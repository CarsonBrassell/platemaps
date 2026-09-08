/**
 * Kitchen titles for the top three seats of a points ranking; everyone below
 * is just a number.
 *
 * Only the web leaderboard (`components/feed/LeaderboardRow.tsx`) renders
 * them now. The phone Friends' Table used to as well, but on 2026-09-07 Calvin
 * asked for the stations to go from it and for every row to show its
 * rank-ladder title (`lib/ranks.ts`) instead.
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
