/**
 * Kitchen titles for the top three seats of a points ranking; everyone below
 * is just a number.
 *
 * Shared because two leaderboards render them — the web one
 * (`components/feed/LeaderboardRow.tsx`) and the phone friends one
 * (`components/mobile/PhoneFriendsLeaderboard.tsx`). A copy in each is how
 * they end up disagreeing about what rank 2 is called, which reads as two
 * different games rather than one product.
 *
 * Deliberately titles and not medals: PRODUCT.md keeps points "a capability,
 * not the reason the product wins", so the podium gets a job description, not
 * a crown.
 */
export const STATIONS: Record<number, string> = {
  1: "Head chef",
  2: "Sous chef",
  3: "Line cook",
};
