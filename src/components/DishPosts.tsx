"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChatIcon, ThumbsUpIcon } from "@/components/icons";
import { StarRating } from "@/components/StarRating";
import { Composer } from "@/components/feed/Composer";
import { useAuth } from "@/lib/auth";
import { avatarPalette, initials, relativeTime } from "@/lib/format";
import type { MapComment } from "@/data/mapComments";

/**
 * The slice of a post this card reads. A narrowed mirror of `Post` in
 * `components/feed/types.ts` — the feed card's own shape carries votes, saves
 * and hearts, none of which this list offers, and declaring what it actually
 * renders keeps it from quietly growing into a second feed card.
 */
type DishPost = {
  id: string;
  authorName: string;
  authorAvatarUrl?: string;
  text: string;
  rating?: number;
  ratingKind?: "restaurant" | "dish";
  media: { url: string; type: "image" | "video"; alt?: string }[];
  createdAt: string;
  upvoteCount: number;
  downvoteCount: number;
  comments: DishReply[];
};

/**
 * A reply, flattened. `parentId` is carried and deliberately not rendered as
 * nesting: the sheet is 448px at its widest and the threaded reader already
 * exists on `/feed`. Everything posted from here is a top-level reply, so the
 * only rows this flattens are ones written in that reader.
 */
type DishReply = {
  id: string;
  parentId: string | null;
  authorName: string;
  authorAvatarUrl?: string;
  text: string;
  createdAt: string;
};

/** Three across at the sheet's width; a fourth would set the row shrinking. */
const VISIBLE_PHOTOS = 3;

/** Past this a post's replies collapse behind a count rather than pushing the
    next post off the screen. */
