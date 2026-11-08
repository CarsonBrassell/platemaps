import type { Corpus } from "@/lib/discover";
import { dishRowsFor, profileRowsForDishTaste } from "@/lib/db";
import { createDishIndexBuilder, type DishIndex } from "@/lib/dishTaste";

/**
 * The dish index (lib/dishTaste.ts), read once and kept: about 400K menu lines
 * boiled down to a few megabytes. It is the same for every viewer and carries
 * nothing personal, but it only changes when a menu batch lands, so it lives
 * far longer than the corpus does (a quarter of a day) and a lapsed copy is
 * handed out while a new one is built behind it. Server-only.
 *
 * Read in pages of restaurants, since the driver's HTTP responses cap near 64MB
 * and a whole menu table would not fit in one.
 */
const INDEX_TTL_MS = 6 * 60 * 60_000;
const PAGE_PLACES = 400;

let cached: { at: number; value: DishIndex; ids: string } | null = null;
let building: Promise<DishIndex> | null = null;

async function build(restaurantIds: readonly string[]): Promise<DishIndex> {
  const builder = createDishIndexBuilder(restaurantIds);
  for (let i = 0; i < restaurantIds.length; i += PAGE_PLACES) {
    builder.add(await dishRowsFor(restaurantIds.slice(i, i + PAGE_PLACES)));
  }
  return builder.finish(await profileRowsForDishTaste());
}

/**
 * The index for `corpus`. Concurrent callers share one build; a failure is
 * thrown to them all (the route falls back to its ordinary picks) and is not
 * cached, so the next request tries again.
 */
export async function loadDishIndex(corpus: Corpus): Promise<DishIndex> {
  const ids = corpus.restaurants.map((r) => r.id);
  const key = `${ids.length}:${ids[0] ?? ""}:${ids[ids.length - 1] ?? ""}`;
  const now = Date.now();
  const fresh = cached && cached.ids === key;
  if (cached && fresh && now - cached.at < INDEX_TTL_MS) return cached.value;

  if (!building) {
    building = build(ids)
      .then((value) => {
        cached = { at: Date.now(), value, ids: key };
        return value;
      })
      .finally(() => {
        building = null;
      });
  }
  // A lapsed copy answers now; the build behind it replaces it for the next request.
  if (cached && fresh) {
    building.catch(() => {});
    return cached.value;
  }
  return building;
}
