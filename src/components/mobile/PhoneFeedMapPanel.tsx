"use client";

import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Map as MapLibreMap } from "maplibre-gl";
import { MapSearch } from "@/components/MapSearch";
import type { MapRestaurant } from "@/components/RestaurantMap";
import { mapCommentsByRestaurant, withDishIds, type MapComment } from "@/data/mapComments";
import type { Dish } from "@/data/dishes";
import type { Post } from "@/components/feed/types";

/**
 * The map feed, phone version — the third tab on /m/feed.
 *
 * `RestaurantMap` itself is reused whole and unmodified: same night style, same
 * unclustered WebGL ember layer, same bubbles. AGENTS.md is explicit that the
 * map is a confirmed exception to the cream world and must not be restyled, so
 * nothing here touches how it looks. What this file owns is the three things
 * the *host page* owns on `/feed` too — the data the map draws on, the
 * Discover/Friends switch floating on it, and the container it sits in — plus
 * one thing the web host does not need: keeping every tap inside the /m tree.
 *
 * ## Why this is a separate file from PhoneFeedScreen
 *
 * MapLibre is the largest download, battery and jank cost in the product, and
 * the phone feed's other two tabs are a list of cards. Everything expensive is
 * therefore behind this component's *mount*, not merely behind a hidden branch:
 *
 * - the `next/dynamic({ ssr: false })` below only fetches the MapLibre chunk
 *   when this component first renders, which is when the Map tab is first
 *   selected. Someone who never opens it never downloads it. (`/feed` does the
 *   same, for the same reason — see the identical wrapper there.)
 * - the restaurants + dishes fetch lives in this component rather than in the
 *   screen, so the two card tabs never issue it. On `/feed` that pair is
 *   fetched on page mount regardless of tab; this is the one deliberate
 *   *improvement* on the web behaviour rather than a mirror of it, and it costs
 *   nothing because the map cannot be shown before this mounts anyway.
 */

/**
 * Catches the map dying so the screen doesn't.
 *
 * `RestaurantMap` constructs MapLibre in an effect, and MapLibre *throws* when
 * WebGL2 is unavailable — a real condition, not a hypothetical: a crashed GPU
 * process leaves Chrome WebGL-less until a full restart, and that is exactly
 * how this screen was first broken in testing. Without a boundary that throw
 * unmounts the whole feed screen, taking the two working card tabs with it.
 *
 * The fallback wears the map placeholder's own dark clothes (the night panel
 * is a sanctioned exception to the cream world) and says what to do rather
 * than apologising. Scoped to the map subtree only: an error in a bubble or
 * the ember layer costs the map, never the feed.
 */
class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        /* Square, like the map it stands in for. The radius here was left from
           when the map sat inset in a white card; full bleed, it showed as
           four wedges of cream in the corners. */
        className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#191c22] px-8 text-center"
      >
        <p className="font-mono text-sm text-[#c8d0d8]">The map couldn&apos;t start</p>
        <p className="text-[13px] leading-relaxed text-[#8b939c]">
          It needs WebGL, which this browser isn&apos;t offering right now — usually a
          restart of the browser brings it back. The feeds are unaffected.
        </p>
      </div>
    );
  }
}

const RestaurantMap = dynamic(
  () => import("@/components/RestaurantMap").then((mod) => mod.RestaurantMap),
  {
    ssr: false,
    /* Fills the same box the map will, so the frame doesn't resize under the
       reader when the chunk lands, and dark — what arrives is the night map,
       never a flash of the cream page. `/feed`'s placeholder is the same
       colour at the map's fixed 540px; here it is `h-full`, because the phone
       map is sized by its container (see the wrapper below). */
    loading: () => (
      <div
        role="status"
        className="flex h-full w-full items-center justify-center bg-[#191c22] font-mono text-sm text-[#8b939c]"
      >
        Loading map…
      </div>
    ),
  },
);

