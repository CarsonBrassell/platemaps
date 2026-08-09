"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { restaurants } from "@/data/restaurants";
import { mapCommentsByRestaurant, type MapComment } from "@/data/mapComments";
import { dishesByRestaurant } from "@/data/dishes";

import { FeedHeader } from "@/components/feed/FeedHeader";
import { FeedTabs } from "@/components/feed/FeedTabs";
import { CreatePostComposer } from "@/components/feed/CreatePostComposer";
import { FoodPostCard, type FriendStatus } from "@/components/feed/FoodPostCard";
import { usePostFeed } from "@/components/feed/usePostFeed";
import { CommentsPanel } from "@/components/feed/CommentsPanel";
import { Leaderboard } from "@/components/feed/Leaderboard";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import {
  EmptyFeedState,
  FeedErrorState,
  OfflineBanner,
  EndOfFeed,
} from "@/components/feed/EmptyFeedState";
import type { FeedTab, NavKey, Post } from "@/components/feed/types";

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

function findDishId(restaurantId: string, dishName: string): string | undefined {
  return dishesByRestaurant[restaurantId]?.find(
    (d) => d.name.toLowerCase() === dishName.toLowerCase(),
  )?.id;
}

/**
 * A post's rating as a bubble's meta row shows it, always carrying the scale
 * it was measured on — "4/5", never a bare number. There are exactly two
 * scales because there are exactly two controls that produce one; no 0-10
 * fallback exists, since that's what let an impossible "9.2 stars" render.
 *
 * A dish review's percent lives in the dish prefix instead, so this returns
 * null there — unless the post has no dish name to hang it on, in which case
 * the meta row is the only place left for it to go.
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
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [outgoingIds, setOutgoingIds] = useState<string[]>([]);
  const [incomingIds, setIncomingIds] = useState<string[]>([]);

  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [ranksVersion, setRanksVersion] = useState(0);

  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /*
   * Which query backs the screen. The three tabs are three genuinely different
   * requests, not one list sliced client-side: Discover is server-ranked and
   * photo-gated, the friend feed is a server-side audience filter with no
   * ranking at all, and the map feed draws whichever of the two `mapSource`
   * points at. Saved needs every post regardless of which feed it surfaced in,
   * since a save doesn't forget where you found it.
   */
  const endpoint =
    navKey === "saved"
      ? "/api/posts"
      : tab === "friends" || (tab === "map" && mapSource === "friends")
        ? "/api/posts/friends"
        : "/api/posts/discover";

  const {
    posts,
    loadError,
    offline,
    banner,
    setBanner,
    reactPoints,
    vote: handleVote,
    heart: handleHeart,
    save: handleSave,
    comment: handleComment,
    likeComment: handleLikeComment,
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
            heartedByMe: p.heartedByMe,
            commentCount: p.comments.length,
            createdAt: p.createdAt,
            rating: bubbleRating(p),
            dishPrefix: bubbleDishPrefix(p),
            postId: p.id,
            dishId: dish ? findDishId(restaurant.id, dish) : undefined,
          };
        })
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      out[restaurant.id] = [...real, ...(mapCommentsByRestaurant[restaurant.id] ?? [])];
    }
    return out;
  }, [posts]);

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
        <FeedTabs active={tab} onChange={setTab} />
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
          {/* The map's own Discover/Friends switch — separate from the tab
              bar above, since leaving the map and coming back shouldn't
              reset which source you'd picked. Which source is active decides
              both what the bubbles show and which reaction they offer. */}
          {/* A segmented switch, not another pill tab bar — this is a data
              source toggle inside the map card, one rank below the screen's
              own tabs. Tan track, white selected segment, mono labels. */}
          <div className="flex px-2.5 py-2.5">
            <div
              role="tablist"
              aria-label="Map data source"
              className="inline-flex rounded-full bg-pm-grey-tint p-1"
            >
              {(["discover", "friends"] as const).map((source) => (
                <button
                  key={source}
                  type="button"
                  role="tab"
                  aria-selected={mapSource === source}
                  onClick={() => setMapSource(source)}
                  className={`min-h-8 rounded-full px-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                    mapSource === source
                      ? "bg-white text-zinc-900"
                      : "text-pm-grey-text hover:text-zinc-900"
                  }`}
                >
                  {source}
                </button>
              ))}
            </div>
          </div>

          {/* Inset like the photo in a hero card, so the map's own radius
              reads inside the card's. The map container clips itself. */}
          <div className="px-2.5 pb-2.5 [&>div]:overflow-hidden">
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
            onHeart={isSignedIn && mapSource === "friends" ? handleHeart : undefined}
          />
          </div>
        </div>
      ) : (
        <>
          {navKey !== "saved" && (
            <div className="mb-4">
              <CreatePostComposer
                name={account?.name}
                avatarUrl={account?.avatarUrl}
                isSignedIn={isSignedIn}
              />
            </div>
          )}

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
        <div className="mx-auto flex w-full max-w-6xl gap-8">
          <main className="min-w-0 flex-1 lg:max-w-[640px]">{feedColumn}</main>

          <aside className="hidden w-80 shrink-0 xl:block">
            <div className="sticky top-6 flex flex-col gap-4">
              <Leaderboard currentUserId={account?.id ?? null} refreshKey={ranksVersion} />
            </div>
          </aside>
        </div>
      </div>

      {activePost && (
        <CommentsPanel
          post={activePost}
          currentUserId={account?.id ?? null}
          onClose={() => setCommentsPostId(null)}
          onSubmit={handleComment}
          onLikeComment={handleLikeComment}
        />
      )}
    </div>
  );
}

