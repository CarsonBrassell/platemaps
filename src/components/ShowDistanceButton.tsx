"use client";

import { useForMeAccess } from "@/lib/auth";
import type { Nearby } from "@/lib/nearby";
import { useQueryString } from "@/lib/queryString";
import { wantsPositionOf } from "@/lib/useDiscoverQuery";

/**
 * The quiet offer above Discover's grid on a bare landing: "Show distance from
 * you".
 *
 * A bare landing never asks for a position (lib/useDiscoverQuery.ts has the
 * rule: narrowing the grid or turning on For me asks, nothing else does), so
 * the cards would carry no distance at all. This is the way to ask on purpose,
 * with the reason in the label. One tap on the shared `nearby.request`, and the
 * query re-asks with the position the moment it lands.
 *
 * It is there while the answer is "not yet" (`idle`) or "try again" (`failed`)
 * and gone for every other state: `locating` has the browser's own prompt up,
 * `ready` has the distances on the cards, and `denied` / `unsupported` are
 * answers a button cannot change. Plain text on the page's ground, so the
 * muted colour is --pm-grey-text, not zinc-500.
 *
 * Two more things keep it from flashing in and out, which would drag the whole
 * grid 44px each way. It waits for `nearby.offerable`, so the prerendered shell
 * never prints it for a visitor whose position is about to arrive without a
 * tap (permission already granted, a saved address), and it stands down while
 * the URL itself asks for a position (a filter or For me is on): the request
 * that ask makes is one effect away, and `idle` is still what this render sees.
 *
 * Only for the accounts on lib/forMeGate.ts: it draws nothing for anyone else,
 * and the callers do not draw its wrapper either.
 */
export function ShowDistanceButton({
  nearby,
  className = "",
}: {
  nearby: Nearby;
  className?: string;
}) {
  const access = useForMeAccess();
  const asking = wantsPositionOf(useQueryString(), access);
  if (!access || nearby.coords || !nearby.offerable) return null;
  if (nearby.state !== "idle" && nearby.state !== "failed") return null;
  // A filter or For me is on and nothing has been asked yet: the hook's effect
  // asks next. A *failed* ask is the reader's to retry, so that still shows.
  if (asking && nearby.state === "idle") return null;
  return (
    <button
      type="button"
      onClick={nearby.request}
      className={`inline-flex min-h-11 items-center text-[13px] text-pm-grey-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${className}`}
    >
      Show distance from you
    </button>
  );
}
