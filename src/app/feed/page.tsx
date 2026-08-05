"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { restaurants } from "@/data/restaurants";
import { mapCommentsByRestaurant, type MapComment } from "@/data/mapComments";
import { dishesByRestaurant } from "@/data/dishes";

import { FeedHeader } from "@/components/feed/FeedHeader";
import { FeedTabs } from "@/components/feed/FeedTabs";
import { CreatePostComposer } from "@/components/feed/CreatePostComposer";
import { CreatePostModal } from "@/components/feed/CreatePostModal";
import { FoodPostCard } from "@/components/feed/FoodPostCard";
import { CommentsPanel } from "@/components/feed/CommentsPanel";
import { Leaderboard } from "@/components/feed/Leaderboard";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import {
  EmptyFeedState,
  FeedErrorState,
  OfflineBanner,
  EndOfFeed,
} from "@/components/feed/EmptyFeedState";
import { SideNav, type NavKey } from "@/components/feed/SideNav";
import { MobileNavigation } from "@/components/feed/MobileNavigation";
import { Dialog } from "@/components/feed/Dialog";
import type { FeedTab, Post } from "@/components/feed/types";

const RestaurantMap = dynamic(
  () => import("@/components/RestaurantMap").then((mod) => mod.RestaurantMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[540px] w-full items-center justify-center rounded-xl bg-zinc-100 text-sm text-zinc-400">
        Loading map…
      </div>
    ),
  },
);

/**
 * Recency-weighted score: a fresh post with a few likes outranks a stale hit.
 *
 * The +1 matters — without it every unliked post scores zero, so a review you
 * just published would sort to the very bottom of the feed and look lost.
 */
