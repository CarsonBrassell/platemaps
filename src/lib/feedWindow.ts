/**
 * How far back the feeds look. One number, deliberately.
 *
 * The feeds are a window on what is happening now — a plate somebody rated
 * last spring says nothing about whether the place is worth going to tonight,
 * and a feed that keeps showing it reads as abandoned. Past this many days a
 * post stops appearing in Discover and in the friends feed.
 *
 * **Nothing is deleted, and the ratings do not move.** A post that ages out of
 * the feed is still in the table, still counted by `plateScore` and by the
 * category tallies, still shown in Saved, in your own activity, and in a
 * restaurant's comments. The restaurant pages read every review ever written;
 * only the two feed queries read this constant.
 *
 * Expect to tune it. At the volume this app runs at today the trade is real:
 * 14 days is fresher, 30 days is fuller, and which one is right depends on how
 * many people posted last week — measured on 2026-08-18, 91 of 493 posts fell
 * inside 14 days and 225 inside 30. Change the number here and both feeds and
 * every piece of copy that quotes it move together; that is the entire reason
 * this is a module and not two inlined intervals in `db.ts`.
 *
 * No imports on purpose. `db.ts` is server-only, and the composer needs to tell
 * people how long a post will show for — a client component has to be able to
 * read this without pulling the Neon driver into the browser bundle.
 */
export const FEED_WINDOW_DAYS = 14;

/** The window in words, for UI copy. Keeps "2 weeks" from drifting from 14. */
export function feedWindowLabel(): string {
  if (FEED_WINDOW_DAYS % 7 === 0) {
    const weeks = FEED_WINDOW_DAYS / 7;
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }
  return `${FEED_WINDOW_DAYS} days`;
}
