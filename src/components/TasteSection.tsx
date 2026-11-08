"use client";

import Link from "next/link";
import { useState } from "react";
import { RestaurantCard } from "@/components/RestaurantCard";
import { TASTE_BTN, TastePickCard } from "@/components/TastePickCard";
import { TasteChips, TasteInvite, TasteSignUp } from "@/components/TasteChips";
import { useForMeAccess } from "@/lib/auth";
import { FOR_ME_PARAM } from "@/lib/discoverFilters";
import { distanceLabel, type Coords } from "@/lib/geo";
import { useTaste, type TastePick } from "@/lib/useTaste";

/**
 * "Your taste": the private picks section at the top of Discover. Everything
 * it shows comes from useTaste (one scorer, one payload, so web and phone
 * cannot drift); this file only lays it out. See probe/your-taste/DESIGN.md.
 *
 * For the accounts on lib/forMeGate.ts it is the small preview of the For me
 * list: "See all" opens that list (`?foryou=1`) rather than unfolding more cards
 * in place, and the chips and the card with its Been here / Not for me buttons
 * are shared with it (TasteChips, TastePickCard). Everyone else gets the section
 * as it was: "See all" unfolds 24 cards in a grid, the reason sits under the
 * card, and the distance is the seeded one.
 */
const PICKS_SHOWN = 12;
const PICKS_UNFOLDED = 24;

export function TasteSection({
  cuisines,
  coords = null,
}: {
  cuisines: string[];
  /** Where the reader is, for the distance on each pick; null when unknown. */
  coords?: Coords | null;
}) {
  const taste = useTaste();
  const access = useForMeAccess();
  const [editing, setEditing] = useState(false);
  const [all, setAll] = useState(false);
  const [more, setMore] = useState(false);

  if (taste.status === "loading") {
    return (
      <section aria-label="Your taste" aria-busy="true" className="mb-7 h-[430px]">
        <div className="mb-3 px-1">
          <h2 className="mono-label text-zinc-500">Your taste</h2>
        </div>
        <div className="mb-4 flex gap-2 px-1">
          {[88, 72, 64, 80, 70].map((w) => (
            <div
              key={w}
              className="h-9 animate-pulse rounded-full bg-white/70"
              style={{ width: w }}
            />
          ))}
        </div>
        <div className="flex gap-4 overflow-hidden px-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[300px] w-[240px] shrink-0 animate-pulse rounded-2xl bg-white/60"
            />
          ))}
        </div>
      </section>
    );
  }

  const { loves, skips } = taste.prefs;

  // No signal (or the fetch failed): the compact invite, never fake picks.
  if (taste.status === "error" || taste.basis === "none" || taste.picks.length === 0) {
    return (
      <section aria-labelledby="your-taste" className="mb-7">
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
          <h2 id="your-taste" className="mono-label text-zinc-500">
            Your taste
          </h2>
        </div>
        <TasteInvite
          cuisines={cuisines}
          loves={loves}
          skips={skips}
          apply={taste.apply}
          signedIn={taste.signedIn}
          more={more}
          onMore={() => setMore(true)}
        />
      </section>
    );
  }

  const picks = taste.picks.slice(0, !access && all ? PICKS_UNFOLDED : PICKS_SHOWN);

  // The card as it was: the reason under it rather than in it, buttons below.
  const card = (p: TastePick, width: string) => (
    <div
      key={p.restaurant.id}
      className={`flex flex-col overflow-hidden rounded-2xl bg-white ${width}`}
    >
      <div className="flex-1">
        <RestaurantCard restaurant={p.restaurant} score={p.plateScore ?? undefined} shape="crop" />
      </div>
      <div className="mt-auto px-3.5 pb-3">
        <p className="truncate text-[13px] text-zinc-500">{p.reason.text}</p>
        <div className="mt-1 flex gap-4">
          <button
            type="button"
            onClick={() => taste.apply({ kind: "been", value: p.restaurant.id })}
            className={TASTE_BTN}
          >
            Been here
          </button>
          <button
            type="button"
            onClick={() => taste.apply({ kind: "hide", value: p.restaurant.id })}
            className={TASTE_BTN}
          >
            Not for me
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <section aria-labelledby="your-taste" className="mb-7">
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <h2 id="your-taste" className="mono-label text-zinc-500">
          Your taste
        </h2>
        <span className="mono-label text-zinc-400">
          {taste.header} ·{" "}
          <button
            type="button"
            aria-expanded={editing}
            onClick={() => setEditing((e) => !e)}
            className="uppercase underline underline-offset-2"
          >
            Edit
          </button>
        </span>
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

      {editing && (
        <div className="mb-4 rounded-2xl bg-white p-5">
          <TasteChips
            mode="edit"
            cuisines={cuisines}
            loves={loves}
            skips={skips}
            apply={taste.apply}
          />
          <p className="mb-3 text-[13px] text-zinc-500">
            These only change Your taste, not the rest of Discover.
          </p>
          <button
            type="button"
            onClick={() => taste.apply({ kind: "reset" })}
            className={TASTE_BTN}
          >
            Reset my taste
          </button>
        </div>
      )}

      <TasteChips
        mode="row"
        cuisines={cuisines}
        loves={loves}
        skips={skips}
        apply={taste.apply}
        more={more}
        onMore={() => setMore(true)}
      />

      {/* For the For me accounts, a link and not a toggle: the full list is the
          For me view of Discover, the same ranking with every place on it. A real
          anchor so it opens in a new tab and shows up in history like any other
          page. Everyone else still unfolds the grid in place. */}
      <div className="mb-2 flex justify-end px-1">
        {access ? (
          <Link
            href={`/?${FOR_ME_PARAM}=1`}
            className="mono-label text-zinc-500 underline underline-offset-2"
          >
            See all
          </Link>
        ) : (
          <button
            type="button"
            aria-expanded={all}
            onClick={() => setAll((a) => !a)}
            className="mono-label text-zinc-500 underline underline-offset-2"
          >
            {all ? "Show fewer" : "See all"}
          </button>
        )}
      </div>

      {all && !access ? (
        <div className="grid grid-cols-2 items-stretch gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {picks.map((p) => card(p, "min-w-0"))}
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-stretch gap-4">
            {picks.map((p) =>
              access ? (
                <TastePickCard
                  key={p.restaurant.id}
                  restaurant={p.restaurant}
                  score={p.plateScore}
                  reason={p.reason.text}
                  distance={distanceLabel(p.restaurant, coords)}
                  shape="crop"
                  className="w-[240px] shrink-0"
                  onBeen={() => taste.apply({ kind: "been", value: p.restaurant.id })}
                  onHide={() => taste.apply({ kind: "hide", value: p.restaurant.id })}
                />
              ) : (
                card(p, "w-[240px] shrink-0")
              ),
            )}
          </div>
        </div>
      )}
      <TasteSignUp signedIn={taste.signedIn} />
    </section>
  );
}
