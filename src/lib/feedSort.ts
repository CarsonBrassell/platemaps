/**
 * How the Discover feed is ordered, and the one place the two orderings are
 * named.
 *
 * Pure — no database import — so the switch in the UI and the route that
 * answers it read the same module without pulling the Neon driver into the
 * browser bundle (see the note on `lib/db.ts` being server-only).
 *
 * - **Trending** is *recent plates with the most upvotes* — net votes inside a
 *   soft 24-hour window, newest first on ties (`trendingScore` below is the
 *   curve and the three constants after it are the shape of it;
 *   `getDiscoverFeed` runs the identical expression in SQL). It is the default
 *   because a hyper-local feed is thin by construction: on a quiet evening,
 *   strict chronology shows an empty room.
 * - **New** is `created_at DESC`, nothing else. It exists so a plate posted
 *   thirty seconds ago is reachable before the ranking has any votes to work
 *   with, which is also what makes posting feel like it did something.
 *
 * That pair is deliberately the Yik Yak split, and it is the whole of what was
 * borrowed. Yik Yak's Hot is the last ~24 hours ranked by net votes and its New
 * is chronological; Trending here is that same 24-hour net-vote ranking with
 * the cliff at the end of the day softened into a tail (see `TRENDING_EDGE` for
 * why a cliff does not survive this volume). Yik Yak's other defining mechanic
 * was a ~5-mile herd radius, and New and Trending don't have one baked in: both
 * cover all of San Diego unless the viewer turns on the separate **Nearby
 * filter** (`NearbyChip`, beside this switch, not a third segment of it) —
 * which limits whichever ordering is already selected to posts within
 * `NEARBY_RADIUS_MI` (see lib/geo.ts, the same 5 miles) rather than replacing
 * it. A radius nobody asked for on the default view would quietly hide plates
 * from someone who never opted into a geofence, so the position that filter
 * needs is opt-in and arrives only by POST body, never a query string (see
 * lib/nearby.ts's header comment on the tap, and the route in
 * api/posts/discover) — New and Trending alone still take no coordinates and
 * remain answerable by a plain GET. And there is deliberately no copy of Yik
 * Yak's `-5` auto-removal: a downvoted plate sinks, it does not vanish, because
 * a post here never expires or disappears.
 *
 * The Friends feed has no switch and must not get one: it is chronological by
 * specification (see `getFriendsFeed`), so "New" is the only order it has and
 * offering the choice would imply a ranking that does not exist.
 */
export type FeedSort = "trending" | "new";

export const FEED_SORT_DEFAULT: FeedSort = "trending";

/**
 * How long a plate counts as "fresh" in Trending, in hours — the width of the
 * window Yik Yak's Hot ranks inside (its Hot is the last ~24 hours ranked by
 * net votes; New is chronological; the herd is a 5-mile radius; and a plate at
 * -5 is deleted, which we deliberately do not copy — posts here never vanish).
 *
 * A day is the unit because it is the unit people check a feed in: a plate
 * posted this morning is still "today's" plate tonight. The window is where the
 * freshness factor has given up about a quarter of itself — exactly
 * `2^(-GRAVITY / EDGE)`, 0.77 at the defaults — and it is soft rather than a
 * cliff for the reason written out on `TRENDING_EDGE`.
 */
export const TRENDING_WINDOW_HOURS = 24;

/**
 * How sharp the edge of the window is: the exponent inside
 * `fresh(age) = (1 + (age / WINDOW)^EDGE)^(-GRAVITY / EDGE)`.
 *
 * **Why a soft edge and a power tail instead of Yik Yak's hard 24-hour cut.**
 * A hard cut is the faithful copy, and at this app's volume it is the wrong
 * one: measured 2026-10-27, 48 posts all-time, about 0.75 posts a day. With
 * arrivals that thin a 24-hour window is empty roughly half the time
 * (`e^-0.75`), and Trending would open onto a blank screen on exactly the
 * evenings someone is checking whether anything is happening. So the window is
 * a knee rather than a wall: past it a plate does not drop out, it falls away
 * polynomially (see `TRENDING_GRAVITY`), which keeps the feed populated while
 * still demanding that a plate be genuinely popular to survive.
 *
 * `EDGE` is how close to a wall that knee is. As it grows, `fresh` flattens to
 * exactly 1 inside the window and `(WINDOW / age)^GRAVITY` outside it — the
 * hard cut with a polynomial tail. At 6 the factor is 0.994 at 12 hours, 0.77
 * at 24, 0.39 at 36 and 0.21 at 48: flat enough that inside the first day the
 * order is net votes with the newest first on ties (what Hot is), steep enough
 * that the second day is clearly a different regime. Lower values smear the
 * knee until votes stop being the first thing the order answers to inside the
 * day: at 2, a 20-hour-old +2 plate already loses to a brand-new +1, and
 * Trending drifts toward New with extra steps.
 */
export const TRENDING_EDGE = 6;