/* ---------------------------------------------------------------------------
 * Bubble text parsing.
 *
 * Verbatim from `src/app/feed/page.tsx`, which declares these at module scope
 * without exporting them. They are the read path for seeded bubbles, which
 * predate structured post fields and still encode rating and dish in the
 * caption ("@Name 4 stars;"). Copied rather than imported because a page module
 * cannot be imported from, and rewriting that file to export them is out of
 * scope here — they belong in `src/lib/` and should move there in one commit
 * that updates both callers.
 * ------------------------------------------------------------------------- */

function bubbleTextFromPost(text: string) {
  const match = text.match(/^@[^;]+;\s*/);
  return match ? text.slice(match[0].length) : text;
}

function ratingFromPost(text: string): string | null {
  const stars = text.match(/^@.*?\s(\d)\sstars?;/);
  return stars ? `${stars[1]}★` : null;
}

function dishNameFromPost(text: string): string | null {
  const match = text.match(/^@.+? - (.+?)\s\d{1,3}%;/);
  return match ? match[1] : null;
}

function dishPrefixFromPost(text: string): string | null {
  const match = text.match(/^@.+? - (.+?)\s(\d{1,3})%;/);
  return match ? `${match[1]} ${match[2]}%` : null;
}

function findDishId(
  menus: Record<string, Dish[]>,
  restaurantId: string,
  dishName: string,
): string | undefined {
  return menus[restaurantId]?.find((d) => d.name.toLowerCase() === dishName.toLowerCase())?.id;
}

/**
 * A post's rating as a bubble's meta row shows it, always carrying the scale it
 * was measured on. Every rating written now is a percent; the `restaurant`
 * branch is the read path for rows written before the star review was retired
 * and prints "4/5" with its denominator. Never convert between the two — see
 * CLAUDE.md's rating-scale invariant.
 */
function bubbleRating(post: Post): string | null {
  if (post.rating === undefined) return ratingFromPost(post.text);
  if (post.ratingKind === "restaurant") return `${post.rating}/5`;
  if (post.ratingKind === "dish") return post.dishName ? null : `${post.rating}%`;
  return null;
}

/** The orange "Marlin taco 85%" prefix, in the dish review's own percent. */
function bubbleDishPrefix(post: Post): string | null {
  if (!post.dishName || post.rating === undefined) return dishPrefixFromPost(post.text);
  if (post.ratingKind === "dish") return `${post.dishName} ${post.rating}%`;
  // A restaurant review's stars belong to the place, not to a dish.
  return post.dishName;
}

/**
 * The shipped `MapSearch`, pinned where a 390px map needs it at every viewport
 * width.
 *
 * Not a fork — the field itself is the real component, handed to `RestaurantMap`
 * through the `searchField` prop it exposes for exactly this kind of swap. What
 * is overridden is four position utilities on its root, from a `display:
 * contents` wrapper that generates no box of its own, so the field still
 * positions against the map's own wrapper exactly as it did.
 *
 * The reason is the one PhoneFeedPostCard already documents: Tailwind's `sm:`
 * reads the *viewport*, and the /m tree is a 390px column inside a desktop
 * window in the preview. MapSearch's own note (MapSearch.tsx:240) says the
 * `sm:` branch is for a map wide enough to hold the field and the source switch
 * on one row, and that below it the field wraps to the row underneath. A 390px
 * frame is never that wide — but in the preview the `sm:` branch fires anyway
 * and drops a 256px field straight on top of the switch. Forcing the narrow
 * placement is what makes the preview show what the handset will.
 *
 * This pairs with the `pt-28` on the zoom stack below: MapSearch's comment and
 * `/feed`'s are explicit that the two numbers are one layout and move together.
 */
// Kept, though nothing renders it: this is the one-prop path back to an on-map
// search field. See NoMapSearch below for why it is switched off.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PhoneMapSearch({ mapRef }: { mapRef: React.RefObject<MapLibreMap | null> }) {
  return (
    <div className="contents [&>div]:left-2.5 [&>div]:right-2.5 [&>div]:top-16 [&>div]:w-auto">
      <MapSearch mapRef={mapRef} />
    </div>
  );
}

