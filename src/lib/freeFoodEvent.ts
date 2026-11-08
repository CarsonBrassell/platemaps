/**
 * The Pizza on Pearl x PlateMaps free slice: everyone gets a ticket for one, for a night
 * at Pizza on Pearl (Pearl St). No leaderboard, no cut — open the ticket icon
 * on the feed and show it at the counter.
 *
 * Everything the event depends on lives here so running the next one is an
 * edit to this file and nothing else (the seen key included, so the first-open
 * popup fires again for the new event).
 */

/** Thu 19 Nov 2026, 5pm PST (UTC-8). */
export const FREE_FOOD_STARTS_AT = Date.parse("2026-11-20T01:00:00Z");

/** Thu 19 Nov 2026, 10pm PST. The icon and popup are gone after this. */
export const FREE_FOOD_ENDS_AT = Date.parse("2026-11-20T06:00:00Z");

export const FREE_FOOD_PARTNER = "Pizza on Pearl";
export const FREE_FOOD_TITLE = "Free slice";
export const FREE_FOOD_KICKER = "Free slice";
export const FREE_FOOD_TICKET_LABEL = "Free slice ticket";
export const FREE_FOOD_CLAIM_CTA = "Claim your free slice";
export const FREE_FOOD_SIGNUP_CTA = "Sign up to claim your free slice";

/** Bring-friends block: texts are composed on the phone, nothing is sent to us. */
export const FREE_FOOD_INVITE_HEADING = "Bring 2 friends \u2014 all 3 of you get a free slice";
export const FREE_FOOD_INVITE_PLACEHOLDER = "Friend's number";
export const FREE_FOOD_INVITE_SEND = "Text them";
export const FREE_FOOD_INVITE_SHARE = "Share link instead";
export const FREE_FOOD_INVITE_ERROR = "Add at least one phone number (10+ digits).";
/** Canonical public link; the native app's own origin is not shareable. */
export const FREE_FOOD_SHARE_URL = "https://platemaps.com/m/feed";
export const FREE_FOOD_INVITE_TEXT = `Free slice at ${FREE_FOOD_PARTNER}, Thu Nov 19 5\u201310pm \u{1F355} Get PlateMaps and claim yours:`;
export const FREE_FOOD_DATE_LINE = "Thu Nov 19 · 5–10pm";
export const FREE_FOOD_PLACE = "Pizza on Pearl, Pearl St";
export const FREE_FOOD_INSTAGRAM_HANDLE = "@pizzaonpearlsd";
export const FREE_FOOD_INSTAGRAM_URL = "https://www.instagram.com/pizzaonpearlsd/";

/** Set once the popup has been shown on a device, so it opens by itself once. */
export const FREE_FOOD_SEEN_KEY = "pm-ticket-pearl-2026-11-19-seen";

/** From now until the event ends. */
export function freeFoodVisible(now: number): boolean {
  return now < FREE_FOOD_ENDS_AT;
}

/** Doors are open. */
export function freeFoodLive(now: number): boolean {
  return now >= FREE_FOOD_STARTS_AT && now < FREE_FOOD_ENDS_AT;
}

/** "47:59:59" — hours run past 24 so a two-day clock reads as one number. */
export function freeFoodClock(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  return [h, m, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Keys the event_tickets rows; the next event gets its own. */
export const FREE_FOOD_EVENT_KEY = "pearl-2026-11-19";

/** A ticket is live this long once activated. */
export const FREE_FOOD_ACTIVE_MS = 5 * 60 * 1000;

/** Max claims per IP per event (server). */
export const FREE_FOOD_MAX_PER_IP = 3;

/** Slices Pizza on Pearl is putting up; the counter shows this minus activations. */
export const FREE_FOOD_TOTAL_SLICES = 150;

export const FREE_FOOD_DEVICE_KEY = "pm-device-id";

/** Same handle rule as the feed byline: "Maya Ellis" reads as "@mayaellis". */
export function ticketHandle(name: string) {
  return "@" + name.trim().toLowerCase().replace(/\s+/g, "");
}

/** "#" + 4 digits, the same for the same person every time. */
export function ticketNumber(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  return `#${String(h % 10000).padStart(4, "0")}`;
}

/** Clock to doors; past 100h the days split off so the tiles still fit. */
export function doorsClock(msLeft: number) {
  const day = 24 * 3600 * 1000;
  if (msLeft < 100 * 3600 * 1000) return freeFoodClock(msLeft);
  const d = Math.floor(msLeft / day);
  return `${d}:${freeFoodClock(msLeft - d * day)}`;
}

/** "5:00" style countdown for the live ticket. */
export function mmss(msLeft: number) {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
