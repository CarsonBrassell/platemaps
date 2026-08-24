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
 * Hard ceiling on a single photo's data URL, enforced by `/api/posts`.
 *
 * Real photos at these settings run 47–135 KB; the old ceiling was 4,000,000,
 * which is not a guard so much as a formality. This leaves roughly 4x headroom
 * over the largest thing this path can legitimately produce.
 *
 * The reason to keep it tight rather than generous: `canvas.toDataURL` falls
 * back *silently* when it does not know a MIME type — asking iOS's WKWebView
 * for `image/webp` returns a PNG, and the same photo goes from 378 KB to
 * 2.5 MB. A 4 MB ceiling waves that straight through into the media column.
 * This one stops it at the door.
 */
export const MAX_MEDIA_LENGTH = 600_000;

/** A photo already resized to the data URL that will be posted. */
export type PhotoDraft = { id: string; url: string };

let nextId = 0;

export function photoFromDataUrl(url: string): PhotoDraft {
  return { id: `p${nextId++}`, url };
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
 * `lib/image.ts` still has the File-to-data-URL resize the avatar upload uses.
 */
