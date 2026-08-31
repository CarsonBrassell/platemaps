"use client";

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { MapRestaurant } from "@/components/RestaurantMap";
import { EMPTY_PLATE_SCORE } from "@/lib/plateScore";
import { PhoneMapSearch } from "./PhoneMapSearch";
import type { Dish } from "@/data/dishes";
import type { Post } from "@/components/feed/types";
import {
  buildMapComments,
  fetchMenus,
  indexPostsByRestaurantName,
  menuRestaurantIdsKey,
} from "@/lib/mapBubbles";

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

  // The map's backdrop. Restaurants and menus used to arrive in one
  // `Promise.all` here, but the menus now depend on `posts` — only a
  // restaurant that gets a bubble needs one — so they have split into two
  // effects. See the web host, which carries the same pair for the same reason.
  const [restaurants, setRestaurants] = useState<MapRestaurant[]>([]);
  const [menus, setMenus] = useState<Record<string, Dish[]>>({});

  /*
   * The feed grouped by the restaurant name each post claims — the index both
   * the bubbles and the menu fetch read. See lib/mapBubbles.ts for why this
   * replaced a per-restaurant `posts.filter(...)`: that scan was 5,701
   * restaurants × every post and re-ran on every vote, which is what kept a
   * bubble's count from repainting after it was cast.
   */
  const postsByRestaurant = useMemo(() => indexPostsByRestaurantName(posts), [posts]);

  /** Which restaurants need a menu, as a value-comparable effect dependency. */
  const menuIdsKey = useMemo(
    () => menuRestaurantIdsKey(postsByRestaurant, restaurants),
    [postsByRestaurant, restaurants],
  );

  /* Every restaurant id whose menu has been asked for, successfully or not.
     A ref, not state: it exists to keep the fetch below from asking twice, and
     making it state would feed the effect's own writes back into its inputs. */
  const requestedMenuIds = useRef<Set<string>>(new Set());

  /* Whether this component is still mounted. The menus effect needs a guard
     scoped to the component rather than to one run of the effect — see the
     long note there for why a per-run `cancelled` flag actively loses data. */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // `fields=map` — the six columns the circle layer and its tip read,
        // plus the plate score. See getRestaurantMapRows in lib/db.ts.
        const res = await fetch("/api/restaurants?fields=map");
        if (!res.ok) return;
        const { restaurants: rows } = (await res.json()) as { restaurants: MapRestaurant[] };
        if (cancelled) return;
        /* Rows with no rated plates arrive without a `plateScore` — see the
           map branch in /api/restaurants for why, and EMPTY_PLATE_SCORE's own
           note for why substituting it here is the intended reading. */
        setRestaurants(
          rows.map((r) => (r.plateScore ? r : { ...r, plateScore: EMPTY_PLATE_SCORE })),
        );
      } catch {
        // The tab comes up as an empty map rather than the screen failing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Menus, for the restaurants that actually have a bubble.
   *
   * This used to be `/api/restaurants/dishes` with no query — every dish for
   * every restaurant, 10.5MB and six seconds, to resolve dish names for the few
   * dozen restaurants anyone had posted about. `menuRestaurantIdsKey` names
   * exactly the set that needs one, and `fetchMenus` fetches only that.
   *
   * ## Why it asks in batches
   *
   * The route caps a request at 500 ids and answers 400 above it. The id set
   * is not bounded by the number of posts, though — it fans out by restaurant
   * NAME, so one post about Starbucks names all 200 Starbucks in the corpus
   * and four chain posts clear the cap. One oversized request would 400, this
   * effect would throw, and every dish link on the map would die at once on
   * both surfaces. `fetchMenus` splits the ask instead, which is what the
   * route's own comment prescribes. Both map surfaces call the same helper —
   * see `src/lib/mapBubbles.ts`.
   *
   * ## Why this cannot loop
   *
   * The effect writes `menus` and depends on `menuIdsKey`, and that key is a
   * pure function of `posts` and `restaurants` — `menus` is not an input to it.
   * So setting `menus` cannot re-arm this effect; only a genuine change in
   * *which* restaurants have bubbles can. Casting a vote is the case that
   * matters: it rewrites a post's counts, not which restaurants have posts, so
   * the key is byte-identical afterwards and nothing refetches.
   *
   * `requestedMenuIds` then makes the set monotonic. Ids are marked before the
   * request goes out, so a key change that only *adds* ids fetches the addition
   * and never the ids already held — including the ids of restaurants that came
   * back with no dishes at all, which never appear as keys in `menus` and would
   * otherwise look permanently missing and refetch forever. Ids are un-marked
   * only when the request actually failed — and since the ask is split into
   * batches, only the ids of the batch that failed, so one bad request can be
   * retried the next time the key moves without re-buying the menus its
   * siblings already delivered.
   *
   * ## Why the guard is `mounted` and not a per-run `cancelled`
   *
   * The restaurants fetch above cancels per run, because a superseded response
   * there is *wrong* — it would overwrite current state with an older answer.
   * This one is the opposite: the response is a set of menus keyed by
   * restaurant id, it is merged rather than assigned, and a menu is the same
   * menu whenever it arrives. A superseded response is not stale, just late.
   *
   * Discarding it would actively lose data, on the ordinary load path rather
   * than an exotic one: restaurants land first, the key becomes the ~19 seeded
   * restaurants and their fetch goes out, then the feed lands and the key
   * grows. A per-run flag would cancel that first response — while its ids stay
   * marked as requested, since the second run computed its own `missing`
   * synchronously before the first could un-mark — and the seeded bubbles would
   * silently lose their dish links on nearly every visit. So the only thing
   * worth refusing here is a write after unmount.
   */
  useEffect(() => {
    const missing = menuIdsKey.split(",").filter((id) => id && !requestedMenuIds.current.has(id));
    if (missing.length === 0) return;
    for (const id of missing) requestedMenuIds.current.add(id);
    void (async () => {
      const { menus: fetched, failedIds } = await fetchMenus(missing);
      /* Bubbles are already on screen — a menu that never lands costs their
         headlines a dish link and nothing else. Let the ids of the batch that
         failed go so a later key change can try again, and ONLY those: the
         batches that succeeded are in hand and re-asking for them would spend
         a second request on menus this page already holds. Released before the
         mount check, the way the old single-request catch was, so unmounting
         mid-flight can't leave an id marked as bought. */
      for (const id of failedIds) requestedMenuIds.current.delete(id);
      if (!mounted.current) return;
      /* An empty result is a no-op merge, and merging it anyway would hand
         `menus` a new identity and rebuild every bubble for nothing. It is the
         shape a total failure takes, and also the shape of a set of
         restaurants that genuinely have no dishes. */
      if (Object.keys(fetched).length === 0) return;
      // Merged, never replaced: a later fetch carries only the ids it asked
      // for, and the menus already held are still the menus for their
      // restaurants. Ids never collide across requests, so the spread order
      // is not load-bearing.
      setMenus((prev) => ({ ...prev, ...fetched }));
    })();
  }, [menuIdsKey]);

  const mapComments = useMemo(
    () => buildMapComments(postsByRestaurant, restaurants, menus),
    [postsByRestaurant, restaurants, menus],
  );

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
       fixed 540. See the wrapper below for how that reaches the map. */
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
        {/* The zoom stack has to clear the feed tabs, which float on the
            top-left of the map now (PhoneFeedScreen). MapLibre puts
            NavigationControl in `top-left` (RestaurantMap.tsx:1165) and gives
            it a 10px inset of its own, so 56px of padding here lands it at 66px
            — under a 44px tab row that starts at 8px. The `env()` term is the
            same one the tab row's own top inset carries: on a handset the row
            starts below the status bar, and the control has to follow it down
            or the two collide again on exactly the devices that have a notch.
            Change one, change the other. */}
        <div className="h-full [&>div]:h-full [&_.map-fun-tiles]:h-full [&_.map-fun-tiles]:rounded-none [&_.maplibregl-ctrl-top-left]:pt-[calc(3.5rem+env(safe-area-inset-top))]">
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
              /* The phone's own field, in the bottom-right corner opposite the
                 source switch. It drives the map rather than leaving it: the
                 term lights every match, signs their names, drops everything
                 else to a bare ember and silences comments from anywhere the
                 reader didn't ask about. Same `useMapSearch` the web field
                 wears — see PhoneMapSearch. */
              searchField={PhoneMapSearch}
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
