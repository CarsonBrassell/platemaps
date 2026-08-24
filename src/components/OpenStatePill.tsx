"use client";

import { useSyncExternalStore } from "react";
import { hoursLabelFor, localDay, type Hours } from "@/lib/openState";
import { getClockSnapshot, getServerClockSnapshot, subscribeToClock } from "@/lib/clock";

/**
 * Today's hours. Not a claim about whether the place is open.
 *
 * This used to compute open/closed and change what it said accordingly — a
 * green dot and "11am – 10pm" when open, "Closing in 14 min" when nearly shut,
 * "Opens 5pm" when closed, "Hours vary" when we had no data. Every one of those
 * is an assertion, and the last two are assertions made from an absence.
 *
 * A card is the wrong place to make them. It renders hundreds at a time from a
 * corpus where hours arrive gradually, so the states were mostly reporting the
 * state of our data rather than the state of the restaurant, and "Hours vary"
 * was really "we have not got to this one yet" — dressed up as information
 * about the business.
 *
 * So it prints the hours and stops. A restaurant we have hours for shows them;
 * one we don't shows nothing, which is the honest rendering of not knowing and
 * is also why hours are no longer a precondition for appearing on the site at
 * all (see scripts/publish-check.mjs).
 *
 * The judgement did not disappear, it moved to where it belongs: the "Open now"
 * filter in lib/discoverFilters.ts, which is a question the reader asked rather
 * than a label the card volunteered — and which now excludes restaurants whose
 * hours are unknown instead of passing them.
 *
 * Still client-rendered, because which day it is depends on the clock and the
 * homepage is prerendered; a server render would freeze the day at build time.
 */
export function OpenStatePill({ hours }: { hours: Hours }) {
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);

  // Pre-mount placeholder holds the pill's height so the card doesn't reflow.
  if (!now) {
    return <span className="inline-flex h-7 items-center" aria-hidden="true" />;
  }

  const label = hoursLabelFor(hours, localDay(now));
  if (!label) return null;

  return (
    <span className="inline-flex items-center rounded-full bg-pm-grey-tint px-3 py-1.5 font-mono text-xs font-medium text-pm-grey-text">
      {label}
    </span>
  );
}
