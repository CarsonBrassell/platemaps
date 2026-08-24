/**
 * How long a post keeps its photos. One number, deliberately.
 *
 * Past this many days the photos are **permanently deleted** — `media` is
 * emptied in place. The post itself survives whole: its text, rating, dish,
 * price and restaurant all stay, so `plateScore`, the category tallies and
 * every restaurant page read exactly what they read before. Only the pictures
 * go, and both feed cards already render a post without them as a text card
 * (`hasPhoto` in `FoodPostCard` and `PhoneFeedPostCard`), so nothing needs a
 * new empty state.
 *
 * This is not recoverable. There is no soft-delete column and no copy in
 * object storage — the base64 in that row is the only place the photo exists.
 *
 * ## It is shorter than the feed window, and that is the thing to think about
 *
 * `FEED_WINDOW_DAYS` is 60. A post is shown in Discover, in the friends feed
 * and as a map bubble for two months, but under this constant it only has a
 * photo for the first two weeks of that. Measured on 2026-08-21: 389 of 510
 * posts — **76% of the corpus** — sat in the 14-to-60-day band, which is to
 * say three quarters of what the feeds serve would be text-only cards in a
 * product whose whole pitch is the photo.
 *
 * Three ways out, in the order they are worth considering:
 *
 * 1. Set this to `FEED_WINDOW_DAYS` so a photo lives exactly as long as the
 *    post is shown. Costs the most storage, reads the best.
 * 2. Leave it short and shrink `FEED_WINDOW_DAYS` to match, accepting a
 *    fortnight-deep feed — the trade that constant's own comment describes.
 * 3. Leave the two mismatched on purpose, because storage is the binding
 *    constraint and a text card is better than a bill.
 *
 * Whichever it is, it should be a decision rather than an accident, which is
 * why the two numbers are in modules facing each other instead of inlined.
 *
 * No imports on purpose, same as `feedWindow.ts`: the composer should be able
 * to tell someone how long their photo will last without pulling the Neon
 * driver into the browser bundle.
 */
export const PHOTO_RETENTION_DAYS = 14;

/** The window in words, for UI and policy copy, so "2 weeks" cannot drift. */
export function photoRetentionLabel(): string {
  if (PHOTO_RETENTION_DAYS % 30 === 0) {
    const months = PHOTO_RETENTION_DAYS / 30;
    return months === 1 ? "1 month" : `${months} months`;
  }
  if (PHOTO_RETENTION_DAYS % 7 === 0) {
    const weeks = PHOTO_RETENTION_DAYS / 7;
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }
  return `${PHOTO_RETENTION_DAYS} days`;
}
