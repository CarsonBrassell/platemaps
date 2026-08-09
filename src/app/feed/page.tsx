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
import { CommentsPanel } from "@/components/feed/CommentsPanel";
import { Leaderboard } from "@/components/feed/Leaderboard";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import {
  EmptyFeedState,
  FeedErrorState,
  OfflineBanner,
  EndOfFeed,
} from "@/components/feed/EmptyFeedState";
import type { NavKey } from "@/components/feed/SideNav";
import type { FeedTab, Post } from "@/components/feed/types";

const RestaurantMap = dynamic(
  () => import("@/components/RestaurantMap").then((mod) => mod.RestaurantMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[540px] w-full items-center justify-center rounded-xl bg-[#15171a] text-sm text-zinc-500">
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
  const { account, isSignedIn, refresh } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightPostId = searchParams.get("post");
  /** Points just awarded by /post, so the return trip confirms what was earned. */
  const earned = searchParams.get("earned");

  const [posts, setPosts] = useState<Post[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [offline, setOffline] = useState(false);
  /** Bumped by "Try again" to re-run the feed fetch effect. */
  const [reloadKey, setReloadKey] = useState(0);

  const [tab, setTab] = useState<FeedTab>("discover");
  const [navKey, setNavKey] = useState<NavKey>(
    searchParams.get("view") === "saved" ? "saved" : "home",
  );

  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  /** Which feed backs the Map tab's bubbles — its own switch, independent of
      `tab`, so leaving the map for Discover or Friends and coming back
      doesn't reset which one you had picked. */
  const [mapSource, setMapSource] = useState<"discover" | "friends">("discover");

  // Friend graph, scoped to just what a card needs to render its button —
  // the full request objects (with ids to accept/decline against) live in
  // the account page's request panel, which fetches /api/friends itself.
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [outgoingIds, setOutgoingIds] = useState<string[]>([]);
  const [incomingIds, setIncomingIds] = useState<string[]>([]);

  const [reactPoints, setReactPoints] = useState<Record<string, number>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [ranksVersion, setRanksVersion] = useState(0);

  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /*
   * Discover and Friends are genuinely different queries now, not one list
   * sliced two ways client-side: Discover is server-ranked and photo-gated,
   * Friends is a server-side audience filter with no ranking at all. Map
   * reads whichever of the two `mapSource` currently points at — it's a view
   * onto one or the other, not a third surface with its own query. Saved
   * needs every post regardless of which feed it surfaced in, since a save
   * doesn't forget which feed you found it on.
   */
  useEffect(() => {
    let cancelled = false;
    const url =
      navKey === "saved"
        ? "/api/posts"
        : tab === "friends" || (tab === "map" && mapSource === "friends")
          ? "/api/posts/friends"
          : "/api/posts/discover";
    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => {
        if (cancelled) return;
        setPosts(data.posts as Post[]);
        setLoadError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPosts((prev) => prev ?? []);
        setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [navKey, tab, mapSource, reloadKey]);

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

  useEffect(() => {
    function sync() {
      setOffline(!navigator.onLine);
    }
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

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

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3000);
    return () => clearTimeout(t);
  }, [banner]);

  // Coming back from /post. The points were already awarded server-side; this
  // just confirms them, and nudges the leaderboard to re-read the new standing.
  useEffect(() => {
    const points = Number(earned);
    if (!Number.isFinite(points) || points <= 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBanner(`+${points} PM Points earned`);
    setRanksVersion((v) => v + 1);
  }, [earned]);

  function patchPost(postId: string, patch: (p: Post) => Post) {
    setPosts((prev) => (prev ? prev.map((p) => (p.id === postId ? patch(p) : p)) : prev));
  }

  /**
   * Which reaction a given post's card should render. On Discover/Friends
   * tabs the surface is just the active tab. In Saved — which draws from
   * every post regardless of which feed it came from — it's derived per
   * post from the actual friend graph, so a saved plate from a friend still
   * lets you heart it rather than defaulting every saved card to upvote.
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

  async function handleReact(postId: string, surface: "discover" | "friends") {
    if (!account) return;
    const current = posts?.find((p) => p.id === postId);
    if (!current) return;

    if (surface === "discover") {
      const wasUpvoted = current.upvotedByMe;
      const prevCount = current.upvoteCount;
      patchPost(postId, (p) => ({
        ...p,
        upvotedByMe: !wasUpvoted,
        upvoteCount: p.upvoteCount + (wasUpvoted ? -1 : 1),
      }));

      try {
        const res = await fetch(`/api/posts/${postId}/upvote`, { method: "POST" });
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        patchPost(postId, (p) => ({ ...p, upvotedByMe: data.upvoted, upvoteCount: data.upvoteCount }));

        if (data.authorPointsEarned > 0) {
          setReactPoints((prev) => ({ ...prev, [postId]: data.authorPointsEarned }));
          setTimeout(
            () =>
              setReactPoints((prev) => {
                const copy = { ...prev };
                delete copy[postId];
                return copy;
              }),
            1800,
          );
          setRanksVersion((v) => v + 1);
          if (data.authorId === account.id) refresh();
        }
      } catch {
        patchPost(postId, (p) => ({ ...p, upvotedByMe: wasUpvoted, upvoteCount: prevCount }));
        setBanner("Couldn't save your upvote.");
      }
      return;
    }

    // Hearts: no count anywhere, so there's nothing to reconcile beyond the
    // toggle itself.
    const wasHearted = current.heartedByMe;
    patchPost(postId, (p) => ({ ...p, heartedByMe: !wasHearted }));
    try {
      const res = await fetch(`/api/posts/${postId}/heart`, { method: "POST" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      patchPost(postId, (p) => ({ ...p, heartedByMe: data.hearted }));
    } catch {
      patchPost(postId, (p) => ({ ...p, heartedByMe: wasHearted }));
      setBanner("Couldn't save that.");
    }
  }

  async function handleSave(postId: string) {
    if (!account) return;
    const current = posts?.find((p) => p.id === postId);
    if (!current) return;
    const wasSaved = current.savedBy.includes(account.id);

    patchPost(postId, (p) => ({
      ...p,
      savedBy: wasSaved
        ? p.savedBy.filter((id) => id !== account.id)
        : [...p.savedBy, account.id],
    }));

    try {
      const res = await fetch(`/api/posts/${postId}/save`, { method: "POST" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      patchPost(postId, (p) => ({
        ...p,
        savedBy: data.saved
          ? [...p.savedBy.filter((id) => id !== account.id), account.id]
          : p.savedBy.filter((id) => id !== account.id),
      }));
    } catch {
      patchPost(postId, (p) => ({
        ...p,
        savedBy: wasSaved
          ? [...p.savedBy.filter((id) => id !== account.id), account.id]
          : p.savedBy.filter((id) => id !== account.id),
      }));
      setBanner("Couldn't update your saved plates.");
    }
  }

  async function handleComment(postId: string, text: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? "Couldn't post that comment.";

      patchPost(postId, (p) => ({
        ...p,
        comments: [...p.comments, data.comment],
        authorPoints: p.authorPoints + (data.authorPointsEarned ?? 0),
      }));
      if (data.authorPointsEarned > 0) {
        setRanksVersion((v) => v + 1);
        if (data.authorId === account?.id) refresh();
      }
      return null;
    } catch {
      return "Couldn't reach PlateMaps. Check your connection.";
    }
  }

  async function handleLikeComment(postId: string, commentId: string) {
    if (!account) return;
    patchPost(postId, (p) => ({
      ...p,
      comments: p.comments.map((c) =>
        c.id === commentId
          ? {
              ...c,
              likedBy: c.likedBy.includes(account.id)
                ? c.likedBy.filter((id) => id !== account.id)
                : [...c.likedBy, account.id],
            }
          : c,
      ),
    }));
    try {
      await fetch(`/api/comments/${commentId}/like`, { method: "POST" });
    } catch {
      setBanner("Couldn't save that.");
    }
  }

  async function handleDelete(postId: string) {
    const snapshot = posts;
    setPosts((prev) => (prev ? prev.filter((p) => p.id !== postId) : prev));
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
    } catch {
      setPosts(snapshot);
      setBanner("Couldn't delete that post.");
    }
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

  async function handleShare(post: Post): Promise<string | null> {
    const url = `${globalThis.location?.origin ?? ""}/feed?post=${post.id}`;
    const title = post.dishName ?? post.restaurant ?? "A plate on PlateMaps";
    try {
      if (navigator.share) {
        await navigator.share({ title, text: post.text, url });
        return null;
      }
      await navigator.clipboard.writeText(url);
      return "Link copied";
    } catch {
      // A cancelled native share throws too — staying silent is correct there.
      return null;
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
    return new Set(
      [...posts]
        .filter((p) => p.upvoteCount >= 3)
        .sort((a, b) => b.upvoteCount - a.upvoteCount)
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
            score: p.upvoteCount,
            upvotes: p.upvoteCount,
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
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-zinc-200 pb-2">
          <h2 className="font-display text-base font-semibold text-zinc-900">Saved plates</h2>
          <button
            type="button"
            onClick={() => {
              setNavKey("home");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="min-h-11 text-sm font-medium text-pm-orange-text hover:underline"
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
        <div className="overflow-hidden rounded-2xl border border-zinc-700/60 shadow-md">
          {/* The map's own Discover/Friends switch — separate from the tab
              bar above, since leaving the map and coming back shouldn't
              reset which source you'd picked. Which source is active decides
              both what the bubbles show and which reaction they offer. */}
          <div
            role="tablist"
            aria-label="Map data source"
            className="flex gap-1 border-b border-zinc-800 bg-[#15171a] px-3 py-2"
          >
            {(["discover", "friends"] as const).map((source) => (
              <button
                key={source}
                type="button"
                role="tab"
                aria-selected={mapSource === source}
                onClick={() => setMapSource(source)}
                className={`min-h-9 rounded-full px-3 text-xs font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                  mapSource === source
                    ? "bg-pm-orange text-white"
                    : "text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                }`}
              >
                {source}
              </button>
            ))}
          </div>

          <RestaurantMap
            restaurants={restaurants}
            commentsByRestaurant={mapComments}
            mode={mapSource}
            onUpvote={
              isSignedIn && mapSource === "discover"
                ? (postId) => handleReact(postId, "discover")
                : undefined
            }
            onHeart={
              isSignedIn && mapSource === "friends"
                ? (postId) => handleReact(postId, "friends")
                : undefined
            }
          />
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
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 px-6 py-12 text-center">
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
                {visiblePosts.map((post) => (
                  <div
                    key={post.id}
                    ref={(el) => {
                      postRefs.current[post.id] = el;
                    }}
                  >
                    <FoodPostCard
                      post={post}
                      currentUserId={account?.id ?? null}
                      surface={surfaceForPost(post)}
                      friendStatus={friendStatusFor(post.userId)}
                      highlighted={post.id === highlighted}
                      trending={trendingIds.has(post.id)}
                      reactPoints={reactPoints[post.id] ?? null}
                      onSave={handleSave}
                      onShare={handleShare}
                      onReact={(postId) => handleReact(postId, surfaceForPost(post))}
                      onOpenComments={setCommentsPostId}
                      onDelete={handleDelete}
                      onAddFriend={handleAddFriend}
                      onRequireSignIn={() => setBanner("Sign in to join in — it takes a second.")}
                    />
                  </div>
                ))}
              </div>
              <EndOfFeed />
            </>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="app-shell mx-auto my-6 w-full max-w-7xl overflow-hidden rounded-2xl border border-zinc-200/60">
      <Header />

      <div className="bg-white/40 px-4 pb-8 pt-5 sm:px-6">
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
