/**
 * How the Discover feed is ordered, and the one place the two orderings are
 * named.
 *
 * Pure — no database import — so the switch in the UI and the route that
 * answers it read the same module without pulling the Neon driver into the
 * browser bundle (see the note on `lib/db.ts` being server-only).
 *
 * - **Trending** is *recent plates with the most upvotes* — net votes over a
 *   time decay (`getDiscoverFeed` holds the curve; the two constants below are
 *   the shape of it). It is the default because a hyper-local feed is thin by
 *   construction: on a quiet evening, strict chronology shows an empty room.
 * - **New** is `created_at DESC`, nothing else. It exists so a plate posted
 *   thirty seconds ago is reachable before the ranking has any votes to work
 *   with, which is also what makes posting feel like it did something.
 *
 * That pair is deliberately the Yik Yak split, and it is the whole of what was
 * borrowed. **No geofence came with it.** Yik Yak's defining mechanic was a
 * ~5-mile herd radius, and this feed does not have one and is not getting one:
 * the feed is all of San Diego. Nothing here reads a viewer position, which is
 * also why "coordinates never go in the URL" (see lib/discover) stays true of
 * the feed without any effort. Neither is there a `-5` auto-hide; a downvoted
 * plate sinks, it does not vanish.
 *
 * The Friends feed has no switch and must not get one: it is chronological by
 * specification (see `getFriendsFeed`), so "New" is the only order it has and
 * offering the choice would imply a ranking that does not exist.
 */
export type FeedSort = "trending" | "new";

export const FEED_SORT_DEFAULT: FeedSort = "trending";

/**
 * How hard age pulls a plate down the Trending list, as the exponent in
 * `(netVotes + 1) / (ageHours + 2)^GRAVITY`.
 *
 * **This is tuned to this app's volume, and that is why it is not 1.5.** The
 * `1.5` this started on is Hacker News's constant, and it is calibrated for a
 * site where a good post collects hundreds of votes within an hour. At the
 * volume here — measured 2026-08-18: 493 posts all-time, 225 in 30 days, so
 * roughly 7 a day — a 1.5 curve makes age swamp everything a plate could
 * plausibly earn. A two-hour-old plate with *zero* votes outranked a day-old
 * plate with ten, which is not "trending", it is "new" with extra steps and
 * the two tabs printed nearly the same list.
 *
 * At 1.0 the ordering does what the tab claims. Scored across the candidate
 * exponents, sorted by rank at this value:
 *
 * | plate            | g=0.8 | g=1.0 | g=1.2 | g=1.5 |
 * | ---------------- | ----- | ----- | ----- | ----- |
 * | 14h old, +35     | 3.918 | 2.250 | 1.292 | 0.563 |
 * | 8h old, +18      | 3.011 | 1.900 | 1.199 | 0.601 |
 * | 2d old, +40      | 1.793 | 0.820 | 0.375 | 0.116 |
 * | 2h old, +2       | 0.990 | 0.750 | 0.568 | 0.375 |
 * | brand new, 0     | 0.480 | 0.400 | 0.333 | 0.253 |
 * | 3d old, +22      | 0.735 | 0.311 | 0.131 | 0.036 |
 * | 5d old, +30      | 0.664 | 0.254 | 0.097 | 0.023 |
 * | 15d old, +7      | 0.072 | 0.022 | 0.007 | 0.001 |
 *
 * Two rows decide it, and they pull opposite ways. **`2d old, +40` must beat
 * `brand new, 0`** — that is the whole of "most upvotes", and at 1.5 it does
 * not (0.116 against 0.253), which is the same collapse described above.
 * **`5d old, +30` must lose to `brand new, 0`** — that is the whole of
 * "recent", and at 0.8 it does not (0.664 against 0.480), which makes the tab
 * a week-long leaderboard that a plate posted tonight cannot enter. 1.0 is the
 * only tested value satisfying both; 1.2 satisfies both too but only just
 * (0.375 against 0.333), with no margin for a quieter week.
 *
 * Raise it toward 1.5 as posting volume grows; the number is only ever right
 * for a given posting rate, and those two rows are the test to re-run.
 */
export const TRENDING_GRAVITY = 1.0;

/**
 * What a comment is worth against an upvote in the Trending numerator.
 *
 * **Zero, and that is a deliberate reversal.** Comments used to count 1:1 with
 * net votes, on the reasoning that a sentence costs more to write than a thumb
 * costs to tap, so a plate people are arguing about deserves the same lift as
 * one that quietly collected votes. That reasoning still holds on its own
 * terms — it is set to 0 because Trending is now specified as *recent plates
 * with the most upvotes*, and a thread inflating that number makes the tab
 * describe something other than what it says.
 *
 * It stays a named constant rather than being deleted out of the SQL because
 * this is the one knob for that question and it is a live one: set it to `0.5`
 * to let a busy thread count for half a vote, or back to `1` to restore the
 * old behaviour exactly. `getDiscoverFeed` drops the `comments` join from the
 * ranking entirely while this is 0, so there is no cost to leaving it here.
 */
export const TRENDING_COMMENT_WEIGHT = 0;

export const FEED_SORTS: ReadonlyArray<{ value: FeedSort; label: string }> = [
  { value: "new", label: "New" },
  { value: "trending", label: "Trending" },
];

/** Anything unrecognised falls back to the default rather than erroring. */
export function parseFeedSort(raw: string | null | undefined): FeedSort {
  return raw === "new" ? "new" : FEED_SORT_DEFAULT;
}
