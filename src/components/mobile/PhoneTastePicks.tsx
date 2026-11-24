"use client";

import { useMemo } from "react";
import { PickButtons, RefreshButton, UndoBar } from "@/components/mobile/PhoneTasteSection";
import { PhoneRestaurantCardGrid } from "@/components/mobile/PhoneRestaurantCardGrid";
import type { Coords } from "@/lib/geo";
import { pickDistanceLabel } from "@/lib/pickDistance";
import { packColumns } from "@/lib/photoShape";
import { qualityNote } from "@/lib/ratingDisplay";
import { usePickLog } from "@/lib/usePickLog";
import { useTaste } from "@/lib/useTaste";

const GRID = "grid grid-cols-2 items-start gap-2 px-4";
const COLUMN = "grid auto-rows-min content-start gap-2";

/**
 * The For me button's results: the reader's taste picks laid out as the
 * normal two-column grid, in place of the Discover results. Only the account
 * on lib/forMeGate.ts (isDiscoverModesUser) ever renders this.
 *
 * `near` is the Nearby button: the picks are asked for within the radius of
 * `coords`. `wait` holds the request while a position is still being found.
 */
export function PhoneTastePicks({
  coords,
  served,
  near,
  wait,
  lost,
}: {
  coords: Coords | null;
  served?: ReadonlyMap<string, string>;
  near: boolean;
  wait: boolean;
  /** Nearby is on and the position is gone: hold the request, never fall back to city-wide picks. */
  lost: boolean;
}) {
  const taste = useTaste({ limit: 24, near: near ? coords : null, wait: wait || lost });
  const ids = useMemo(() => taste.picks.map((p) => p.restaurant.id), [taste.picks]);
  const { attach, handlers } = usePickLog({ on: true, batch: taste.batch, ids, surface: "phone" });

  const columns = useMemo(() => {
    const byId = new Map(taste.picks.map((p) => [p.restaurant.id, p]));
    return packColumns(
      taste.picks.map((p) => p.restaurant),
      2,
    ).map((column) => column.map((r) => byId.get(r.id)!));
  }, [taste.picks]);

  if (lost) {
    return (
      <section aria-label="For me" className="px-4 py-16 text-center">
        <p className="mx-auto max-w-[17rem] text-sm leading-snug text-pm-grey-text">
          Can&apos;t get your location, so there are no picks within 5 miles. Add an address in Filters.
        </p>
      </section>
    );
  }

  if (taste.status === "loading") {
    return (
      <section aria-label="For me" aria-busy="true">
        <div className={GRID}>
          {[0, 1].map((c) => (
            <div key={c} className={COLUMN}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[260px] animate-pulse rounded-xl bg-white/60" />
              ))}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (taste.status === "error") {
    return (
      <section aria-label="For me" className="px-4 py-16 text-center">
        <p className="font-display text-lg text-zinc-900">Couldn&apos;t load your picks.</p>
        <button
          type="button"
          onClick={taste.refresh}
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          Try again
        </button>
      </section>
    );
  }

  if (taste.picks.length === 0) {
    return (
      <section aria-label="For me" className="px-4 py-16 text-center">
        <p className="mx-auto max-w-[17rem] text-sm leading-snug text-pm-grey-text">
          {near
            ? "Nothing near you fits your taste yet. Turn off Nearby to see picks across the city."
            : "Post a few meals and your picks show up here."}
        </p>
      </section>
    );
  }

  return (
    <section ref={attach} {...handlers} aria-label="For me">
      <div className="flex items-center justify-between gap-3 px-4">
        <p className="text-[12px] text-zinc-500">{taste.shortHeader}</p>
        {taste.signedIn && <RefreshButton refreshing={taste.refreshing} onRefresh={taste.refresh} />}
      </div>
      {taste.undo && <UndoBar undo={taste.undo} />}
      <div className={`${GRID} motion-safe:transition-opacity${taste.refreshing ? " opacity-60" : ""}`}>
        {columns.map((column, i) => (
          <div key={i} className={COLUMN}>
            {column.map((p) => (
              <div key={p.restaurant.id} className="flex flex-col overflow-hidden rounded-xl bg-white">
                <PhoneRestaurantCardGrid
                  restaurant={p.restaurant}
                  score={p.plateScore ?? undefined}
                  distance={pickDistanceLabel(p.restaurant, coords, served)}
                  reason={p.reason.short}
                  reasonLines={3}
                  quality={qualityNote(p.restaurant.rating, p.restaurant.reviewCount)}
                />
                <div className="px-2 pb-1">
                  <PickButtons
                    name={p.restaurant.name}
                    onBeen={() => taste.apply({ kind: "been", value: p.restaurant.id })}
                    onHide={() => taste.apply({ kind: "hide", value: p.restaurant.id })}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
