/**
 * Derives whether a restaurant is open from its real closing time.
 *
 * The `statusLabel` stored on each restaurant used to carry wait-time copy
 * ("No wait", "Filling up") that had nothing behind it — Yelp exposes no
 * busyness data, so those strings were generated from a hash of the business
 * id. `closingTime` is real, so open/closed/closing-soon can be computed
 * honestly instead of invented.
 *
 * Everything here is in San Diego local time: the app is explicitly a San
 * Diego product and already presents a single local clock in the stats bar.
 */

export type OpenState = {
  kind: "open" | "soon" | "closed" | "unknown";
  label: string;
  /** Matches the existing pill styling contract on Restaurant. */
  status: "calm" | "urgent";
};

const TIME_ZONE = "America/Los_Angeles";
/** Anything closing before 5am is the small hours of the *next* day. */
const LATE_NIGHT_CUTOFF = 5 * 60;
/** How close to closing counts as "closing soon". */
const SOON_MINUTES = 60;

/** Minutes since midnight in San Diego, for whatever instant is passed in. */
export function localMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // Intl can render midnight as 24 rather than 0 depending on the runtime.
  return (hour % 24) * 60 + minute;
}

/**
 * "Closes 9pm" / "Closes 9:30pm" / "Closes 2am" -> minutes since midnight.
 * Returns null for "Hours vary" and anything else unparseable.
 */
export function parseClosing(closingTime: string): number | null {
  const match = closingTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!match) return null;

  const [, rawHour, rawMinute, meridiem] = match;
  let hour = Number(rawHour) % 12;
  if (meridiem.toLowerCase() === "pm") hour += 12;
  return hour * 60 + Number(rawMinute ?? 0);
}

export function openStateFor(closingTime: string, now: Date): OpenState {
  const closes = parseClosing(closingTime);
  if (closes === null) {
    return { kind: "unknown", label: "Hours vary", status: "calm" };
  }

  // Normalise both sides onto one continuous timeline so a 2am close compares
  // correctly against an 11pm now, and against a 1am now.
  const closesAt = closes < LATE_NIGHT_CUTOFF ? closes + 24 * 60 : closes;
  const nowRaw = localMinutes(now);
  const nowAt = nowRaw < LATE_NIGHT_CUTOFF ? nowRaw + 24 * 60 : nowRaw;

  const remaining = closesAt - nowAt;

  if (remaining <= 0) return { kind: "closed", label: "Closed now", status: "calm" };
  if (remaining <= SOON_MINUTES) {
    return { kind: "soon", label: `Closing in ${remaining} min`, status: "urgent" };
  }
  return { kind: "open", label: closingTime.replace(/^Closes /, "Open til "), status: "calm" };
}
