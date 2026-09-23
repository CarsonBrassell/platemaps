import { closeImage, decodeImage, type DecodedImage } from "@/lib/image";

/**
 * One photo per post, and the reason is the screen that follows the shutter.
 *
 * A plate post is about one plate. Four slots turned the shutter into a loop —
 * press, land back on the live camera, press again — and the picture just taken
 * was never on screen long enough to look at. With one, the press has somewhere
 * to go: the shot fills the frame the camera was filling, and the only two
 * questions left are keep it or take it again. See `CameraCapture`.
 *
 * A post still carries a list of URLs and older ones hold several, so nothing
 * downstream of the composer assumes a count.
 */
export const MAX_PHOTOS = 1;

/**
 * Longest edge of a captured photo, in pixels.
 *
 * 900 rather than 1080, which is worth about 29% of every photo's bytes —
 * measured by re-encoding three real posted photos through the same canvas
 * path this uses, not estimated. Quality is deliberately untouched: dropping
 * the dimension is the cheaper half of the saving and it cannot introduce
 * compression artefacts into food photography, which is the product.
 *
 * What the number has to cover: a photo is 3:4 (`SHOT_W`/`SHOT_H` in
 * CameraCapture) and the feed hero is `aspect-[3/4] w-full` inside a card
 * about 358 CSS px wide, so the hero asks for 716 device px across at 2x and
 * 1074 at 3x. 900 is the long edge, which puts 675 across the short one: 2x is
 * nearly there, 3x short — on a feed you scroll. The 96px card thumbnail
 * wants 288 at 3x and is nowhere near the constraint.
 *
 * Raise it back toward 1080 if photos ever get a full-bleed, full-height
 * viewer where the whole frame is examined rather than glanced at.
 */
export const PHOTO_SIZE = 900;

export const PHOTO_QUALITY = 0.72;

/**
 * The shape of every post photo: 3:4, long edge `PHOTO_SIZE`.
 *
 * The camera crops to this at the shutter and the feed hero renders it, so a
 * file that is not this shape gets cropped somewhere it was never reviewed.
 * `fileToDraft` cuts a chosen picture to the same box for the same reason —
 * what is on the review screen is what lands in the feed, whichever way the
 * picture came in.
 */
export const SHOT_H = PHOTO_SIZE;
export const SHOT_W = Math.round((SHOT_H * 3) / 4);

/**
 * The upload route's ceiling. A capture at PHOTO_SIZE and PHOTO_QUALITY lands
 * around 50–135KB, so this is roughly ten times the real thing: big enough
 * that no genuine photo ever trips it, small enough to bound what a forged
 * request can push into the store.
 *
 * It is not the only guard, and deliberately not the important one. Canvas
 * encoding falls back *silently* when it does not know a MIME type — asking
 * iOS's WKWebView for `image/webp` hands back a PNG, and the same photo goes
 * from 378KB to 2.5MB. `canvasToJpeg` asks for `image/jpeg`, which every
 * engine supports, and `/api/blob/upload` rejects anything whose type is not
 * `image/jpeg` outright. A silent fallback fails loudly at the door rather
 * than arriving as a very large photo that happens to fit under this number.
 */
export const MAX_UPLOAD_BYTES = 2_000_000;

/**
 * A photo taken but not yet posted. It exists only in this browser.
 *
 * `blob` is the encoded JPEG and `previewUrl` an object URL over it, so the
 * thumbnail renders on the shutter press with no network in the way. Neither
 * is an address anyone else could reach, and that is the point: **a draft is
 * not uploaded.** Nothing reaches the blob store until Post is pressed, so
 * backing out of the composer, closing the tab or killing the app leaves
 * nothing behind to find later.
 *
 * This used to upload at the shutter, which made Post instant on a good
 * connection and left an unreferenced file in the store every single time
 * somebody changed their mind. Storage you have to sweep up afterwards is
 * worse than a second of waiting.
 */
export type PhotoDraft = {
  id: string;
  previewUrl: string;
  blob: Blob;
};

let nextId = 0;

export function nextPhotoId() {
  return `p${nextId++}`;
}

/**
 * `canvas.toBlob` as a promise, at the one quality every capture uses.
 * Resolves null when the browser refuses the encode.
 */
export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY));
}

/** Puts one JPEG in the blob store and returns the URL a post can carry. */
async function uploadOne(blob: Blob, kind: "post" | "avatar"): Promise<string> {
  const body = new FormData();
  body.append("file", blob, "photo.jpg");
  body.append("kind", kind);

  const res = await fetch("/api/blob/upload", { method: "POST", body });
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !data?.url) throw new Error(data?.error ?? "That photo didn't upload.");
  return data.url;
}

/** One avatar, which has no batch to be part of. */
export function uploadAvatar(blob: Blob): Promise<string> {
  return uploadOne(blob, "avatar");
}