/**
 * No search field on the phone map.
 *
 * `RestaurantMap`'s `searchField` prop *defaults* to `MapSearch`, so leaving it
 * off does not remove the field — it restores it. This is how you opt out.
 *
 * Search moved to the screen header (PhoneFeedHeader), and two search fields on
 * one 390px screen is one too many. The cost is real and worth naming: the
 * header's search navigates to discover (`/m?q=`), while `MapSearch` flew the
 * *camera* to a spot without leaving the map. That is a different job and the
 * phone map currently has no replacement for it — restoring it is one prop:
 * pass `PhoneMapSearch` again, which is kept above for exactly that reason.
 */
const NoMapSearch = () => null;

/**
 * Where a href the map pushes should land in the phone tree.
 *
 * `RestaurantMap` hardcodes web hrefs — `/restaurant/<id>`, `/restaurant/<id>
 * ?dish=<id>` and `/feed?post=<id>` — and pushes them through `useRouter()`
 * (RestaurantMap.tsx:1435, :1547-1584). Following one drops the reader out of
 * /m and into the web layout with the phone nav gone, so every one of them is
 * re-pointed here. Returns null for anything unrecognised, which passes
 * straight through to the real router.
 */
function phoneTarget(
  href: string,
): { kind: "route"; href: string } | { kind: "post"; postId: string | null } | null {
  const [path, query = ""] = href.split("?");
  if (path.startsWith("/restaurant/")) {
    // The query is carried as-is: `?dish=` is what a bubble's dish reference
    // adds, and /m/restaurant/[id] ignores a param it doesn't read rather than
    // failing on it. Deep-linking the phone detail screen to a dish is a real
    // gap, but it is that screen's to close, not this file's.
    return { kind: "route", href: query ? `/m${path}?${query}` : `/m${path}` };
  }
  if (path === "/feed") {
    return { kind: "post", postId: new URLSearchParams(query).get("post") };
  }
  return null;
}

