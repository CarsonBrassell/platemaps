import Link from "next/link";
import { Header } from "@/components/Header";

/**
 * DRAFT SURFACE — index for the map-search redesign.
 *
 * Not linked from anywhere in the app and not meant to be: these three routes
 * exist so a direction can be picked by looking at candidates on the real map,
 * over the real moving backdrop, rather than at a comp. `/feed` still renders
 * the shipped `MapSearch` and is untouched by everything under here.
 *
 * The whole experiment is `src/app/drafts/` plus `src/components/drafts/`, and
 * one optional `renderSearch` prop on `RestaurantMap` that defaults to the
 * shipped field. Deleting those two folders and that prop removes it entirely.
 */

const VARIANTS = [
  {
    slug: "lantern",
    name: "Lantern",
    tag: "Quiet / glass",
    intent:
      "A 44px circle at rest that expands into a field. Frosted glass over the map, ember only on the focus ring and the selected row — the map stays the hero and the control nearly disappears until it is wanted.",
    cost: "Icon-only at rest is the least discoverable of the three, and glass has to hold its contrast floor over a lit district rather than over water. Offers the city's top-rated before you type.",
  },
  {
    slug: "marquee",
    name: "Marquee",
    tag: "Safe / solid",
    intent:
      "Always open, solid warm-dark card wearing the same fill and ember hairline as the zoom stack in the other corner — visibly a sibling of the map's existing chrome. Names in Fraunces, ratings in mono ember.",
    cost: "Highest legibility over any map content and the lowest risk of the three; it also asks for the most room and is the least surprising. Offers the places you have flown to before, falling back to top-rated.",
  },
  {
    slug: "ember",
    name: "Ember",
    tag: "Bold / map-native",
    intent:
      "Borrows the comment bubble's clothes instead of the app's — the same warm near-white fill, hairline, 8px corner and mono meta row — so a result reads as another annotation on the map. Hovering or arrowing a row lights that restaurant's ember before you commit.",
    cost: "A near-white card is least separated exactly where the map is brightest, so its hairline is load-bearing. Offers whatever is in the current frame before you type.",
  },
];

export default function MapSearchDraftsIndex() {
  return (
    <div className="mx-auto w-full max-w-7xl pb-12">
      <Header />

      <div className="px-4 pt-2 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <p className="mono-label text-pm-orange-text">Draft surface</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-zinc-900">
            Map search, three directions
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-pm-grey-text">
            Three candidate treatments for the search field on the feed map, each
            mounted on the real map so they can be judged against a backdrop that
            moves and changes colour as you pan. Pan each one over Gaslamp or
            North Park before deciding — the orange heatmap pools are where a
            floating control is hardest to read.
          </p>
          <p className="mt-2 max-w-2xl text-sm text-pm-grey-text">
            Nothing here ships. <span className="font-medium text-zinc-900">/feed</span>{" "}
            still renders the field that was signed off this session, and none of
            these pages can change it.
          </p>

          <ul className="mt-6 flex flex-col gap-4">
            {VARIANTS.map((variant) => (
              <li key={variant.slug}>
                <Link
                  href={`/drafts/map-search/${variant.slug}`}
                  className="block rounded-2xl bg-white p-5 transition-colors hover:bg-pm-orange-tint/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-display text-xl font-semibold text-zinc-900">
                      {variant.name}
                    </h2>
                    <span className="mono-label shrink-0 text-zinc-500">{variant.tag}</span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-700">{variant.intent}</p>
                  <p className="mt-2 text-sm text-zinc-500">{variant.cost}</p>
                </Link>
              </li>
            ))}
          </ul>

          {/* A later, narrower pass. The three above each change several things
              at once, which makes them impossible to diff; this one holds
              everything still and swaps only the shape of the box. */}
          <p className="mt-6 text-sm text-pm-grey-text">
            Then, narrower:{" "}
            <Link
              href="/drafts/map-search/field"
              className="font-medium text-pm-orange-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              nine container shapes
            </Link>{" "}
            for the field itself — one live map, a picker that swaps the
            treatment on it, and no dropdown at all.
          </p>

          <p className="mt-6 text-sm text-pm-grey-text">
            All three share one behaviour model — the same 150ms debounce, the
            same ranking, the same combobox keyboard handling, the same camera
            flight — so what differs between them is design, not accident.
          </p>
        </div>
      </div>
    </div>
  );
}
