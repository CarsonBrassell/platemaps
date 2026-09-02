"use client";

import { CoachTour, useCoachTour } from "@/components/tour/CoachTour";

/**
 * Where the first-run tour is hung.
 *
 * The layout is a server component and the tour is not, so this is the client
 * boundary between them — it exists to hold the one hook call and nothing else.
 *
 * Mounted in the **root** layout rather than on the feed, because every step of
 * the walk ends in a route change: anything mounted by a page would unmount
 * itself the first time somebody pressed the control it was pointing at. `/m`
 * nests under the same layout, so this one mount serves both bodies.
 */
export function CoachTourMount() {
  const tour = useCoachTour();
  if (!tour.open) return null;
  return <CoachTour onDone={tour.close} />;
}
