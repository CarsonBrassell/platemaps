"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { VoteDirection } from "./PostActions";
import type { Post } from "./types";

/**
 * One list of posts and everything you can do to a card in it.
 *
 * Both feeds — /feed and /friends — render the same card against the same
 * endpoints, so the optimistic patching lives here once rather than being
 * copied into a second page and drifting. What stays with each page is what
 * differs: which endpoint backs it, the friend graph and its Add-friend
 * buttons (Discover only), the map, and the saved view.
 *
 * `vote` is exposed but is a Discover-surface action; nothing on the friends
 * screen calls it, and FoodPostCard's prop union means a friends-surface call
 * site cannot even pass it. Hearts, the friends reaction, deliberately have no
 * count to reconcile and award nobody any points.
 */
export function usePostFeed({
  endpoint,
  reloadKey = 0,
  onPointsAwarded,
}: {
  /** The feed behind this screen. Changing it refetches. */
  endpoint: string;
  /** Bumped by a "Try again" button to re-run the fetch. */
  reloadKey?: number;
  /** An action just paid the post's author — the leaderboard's cue to re-read. */
  onPointsAwarded?: () => void;
}) {
  const { account, refresh } = useAuth();

  const [posts, setPosts] = useState<Post[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  /** Points just earned by upvoting, keyed by post, floated above its actions. */
  const [reactPoints, setReactPoints] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(endpoint)
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
  }, [endpoint, reloadKey]);

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

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3000);
    return () => clearTimeout(t);
  }, [banner]);

  function patchPost(postId: string, patch: (p: Post) => Post) {
    setPosts((prev) => (prev ? prev.map((p) => (p.id === postId ? patch(p) : p)) : prev));
  }

  function creditAuthor(postId: string, points: number, authorId: string) {
    setReactPoints((prev) => ({ ...prev, [postId]: points }));
    setTimeout(
      () =>
        setReactPoints((prev) => {
          const copy = { ...prev };
          delete copy[postId];
          return copy;
        }),
      1800,
    );
    onPointsAwarded?.();
    if (authorId === account?.id) refresh();
  }

  /**
   * Discover's up/down. Three-state like the server's castVote: pressing the
   * direction already held clears the vote, the other one switches sides. The
   * optimistic patch mirrors that arithmetic so the score doesn't jump by one
   * and then correct itself by two when the response lands on a switch.
   */
  async function vote(postId: string, direction: VoteDirection) {
    if (!account) return;
    const current = posts?.find((p) => p.id === postId);
    if (!current) return;

    const held: VoteDirection | null = current.upvotedByMe
      ? "up"
      : current.downvotedByMe
        ? "down"
        : null;
    const next = held === direction ? null : direction;
    const before = {
      upvotedByMe: current.upvotedByMe,
      downvotedByMe: current.downvotedByMe,
      upvoteCount: current.upvoteCount,
      downvoteCount: current.downvoteCount,
    };

    patchPost(postId, (p) => ({
      ...p,
      upvotedByMe: next === "up",
      downvotedByMe: next === "down",
      upvoteCount: p.upvoteCount + (next === "up" ? 1 : 0) - (held === "up" ? 1 : 0),
      downvoteCount: p.downvoteCount + (next === "down" ? 1 : 0) - (held === "down" ? 1 : 0),
    }));

    try {
      const res = await fetch(`/api/posts/${postId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      patchPost(postId, (p) => ({
        ...p,
        upvotedByMe: data.myVote === "up",
        downvotedByMe: data.myVote === "down",
        upvoteCount: data.upvoteCount,
        downvoteCount: data.downvoteCount,
      }));

      if (data.authorPointsEarned > 0) {
        creditAuthor(postId, data.authorPointsEarned, data.authorId);
      }
    } catch {
      patchPost(postId, (p) => ({ ...p, ...before }));
      setBanner("Couldn't save your vote.");
    }
  }

  /**
   * The friends reaction. No count comes back and none is ever rendered, so
   * there's nothing to reconcile beyond the toggle itself — and no points move,
   * which is the point: a heart says "I saw this, it's you", not "you scored".
   */
  async function heart(postId: string) {
    if (!account) return;
    const current = posts?.find((p) => p.id === postId);
    if (!current) return;

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

  async function save(postId: string) {
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

  async function comment(postId: string, text: string): Promise<string | null> {
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
        onPointsAwarded?.();
        if (data.authorId === account?.id) refresh();
      }
      return null;
    } catch {
      return "Couldn't reach PlateMaps. Check your connection.";
    }
  }

  async function likeComment(postId: string, commentId: string) {
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

  async function remove(postId: string) {
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

  async function share(post: Post): Promise<string | null> {
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

  return {
    posts,
    setPosts,
    patchPost,
    loadError,
    offline,
    banner,
    setBanner,
    reactPoints,
    vote,
    heart,
    save,
    comment,
    likeComment,
    remove,
    share,
  };
}
