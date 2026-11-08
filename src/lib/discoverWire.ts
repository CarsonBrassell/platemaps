import type { DiscoverPage } from "@/lib/discover";
import type { FacetCounts } from "@/lib/discoverFilters";
import type { FullTastePrefs } from "@/lib/taste";

/* --- "For me" ------------------------------------------------------------
 *
 * Discover's personal order (probe/for-me/PLAN.md). These types are the whole
 * contract between the server and the two clients. They live here, not in
 * lib/discover.ts, because a client component may import this file and may not
 * import that one; lib/discover.ts re-exports them.
 *
 * Everything here is personal, so it only ever rides on the private POST
 * (`Cache-Control: private, no-store`). The public GET is CDN-cached by URL and
 * never carries any of it.
 */

/** Why a place is on the For me list, in one line. Built on the server from the
    viewer's own signals and never longer than 56 characters. */
export type ForMeReason = {
  kind: "like" | "pick" | "friends" | "cuisine" | "price" | "near" | "rated";
  text: string;
  /** Friends' first names ("Ana and Ben have been"), present only when a friend
      has been and `text` is not already that line (kind other than "friends").
      Never a count; the key is absent when there are no friends. */
  friends?: string;
};

/**
 * What For me has learned about the viewer, for the one quiet line above the
 * list ("Tuned to you - $11-18 a plate - usually within 7 mi - pizza, coffee").
 * Each part is null (or empty) when there is too little to say, and the line
 * is left out when all of them are. Built from the viewer's own data and sent
 * only on their own private POST.
 */
export type ForMeProfile = {
  /** The usual plate range in whole dollars, as printed; null with no prices to go on. */
  budget: { lo: number; hi: number } | null;
  /** How far they usually go, in whole miles; null under three places with a location. */
  radiusMi: number | null;
  /** Their leading cuisines, the strongest first; empty with no history or picks. */
  cuisines: string[];
};

/** What the For me list was built from, and how much of it matched. */
export type ForMeInfo = {
  /** `history`: places the viewer has been; `picks`: only cuisines or places
      they chose; `none`: no signal at all, so the list is the "Also well rated"
      tail and nothing else. */
  basis: "history" | "picks" | "none";
  /** The line above the list, e.g. "Based on 3 places you've been". */
  header: string;
  /** How many places the history part was built from. */
  seeds: number;
  /** How many of the leading results are matches; every result after them is
      the "Also well rated" tail. Counted over the filtered list, not the corpus,
      so it can be 0 on a page whose total is not. */
  matched: number;
  /** True when the order is plain search relevance: text search wins over
      For me (decision D3), and this tells the client not to wait for a personal
      order that is not coming. */
  paused?: boolean;
  /** The "Tuned to you" line's parts; see `ForMeProfile`. Absent on a paused answer. */
  profile?: ForMeProfile;
};

/** The body of `POST /api/restaurants/discover`. `forMe` and `prefs` are the
    For me additions; `prefs` is the signed-out (localStorage) copy of the
    viewer's taste and is ignored for a signed-in viewer whose row exists. */
export type DiscoverRequestBody = {
  search: string;
  shown?: number;
  coords?: { lat: number; lng: number };
  forMe?: true;
  prefs?: FullTastePrefs;
};

/**
 * `DiscoverPage` over JSON.
 *
 * The server-rendered page reaches the client through React's serializer,
 * which carries a `Map`. `POST /api/restaurants/discover` answers with
 * `JSON.stringify`, which turns every one of the facet-count Maps into `{}`,
 * and the first `counts.cuisine.get(...)` in the rail is a runtime error with
 * a working grid behind it. The located view crashed this way from the day
 * Nearby shipped; nobody had it on with a granted permission.
 *
 * So the route sends the four Maps as entry lists and the two clients revive
 * them, through this pair and nothing else. Type-only imports on purpose: this
 * is imported by client components, and `lib/discover.ts` reaches the database.
 */
const MAP_FACETS = ["neighborhood", "cuisine", "price", "aspect"] as const;
type MapFacet = (typeof MAP_FACETS)[number];

export type FacetCountsWire = Omit<FacetCounts, MapFacet> & Record<MapFacet, [string, number][]>;
export type DiscoverPageWire = Omit<DiscoverPage, "counts"> & { counts: FacetCountsWire };

export function toWire(page: DiscoverPage): DiscoverPageWire {
  const counts = { ...page.counts } as unknown as FacetCountsWire;
  for (const key of MAP_FACETS) counts[key] = [...page.counts[key]];
  return { ...page, counts };
}

export function fromWire(wire: DiscoverPageWire): DiscoverPage {
  const counts = { ...wire.counts } as unknown as FacetCounts;
  for (const key of MAP_FACETS) counts[key] = new Map(wire.counts[key]);
  return { ...wire, counts };
}
