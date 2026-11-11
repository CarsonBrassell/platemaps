"use client";

import { RefreshButton } from "@/components/TasteSection";
import { TastePickCard } from "@/components/TastePickCard";
import { pickDistanceLabel } from "@/lib/pickDistance";
import type { Coords } from "@/lib/geo";
import { qualityNote } from "@/lib/ratingDisplay";
import { usePickLog } from "@/lib/usePickLog";
import { useTaste, type TastePick } from "@/lib/useTaste";

/**
 * The "For me" button's results: the viewer's dish-based picks laid out as the
 * results grid, in place of the grid. Only mounted while that button is on, for
 * the one account that has the buttons (lib/discoverModes.ts), so the fetch
 * only happens then. The cards are the same TastePickCard the taste row used.
 */
const GRID = "grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2";

export function TastePicksGrid({
  nearOn,
  coords,
  waiting,
  served,
}: {
  /** The Nearby button is on: the picks are limited to within 5 miles. */
  nearOn: boolean;
  /** Where the reader is, for the distance on each pick and for the Nearby limit. */
  coords: Coords | null;
  /** Nearby is on and a position is still on its way: send nothing yet. */
  waiting: boolean;
  /** Restaurant id to the distance the results grid printed. */
  served?: ReadonlyMap<string, string>;
}) {
  /* Nearby is on and the position is gone: hold the request rather than fall back to city-wide picks. */
  const lost = nearOn && !coords && !waiting;
  const taste = useTaste({ limit: 24, near: nearOn ? coords : null, wait: waiting || lost });
  const { attach, handlers } = usePickLog({
    on: true,
    batch: taste.batch,
    ids: taste.picks.map((p) => p.restaurant.id),
    surface: "web",
  });

  if (lost) {
    return (
      <section aria-label="Your picks">
        <div className="rounded-2xl bg-white px-6 py-12 text-center">
          <p className="mx-auto max-w-xs text-sm text-zinc-900">
            Can&rsquo;t get your location, so there are no picks within 5 miles. Add an address in Filters.
          </p>
        </div>
      </section>
    );
  }

  if (taste.status === "loading") {
    return (
      <section aria-label="Your picks" aria-busy="true">
        <div className={GRID}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[300px] animate-pulse rounded-2xl bg-white/60" />
          ))}
        </div>
      </section>
    );
  }

  if (taste.status === "error") {
    return (
      <section aria-label="Your picks">
        <div className="rounded-2xl bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-900">Couldn&rsquo;t load your picks.</p>
          <button
            type="button"
            onClick={taste.refresh}
            className="mt-4 min-h-11 rounded-full bg-pm-orange px-5 text-[13px] font-medium text-[#F7F4EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (taste.picks.length === 0) {
    return (
      <section aria-label="Your picks">
        <div className="rounded-2xl bg-white px-6 py-12 text-center">
          <p className="mx-auto max-w-xs text-sm text-zinc-900">
            {nearOn
              ? "Nothing near you fits your taste yet. Turn off Nearby to see picks across the city."
              : "Post a few meals and your picks show up here."}
          </p>
        </div>
      </section>
    );
  }

  const card = (p: TastePick) => (
    <TastePickCard
      key={p.restaurant.id}
      restaurant={p.restaurant}
      score={p.plateScore}
      reason={p.reason.text}
      reasonLines={3}
      quality={qualityNote(p.restaurant.rating, p.restaurant.reviewCount)}
      distance={pickDistanceLabel(p.restaurant, coords, served)}
      shape="crop"
      className="min-w-0"
      onBeen={() => taste.apply({ kind: "been", value: p.restaurant.id })}
      onHide={() => taste.apply({ kind: "hide", value: p.restaurant.id })}
    />
  );

  return (
    <section ref={attach} {...handlers} aria-labelledby="your-picks">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
        <h2 id="your-picks" className="mono-label text-zinc-500">
          {taste.shortHeader}
        </h2>
        {taste.signedIn && <RefreshButton refreshing={taste.refreshing} onRefresh={taste.refresh} />}
      </div>

      {taste.undo && (
        <div
          role="status"
          className="mb-3 flex items-center justify-between rounded-xl bg-pm-grey-tint px-4 py-2.5 text-[13px] text-pm-grey-text"
        >
          <span>{taste.undo.label}</span>
          <button
            type="button"
            onClick={taste.undo.run}
            className="font-medium text-pm-orange-text underline underline-offset-2"
          >
            Undo
          </button>
        </div>
      )}

      <div className={`${GRID} motion-safe:transition-opacity${taste.refreshing ? " opacity-60" : ""}`}>
        {taste.picks.map(card)}
      </div>
    </section>
  );
}
