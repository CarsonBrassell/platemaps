/**
 * Derives whether a restaurant is open from its real weekly hours.
 *
 * ## What was wrong before
 *
 * This used to take a single closing time — "Closes 10pm" — because that was
 * the only hours data the corpus had. With one number the only question that
 * can be asked is "is it before closing", so a dinner-only steakhouse read
 * "Open til 10pm" at nine in the morning, and the "Open now" filter returned
 * every dinner-only restaurant in San Diego. The logic was correct; it was
 * working on half the facts.
 *
 * Yelp returned the opening times all along — fetch-restaurants.mjs read
 * `slot.end` and discarded the rest. scripts/fetch-hours.mjs now keeps the
 * whole week.
 *
 * ## Why the whole week rather than one open/close pair
 *
 * A pair cannot say "closed Mondays", cannot give Friday a later close than
 * Tuesday, and cannot describe a kitchen that shuts between lunch and dinner.
 * All three are ordinary. Snooze closes at 2:30pm on weekdays and 4pm at
 * weekends; under a single closing time one of those was always a lie.
 *
 * Everything here is in San Diego local time: the app is explicitly a San
 * Diego product and already presents a single local clock in the stats bar.
 */

/**
 * One service window, in Yelp's shape, stored unchanged.
 *
 * `day` is 0 = Monday, which is Yelp's convention and NOT JavaScript's
 * (0 = Sunday). Converting at read time keeps one conversion in one place
 * rather than two that can drift apart.
 */
export type DaySlot = {
  day: number;
  /** "1130" — 24-hour, no separator. */
  start: string;
  end: string;
  /** Set when the window runs past midnight, e.g. 5pm–2am. */
  overnight?: boolean;
};

/** Null when hours were never fetched; empty when the business publishes none. */
export type Hours = DaySlot[] | null;

export type OpenState = {
  kind: "open" | "soon" | "closed" | "unknown";
  /** Today's hours where they exist — "11am – 10pm" — or why they don't. */
  label: string;
  /** Matches the existing pill styling contract on Restaurant. */
  status: "calm" | "urgent";
};

const TIME_ZONE = "America/Los_Angeles";
/** How close to closing counts as "closing soon". */
const SOON_MINUTES = 60;
const DAY = 24 * 60;

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

/** Day of week in San Diego, in Yelp's numbering: 0 = Monday. */
export function localDay(now: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
  }).format(now);
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name);
  return index === -1 ? 0 : index;
}

/** "1430" -> minutes since midnight. */
function slotMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2, 4));
}

/** 870 -> "2:30pm", 1320 -> "10pm". Whole hours drop the ":00". */
export function formatMinutes(total: number): string {
  const mins = ((total % DAY) + DAY) % DAY;
  const hour24 = Math.floor(mins / 60);
  const minute = mins % 60;
  const meridiem = hour24 >= 12 ? "pm" : "am";
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour}${meridiem}` : `${hour}:${String(minute).padStart(2, "0")}${meridiem}`;
}

/**
 * "11am – 10pm", or "11am – 2pm, 5pm – 10pm" where a day has two services.
 * Empty string when the restaurant isn't open at all on the given day.
 */
export function hoursLabelFor(hours: Hours, day: number): string {
  if (!hours?.length) return "";
  return hours
    .filter((slot) => slot.day === day)
    .map((slot) => `${formatMinutes(slotMinutes(slot.start))} – ${formatMinutes(slotMinutes(slot.end))}`)
    .join(", ");
}

/**
 * Every service window that could contain `now`, laid out on a timeline where
 * midnight tonight is 0.
 *
 * Yesterday's windows are included because an overnight one — Friday 5pm to
 * Saturday 2am — is stored against Friday, and at 1am on Saturday it is
 * yesterday's window that is still running. Missing this is why a 2am bar read
 * "closed" for the two hours it was busiest.
 */
function windowsAround(hours: DaySlot[], today: number): { open: number; close: number }[] {
  const yesterday = (today + 6) % 7;
  const out: { open: number; close: number }[] = [];

  for (const slot of hours) {
    const start = slotMinutes(slot.start);
    const end = slotMinutes(slot.end);
    // Yelp sets is_overnight, but a close that is numerically before the open
    // means the same thing and is the more reliable signal of the two.
    const spansMidnight = slot.overnight || end <= start;
    const close = spansMidnight ? end + DAY : end;

    if (slot.day === today) out.push({ open: start, close });
    if (slot.day === yesterday) out.push({ open: start - DAY, close: close - DAY });
  }
  return out;
}

/**
 * When today's service ends, in minutes since midnight — past 1440 for a close
 * that runs into tomorrow. Null when the restaurant isn't open today or has no
 * hours on file.
 *
 * Exists for the reservation board, which needs the last seating rather than
 * the open/closed verdict. Where a day has two services this returns the end of
 * the last one: a booking board that stopped at the lunch close would refuse to
 * seat anyone for dinner.
 */
export function closingMinutesFor(hours: Hours, now: Date): number | null {
  if (!hours?.length) return null;
  const windows = windowsAround(hours, localDay(now));
  const nowAt = localMinutes(now);
  const ahead = windows.filter((w) => w.close > nowAt).map((w) => w.close);
  return ahead.length > 0 ? Math.max(...ahead) : null;
}

export function openStateFor(hours: Hours, now: Date): OpenState {
  if (!hours?.length) {
    return { kind: "unknown", label: "Hours vary", status: "calm" };
  }

  const today = localDay(now);
  const nowAt = localMinutes(now);
  const windows = windowsAround(hours, today);

  const current = windows.find((w) => nowAt >= w.open && nowAt < w.close);
  if (current) {
    const remaining = current.close - nowAt;
    if (remaining <= SOON_MINUTES) {
      return { kind: "soon", label: `Closing in ${remaining} min`, status: "urgent" };
    }
    return { kind: "open", label: hoursLabelFor(hours, today), status: "calm" };
  }

  // Not open. Say when it opens rather than just "closed" — a reader deciding
  // where to go this evening is better served by "Opens 5pm" than by a dead end.
  const next = windows.filter((w) => w.open > nowAt).sort((a, b) => a.open - b.open)[0];
  if (next) {
    return { kind: "closed", label: `Opens ${formatMinutes(next.open)}`, status: "calm" };
  }

  const todayLabel = hoursLabelFor(hours, today);
  return {
    kind: "closed",
    label: todayLabel ? "Closed now" : "Closed today",
    status: "calm",
  };
}
