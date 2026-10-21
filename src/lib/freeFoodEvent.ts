/**
 * The Pizza on Pearl x PlateMaps "Plate-Off": a live event where the ten
 * people with the most Plate Points when the board locks each get two pizzas
 * and a drink.
 *
 * Everything the event depends on lives here so running the next one is an
 * edit to this file and nothing else. The board itself is the ordinary
 * all-time leaderboard (`/api/leaderboard?window=all`): real users, real
 * points, the same `hide_from_leaderboard` switch respected.
 */

/** When the board locks. Two days from launch (Thu 23 Oct 2026, 3pm PT). */
export const FREE_FOOD_ENDS_AT = Date.parse("2026-10-23T22:00:00Z");

/**
 * How long the button stays on the feed after the lock, so winners can still
 * open the board at the counter. After this the button and the popup are gone.
 */
export const FREE_FOOD_GRACE_MS = 24 * 60 * 60 * 1000;

/** How many places win. */
export const FREE_FOOD_WINNERS = 10;

export const FREE_FOOD_PARTNER = "Pizza on Pearl";
export const FREE_FOOD_TITLE = "The Pearl St Plate-Off";
export const FREE_FOOD_PRIZE = "2 pizzas + a drink";

export function freeFoodLocked(now: number): boolean {
  return now >= FREE_FOOD_ENDS_AT;
}

export function freeFoodVisible(now: number): boolean {
  return now < FREE_FOOD_ENDS_AT + FREE_FOOD_GRACE_MS;
}

/** "47:59:59" — hours run past 24 so a two-day clock reads as one number. */
export function freeFoodClock(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  return [h, m, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}
