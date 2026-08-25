"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import type { MapRestaurant } from "@/components/RestaurantMap";
import type { Dish } from "@/data/dishes";
import {
  buildMapComments,
  fetchMenus,
  indexPostsByRestaurantName,
  menuRestaurantIdsKey,
} from "@/lib/mapBubbles";

import { FeedHeader } from "@/components/feed/FeedHeader";
import { FeedTabs } from "@/components/feed/FeedTabs";
import { FoodPostCard, type FriendStatus } from "@/components/feed/FoodPostCard";
import { usePostFeed } from "@/components/feed/usePostFeed";
import { CommentsScreen } from "@/components/feed/CommentsScreen";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import {
  EmptyFeedState,
  FeedErrorState,
  OfflineBanner,
  EndOfFeed,
} from "@/components/feed/EmptyFeedState";
import type { FeedTab, NavKey, Post } from "@/components/feed/types";
import { FeedSortSwitch } from "@/components/feed/FeedSortSwitch";
import { FEED_SORT_DEFAULT, type FeedSort } from "@/lib/feedSort";
import { FeedSearchField } from "@/components/feed/FeedSearchField";
import { searchFeed } from "@/lib/feedFilters";
import { QUERY_PARAM } from "@/lib/discoverFilters";

const RestaurantMap = dynamic(
  () => import("@/components/RestaurantMap").then((mod) => mod.RestaurantMap),
  {
    ssr: false,
    /* Same height and radius as the map it stands in for, so the card doesn't
       resize under the user when the chunk lands. Dark, because what arrives
       is the night map, not the cream page. */
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

export default function FeedPage() {
  return (
    <Suspense fallback={null}>
      <FeedPageInner />
    </Suspense>
  );
}

function FeedPageInner() {
  const { account, isSignedIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightPostId = searchParams.get("post");
  /** Points just awarded by /post, so the return trip confirms what was earned. */
  const earned = searchParams.get("earned");

  /** Bumped by "Try again" to re-run the feed fetch. */
  const [reloadKey, setReloadKey] = useState(0);

  const [tab, setTab] = useState<FeedTab>("discover");
  /* Discover's ordering. Its own state rather than part of `tab`, so leaving
     Discover for the map and coming back doesn't reset how you had it sorted
     — the same rule `mapSource` follows below. */
  const [sort, setSort] = useState<FeedSort>(FEED_SORT_DEFAULT);
  const [navKey, setNavKey] = useState<NavKey>(
    searchParams.get("view") === "saved" ? "saved" : "home",
  );

  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  /** Which feed backs the Map tab's bubbles — its own switch, independent of
      `tab`, so leaving the map for another feed and coming back doesn't reset
      which one you had picked. */
  const [mapSource, setMapSource] = useState<"discover" | "friends">("discover");

  // Friend graph, scoped to just what a card needs to render its button —
  // the full request objects (with ids to accept/decline against) live on
  // /friends, which fetches /api/friends itself.
  // What the map draws on. Both arrive from the API below — see that effect.
  const [restaurants, setRestaurants] = useState<MapRestaurant[]>([]);
  const [menus, setMenus] = useState<Record<string, Dish[]>>({});

  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [outgoingIds, setOutgoingIds] = useState<string[]>([]);
  const [incomingIds, setIncomingIds] = useState<string[]>([]);

  const [highlighted, setHighlighted] = useState<string | null>(null);
  /* Write-only while the leaderboard is off — it was the only reader of this
     counter. The two setter calls below are left in place so restoring the
     leaderboard is just re-adding the <aside> and naming this value again. */
  const [, setRanksVersion] = useState(0);

  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /*
   * Which query backs the screen. The three tabs are three genuinely different
   * requests, not one list sliced client-side: Discover is server-ranked and
   * photo-gated, the friend feed is a server-side audience filter with no
   * ranking at all, and the map feed draws whichever of the two `mapSource`
   * points at. Saved needs every post regardless of which feed it surfaced in,
   * since a save doesn't forget where you found it.
   */
  /* The sort rides only the Discover tab. The map reads the same endpoint but
     is not a list you scroll, so re-ranking its bubbles under a control it
     doesn't show would change what's on screen for no visible reason. */
  const endpoint =
    navKey === "saved"
      ? "/api/posts"
      : tab === "friends" || (tab === "map" && mapSource === "friends")
        ? "/api/posts/friends"
        : tab === "discover"
          ? `/api/posts/discover?sort=${sort}`
          : "/api/posts/discover";

  const {
    posts,
    places,
    loadError,
    offline,
    banner,
    setBanner,
    reactPoints,
    commentReactPoints,
    vote: handleVote,
    heart: handleHeart,
    save: handleSave,
    comment: handleComment,
    voteComment: handleVoteComment,
    remove: handleDelete,
    share: handleShare,
  } = usePostFeed({
    endpoint,
    reloadKey,
    onPointsAwarded: () => setRanksVersion((v) => v + 1),
  });

  /*
   * The feed grouped by the restaurant name each post claims — the index both
   * the map bubbles and the menu fetch read, computed once per feed change
   * rather than re-derived by each of them. See lib/mapBubbles.ts for why this
   * replaced a per-restaurant `posts.filter(...)`.
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
    // No reset-to-empty branch here: every place that reads these three
    // arrays is already gated on currentUserId being set, so stale state
    // left over from a previous sign-in is simply never looked at once
    // isSignedIn goes false — nothing to clear.
    if (!isSignedIn) return;
    let cancelled = false;
    fetch("/api/friends")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setFriendIds(d.friendIds ?? []);
        setOutgoingIds((d.outgoing ?? []).map((r: { userId: string }) => r.userId));
        setIncomingIds((d.incoming ?? []).map((r: { userId: string }) => r.userId));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  /*
   * The map's backdrop: every restaurant. Static import once, one fetch now.
   *
   * Menus used to ride along in the same `Promise.all`, on the reasoning that
   * the map needs both or neither. They no longer can: which menus are needed
   * depends on which restaurants got a bubble, which depends on `posts`, which
   * arrives later and changes when the Discover/Friends tab does. So the menus
   * moved to their own effect below, and this one keeps the part that has no
   * such dependency.
   */
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
        setRestaurants(rows);
      } catch {
        // The feed itself doesn't depend on these — the list renders, and the
        // map tab comes up empty rather than the page failing.
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
   * The effect writes `menus` and depends on `menuIdsKey`, and that key is
   * a pure function of `posts` and `restaurants` — `menus` is not an input to
   * it. So setting `menus` cannot re-arm this effect; only a genuine change in
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
   * Every other fetch on this page cancels per run, because a superseded
   * response there is *wrong* — it would overwrite current state with an older
   * answer. This one is the opposite: the response is a set of menus keyed by
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

  // Deep link from a map bubble or a shared /feed?post= link. Discover is
  // ranked and capped rather than "every post" now, so a link to a post
  // that's since cooled off its top slice won't be found here — a known,
  // accepted gap rather than a full second fetch path for one edge case.
  useEffect(() => {
    if (!highlightPostId || !posts?.some((p) => p.id === highlightPostId)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab("discover");
    setNavKey("home");
    setHighlighted(highlightPostId);
    const scroll = setTimeout(() => {
      postRefs.current[highlightPostId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    const clear = setTimeout(() => setHighlighted(null), 3000);
    return () => {
      clearTimeout(scroll);
      clearTimeout(clear);
    };
  }, [highlightPostId, posts]);

  // Coming back from /post. The points were already awarded server-side; this
  // just confirms them, and nudges the leaderboard to re-read the new standing.
  useEffect(() => {
    const points = Number(earned);
    if (!Number.isFinite(points) || points <= 0) return;
    setBanner(`+${points} Plate Points earned`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRanksVersion((v) => v + 1);
  }, [earned, setBanner]);

  /**
   * Which reaction a given post's card should render. On the Feed and Friend
   * feed tabs the surface is just the active tab. In Saved — which draws from
   * every post regardless of which feed it came from — it's derived per post
   * from the actual friend graph, so a saved plate by a friend keeps its like
   * rather than acquiring a pair of vote arrows it never had.
   */
  function surfaceForPost(post: Post): "discover" | "friends" {
    if (navKey === "saved") return friendIds.includes(post.userId) ? "friends" : "discover";
    return tab === "friends" ? "friends" : "discover";
  }

  function friendStatusFor(userId: string): FriendStatus {
    if (friendIds.includes(userId)) return "friends";
    if (outgoingIds.includes(userId)) return "requested";
    if (incomingIds.includes(userId)) return "incoming";
    return "none";
  }

  /**
   * Sends a request — or, per sendFriendRequest's reciprocal case, becomes
   * friends immediately if the other person already requested this user.
   * The optimistic "requested" guess is corrected against the real status
   * the server reports as soon as the response lands.
   */
  async function handleAddFriend(userId: string) {
    if (!account) return;
    setOutgoingIds((prev) => [...prev, userId]);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("failed");
      const data: { status: FriendStatus } = await res.json();
      if (data.status === "friends") {
        setFriendIds((prev) => [...prev, userId]);
        setOutgoingIds((prev) => prev.filter((id) => id !== userId));
      }
    } catch {
      setOutgoingIds((prev) => prev.filter((id) => id !== userId));
      setBanner("Couldn't send that request.");
    }
  }

  /*
   * The list before the filters, already ordered and audience-scoped by
   * whichever endpoint the fetch above chose — no client-side sort left to do.
   * Saved is the one surface that narrows first, because "saved" is not a
   * filter you can turn off from the rail.
   */
  const scopedPosts = useMemo(() => {
    if (!posts) return [];
    if (navKey === "saved") {
      return account ? posts.filter((p) => p.savedBy.includes(account.id)) : [];
    }
    return posts;
  }, [posts, navKey, account]);

  /*
   * The search term, and it lives in the URL.
   *
   * `/feed?q=carbonara` is a link you can send, and — the reason it had to be
   * the URL rather than component state — it is how the header's search field
   * writes a term into a page it does not own. Answering it costs no request:
   * the feed is a bounded window that is already loaded, and the restaurant
   * each post is about arrived beside the posts. See lib/feedFilters.ts for
   * what a term is matched against, which is deliberately more than Discover's
   * search covers.
   */
  const query = searchParams.get(QUERY_PARAM)?.trim() ?? "";

  const search = useCallback(
    (next: string) => {
      const params = new URLSearchParams(window.location.search);
      const q = next.trim();
      if (q) params.set(QUERY_PARAM, q);
      else params.delete(QUERY_PARAM);
      const rest = params.toString();
      router.replace(rest ? `/feed?${rest}` : "/feed", { scroll: false });
    },
    [router],
  );

  const visiblePosts = useMemo(
    () => searchFeed(scopedPosts, places, query),
    [scopedPosts, places, query],
  );
  /** A term is on and it is hiding plates — what the "2 of 30" line reports. */
  const searched = query.length > 0 && posts !== null;

  /* The flame is a Discover-only signal. Friends is explicitly not an
     engagement-ranked feed ("no ranking, no sorting by engagement, nothing
     gets buried"), so flaming a card there would contradict the surface it's
     shown on — the badge only ever appears on the Discover tab. */
  const trendingIds = useMemo(() => {
    if (!posts || navKey === "saved" || tab !== "discover") return new Set<string>();
    // Net score, the same number the card prints — a plate that collected 12
    // ups and 11 downs is an argument, not a hot plate.
    const net = (p: Post) => p.upvoteCount - p.downvoteCount;
    return new Set(
      [...posts]
        .filter((p) => net(p) >= 3)
        .sort((a, b) => net(b) - net(a))
        .slice(0, 3)
        .map((p) => p.id),
    );
  }, [posts, navKey, tab]);

  const mapComments = useMemo(
    () => buildMapComments(postsByRestaurant, restaurants, menus),
    [postsByRestaurant, restaurants, menus],
  );

  const activePost = commentsPostId
    ? (posts?.find((p) => p.id === commentsPostId) ?? null)
    : null;

  const showMap = tab === "map" && navKey !== "saved";

  const feedColumn = (
    <>
      <FeedHeader />

      {navKey === "saved" ? (
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-zinc-900">Saved plates</h2>
          <button
            type="button"
            onClick={() => {
              setNavKey("home");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="min-h-11 rounded-full text-sm font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Back to feed
          </button>
        </div>
      ) : (
        /* The sort sits on the tab row's right, not under it: it modifies the
           feed the tabs pick, and a second full row of chrome above the first
           card pushes the actual plates down for a control most visits never
           touch. Rendered only on Discover — see FeedSortSwitch. */
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <FeedTabs active={tab} onChange={setTab} className="mb-0" />
          {tab === "discover" && <FeedSortSwitch active={sort} onChange={setSort} />}
        </div>
      )}

      {offline && <OfflineBanner />}

      {banner && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-pm-orange-tint px-4 py-2.5 text-sm font-medium text-pm-orange-text"
        >
          {banner}
        </p>
      )}

      {/* Search. Absent on the map tab, which is not a list you scroll and
          whose own comment in RestaurantMap is explicit that it draws every
          restaurant and every bubble unfiltered. */}
      {!showMap && (
        <div className="mb-4 flex flex-col gap-2.5">
          {/* Below `sm` only — above it the header's field is this one. See
              FeedSearchField. */}
          <div className="sm:hidden">
            <FeedSearchField value={query} onSubmit={search} />
          </div>

          {/* What the feed is narrowed to, and the way out of it. A term typed
              into the header field is otherwise invisible from down here, which
              is how a feed ends up showing two plates and no reason why. */}
          {searched && (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 truncate text-[13px] text-zinc-600">
                Plates matching{" "}
                <span className="font-medium text-zinc-900">&ldquo;{query}&rdquo;</span>
              </p>
              <div className="flex shrink-0 items-baseline gap-3">
                <p role="status" className="mono-label tabular-nums text-zinc-500">
                  {visiblePosts.length} of {scopedPosts.length}
                </p>
                {/* Quiet underlined text, the rank this app gives the way out of
                    a choice — not something competing with the plates. */}
                <button
                  type="button"
                  onClick={() => search("")}
                  className="rounded-full px-1 text-xs text-zinc-600 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showMap ? (
        <div className="overflow-hidden rounded-2xl bg-white">
          {/* Inset like the photo in a hero card, so the map's own radius
              reads inside the card's. The map container clips itself. */}
          {/* The floating switch below takes the map's top-left corner, so
              MapLibre's zoom stack (added "top-left" in RestaurantMap) is
              pushed down to clear it — scoped here rather than in
              .map-fun-tiles, since every other map keeps its corner.

              Two pushes, because the top of the map holds a different number of
              rows at each width. From `sm` the switch and MapSearch share one
              row, so 40px clears the switch alone (its 40px height from a 10px
              inset, plus MapLibre's own 10px margin on the group = 50px).
              Below `sm` the field wraps underneath and ends at 108px, so the
              stack drops to 112px + 10px = 122px. **This pairs with MapSearch's
              `top-16`** — the two numbers are one layout and must move
              together; the field previously dodged sideways to `left-16`
              instead, which is what left it sharing a row with the +/− keys. */}
          {/* This used to also carry `[&>div]:overflow-hidden` to clip the
              canvas to the map's rounded corners. RestaurantMap now returns a
              positioning wrapper around its container (for the search field),
              so `&>div` names the wrapper and the clip landed one level above
              the radius, squaring the corners off. The map container clips
              itself instead — the descendant selector below is unaffected. */}
          <div className="relative p-2.5 [&_.maplibregl-ctrl-top-left]:pt-28 sm:[&_.maplibregl-ctrl-top-left]:pt-10">
          {/* The bubble chip stays upvote-only — there's no room on a map pin
              for a pair — but the number it shows is the same net score the
              card shows. Downvoting happens on the card. */}
          <RestaurantMap
            restaurants={restaurants}
            commentsByRestaurant={mapComments}
            mode={mapSource}
            onUpvote={
              isSignedIn && mapSource === "discover"
                ? (postId) => handleVote(postId, "up")
                : undefined
            }
            onDownvote={
              isSignedIn && mapSource === "discover"
                ? (postId) => handleVote(postId, "down")
                : undefined
            }
            onHeart={isSignedIn && mapSource === "friends" ? handleHeart : undefined}
          />

          {/* The map's own Discover/Friends switch — separate from the tab
              bar above, since leaving the map and coming back shouldn't
              reset which source you'd picked. Which source is active decides
              both what the bubbles show and which reaction they offer.

              It floats on the night map rather than sitting in a white band
              above it: the map is the surface it belongs to, and a band of
              card ground above it just pushed the map down.

              **No container at all — a documented departure.** DESIGN.md's
              rank-3 segmented control is a tan `pm-grey-tint` track with a white
              selected segment, and that is still correct everywhere it sits on
              cream. Here it did not work: on the night tiles a tan pill is a
              cream-world control that wandered onto the map, and the track it
              wore next (near-black, hairline, square) was still a box on a
              picture. So it wears the screen tabs' clothes instead — bare
              labels, the selected one carrying a short orange underline — which
              is a rank up from where DESIGN.md files this control. That is
              deliberate: what it switches (which audience the whole map is
              drawn from) is closer to a tab than to a filter. It also keeps
              this row from reading as a toolbar: MapSearch, at the other end,
              is a filled night pill, so the two ends are one contained control
              and one bare one rather than two slabs bolted over the city.

              What replaces the fill is the halo — without it, cream type is
              only as legible as the tile that happens to be under it, which is
              the same trade MapSearch made before it took a fill. The bar
              itself is lit rather than
              painted in `--pm-orange` — it is the only mark left on the map, so
              it burns in the map's voice; see `.map-source-bar`. */}
          <div className="absolute left-5 top-5 z-10">
            <div
              role="tablist"
              aria-label="Map data source"
              className="inline-flex items-center gap-5"
            >
              {(["discover", "friends"] as const).map((source) => {
                const on = mapSource === source;
                return (
                  <button
                    key={source}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setMapSource(source)}
                    className={`relative inline-flex min-h-11 items-center rounded-sm font-mono text-[11px] font-medium uppercase tracking-[0.12em] transition-colors [text-shadow:0_1px_7px_rgba(0,0,0,0.95),0_0_3px_rgba(0,0,0,0.7)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pm-orange ${
                      on ? "text-[#F7F4EC]" : "text-[#c8d0d8] hover:text-[#F7F4EC]"
                    }`}
                  >
                    {source}
                    {on && (
                      <span
                        className="map-source-bar absolute inset-x-0 bottom-2.5 h-[2px] rounded-full"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          </div>
        </div>
      ) : (
        <>
          {posts === null ? (
            <FeedSkeleton />
          ) : loadError && posts.length === 0 ? (
            <FeedErrorState onRetry={() => setReloadKey((k) => k + 1)} />
          ) : visiblePosts.length === 0 ? (
            /* Three different empties, and telling them apart is the point: a
               feed with nothing in it needs an invitation to post, a feed
               searched down to nothing needs the way back out. */
            searched ? (
              <div className="rounded-2xl bg-white px-6 py-12 text-center">
                <p className="font-display text-base font-semibold text-zinc-900">
                  No plates match &ldquo;{query}&rdquo;
                </p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-zinc-500">
                  Search covers captions, dishes, restaurants, cuisines and the comments
                  on a plate. A shorter term will reach more of them.
                </p>
                <button
                  type="button"
                  onClick={() => search("")}
                  className="mt-4 min-h-11 rounded-full bg-pm-orange px-5 text-[13px] font-medium text-[#F7F4EC] transition-transform hover:brightness-105 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  Clear search
                </button>
              </div>
            ) : navKey === "saved" ? (
              <div className="rounded-2xl bg-white px-6 py-12 text-center">
                <p className="font-display text-base font-semibold text-zinc-900">
                  Nothing saved yet
                </p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-zinc-500">
                  Tap the bookmark on a plate and it&apos;ll show up here.
                </p>
              </div>
            ) : (
              <EmptyFeedState
                tab={tab}
                isSignedIn={isSignedIn}
                onCreate={() => router.push("/post")}
              />
            )
          ) : (
            <>
              <div className="flex flex-col gap-4">
                {visiblePosts.map((post) => {
                  /* Split at the call site rather than passed as a string:
                     FoodPostCard's props are a union on `surface`, so the
                     vote handler and the heart handler cannot both reach one
                     card — which is exactly the guarantee the two feeds
                     depend on. */
                  const shared = {
                    post,
                    currentUserId: account?.id ?? null,
                    friendStatus: friendStatusFor(post.userId),
                    highlighted: post.id === highlighted,
                    onSave: handleSave,
                    onShare: handleShare,
                    onOpenComments: setCommentsPostId,
                    onDelete: handleDelete,
                    onAddFriend: handleAddFriend,
                    onRequireSignIn: () => setBanner("Sign in to join in — it takes a second."),
                  };
                  return (
                    <div
                      key={post.id}
                      ref={(el) => {
                        postRefs.current[post.id] = el;
                      }}
                    >
                      {surfaceForPost(post) === "discover" ? (
                        <FoodPostCard
                          {...shared}
                          surface="discover"
                          trending={trendingIds.has(post.id)}
                          reactPoints={reactPoints[post.id] ?? null}
                          onVote={handleVote}
                        />
                      ) : (
                        <FoodPostCard {...shared} surface="friends" onReact={handleHeart} />
                      )}
                    </div>
                  );
                })}
              </div>
              <EndOfFeed />
            </>
          )}
        </>
      )}
    </>
  );

  return (
    /* No shell card: the cream page is the ground, and each card below sits
       directly on it. */
    <div className="mx-auto w-full max-w-7xl pb-12">
      <Header />

      <div className="px-4 pt-2 sm:px-6">
        {/* The leaderboard used to sit in an xl-only <aside> beside this
            column. With it gone the feed is the only thing here, so it centres
            itself rather than staying pinned left against an empty gutter. */}
        <div className="mx-auto flex w-full max-w-6xl gap-8">
          <main className="mx-auto min-w-0 flex-1 lg:max-w-[640px]">{feedColumn}</main>
        </div>
      </div>

      {activePost && (
        <CommentsScreen
          post={activePost}
          currentUserId={account?.id ?? null}
          onClose={() => setCommentsPostId(null)}
          onSubmit={handleComment}
          onVoteComment={handleVoteComment}
          reactPoints={commentReactPoints}
        />
      )}
    </div>
  );
}

