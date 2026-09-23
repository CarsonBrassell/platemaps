"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ShortPostRow, useShortThreadActions, type ShortPost } from "@/components/feed/ShortThread";
import type { Restaurant } from "@/data/restaurantTypes";

/**
 * The slice of `/api/posts` this thread reads: the short thread's row plus the
 * three fields that decide whether a post belongs to *this* restaurant.
 *
 * `rating` and `dishName` (on `ShortPost`) are the point of it. This list used
 * to render `post.text` and nothing else, so a plate someone scored 91%
 * arrived here as unattributed prose while the number it carried — the same
 * number the restaurant's whole score is derived from — was dropped on the
 * floor. The arrows and the Reply that are on the same post in the feed
 * weren't here either; they come with the row now.
 */
type Post = ShortPost & {
  restaurant?: string;
  /**
   * The listing the post actually resolved to, server-side, and the id the
   * map's bubbles are keyed by — see `indexPostsByRestaurant` in
   * lib/mapBubbles.ts. Read here so a bubble's `?post=` deep link can always
   * find its row: the name join below is the older, looser test, and a post
   * that resolved to this restaurant without carrying its exact name string
   * would otherwise be missing from the very list it was linked into.
   */
  placeId?: string;
  /** What the composer wrote. The fallback when `placeId` is absent. */
  restaurantId?: string;
};

export function RestaurantComments({
  restaurant,
  postHref,
  highlightPostId,
}: {
  restaurant: Restaurant;
  /**
   * Where the comment field goes. The two versions of the site have two
   * composers (`/post` and `/m/post`), and both take `?restaurant=<id>` and
   * answer their own "where were you?" step with it — so the caller passes the
   * one it belongs to rather than this component guessing from the URL.
   */
  postHref: string;
  /**
   * One comment to scroll to and ring, from `?post=` on the page URL — what a
   * map bubble pushes when its body is tapped, so the thing the reader clicked
   * is the thing they land on rather than a list they have to re-find it in.
   * Null or absent leaves the thread exactly as it was.
   */
  highlightPostId?: string | null;
}) {
  const { account, isSignedIn } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  /* Which row is currently ringed. Separate from `highlightPostId` because it
     is temporary — the ring fades after a few seconds while the URL keeps its
     param, so a refresh still lands on the comment. Same pair, and the same
     timings, as the `/feed?post=` highlight in app/feed/page.tsx. */
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetch("/api/posts")
      .then((res) => res.json())
      .then((data) =>
        setPosts(
          (data.posts as Post[]).filter(
            (p) =>
              p.restaurant === restaurant.name ||
              p.placeId === restaurant.id ||
              p.restaurantId === restaurant.id,
          ),
        ),
      )
      .catch(() => {
        // Leaves the empty state up. Nothing here is worth an error banner.
      });
  }, [restaurant.name, restaurant.id]);

  /* Deep link from a map bubble. Waits for the posts, because the row cannot
     be scrolled to before it exists — and on `/restaurant` that wait is real:
     the thread is fetched client-side after the server-rendered page paints.
     The 150ms is the settling beat the feed's copy uses for the same reason,
     and on lg this scroll travels inside the sticky comments rail rather than
     the page, which `scrollIntoView` handles on its own. */
  useEffect(() => {
    if (!highlightPostId || !posts.some((p) => p.id === highlightPostId)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlighted(highlightPostId);
    const scroll = setTimeout(() => {
      rowRefs.current[highlightPostId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    const clear = setTimeout(() => setHighlighted(null), 3000);
    return () => {
      clearTimeout(scroll);
      clearTimeout(clear);
    };
  }, [highlightPostId, posts]);

  /* The votes and replies themselves — the feed's routes and the feed's
     three-state arithmetic, shared with the dish sheet in ShortThread. */
  const { votePost, voteComment, addComment, error } = useShortThreadActions<Post>({
    getPost: (postId) => posts.find((p) => p.id === postId),
    patchPost: (postId, patch) =>
      setPosts((prev) => prev.map((p) => (p.id === postId ? patch(p) : p))),
  });

  /* Where the "Sign in" line already points. A dead arrow gives no clue why
     nothing happened, so a signed-out press goes to the door instead. */
  function requireSignIn() {
    router.push("/account");
  }

  return (
    <div className="rounded-2xl bg-white px-5 py-5 sm:px-6">
      <p className="mono-label mb-4 text-zinc-500">Comments &amp; reviews</p>

      {!isSignedIn ? (
        <p className="mb-4 text-sm text-zinc-500">
          <Link
            href="/account"
            className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500"
          >
            Sign in
          </Link>{" "}
          to comment or leave a review.
        </p>
      ) : (
        /* A link, not a textarea. It looks like the field it replaced because
           that is where people already reach; what changed is where it lands. */
        <Link
          href={postHref}
          className="mb-4 flex min-h-11 w-full items-center rounded-full bg-pm-grey-tint px-4 py-2.5 text-left text-sm text-pm-grey-text transition-colors hover:bg-pm-grey-tint/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          Add a comment or review…
        </Link>
      )}

      {error && (
        <p role="status" className="mb-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {posts.length === 0 ? (
          <p className="text-sm text-zinc-500">No comments yet — be the first.</p>
        ) : (
          posts.map((post) => (
            <ShortPostRow
              key={post.id}
              post={post}
              canInteract={isSignedIn}
              currentUserId={account?.id ?? null}
              highlighted={post.id === highlighted}
              rowRef={(el) => {
                rowRefs.current[post.id] = el;
              }}
              onRequireSignIn={requireSignIn}
              onVote={(direction) => votePost(post.id, direction)}
              onVoteComment={(commentId, direction) => voteComment(post.id, commentId, direction)}
              onReply={(text, parentId) => addComment(post.id, text, parentId)}
            />
          ))
        )}
      </div>
    </div>
  );
}
