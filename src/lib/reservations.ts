/**
 * MOCKED availability model — walk-in wait times and bookable tables.
 *
 * ⚠ Nothing here is real. PRODUCT.md records that invented wait copy shipped
 * once and was deliberately removed, because no source we hold exposes
 * busyness. This module exists to prototype what a first-party reservation
 * surface would look like; the numbers are a deterministic hash of the
 * restaurant id and the clock, not a measurement. Do not present this as live
 * data, and delete the generator wholesale when a real provider is wired in —
 * `ReservationPanel` only needs `waitEstimate` and `reservationBoard` to keep
 * their shapes.
 *
 * Deterministic on purpose: the same restaurant shows the same wait for a
 * twenty-minute stretch, so the number doesn't flicker on every render, and
 * two restaurants never show the same figure by accident.
 *
 * Times are minutes since midnight in San Diego local time, the same
 * convention `openState.ts` uses — see that file for why the app has one
 * local clock.
 */

import { localMinutes, parseClosing } from "./openState";

/** Anything closing before 5am belongs to the *next* day. Mirrors openState. */
const LATE_NIGHT_CUTOFF = 5 * 60;
/** Soonest a table can be booked from now. */
const LEAD_MINUTES = 30;
const SLOT_STEP = 15;
/** The kitchen stops seating before the doors close. */
const LAST_SEATING_BEFORE_CLOSE = 45;
/** Enough choice to feel like a board, few enough to sit in the side rail. */
const SLOT_COUNT = 3;
/** Used when `closingTime` is "Hours vary" and there's nothing to parse. */
const FALLBACK_CLOSE = 22 * 60;
/** Where tomorrow's board starts once tonight is done. */
const TOMORROW_OPEN = 17 * 60;

/** The bands a wait can land in. Ordered — index is the severity. */
const WAIT_BANDS = [0, 0, 10, 15, 25, 40] as const;
/** Dinner rush nudges the band up one step. */
const PEAK_START = 18 * 60;
const PEAK_END = 20 * 60 + 30;

export const PARTY_SIZES = [1, 2, 3, 4, 5, 6] as const;
export type PartySize = (typeof PARTY_SIZES)[number];

export type WaitEstimate = {
  /** Minutes to a walk-in table. Zero means walk straight in. */
  minutes: number;
  partiesAhead: number;
  /** Drives the status dot, matching OpenStatePill's vocabulary. */
  tone: "calm" | "urgent";
};

export type ReservationBoard = {
  day: "today" | "tomorrow";
  /** Bookable times, minutes since midnight. Never empty. */
  slots: number[];
};

/** Slots from here on are an evening, and "Tonight" reads better than "Today". */
export const EVENING_START = 17 * 60;

/** FNV-1a. Small, stable, and no dependency — the seed decides the band. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/** Both sides onto one continuous timeline, so 2am compares against 11pm. */
function normalize(minutes: number): number {
  return minutes < LATE_NIGHT_CUTOFF ? minutes + 24 * 60 : minutes;
}

/**
 * The current walk-in wait, or null when the restaurant is closed — a closed
 * kitchen has no wait, and showing "0 min" there would read as "walk in now".
 */
export function waitEstimate(
  restaurantId: string,
  now: Date,
  isOpen: boolean,
): WaitEstimate | null {
  if (!isOpen) return null;

  const nowMinutes = localMinutes(now);
  // One draw per twenty minutes: long enough to sit still while you read the
  // page, short enough that the number visibly moves over an evening.
  const bucket = Math.floor(nowMinutes / 20);
  const draw = hash(`${restaurantId}:${bucket}`);

  let band = draw % WAIT_BANDS.length;
  if (nowMinutes >= PEAK_START && nowMinutes <= PEAK_END) {
    band = Math.min(band + 1, WAIT_BANDS.length - 1);
  }

  const minutes = WAIT_BANDS[band];
  return {
    minutes,
    // Roughly a table every eight minutes, so the two figures agree.
    partiesAhead: Math.round(minutes / 8),
    tone: minutes >= 25 ? "urgent" : "calm",
  };
}

/**
 * Bookable times. Rolls to tomorrow once tonight's last seating has passed,
 * so the board is never empty and never offers a table in the past.
 */
export function reservationBoard(closingTime: string, now: Date): ReservationBoard {
  const closes = parseClosing(closingTime) ?? FALLBACK_CLOSE;
  const closesAt = normalize(closes);
  const nowAt = normalize(localMinutes(now));

  const first = ceilTo(nowAt + LEAD_MINUTES, SLOT_STEP);
  const lastSeating = closesAt - LAST_SEATING_BEFORE_CLOSE;

  if (first > lastSeating) {
    return { day: "tomorrow", slots: buildSlots(TOMORROW_OPEN, TOMORROW_OPEN + SLOT_COUNT * SLOT_STEP) };
  }
  return { day: "today", slots: buildSlots(first, lastSeating) };
}

function buildSlots(first: number, lastSeating: number): number[] {
  const slots: number[] = [];
  for (let t = first; t <= lastSeating && slots.length < SLOT_COUNT; t += SLOT_STEP) {
    slots.push(t);
  }
  return slots;
}

/** 1140 -> "7:00 PM". Wraps past-midnight slots back onto a real clock face. */
export function formatClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}
