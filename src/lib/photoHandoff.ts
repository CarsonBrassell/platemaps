/**
 * Carries photos picked on the feed across to the /post flow.
 *
 * The file dialog has to open inside the click that asked for it — a browser
 * blocks a programmatic `input.click()` on a freshly loaded page — so the feed
 * runs the picker and leaves the files here for /post to collect.
 *
 * A module variable survives client-side navigation but not a reload, which is
 * the lifetime we want: a reloaded /post starts with an empty tray rather than
 * photos the visitor no longer remembers choosing.
 */
let pending: File[] = [];
let lastTaken: { at: number; files: File[] } = { at: 0, files: [] };

export function stashPhotos(files: File[]) {
  pending = files;
}

/**
 * Returns the stashed files and clears them, so a later visit to /post starts
 * empty rather than re-opening someone's last selection.
 *
 * The one-second replay covers React's development double-invocation: the same
 * mount asking twice has to see the same files, or the tray comes up empty in
 * dev and full in production.
 */
export function takePhotos(): File[] {
  if (pending.length) {
    lastTaken = { at: Date.now(), files: pending };
    pending = [];
    return lastTaken.files;
  }
  return Date.now() - lastTaken.at < 1000 ? lastTaken.files : [];
}