/** Takes a photo back out of the store. Best effort — see `uploadPhotos`. */
export async function discardPhoto(url: string): Promise<void> {
  await fetch("/api/blob/upload", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

/**
 * Every draft on a post, uploaded together, in the order they were taken.
 *
 * All or nothing. If the third of four fails, the two that landed are deleted
 * again before this throws — a post that was never written must not leave
 * half its photos in the store. That rollback is best effort by nature (the
 * delete can fail too, or the tab can close mid-flight), which is the reason
 * the upload happens here at all rather than at the shutter: the window where
 * a file can be orphaned is a few seconds inside one button press, instead of
 * the whole time the composer is open.
 */
export async function uploadPhotos(photos: PhotoDraft[]): Promise<string[]> {
  if (photos.length === 0) return [];

  const results = await Promise.allSettled(photos.map((p) => uploadOne(p.blob, "post")));
  const landed = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));

  if (landed.length !== photos.length) {
    await Promise.allSettled(landed.map(discardPhoto));
    const failure = results.find((r) => r.status === "rejected");
    throw failure && failure.status === "rejected"
      ? failure.reason
      : new Error("Your photos didn't upload.");
  }

  return landed;
}

/**
 * Is this an address in our own blob store?
 *
 * The gate on both write paths. A stored photo URL arrives from a client that
 * could have written anything into the field, so the post and avatar routes
 * check the host rather than trusting the string — otherwise the column
 * becomes a place to park arbitrary URLs, and every feed render turns into a
 * request to somebody else's server.
 *
 * The host is *this project's* store, not the shared
 * `.public.blob.vercel-storage.com` suffix — every Vercel customer's public
 * store lives under that suffix, so checking only the suffix let anyone park a
 * file in their own store and have it rendered here (and promoted to a
 * restaurant cover). The store id is read from BLOB_READ_WRITE_TOKEN
 * (`vercel_blob_rw_<storeId>_<secret>`), which the upload route already needs,
 * and the path must be the `<folder>/<userId>/<uuid>.jpg` shape that route
 * writes. Server-only: the token is not in the client bundle, so this is
 * always false in a browser.
 */
export function isStoredPhotoUrl(url: string): boolean {
  return storedPhotoParts(url) !== null;
}

/**
 * The user id segment of a stored photo's path, or null when the URL is not a
 * stored photo. Ownership checks compare this exactly rather than looking for
 * `/<id>/` anywhere in the path.
 */
export function storedPhotoOwner(url: string): string | null {
  return storedPhotoParts(url)?.owner ?? null;
}

const STORED_PHOTO_PATH = /^\/(?:posts|avatars)\/([^/]+)\/[0-9a-f-]{36}\.jpg$/;

function ownBlobHost(): string | null {
  const m = process.env.BLOB_READ_WRITE_TOKEN?.match(/^vercel_blob_rw_([A-Za-z0-9]+)_/);
  return m ? `${m[1].toLowerCase()}.public.blob.vercel-storage.com` : null;
}

function storedPhotoParts(url: string): { owner: string } | null {
  const host = ownBlobHost();
  if (!host) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== host) return null;
    const m = parsed.pathname.match(STORED_PHOTO_PATH);
    return m ? { owner: m[1] } : null;
  } catch {
    return null;
  }
}

/**
 * A picture from the library, made into the same draft the shutter makes.
 *
 * Centre-covered to 3:4 at `SHOT_W`x`SHOT_H` and re-encoded as a JPEG at
 * `PHOTO_QUALITY`, so a chosen photo and a taken one are the same thing from
 * here on: same shape, same size, same type at the upload door, same crop on
 * the review screen as in the feed. Drawing through a canvas also drops the
 * file's EXIF — the GPS tag on a phone photo does not ride onto a public post.
 *
 * `decodeImage` handles the HEIC-off-an-iPhone case and applies the EXIF
 * rotation, so a portrait shot arrives upright. Everything that can go wrong
 * comes back as one sentence for the screen rather than a throw: a corrupt
 * file, an unsupported format and a decode the browser gave up on all read
 * the same to the person holding the phone.
 *
 * This is `resizePhotos` back under a new name. It left with the first
 * library pickers (2026-08, `039271c`) and returned with this one in 2026-09 —
 * see the note at the top of `CameraCapture` for why the picker came back.
 */
export async function fileToDraft(
  file: File,
): Promise<{ draft: PhotoDraft; error?: never } | { draft?: never; error: string }> {
  const unreadable = { error: "Couldn't read that photo. Try a different one." } as const;
  /* Safari reports HEIC with an empty type on some versions, so the name is
     the fallback check rather than the type being the only one. */
  if (file.type && !file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
    return { error: "That file isn't a photo." };
  }

  let source: DecodedImage;
  try {
    source = await decodeImage(file);
  } catch {
    return unreadable;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = SHOT_W;
    canvas.height = SHOT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return unreadable;

    // The same cover crop the viewfinder shows and the shutter writes.
    const scale = Math.max(SHOT_W / source.width, SHOT_H / source.height);
    const dw = source.width * scale;
    const dh = source.height * scale;
    ctx.drawImage(source, (SHOT_W - dw) / 2, (SHOT_H - dh) / 2, dw, dh);

    const blob = await canvasToJpeg(canvas);
    if (!blob) return unreadable;
    return { draft: { id: nextPhotoId(), previewUrl: URL.createObjectURL(blob), blob } };
  } finally {
    closeImage(source);
  }
}
