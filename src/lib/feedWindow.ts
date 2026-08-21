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
 * **It was widened to two months for the map, not for the feed list.** The map
 * bubbles are drawn from whichever feed `/feed`'s Map tab is pointed at, so the
 * window is also what decides whether a restaurant has anything to say when
 * somebody searches it — and searching the map is now a way to ask about a
 * whole cuisine, where a fortnight of posts leaves most of the matches silent.
 * Two months of chatter on a taco place is still worth reading; two months of
 * *feed* would be stale, which is the tension this number now sits in. If the
 * list starts reading as abandoned, the answer is to give the map its own read
 * rather than to shrink this back and empty the bubbles out again.
 *
 * The 60-day count was not measured — the figures above are what the corpus
 * looked like at 14 and 30 on the day they were taken.
 *
 * No imports on purpose. `db.ts` is server-only, and the composer needs to tell
 * people how long a post will show for — a client component has to be able to
 * read this without pulling the Neon driver into the browser bundle.
 */
export const FEED_WINDOW_DAYS = 60;

/** The window in words, for UI copy. Keeps "2 months" from drifting from 60.
 *
 *  Months are counted at 30 days, which is what "2 months" means to the person
 *  reading it rather than what a calendar owes — the number this describes is a
 *  `make_interval(days => …)`, so a real month boundary was never in play. The
 *  month branch goes first so a window that is a whole number of both (210,
 *  say) reads as the larger unit. */
export function feedWindowLabel(): string {
  if (FEED_WINDOW_DAYS % 30 === 0) {
    const months = FEED_WINDOW_DAYS / 30;
    return months === 1 ? "1 month" : `${months} months`;
  }
  if (FEED_WINDOW_DAYS % 7 === 0) {
    const weeks = FEED_WINDOW_DAYS / 7;
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }
  return `${FEED_WINDOW_DAYS} days`;
}
