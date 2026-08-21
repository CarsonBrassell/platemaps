export const MAX_PHOTOS = 4;
export const PHOTO_SIZE = 1080;
export const PHOTO_QUALITY = 0.72;

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
