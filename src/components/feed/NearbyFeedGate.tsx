"use client";

import type { ReactNode } from "react";
import { PinIcon } from "@/components/icons";
import { NEARBY_RADIUS_MI } from "@/lib/geo";
import type { Nearby } from "@/lib/nearby";

/**
 * What the Nearby sort shows in place of the post list until there is a fix
 * to rank against.
 *
 * A fourth caller of the same white-card shape `EmptyFeedState`'s `Shell` and
 * `PhoneFeedScreen`'s `PhoneFeedState` already draw, restated here rather than
 * exported from either: those two are scoped to their own screen's routing
 * (`EmptyFeedState`'s sign-in link is `/account`, the phone one is `/m/post`),
 * and this component has no destination of its own to disagree about — it's
 * the same shell with different words, shared by both screens because the
 * `Nearby` state it reads is the one thing that must not drift between them.
 *
 * `useNearby()` never raises the permission prompt itself (see lib/nearby.ts)
 * — it only reflects whatever the tap on the Nearby segment already started.
 * That's why this component takes the whole `Nearby` object rather than just
 * `state`: "failed" is the one state a person can do something about, and the
 * something is `nearby.request()` again, not a second control this file would
 * otherwise have to invent.
 */
function Shell({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-pm-grey-tint text-pm-grey-text">
        {icon}
      </span>
      <p className="font-display text-base font-semibold text-zinc-900">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-zinc-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const primaryButton =
  "inline-flex min-h-11 items-center gap-2 rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] transition-transform hover:brightness-105 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

export function NearbyFeedGate({ nearby }: { nearby: Nearby }) {
  switch (nearby.state) {
    // "idle" and "locating" read the same: the prompt only exists for the
    // instant between the tap and the browser answering it (or, on a permission
    // already granted, there's no prompt at all and this is the whole wait) —
    // splitting them into two messages would just be two words flickering past
    // for a case nobody needs told apart.
    case "idle":
    case "locating":
      return (
        <Shell
          icon={<PinIcon className="h-6 w-6" />}
          title="Finding plates near you…"
          body={`Once we have your position, this shows plates within ${NEARBY_RADIUS_MI} mi, ranked the same way Trending is.`}
        />
      );
    case "denied":
      return (
        <Shell
          icon={<PinIcon className="h-6 w-6" />}
          title="Location is blocked"
          body={`PlateMaps can't see where you are. Allow location for this site in your browser or phone settings to see plates within ${NEARBY_RADIUS_MI} mi.`}
        />
      );
    case "failed":
      return (
        <Shell
          icon={<PinIcon className="h-6 w-6" />}
          title="Couldn't get your location"
          body="That can happen on a weak signal or a slow GPS fix — it's usually worth another try."
          action={
            <button type="button" onClick={() => nearby.request()} className={primaryButton}>
              Try again
            </button>
          }
        />
      );
    case "unsupported":
      return (
        <Shell
          icon={<PinIcon className="h-6 w-6" />}
          title="This device can't share its location"
          body="Nearby needs a position to filter on, and this browser has nothing to offer one. New and Trending still show every plate in San Diego."
        />
      );
    // "ready" is the caller's job to gate on before rendering this component
    // at all — see the `showNearbyGate` checks in feed/page.tsx and
    // PhoneFeedScreen.tsx. Handled here too so the switch stays exhaustive
    // rather than needing a `default` that silently swallows a state that
    // should never reach it.
    case "ready":
      return null;
  }
}