/**
 * The exponent of the tail: far past the window, `fresh` falls like
 * `(WINDOW / age)^GRAVITY`, so doubling a plate's age past the window divides
 * its score by about 2^2.25 ≈ 4.8.
 *
 * **Why 2.25.** It is the value at which the hold times come out right for a
 * feed this quiet. The table is how long a plate with the given net votes stays
 * above a *brand-new* +1 plate (a fresh publish seeds the author's own upvote,
 * so +1 is what a new plate scores, v = 2), solved from the formula and
 * matching the replay in `probe/trending-2026-10-27/`:
 *
 * | net votes | outranks a new +1 plate until |
 * | --------- | ----------------------------- |
 * | +2        | 27h                           |
 * | +4        | 36h                           |
 * | +10       | 51h                           |
 * | +30       | 81h                           |
 * | +100      | 137h (5.7 days)               |
 * | ~+160     | 169h (a week)                 |
 *
 * That is the shape wanted: the top of the feed turns over daily unless a plate
 * is real, and the few that are real hold on for days. The observed maximum is
 * +4 (measured 2026-10-27, net votes), which buys a plate a day and a half —
 * long enough to be seen, short enough that a plate posted tonight is never
 * walled out. The neighbours show why it is not rounder: at an exponent of 1 a
 * +10 plate holds the top for 5.5 days and a +30 plate for 15, which is a
 * leaderboard rather than a trend; at 4 a +4 plate gets 29 hours and a +100
 * plate 64, so even a plate people love is gone before the weekend.
 *
 * Re-solve the table before moving it as volume grows: the number is only right
 * for a given posting rate.
 */
export const TRENDING_GRAVITY = 2.25;

/**
 * What a comment is worth against an upvote in the Trending net-vote term.
 *
 * **Zero, and that is a deliberate reversal.** Comments used to count 1:1 with
 * net votes, on the reasoning that a sentence costs more to write than a thumb
 * costs to tap, so a plate people are arguing about deserves the same lift as
 * one that quietly collected votes. That reasoning still holds on its own
 * terms — it is set to 0 because Trending is specified as *recent plates with
 * the most upvotes*, and a thread inflating that number makes the tab describe
 * something other than what it says.
 *
 * It stays a named constant rather than being deleted out of the SQL because
 * this is the one knob for that question and it is a live one: set it to `0.5`
 * to let a busy thread count for half a vote, or `1` to count it as a full one.
 * `getDiscoverFeed` omits the comment term from the ranking SQL while this is
 * 0, so there is no cost to leaving it here.
 */
export const TRENDING_COMMENT_WEIGHT = 0;

/**
 * The Trending score: `v(net) * fresh(age)`. `getDiscoverFeed`'s `TRENDING_SCORE`
 * SQL is this function line for line — change one, change the other, and run
 * `npm run feed:check`.
 *
 * `net = up - down + TRENDING_COMMENT_WEIGHT * comments`, and the vote term is
 * `v(net) = net + 1` for `net >= 0` and `1 / (1 - net)^2` below it. The `+ 1`
 * keeps a plate with no votes above zero so freshness has something to scale;
 * the reciprocal branch (−1 → 0.25, −3 → 0.0625, −5 → 0.028) is what makes the
 * score safe to *multiply* by a decay. It is always positive, so a downvoted
 * plate sinks below a brand-new zero-vote one, and it shrinks toward zero as it
 * ages instead of climbing — dividing a negative number by a growing age would
 * be a promotion, which is the bug the old two-tier ordering existed to avoid.
 *
 * `fresh(age) = (1 + (age / TRENDING_WINDOW_HOURS)^TRENDING_EDGE)^(-TRENDING_GRAVITY / TRENDING_EDGE)`
 * with `age` floored at 0 hours, as `GREATEST(..., 0)` does in SQL: a post
 * stamped a hair after the scroll clock (`at`) scores exactly as brand new
 * rather than a hair below it. The floor is also what keeps the base of the
 * fractional power at 1 or more if `TRENDING_EDGE` is ever retuned to an odd
 * number, where a negative age would otherwise put a negative base under it.
 *
 * The SQL writes the exponent as the one number `-GRAVITY / EDGE`, divided here
 * in JS before it is spliced in. Dividing two integer constants inside the SQL
 * text would be integer division in Postgres (`-3 / 6` is 0) and silently turn
 * the decay off, so `npm run feed:check` asserts the exponent in `db.ts`.
 */
export function trendingScore({
  up,
  down,
  comments = 0,
  ageHours,
}: {
  up: number;
  down: number;
  comments?: number;
  ageHours: number;
}): number {
  const net = up - down + TRENDING_COMMENT_WEIGHT * comments;
  const votes = net >= 0 ? net + 1 : 1 / (1 - net) ** 2;
  const age = Math.max(ageHours, 0);
  const fresh = (1 + (age / TRENDING_WINDOW_HOURS) ** TRENDING_EDGE) ** (-TRENDING_GRAVITY / TRENDING_EDGE);
  return votes * fresh;
}

export const FEED_SORTS: ReadonlyArray<{ value: FeedSort; label: string }> = [
  { value: "new", label: "New" },
  { value: "trending", label: "Trending" },
];

/** Anything unrecognised — including a stale `?sort=nearby` from before Nearby
    became a filter rather than a sort — falls back to the default rather than
    erroring. */
export function parseFeedSort(raw: string | null | undefined): FeedSort {
  return raw === "new" ? raw : FEED_SORT_DEFAULT;
}
