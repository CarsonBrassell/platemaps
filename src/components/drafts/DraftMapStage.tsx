"use client";

import { useEffect, useMemo, useState, type ComponentType, type RefObject } from "react";
import dynamic from "next/dynamic";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { RestaurantView } from "@/data/restaurants";
import type { Dish } from "@/data/dishes";
import { mapCommentsByRestaurant, withDishIds, type MapComment } from "@/data/mapComments";

/**
 * DRAFT SURFACE — the real map, with one candidate search field on it.
 *
 * The whole reason the drafts are routes and not a mockup: the thing under
 * review is a control read against a backdrop that moves and changes colour
 * while you use it — near-black water, mid-grey blocks, the orange heatmap
 * pools over Gaslamp and North Park. A static comp proves nothing about any of
 * them, and the glass variant in particular is only honest if you can pan it
 * over a lit district.
 *
 * So this mounts the shipped `RestaurantMap` unchanged and swaps only the field,
 * through its `renderSearch` seam. What it deliberately does NOT reproduce from
 * `/feed` is everything irrelevant to the comparison: no vote or heart chips
 * (they need a session), no Discover/Friends switch, no post feed. Bubbles come
 * from the seeded map chatter, which is static and needs no auth, so the field
 * is still being judged over real cards and real leader lines rather than a bare
 * dot field.
 */

const RestaurantMap = dynamic(
  () => import("@/components/RestaurantMap").then((mod) => mod.RestaurantMap),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="flex h-[540px] w-full items-center justify-center rounded-xl bg-[#191c22] font-mono text-sm text-[#8b939c]"
      >
        Loading map…
      </div>
    ),
  },
);

/** What every draft field takes: the map (to fly, and for variant C to paint a
 *  highlight layer off the live source) and the corpus the map is already
 *  drawing (for the resting offer and the empty state's suggestions). */
export type DraftSearchField = ComponentType<{
  mapRef: RefObject<MapLibreMap | null>;
  seeds: RestaurantView[];
}>;

export function DraftMapStage({ field: Field }: { field: DraftSearchField }) {
  const [restaurants, setRestaurants] = useState<RestaurantView[]>([]);
  const [menus, setMenus] = useState<Record<string, Dish[]>>({});

  /* The same pair `/feed` fetches, for the same reason: half of this data draws
     pins with dead dish links. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [restaurantRes, dishRes] = await Promise.all([
          fetch("/api/restaurants"),
          fetch("/api/restaurants/dishes"),
        ]);
        if (!restaurantRes.ok || !dishRes.ok) return;
        const [{ restaurants: rows }, { dishes }] = await Promise.all([
          restaurantRes.json() as Promise<{ restaurants: RestaurantView[] }>,
          dishRes.json() as Promise<{ dishes: Record<string, Dish[]> }>,
        ]);
        if (cancelled) return;
        setRestaurants(rows);
        setMenus(dishes);
      } catch {
        // The page still renders; the map just comes up empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const comments = useMemo(() => {
    const out: Record<string, MapComment[]> = {};
    for (const restaurant of restaurants) {
      out[restaurant.id] = withDishIds(
        mapCommentsByRestaurant[restaurant.id] ?? [],
        menus[restaurant.id] ?? [],
      );
    }
    return out;
  }, [restaurants, menus]);

  /* RestaurantMap's seam hands its field one prop, `mapRef`. The corpus is
     bound in here rather than threaded through the map, which has no business
     knowing what a draft needs. Memoised on the corpus so the field isn't
     remounted (and its query thrown away) on every render of this stage. */
  const BoundField = useMemo(() => {
    function DraftField({ mapRef }: { mapRef: RefObject<MapLibreMap | null> }) {
      return <Field mapRef={mapRef} seeds={restaurants} />;
    }
    return DraftField;
  }, [Field, restaurants]);

  return (
    <div className="overflow-hidden rounded-2xl bg-white">
      {/* `pt-10` on MapLibre's control stack is kept even though the
          Discover/Friends switch that forced it is not on this page. The switch
          is what the shipped field has to clear at 390px — the zoom stack
          pushed down 40px and reaching 41px in from the map's edge — and a
          draft judged against a *different* obstacle course would prove nothing
          about the collision the last pass found. Same geometry, one fewer
          control drawn. */}
      <div className="relative p-2.5 [&_.maplibregl-ctrl-top-left]:pt-10">
        <RestaurantMap
          restaurants={restaurants}
          commentsByRestaurant={comments}
          mode="discover"
          searchField={BoundField}
        />
      </div>
    </div>
  );
}
