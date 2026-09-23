"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThumbsUpIcon } from "@/components/icons";
import { ShortPostRow, useShortThreadActions, type ShortPost } from "@/components/feed/ShortThread";
import { useAuth } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import type { MapComment } from "@/data/mapComments";

/**
 * What people wrote about one plate.
 *
 * The dish sheet used to answer this from `mapComments` alone — hand-authored
 * seed bubbles keyed to the 19 restaurants the app shipped with. Every real
 * write-up about a dish was already in Postgres and reachable nowhere except
 * the restaurant's undifferentiated thread at the bottom of the page, so
 * tapping a plate showed nothing about it on all but a handful of restaurants.
 * The posts lead now; the seed chatter follows them, unchanged.
 *
 * Each post is the short thread's row — `ShortPostRow` in feed/ShortThread —
 * so the arrows and Reply that are on the same post in the feed and in the
 * restaurant's own thread are here too. This card used to draw a thumbs-up
 * with the net score next to it: a count being *reported*, which DESIGN.md
 * allows, except it sat exactly where every other surface puts the vote you
 * can *cast*, and read as a control that did nothing.
 *
 * Fetched on open rather than shipped with the page: a menu here runs to a
 * hundred rows and the reader opens one of them. See the note on the route.
 */
export function DishPosts({
  restaurantId,
  dishName,
  seedComments,
  onSeeAll,
}: {
  restaurantId: string;
  /** The menu's spelling. Normalised server-side — see `dishRatingKey`. */
  dishName: string;
  /** Seed map bubbles about this dish: anonymous, unrated, newest first. */
  seedComments: MapComment[];
  onSeeAll: () => void;
}) {
  /**
   * The sheet can be re-pointed at another plate without unmounting — the map
   * bubble's `?dish=` deep link does exactly that — so the answer is stored
   * *with the question it answers*, and anything whose key doesn't match the
   * dish currently on screen reads as "not loaded yet".
   *
   * That is also why the effect doesn't clear this on the way in: resetting
   * state synchronously inside an effect is a cascading render, and comparing
   * keys during render gets the same result a frame earlier.
   */
  const key = `${restaurantId} ${dishName}`;
  const [result, setResult] = useState<
    { key: string; posts: ShortPost[] } | { key: string; failed: true } | null
  >(null);
  const { account, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/restaurants/${encodeURIComponent(restaurantId)}/dish-posts?dish=${encodeURIComponent(dishName)}`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => setResult({ key, posts: data.posts as ShortPost[] }))
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setResult({ key, failed: true });
      });

    return () => controller.abort();
  }, [key, restaurantId, dishName]);

  const current = result?.key === key ? result : null;
  const failed = current !== null && "failed" in current;
  const posts = current !== null && "posts" in current ? current.posts : null;
  const loading = current === null;
  const count = posts?.length ?? 0;

  /* The votes and replies — the feed's routes and arithmetic, shared with the
     restaurant thread. A patch is written into the loaded result only; if the
     sheet has since been re-pointed at another plate there is nothing to
     patch, and the response for the old one is simply dropped. */
  const { votePost, voteComment, addComment, error } = useShortThreadActions<ShortPost>({
    getPost: (postId) => posts?.find((p) => p.id === postId),
    patchPost: (postId, patch) =>
      setResult((prev) => {
        if (prev === null || !("posts" in prev)) return prev;
        return { ...prev, posts: prev.posts.map((p) => (p.id === postId ? patch(p) : p)) };
      }),
  });

  /* Where the "Sign in" line already points. A dead arrow gives no clue why
     nothing happened, so a signed-out press goes to the door instead. */
  function requireSignIn() {
    router.push("/account");
  }

  return (
    <div className="mt-4 rounded-2xl bg-white px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="mono-label text-zinc-500">What people said</p>
        {count > 0 && (
          <p className="font-mono text-xs tabular-nums text-zinc-500">
            {count} {count === 1 ? "post" : "posts"}
          </p>
        )}
      </div>

      {error && (
        <p role="status" className="mb-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        // No spinner: the sheet is already open and the rest of it is readable,
        // so this line is a placeholder holding its own height, not an event.
        <p className="font-mono text-xs text-zinc-500">Loading…</p>
      ) : failed ? (
        <p className="text-sm text-zinc-500">Couldn&apos;t load posts about this plate.</p>
      ) : count === 0 && seedComments.length === 0 ? (
        <div className="flex flex-col items-start gap-1.5">
          <p className="text-sm text-zinc-500">
            Nobody has posted about this plate yet — be the first.
          </p>
          {/* The rate/vote controls elsewhere on this page (the reply link
              below, the feed's vote arrows) all give a logged-out reader the
              same door back in — this empty state was the one place on the
              dish sheet that didn't. */}
          {!isSignedIn && (
            <Link
              href="/account"
              className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Sign in to rate it
            </Link>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-5">
          {posts?.map((post) => (
            <li key={post.id}>
              {/* No dish name under the handle: every post here is about the
                  plate in the sheet's title. */}
              <ShortPostRow
                post={post}
                showDishName={false}
                canInteract={isSignedIn}
                currentUserId={account?.id ?? null}
                onRequireSignIn={requireSignIn}
                onVote={(direction) => votePost(post.id, direction)}
                onVoteComment={(commentId, direction) =>
                  voteComment(post.id, commentId, direction)
                }
                onReply={(text, parentId) => addComment(post.id, text, parentId)}
              />
            </li>
          ))}

          {/* The old seed bubbles, below the real posts and still anonymous:
              they carry no author, no rating and no photo, so they set as
              plain prose with a timestamp. Nothing to reply to or vote on —
              there is no post row behind them — so the thumbs-up here is the
              one DESIGN.md keeps: a count of approvals being reported. */}
          {seedComments.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-1">
              <p className="text-sm leading-snug text-zinc-700">{comment.text}</p>
              <div className="flex items-center gap-2.5 font-mono text-xs text-zinc-500">
                {comment.upvotes !== undefined && (
                  <span className="inline-flex items-center gap-1">
                    <ThumbsUpIcon className="h-3 w-3" />
                    {comment.upvotes}
                  </span>
                )}
                {comment.createdAt && <span>{relativeTime(comment.createdAt)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={onSeeAll}
        className="mt-4 font-mono text-xs font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        See every comment on this restaurant
      </button>
    </div>
  );
}
