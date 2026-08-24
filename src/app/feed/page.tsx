"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import type { MapRestaurant } from "@/components/RestaurantMap";
import { mapCommentsByRestaurant, withDishIds, type MapComment } from "@/data/mapComments";
import type { Dish } from "@/data/dishes";

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

/* The map bubbles predate structured post fields, so seeded comments still
   encode rating and dish in the caption ("@Name 4 stars;"). Structured
   columns win when a post has them; these parsers cover the rest. */
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
  return menus[restaurantId]?.find(
    (d) => d.name.toLowerCase() === dishName.toLowerCase(),
  )?.id;
}

/**
 * A post's rating as a bubble's meta row shows it, always carrying the scale
 * it was measured on. Every rating written now is a percent, so that is what
 * this produces; the `restaurant` branch is the read path for rows written
 * before the star review was retired, and prints "4/5" with its denominator
 * because those are still 1-5. No 0-10 fallback exists, since that's what let
 * an impossible "9.2 stars" render.
 *
 * A percent lives in the dish prefix instead, so this returns null there —
 * unless the post has no dish name to hang it on, in which case the meta row is
 * the only place left for it to go.
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
  // A restaurant review's stars belong to the place, not to a dish, so they
  // never get appended to a dish name.
  return post.dishName;
}

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
   * The map's backdrop: every restaurant, so every ember has a pin —
   * AGENTS.md rules out clustering, so this one really does need the whole
   * corpus.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/restaurants");
        if (!res.ok) return;
        const { restaurants: rows } = (await res.json()) as { restaurants: MapRestaurant[] };
        if (cancelled) return;
        setRestaurants(rows);
      } catch {
        // The feed itself doesn't depend on this — the list renders, and the
        // map tab comes up empty rather than the page failing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Menus, bounded to the restaurants that can actually put a dish name on a
   * bubble: the ones with a real post loaded, and the ones with a seeded
   * comment in `mapCommentsByRestaurant`. This used to be the whole dish
   * table, unconditionally, on every load of `/feed` — measured at 18.3 MB
   * against the corpus this shipped with, fetched whether or not the Map tab
   * was ever opened. The real need is a couple dozen restaurants.
   *
   * See the identical comment in `PhoneFeedMapPanel` for why `neededIds` is
   * recomputed as `posts` streams in and why the fetch below merges into
   * `menus` instead of replacing it — the mobile file is where this pattern
   * was first written; keep the two in step if either changes.
   */
  const neededIds = useMemo(() => {
    const ids = new Set(Object.keys(mapCommentsByRestaurant));
    for (const p of posts ?? []) if (p.restaurantId) ids.add(p.restaurantId);
    return ids;
  }, [posts]);

  useEffect(() => {
    const known = new Set(Object.keys(menus));
    const missing = [...neededIds].filter((id) => !known.has(id));
    if (missing.length === 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/restaurants/dishes?ids=${missing.join(",")}`);
        if (!res.ok || cancelled) return;
        const { dishes } = (await res.json()) as { dishes: Record<string, Dish[]> };
        if (cancelled) return;
        setMenus((prev) => ({ ...prev, ...dishes }));
      } catch {
        // A missing menu just means those bubbles skip the dish link.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neededIds]);

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
    setBanner(`+${points} PM Points earned`);
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

  const visiblePosts = useMemo(() => {
    if (!posts) return [];
    if (navKey === "saved") {
      return account ? posts.filter((p) => p.savedBy.includes(account.id)) : [];
    }
    // Already correctly ordered and audience-scoped by whichever endpoint
    // the fetch effect above chose — no client-side sort left to do.
    return posts;
  }, [posts, navKey, account]);

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
              drawn from) is closer to a tab than to a filter, and the map has
              one other control, a field with no container either (MapSearch).

              What replaces the fill is the halo, the same one MapSearch's field
              carries: without it, cream type is only as legible as the tile
              that happens to be under it. The bar itself is lit rather than
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
            navKey === "saved" ? (
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