function hotScore(post: Post) {
  const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / 3_600_000;
  return (post.likedBy.length + 1) / Math.pow(ageHours + 2, 1.5);
}

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

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
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
  const searchParams = useSearchParams();
  const highlightPostId = searchParams.get("post");

  const [posts, setPosts] = useState<Post[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [offline, setOffline] = useState(false);
  /** Bumped by "Try again" to re-run the feed fetch effect. */
  const [reloadKey, setReloadKey] = useState(0);

  const [tab, setTab] = useState<FeedTab>("for-you");
  const [navKey, setNavKey] = useState<NavKey>("home");

  const [composeOpen, setComposeOpen] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [ranksOpen, setRanksOpen] = useState(false);

  const [following, setFollowing] = useState<string[]>([]);
  const [pointsToast, setPointsToast] = useState<Record<string, string>>({});
  const [votePoints, setVotePoints] = useState<Record<string, number>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [ranksVersion, setRanksVersion] = useState(0);

  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Every state write happens in a promise callback rather than the effect
  // body, and is dropped if the effect was cleaned up first.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/posts")
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
  }, [reloadKey]);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    fetch("/api/follows")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setFollowing(d.following ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  // Derived rather than cleared on sign-out, so signing out doesn't need a
  // synchronous setState inside the effect above. Memoised because it feeds
  // the feed-filtering useMemo below.
  const followingIds = useMemo(
    () => (isSignedIn ? following : []),
    [isSignedIn, following],
  );

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

  // Deep link from a map bubble. "For You" is unfiltered, so switching to it
  // guarantees the target post is actually in the list before we scroll.
  useEffect(() => {
    if (!highlightPostId || !posts?.some((p) => p.id === highlightPostId)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab("for-you");
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

  function flashPoints(postId: string, message: string) {
    setPointsToast((prev) => ({ ...prev, [postId]: message }));
    setTimeout(
      () =>
        setPointsToast((prev) => {
          const next = { ...prev };
          delete next[postId];
          return next;
        }),
      1800,
    );
  }

  function patchPost(postId: string, patch: (p: Post) => Post) {
    setPosts((prev) => (prev ? prev.map((p) => (p.id === postId ? patch(p) : p)) : prev));
  }

  async function handleLike(postId: string) {
    if (!account) return;
    const current = posts?.find((p) => p.id === postId);
    if (!current) return;

    const wasLiked = current.likedBy.includes(account.id);
    // Optimistic: flip immediately, reconcile (or revert) when the server answers.
    patchPost(postId, (p) => ({
      ...p,
      likedBy: wasLiked
        ? p.likedBy.filter((id) => id !== account.id)
        : [...p.likedBy, account.id],
    }));

    try {
      const res = await fetch(`/api/posts/${postId}/like`, { method: "POST" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();

      patchPost(postId, (p) => ({
        ...p,
        likedBy: data.liked
          ? [...p.likedBy.filter((id) => id !== account.id), account.id]
          : p.likedBy.filter((id) => id !== account.id),
        authorPoints: p.authorPoints + (data.authorPointsEarned ?? 0),
      }));

      if (data.authorPointsEarned > 0) {
        flashPoints(
          postId,
          data.milestone
            ? `+${data.authorPointsEarned} for ${firstName(data.authorName)} · ${data.milestone.likes} likes!`
            : `+${data.authorPointsEarned} point for ${firstName(data.authorName)}`,
        );
        setRanksVersion((v) => v + 1);
        if (data.authorId === account.id) refresh();
      }
    } catch {
      patchPost(postId, (p) => ({
        ...p,
        likedBy: wasLiked
          ? [...p.likedBy.filter((id) => id !== account.id), account.id]
          : p.likedBy.filter((id) => id !== account.id),
      }));
      setBanner("Couldn't save that like.");
    }
  }

  async function handleVote(postId: string, vote: boolean) {
    if (!account) return;
    const current = posts?.find((p) => p.id === postId);
    if (!current) return;

    const had = current.votedYesBy.includes(account.id)
      ? true
      : current.votedNoBy.includes(account.id)
        ? false
        : null;

    // Optimistic: drop any previous verdict, then apply the new one unless
    // this tap was un-voting the same side.
    const next = had === vote ? null : vote;
    patchPost(postId, (p) => ({
      ...p,
      votedYesBy: p.votedYesBy.filter((id) => id !== account.id).concat(next === true ? [account.id] : []),
      votedNoBy: p.votedNoBy.filter((id) => id !== account.id).concat(next === false ? [account.id] : []),
    }));

    try {
      const res = await fetch(`/api/posts/${postId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();

      // Reconcile against the server's counts rather than trusting the guess.
      patchPost(postId, (p) => {
        const others = {
          yes: p.votedYesBy.filter((id) => id !== account.id),
          no: p.votedNoBy.filter((id) => id !== account.id),
        };
        return {
          ...p,
          votedYesBy: data.myVote === true ? [...others.yes, account.id] : others.yes,
          votedNoBy: data.myVote === false ? [...others.no, account.id] : others.no,
        };
      });

      if (data.pointsEarned > 0) {
        setVotePoints((prev) => ({ ...prev, [postId]: data.pointsEarned }));
        setTimeout(
          () =>
            setVotePoints((prev) => {
              const copy = { ...prev };
              delete copy[postId];
              return copy;
            }),
          1800,
        );
        setRanksVersion((v) => v + 1);
        refresh();
      }
    } catch {
      patchPost(postId, (p) => ({
        ...p,
        votedYesBy: p.votedYesBy.filter((id) => id !== account.id).concat(had === true ? [account.id] : []),
        votedNoBy: p.votedNoBy.filter((id) => id !== account.id).concat(had === false ? [account.id] : []),
      }));
      setBanner("Couldn't save your vote.");
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
      return "Couldn't reach PlateMap. Check your connection.";
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

  async function handleToggleFollow(userId: string) {
    const wasFollowing = following.includes(userId);
    setFollowing((prev) => (wasFollowing ? prev.filter((id) => id !== userId) : [...prev, userId]));
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setFollowing((prev) =>
        wasFollowing ? [...prev, userId] : prev.filter((id) => id !== userId),
      );
      setBanner("Couldn't update who you follow.");
    }
  }

  async function handleShare(post: Post): Promise<string | null> {
    const url = `${globalThis.location?.origin ?? ""}/feed?post=${post.id}`;
    const title = post.dishName ?? post.restaurant ?? "A plate on PlateMap";
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

  function handleCreated(post: Post, pointsEarned: number) {
    setPosts((prev) => (prev ? [post, ...prev] : [post]));
    setComposeOpen(false);
    setBanner(`+${pointsEarned} PM Points earned`);
    setRanksVersion((v) => v + 1);
    refresh();
  }

  const visiblePosts = useMemo(() => {
    if (!posts) return [];
    const list = [...posts];

    if (navKey === "saved") {
      return account ? list.filter((p) => p.savedBy.includes(account.id)) : [];
    }

    if (tab === "following") {
      return list
        .filter((p) => followingIds.includes(p.userId))
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    }
    return list.sort((a, b) => hotScore(b) - hotScore(a));
  }, [posts, navKey, tab, followingIds, account]);

  /* The flame marks the few genuinely hot plates, computed over every post
     rather than the current tab so a card keeps its badge wherever it shows
     up. The likes floor stops a quiet feed from flaming everything. */
  const trendingIds = useMemo(() => {
    if (!posts) return new Set<string>();
    return new Set(
      [...posts]
        .filter((p) => p.likedBy.length >= 3)
        .sort((a, b) => hotScore(b) - hotScore(a))
        .slice(0, 3)
        .map((p) => p.id),
    );
  }, [posts]);

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
            score: p.likedBy.length,
            upvotes: p.likedBy.length,
            createdAt: p.createdAt,
            rating: p.rating !== undefined ? `${p.rating.toFixed(1)}★` : ratingFromPost(p.text),
            dishPrefix:
              p.dishName && p.rating !== undefined
                ? `${p.dishName} ${p.rating.toFixed(1)}/10`
                : dishPrefixFromPost(p.text),
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

  const navAccount = account
    ? { name: account.name, points: account.points, avatarUrl: account.avatarUrl }
    : null;

  function navigate(key: Extract<NavKey, "home" | "saved" | "leaderboard">) {
    if (key === "leaderboard") {
      setRanksOpen(true);
      return;
    }
    setNavKey(key);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const showMap = tab === "map" && navKey !== "saved";

  const feedColumn = (
    <>
      <FeedHeader />

      {navKey === "saved" ? (
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-zinc-200 pb-2">
          <h2 className="font-display text-base font-semibold text-zinc-900">Saved plates</h2>
          <button
            type="button"
            onClick={() => navigate("home")}
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
        <div className="overflow-hidden rounded-2xl border border-zinc-200 shadow-sm">
          <RestaurantMap restaurants={restaurants} commentsByRestaurant={mapComments} />
        </div>
      ) : (
        <>
          {navKey !== "saved" && (
            <div className="mb-4">
              <CreatePostComposer
                name={account?.name}
                avatarUrl={account?.avatarUrl}
                isSignedIn={isSignedIn}
                onOpen={() => setComposeOpen(true)}
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
                onCreate={() => setComposeOpen(true)}
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
                      isFollowing={followingIds.includes(post.userId)}
                      highlighted={post.id === highlighted}
                      trending={trendingIds.has(post.id)}
                      pointsToast={pointsToast[post.id] ?? null}
                      votePoints={votePoints[post.id] ?? null}
                      onLike={handleLike}
                      onSave={handleSave}
                      onShare={handleShare}
                      onVote={handleVote}
                      onOpenComments={setCommentsPostId}
                      onDelete={handleDelete}
                      onToggleFollow={handleToggleFollow}
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

      <div className="bg-white/40 px-4 pb-24 pt-5 sm:px-6 lg:pb-8">
        <div className="mx-auto flex w-full max-w-6xl gap-8">
          <aside className="hidden w-52 shrink-0 lg:block">
            <SideNav
              activeKey={navKey}
              account={navAccount}
              onNavigate={navigate}
              onCreate={() => setComposeOpen(true)}
            />
          </aside>

          <main className="min-w-0 flex-1 lg:max-w-[640px]">{feedColumn}</main>

          <aside className="hidden w-80 shrink-0 xl:block">
            <div className="sticky top-6 flex flex-col gap-4">
              <Leaderboard currentUserId={account?.id ?? null} refreshKey={ranksVersion} />
            </div>
          </aside>
        </div>
      </div>

      <MobileNavigation
        activeKey={navKey}
        onNavigate={navigate}
        onCreate={() => setComposeOpen(true)}
      />

      {composeOpen && (
        <CreatePostModal
          isSignedIn={isSignedIn}
          onClose={() => setComposeOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {activePost && (
        <CommentsPanel
          post={activePost}
          currentUserId={account?.id ?? null}
          onClose={() => setCommentsPostId(null)}
          onSubmit={handleComment}
          onLikeComment={handleLikeComment}
        />
      )}

      {ranksOpen && (
        <Dialog title="Leaderboard" onClose={() => setRanksOpen(false)} variant="panel">
          <div className="p-4">
            <Leaderboard currentUserId={account?.id ?? null} refreshKey={ranksVersion} />
          </div>
        </Dialog>
      )}
    </div>
  );
}
