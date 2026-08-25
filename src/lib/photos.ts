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

/** Where a draft sits between the shutter and the blob store. */
export type PhotoStatus = "uploading" | "ready" | "failed";

/**
 * A photo taken but not yet posted.
 *
 * Two URLs, and the difference is the whole point. `previewUrl` is an object
 * URL over the JPEG still in memory — it renders the instant the shutter
 * fires and never leaves the browser. `url` belongs to the blob store and is
 * the only one a post may carry; it does not exist until the upload lands,
 * which is why it's optional and why `status` has to be consulted before
 * publishing rather than assumed.
 *
 * Photos used to be posted as base64 data URLs straight into the `media`
 * jsonb column. They are files in a bucket now and the row holds an address,
 * so a feed query no longer drags every picture on the page through Postgres.
 */
export type PhotoDraft = {
  id: string;
  previewUrl: string;
  url?: string;
  status: PhotoStatus;
  /**
   * The encoded JPEG, kept so a failed upload can be retried without making
   * anyone take the picture again — which on a split photo would mean two
   * more presses, and the usual reason an upload fails is a restaurant's
   * signal, not the photo. Browser-side only: it is never part of a payload,
   * and `payload()` in either composer reads `url`.
   */
  blob?: Blob;
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
export async function uploadPhoto(blob: Blob, kind: "post" | "avatar" = "post"): Promise<string> {
  const body = new FormData();
  body.append("file", blob, "photo.jpg");
  body.append("kind", kind);

  const res = await fetch("/api/blob/upload", { method: "POST", body });
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !data?.url) throw new Error(data?.error ?? "That photo didn't upload.");
  return data.url;
}

/**
 * Is this an address in our own blob store?
 *
 * The gate on both write paths. Every stored photo URL now arrives from a
 * client that could have written anything into the field, so the post and
 * avatar routes check the host rather than trusting the string — otherwise
 * the column becomes a place to park arbitrary URLs, and every feed render
 * turns into a request to somebody else's server.
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

/** Every draft carries a blob URL — the gate on publishing. */
export function allPhotosReady(photos: PhotoDraft[]): boolean {
  return photos.every((p) => p.status === "ready" && p.url);
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