export function PhoneFeedMapPanel({
  posts,
  source,
  onSourceChange,
  isSignedIn,
  onVote,
  onHeart,
  onOpenPost,
}: {
  /** The feed backing the bubbles — null while it is still loading. */
  posts: Post[] | null;
  source: "discover" | "friends";
  onSourceChange: (source: "discover" | "friends") => void;
  isSignedIn: boolean;
  onVote: (postId: string, direction: "up" | "down") => void;
  onHeart: (postId: string) => void;
  /**
   * A bubble tapped its body or its reply chip — on the web that is a
   * `/feed?post=` navigation, which here is a tab change on the screen already
   * open. See PhoneFeedScreen.
   */
  onOpenPost: (postId: string | null) => void;
}) {
  const router = useRouter();

  // The map's backdrop: every restaurant, and every menu, so a bubble that
  // names a dish can link to it. Fetched together because the map needs both or
  // neither — half of this draws pins with dead dish links. The whole dish
  // table is the unbounded call the route's own comment flags; the map knows
  // which restaurants it draws, so `?ids=` is where that gets fixed.
  const [restaurants, setRestaurants] = useState<MapRestaurant[]>([]);
  const [menus, setMenus] = useState<Record<string, Dish[]>>({});

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
          restaurantRes.json() as Promise<{ restaurants: MapRestaurant[] }>,
          dishRes.json() as Promise<{ dishes: Record<string, Dish[]> }>,
        ]);
        if (cancelled) return;
        setRestaurants(rows);
        setMenus(dishes);
      } catch {
        // The tab comes up as an empty map rather than the screen failing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const mapComments = useMemo(() => {
    const out: Record<string, MapComment[]> = {};
    for (const restaurant of restaurants) {
      const menu = menus[restaurant.id] ?? [];
      const real: MapComment[] = (posts ?? [])
        .filter((p) => p.restaurant === restaurant.name)
        .map((p) => {
          const parsedDish = dishNameFromPost(p.text);
          const dish = p.dishName ?? parsedDish ?? undefined;
          return {
            id: p.id,
            restaurantId: restaurant.id,
            text: bubbleTextFromPost(p.text),
            // Net, so the bubble and the card never disagree about a plate.
            score: p.upvoteCount - p.downvoteCount,
            upvotes: p.upvoteCount - p.downvoteCount,
            upvotedByMe: p.upvotedByMe,
            downvotedByMe: p.downvotedByMe,
            heartedByMe: p.heartedByMe,
            commentCount: p.comments.length,
            createdAt: p.createdAt,
            // Same "Maya Ellis" -> "mayaellis" reading the feed card uses.
            author: p.authorName.trim().toLowerCase().replace(/\s+/g, ""),
            rating: bubbleRating(p),
            dishPrefix: bubbleDishPrefix(p),
            postId: p.id,
            dishId: dish ? findDishId(menus, restaurant.id, dish) : undefined,
          };
        })
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      // The seeded bubbles name their dish rather than carrying its id, since
      // menus are database rows now — resolved here against the menu this
      // restaurant actually has. See withDishIds.
      const seeded = withDishIds(mapCommentsByRestaurant[restaurant.id] ?? [], menu);
      out[restaurant.id] = [...real, ...seeded];
    }
    return out;
  }, [posts, restaurants, menus]);

  /**
   * The router the map subtree sees.
   *
   * `RestaurantMap` reaches navigation through `useRouter()` and builds its
   * hrefs itself, so there is no prop to point at /m — but `useRouter` is just
   * a read of `AppRouterContext`, and a provider around the map is enough to
   * re-point every push it makes without touching the shared component. Only
   * the three href shapes `phoneTarget` recognises are rewritten; everything
   * else is handed to the real router unchanged, so this cannot silently
   * swallow a navigation it doesn't know about.
   */
  const mapRouter = useMemo<AppRouterInstance>(
    () => ({
      back: () => router.back(),
      forward: () => router.forward(),
      refresh: () => router.refresh(),
      push: (href, options) => {
        const target = phoneTarget(href);
        if (!target) return router.push(href, options);
        if (target.kind === "route") return router.push(target.href, options);
        onOpenPost(target.postId);
      },
      replace: (href, options) => {
        const target = phoneTarget(href);
        if (!target) return router.replace(href, options);
        if (target.kind === "route") return router.replace(target.href, options);
        onOpenPost(target.postId);
      },
      prefetch: (href, options) => {
        const target = phoneTarget(href);
        // Nothing to prefetch for the in-screen tab change.
        if (target?.kind === "post") return;
        router.prefetch(target ? target.href : href, options);
      },
    }),
    [router, onOpenPost],
  );

  return (
    /* Edge to edge, and deliberately unlike `/feed`, which frames its map in a
       white card inset by 10px so the map's radius reads inside the card's.
       There is no card here and no inset: on a phone the map IS the screen, and
       a 10px cream margin around it reads as a mistake rather than as framing.
       The corner radius goes with the card for the same reason — nothing is
       being grouped, so there is no shape to group it into.

       Height is `h-full` of whatever the screen gives it, rather than the web's
       fixed 540. See the wrapper below for how that reaches the map.

       The zoom stack needs no push down any more. It used to clear two rows —
       the source switch and the search field wrapped under it, ending at 108px
       — and both are gone from the top edge: the switch moved to the bottom
       (see below) and the field was removed (NoMapSearch). So the top-left is
       empty and the controls sit at their natural inset. */
    <div className="h-full overflow-hidden">
      <div className="relative h-full">
        {/* Sizing the map from outside it. RestaurantMap's container is
            `h-[540px] w-full` (RestaurantMap.tsx:1637) — a fixed height that on
            a 390x844 frame would leave the map floating in the middle of the
            screen and running under the nav on shorter handsets. It is a shared
            web component and must not be edited for this, so the height is
            overridden by descendant selectors instead: `&>div` is the
            positioning wrapper the component returns, and `.map-fun-tiles` is
            the canvas container itself. Both selectors out-specify a plain
            utility class, so no `!important` is needed. MapLibre reads the
            container's real box on init, so it comes up at the right size
            rather than needing a resize() we have no handle to call. */}
        {/* `rounded-none` joins the height overrides for the same reason they
            exist: RestaurantMap's container carries `rounded-xl` for the web's
            inset card, and a rounded corner on a full-bleed map just shows a
            wedge of cream at each corner. Same descendant-selector trick, same
            reason it beats a utility class without `!important`. */}
        <div className="h-full [&>div]:h-full [&_.map-fun-tiles]:h-full [&_.map-fun-tiles]:rounded-none">
          {/* The provider is what makes every push the map makes land in /m —
              see mapRouter above. It wraps only the map, so nothing else on the
              screen navigates through a rewritten router. */}
          <MapErrorBoundary>
          <AppRouterContext.Provider value={mapRouter}>
            {/* The bubble chip stays upvote-only — there's no room on a pin for
                a pair — but the number it shows is the same net score the card
                shows. Downvoting happens on the card. */}
            <RestaurantMap
              restaurants={restaurants}
              commentsByRestaurant={mapComments}
              mode={source}
              onUpvote={
                isSignedIn && source === "discover" ? (postId) => onVote(postId, "up") : undefined
              }
              onDownvote={
                isSignedIn && source === "discover" ? (postId) => onVote(postId, "down") : undefined
              }
              onHeart={isSignedIn && source === "friends" ? onHeart : undefined}
              searchField={NoMapSearch}
            />
          </AppRouterContext.Provider>
          </MapErrorBoundary>
        </div>

        {/* The Discover/Friends switch: bottom-left, on a dark glass track,
            active side filled cream.

            **This is a phone-only departure from AGENTS.md**, which names this
            control the one sanctioned exception to the rank-3 rule and gives it
            the screen tabs' clothes — bare labels over a lit orange bar —
            because "no track survives on the night tiles". That reasoning was
            about a *tan* track: a cream-world object that wandered onto the map.
            A translucent near-black track is not that. It is the same material
            as the tiles it sits on, so it reads as part of the map rather than
            as a chip dropped on it, and the cream fill on the active side does
            the work the orange bar was standing in for.

            The web `/feed` map keeps the bare-label treatment, so AGENTS.md's
            rule still describes what ships there. Update that bullet if this
            ever crosses over.

            Bottom-left rather than top-left because on a phone the top of the
            map is where the bubbles are and the bottom is where the thumb is —
            the switch was sitting in the one band the content needs.

            It is separate from the tab bar above it on purpose: leaving the map
            for another feed and coming back must not reset which source you had
            picked, which is why the state lives on the screen rather than
            here. */}
        {/* Lifted clear of the nav, which now floats over the map rather than
            sitting below it — at a plain `bottom-4` this would be underneath
            the nav bubble. `--phone-nav-space` is the same number the nav
            reserves elsewhere, so the switch tracks it if the nav changes. */}
        <div className="absolute left-4 z-10 bottom-[calc(var(--phone-nav-space)+0.25rem)]">
          <div
            role="tablist"
            aria-label="Map data source"
            className="inline-flex items-center gap-1 rounded-full bg-black/45 p-1 backdrop-blur-md"
          >
            {(["discover", "friends"] as const).map((value) => {
              const on = source === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => onSourceChange(value)}
                  /* Sentence case, not the mono uppercase the bare-label version
                     wore: on a filled pill the label is a button, and the small
                     caps read as a section heading sitting on one. */
                  className={`inline-flex min-h-11 items-center rounded-full px-4 text-[13px] font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                    on ? "bg-[#F7F4EC] text-zinc-900" : "text-[#d3dae1]"
                  }`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