const VISIBLE_REPLIES = 2;

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
    { key: string; posts: DishPost[] } | { key: string; failed: true } | null
  >(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/restaurants/${encodeURIComponent(restaurantId)}/dish-posts?dish=${encodeURIComponent(dishName)}`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => setResult({ key, posts: data.posts as DishPost[] }))
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

  /**
   * A reply, written straight onto the post it answers.
   *
   * The new comment is spliced into the post it belongs to rather than
   * re-fetching the list: a refetch would reorder nothing and cost a round
   * trip, and the route hands back the created row already hydrated. Returns
   * the failure message, or null — the shape `Composer` expects.
   */
  async function submitReply(postId: string, text: string): Promise<string | null> {
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error ?? "Couldn't post that reply.";

    setResult((prev) => {
      if (prev === null || !("posts" in prev)) return prev;
      return {
        ...prev,
        posts: prev.posts.map((post) =>
          post.id === postId
            ? { ...post, comments: [...post.comments, data.comment as DishReply] }
            : post,
        ),
      };
    });
    return null;
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

      {loading ? (
        // No spinner: the sheet is already open and the rest of it is readable,
        // so this line is a placeholder holding its own height, not an event.
        <p className="font-mono text-xs text-zinc-500">Loading…</p>
      ) : failed ? (
        <p className="text-sm text-zinc-500">Couldn&apos;t load posts about this plate.</p>
      ) : count === 0 && seedComments.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nobody has posted about this plate yet — be the first.
        </p>
      ) : (
        <ul className="flex flex-col gap-5">
          {posts?.map((post) => (
            <DishPostRow key={post.id} post={post} onReply={submitReply} />
          ))}

          {/* The old seed bubbles, below the real posts and still anonymous:
              they carry no author, no rating and no photo, so they set as
              plain prose with a timestamp. Nothing to reply to — there is no
              post row behind them. */}
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

function DishPostRow({
  post,
  onReply,
}: {
  post: DishPost;
  onReply: (postId: string, text: string) => Promise<string | null>;
}) {
  const { isSignedIn } = useAuth();
  const [replying, setReplying] = useState(false);
  const [showAllReplies, setShowAllReplies] = useState(false);

  const { avatarBg } = avatarPalette(post.authorName);
  // The net score, never the two counts — a plate's write-up does not print
  // "and 3 people disagreed" underneath somebody's dinner. Hidden at zero or
  // below rather than shown as a 0, which reads as a verdict of its own.
  const net = post.upvoteCount - post.downvoteCount;
  const photos = post.media.filter((m) => m.type === "image").slice(0, VISIBLE_PHOTOS);
  const replies = post.comments;
  const shown = showAllReplies ? replies : replies.slice(0, VISIBLE_REPLIES);

  return (
    <li className="flex gap-2.5">
      <Avatar name={post.authorName} url={post.authorAvatarUrl} bg={avatarBg} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          {/* A username is a machine handle, so it sets in the mono — the same
              rule the restaurant thread follows. */}
          <span className="truncate font-mono text-[13px] font-medium text-zinc-900">
            {post.authorName}
          </span>
          {/* Each scale renders as itself. A 0-100 plate rating and an old
              1-5 restaurant review answer different questions, and neither is
              ever redrawn as the other — see the rating note in lib/db.ts. */}
          {post.rating !== undefined && post.ratingKind === "dish" && (
            <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-pm-orange-text">
              {Math.round(post.rating)}%
            </span>
          )}
          {post.rating !== undefined && post.ratingKind === "restaurant" && (
            <span className="flex shrink-0 items-center gap-1">
              <StarRating rating={post.rating} className="h-3 w-3" />
              <span className="font-mono text-xs tabular-nums text-zinc-500">
                {post.rating}/5
              </span>
            </span>
          )}
        </div>

        <p className="mt-0.5 text-sm leading-snug text-zinc-700">{post.text}</p>

        {/* The plate itself, which is most of why anyone opened this sheet. A
            lone photo takes the column at 4:3 rather than sitting in it as a
            thumbnail; two or three share the row as squares. Both keep the
            inset-and-rounded treatment DESIGN.md gives every photo area. */}
        {photos.length > 0 && (
          <div className="mt-2 flex gap-1.5">
            {photos.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.url}
                src={photo.url}
                alt={photo.alt ?? ""}
                loading="lazy"
                className={`min-w-0 flex-1 rounded-xl bg-[var(--pm-tone-1)] object-cover ${
                  photos.length === 1 ? "aspect-[4/3]" : "aspect-square"
                }`}
              />
            ))}
          </div>
        )}

        <div className="mt-1.5 flex items-center gap-3 font-mono text-xs text-zinc-500">
          {net > 0 && (
            <span className="inline-flex items-center gap-1">
              <ThumbsUpIcon className="h-3 w-3" />
              <span className="tabular-nums">{net}</span>
            </span>
          )}
          <span>{relativeTime(post.createdAt)}</span>
          {isSignedIn ? (
            <button
              onClick={() => setReplying((open) => !open)}
              aria-expanded={replying}
              className="font-medium text-zinc-700 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              {replying ? "Cancel" : "Reply"}
            </button>
          ) : (
            <Link
              href="/account"
              className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Sign in to reply
            </Link>
          )}
          {replies.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <ChatIcon className="h-3 w-3" />
              <span className="tabular-nums">{replies.length}</span>
            </span>
          )}
        </div>

        {(shown.length > 0 || replying) && (
          <div className="mt-2 flex flex-col gap-2.5">
            {shown.map((reply) => (
              <Reply key={reply.id} reply={reply} />
            ))}

            {replies.length > shown.length && (
              <button
                onClick={() => setShowAllReplies(true)}
                className="self-start font-mono text-xs font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                Show {replies.length - shown.length} more{" "}
                {replies.length - shown.length === 1 ? "reply" : "replies"}
              </button>
            )}

            {replying && (
              <Composer
                placeholder={`Reply to ${post.authorName}…`}
                submitLabel="Reply"
                autoFocus
                onSubmit={async (text) => {
                  const failure = await onReply(post.id, text);
                  if (!failure) setReplying(false);
                  return failure;
                }}
                onCancel={() => setReplying(false)}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Reply({ reply }: { reply: DishReply }) {
  const { avatarBg } = avatarPalette(reply.authorName);
  return (
    <div className="flex gap-2">
      <Avatar name={reply.authorName} url={reply.authorAvatarUrl} bg={avatarBg} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-zinc-700">
          <span className="font-mono text-xs font-medium text-zinc-900">{reply.authorName}</span>{" "}
          {reply.text}
        </p>
        <p className="mt-0.5 font-mono text-xs text-zinc-500">{relativeTime(reply.createdAt)}</p>
      </div>
    </div>
  );
}

function Avatar({
  name,
  url,
  bg,
  size = "md",
}: {
  name: string;
  url?: string;
  bg: string;
  size?: "md" | "sm";
}) {
  const box = size === "sm" ? "h-6 w-6 text-[9px]" : "h-8 w-8 text-[11px]";
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={`${box} shrink-0 rounded-full object-cover`} />
  ) : (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-full ${bg} font-mono font-semibold text-white`}
    >
      {initials(name)}
    </span>
  );
}
