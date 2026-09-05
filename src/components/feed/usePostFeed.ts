"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { VoteDirection } from "./PostActions";
import type { Comment, Post } from "./types";
import type { FeedPlaces } from "@/lib/feedFilters";

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
  /**
   * The restaurants the loaded posts are about, keyed by id — what the feed's
   * filters read.
   *
   * Sent beside the posts by every feed route (`placesForPosts` in
   * lib/discover.ts) rather than fetched separately, so narrowing the feed costs
   * no request of its own. Empty is the honest degraded state: no post resolves
   * to a place, the search field still works over captions and comments, and
   * the restaurant dimensions simply offer nothing to pick.
   */
  const [places, setPlaces] = useState<FeedPlaces>({});
  const [loadError, setLoadError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  /** Points just earned by upvoting, keyed by post, floated above its actions. */
  const [reactPoints, setReactPoints] = useState<Record<string, number>>({});
  /** The same, keyed by comment — floated beside that comment's score. */
  const [commentReactPoints, setCommentReactPoints] = useState<Record<string, number>>({});

  /**
   * One read of the current endpoint, as a promise.
   *
   * It resolves rather than rejects on failure — every caller wants "the fetch
   * is over", and the outcome is already reported through `posts`/`loadError`.
   * That is what lets a caller *await* a load: the phone's pull-to-refresh
   * holds its spinner up until this settles, and a rejection there would be an
   * unhandled one for a failure the hook has already handled.
   *
   * `isStale` is how the mount effect below abandons a response whose endpoint
   * has since changed — switching tabs mid-flight must not paint the old feed
   * over the new one. A manual refresh has nothing to abandon and passes
   * nothing, so it always lands.
   */
  const load = useCallback(
    (isStale: () => boolean = () => false) =>
      fetch(endpoint)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
        .then((data) => {
          if (isStale()) return;
          setPosts(data.posts as Post[]);
          setPlaces((data.places as FeedPlaces | undefined) ?? {});
          setLoadError(false);
        })
        .catch(() => {
          if (isStale()) return;
          setPosts((prev) => prev ?? []);
          setLoadError(true);
        }),
    [endpoint],
  );

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load, reloadKey]);

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

  /** creditAuthor's twin for a comment: same float, anchored to the comment. */
  function creditCommentAuthor(commentId: string, points: number, authorId: string) {
    setCommentReactPoints((prev) => ({ ...prev, [commentId]: points }));
    setTimeout(
      () =>
        setCommentReactPoints((prev) => {
          const copy = { ...prev };
          delete copy[commentId];
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

  /** `parentId` makes it a reply to another comment on the same post. */
  async function comment(
    postId: string,
    text: string,
    parentId: string | null = null,
  ): Promise<string | null> {
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, parentId }),
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

  /**
   * A comment's up/down. Same three-state arithmetic as `vote` above, applied
   * to one comment in one post's list: pressing what you hold clears it, the
   * other direction switches sides, and the optimistic patch does the full
   * swing so a switch doesn't jump by one and then correct by two.
   */
  async function voteComment(postId: string, commentId: string, direction: VoteDirection) {
    if (!account) return;
    const before = posts?.find((p) => p.id === postId)?.comments.find((c) => c.id === commentId);
    if (!before) return;

    const held = before.myVote;
    const next = held === direction ? null : direction;

    function patchComment(patch: (c: Comment) => Comment) {
      patchPost(postId, (p) => ({
        ...p,
        comments: p.comments.map((c) => (c.id === commentId ? patch(c) : c)),
      }));
    }

    patchComment((c) => ({
      ...c,
      myVote: next,
      upvoteCount: c.upvoteCount + (next === "up" ? 1 : 0) - (held === "up" ? 1 : 0),
      downvoteCount: c.downvoteCount + (next === "down" ? 1 : 0) - (held === "down" ? 1 : 0),
    }));

    try {
      const res = await fetch(`/api/comments/${commentId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      patchComment((c) => ({
        ...c,
        myVote: data.myVote,
        upvoteCount: data.upvoteCount,
        downvoteCount: data.downvoteCount,
      }));

      if (data.authorPointsEarned > 0) {
        creditCommentAuthor(commentId, data.authorPointsEarned, data.authorId);
      }
    } catch {
      patchComment((c) => ({
        ...c,
        myVote: before.myVote,
        upvoteCount: before.upvoteCount,
        downvoteCount: before.downvoteCount,
      }));
      setBanner("Couldn't save your vote.");
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

  /**
   * Copy, by whichever route this browser actually allows.
   *
   * `navigator.clipboard.writeText` is the modern one and it is not always
   * available even on a secure origin: it is gated behind a permission that
   * several WebViews — including the one the iOS app runs in — deny outright,
   * and it rejects with `NotAllowedError` rather than being absent, so a
   * feature check does not catch it. `execCommand` is deprecated and still the
   * only thing that works there, so it stays as the second attempt.
   *
   * Returns whether the text actually landed on the clipboard. The caller
   * needs that answer: silently reporting "Link copied" for a copy that never
   * happened is worse than the button doing nothing, because it stops the
   * person from trying again.
   */
  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* Fall through to the legacy path below. */
    }
    try {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      // Off-screen but still focusable: `display: none` cannot be selected,
      // and a visible field would scroll the page on focus.
      field.style.position = "fixed";
      field.style.top = "0";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      return copied;
    } catch {
      return false;
    }
  }

  /**
   * Share a plate, or copy its link when there is no share sheet.
   *
   * Every failure used to land in one `catch` that returned null, on the
   * reasoning that a cancelled native share throws and should stay quiet. It
   * does — but so does a clipboard write the browser refuses, and swallowing
   * both is why this button did nothing at all anywhere `navigator.share` is
   * missing and the clipboard permission is denied. Only `AbortError` is a
   * decision; everything else is a failure and the caller gets a note to show.
   */
  async function share(post: Post): Promise<string | null> {
    const url = `${globalThis.location?.origin ?? ""}/feed?post=${post.id}`;
    const title = post.dishName ?? post.restaurant ?? "A plate on PlateMaps";

    if (navigator.share) {
      try {
        await navigator.share({ title, text: post.text, url });
        return null;
      } catch (err) {
        // Dismissing the sheet is a choice, not a problem to report.
        if (err instanceof DOMException && err.name === "AbortError") return null;
        // Anything else means the sheet never delivered — fall back to copying.
      }
    }

    return (await copyText(url)) ? "Link copied" : "Couldn't copy the link";
  }

  return {
    posts,
    places,
    setPosts,
    /* Re-read the feed on demand, and tell the caller when that is done. The
       phone's pull-to-refresh is the only caller today; the "Try again" button
       still goes through `reloadKey` because it has nothing to wait for. */
    refresh: () => load(),
    patchPost,
    loadError,
    offline,
    banner,
    setBanner,
    reactPoints,
    commentReactPoints,
    vote,
    heart,
    save,
    comment,
    voteComment,
    remove,
    share,
  };
}
