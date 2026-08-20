/**
 * How the Discover feed is ordered, and the one place the two orderings are
 * named.
 *
 * Pure — no database import — so the switch in the UI and the route that
 * answers it read the same module without pulling the Neon driver into the
 * browser bundle (see the note on `lib/db.ts` being server-only).
 *
 * - **Trending** is the ranking Discover has always had: net votes over a
 *   steep time decay. It is the default because a hyper-local feed is thin by
 *   construction — on a quiet evening, strict chronology shows an empty room.
 * - **New** is `created_at DESC`, nothing else. It exists so a plate posted
 *   thirty seconds ago is reachable before the ranking has any votes to work
 *   with, which is also what makes posting feel like it did something.
 *
 * The Friends feed has no switch and must not get one: it is chronological by
 * specification (see `getFriendsFeed`), so "New" is the only order it has and
 * offering the choice would imply a ranking that does not exist.
 */
export type FeedSort = "trending" | "new";

export const FEED_SORT_DEFAULT: FeedSort = "trending";

export const FEED_SORTS: ReadonlyArray<{ value: FeedSort; label: string }> = [
  { value: "trending", label: "Trending" },
  { value: "new", label: "New" },
];

/** Anything unrecognised falls back to the default rather than erroring. */
export function parseFeedSort(raw: string | null | undefined): FeedSort {
  return raw === "new" ? "new" : FEED_SORT_DEFAULT;
}
