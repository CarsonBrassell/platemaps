export const MAX_PHOTOS = 4;

/**
 * Longest edge of a captured photo, in pixels.
 *
 * 900 rather than 1080, which is worth about 29% of every photo's bytes —
 * measured by re-encoding three real posted photos through the same canvas
 * path this uses, not estimated. Quality is deliberately untouched: dropping
 * the dimension is the cheaper half of the saving and it cannot introduce
 * compression artefacts into food photography, which is the product.
 *
 * What the number has to cover: the feed hero is `aspect-[16/9] w-full` inside
 * a card about 358 CSS px wide, so it asks for 716 device px at 2x and 1074 at
 * 3x. 1080 was sized for the 3x case at full bleed. 900 clears 2x outright and
 * falls a little short of 3x — inside a 16:9 crop, on a feed you scroll.
 * The 96px card thumbnail wants 288 at 3x and is nowhere near the constraint.
 *
 * Raise it back toward 1080 if photos ever get a full-bleed, full-height
 * viewer where the whole frame is examined rather than glanced at.
 */
export const PHOTO_SIZE = 900;

export const PHOTO_QUALITY = 0.72;

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
 */
export function isStoredPhotoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".public.blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

/*
 * `resizePhotos` used to live here, turning chosen files into drafts.
 *
 * It went with the last of the library pickers: every photo on a post is now
 * taken by `CameraCapture`, which draws straight from a video frame to a canvas
 * at these three numbers and never touches a File. The size, quality and
 * per-post ceiling stay here because they are still the answer to "what will
 * the post API accept", and the day another way in exists it should read them
 * rather than pick its own.
 *
 * `lib/image.ts` still has the File-to-JPEG resize the avatar upload uses.
 */
