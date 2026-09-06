import type { DiscoverPage } from "@/lib/discover";
import type { FacetCounts } from "@/lib/discoverFilters";

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
