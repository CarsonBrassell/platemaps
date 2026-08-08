import { resizeImageToDataUrl } from "@/lib/image";

export const MAX_PHOTOS = 4;
export const PHOTO_SIZE = 1080;
export const PHOTO_QUALITY = 0.72;

/** A photo already resized to the data URL that will be posted. */
export type PhotoDraft = { id: string; url: string };

let nextId = 0;

export function photoFromDataUrl(url: string): PhotoDraft {
  return { id: `p${nextId++}`, url };
}

/**
 * Resizes chosen files down to what the post API will accept.
 *
 * Three places take photos in — the camera screen's library button, the tray on
 * the detail step, and the hand-off from the feed — and all three land here, so
 * the size, quality and per-post ceiling are decided once.
 *
 * Errors are returned rather than thrown: one unreadable file among four should
 * cost that file, not the whole selection.
 */
export async function resizePhotos(
  files: File[],
  room: number,
): Promise<{ photos: PhotoDraft[]; error: string | null }> {
  if (room <= 0) {
    return { photos: [], error: `Up to ${MAX_PHOTOS} photos per post.` };
  }

  let error = files.length > room ? `Only the first ${room} fit — ${MAX_PHOTOS} photos per post.` : null;
  const photos: PhotoDraft[] = [];

  for (const file of files.slice(0, room)) {
    if (!file.type.startsWith("image/")) {
      error = "Only image files can be added right now.";
      continue;
    }
    try {
      photos.push(photoFromDataUrl(await resizeImageToDataUrl(file, PHOTO_SIZE, PHOTO_QUALITY)));
    } catch {
      error = `Couldn't process ${file.name}. Try a different photo.`;
    }
  }

  return { photos, error };
}
