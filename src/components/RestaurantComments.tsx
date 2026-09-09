"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { avatarPalette, initials, relativeTime } from "@/lib/format";
import { StarRating } from "@/components/StarRating";
import type { Restaurant } from "@/data/restaurantTypes";

/**
 * The slice of `/api/posts` this thread reads — a narrowed mirror of `Post` in
 * components/feed/types.ts.
 *
 * `rating` and `dishName` are the point of it. This list used to render
 * `post.text` and nothing else, so a plate someone scored 91% arrived here as
 * unattributed prose while the number it carried — the same number the
 * restaurant's whole score is derived from — was dropped on the floor.
 */
type Post = {
  id: string;
  authorName: string;
  authorAvatarUrl?: string;
  text: string;
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
  dishName?: string;
  rating?: number;
  ratingKind?: "restaurant" | "dish";
  createdAt: string;
};

/**
 * Everything posted about a restaurant, under the restaurant.
 *
 * **There is no composer here any more.** This card used to carry a six-stage
 * wizard of its own — comment or review, restaurant or food, a star picker, a
 * dish picker, a percent slider — that ended by *prefixing a string onto the
 * post text* (`@Landini's - Sopranos Pizza 91%; …`). Nothing it wrote ever
 * reached `posts.rating` or `posts.dish_name`, so none of it counted toward a
 * plate score, a dish's percent or a category tally; it only looked like a
 * review. Its star branch wrote a 1-5 restaurant rating years after that scale
 * was retired, and as text, where `/api/posts`' refusal to store one couldn't
 * catch it.
 *
 * The field is a link to the real composer now, holding this restaurant, and
 * every rating on this page comes from one flow.
 */
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
  const { isSignedIn } = useAuth();
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

      <div className="flex flex-col gap-4">
        {posts.length === 0 ? (
          <p className="text-sm text-zinc-500">No comments yet — be the first.</p>
        ) : (
          posts.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              highlighted={post.id === highlighted}
              rowRef={(el) => {
                rowRefs.current[post.id] = el;
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PostRow({
  post,
  highlighted,
  rowRef,
}: {
  post: Post;
  /** Deep-linked from the map — ringed for a moment so it can be found. */
  highlighted?: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
}) {
  const { avatarBg } = avatarPalette(post.authorName);

  return (
    /* The ring is the feed card's — `ring-2 ring-pm-orange` — so arriving from
       a bubble marks the same thing the same way on either page. The padding
       and negative margin are only so the ring has something to sit around: a
       row is bare text against the card, and a ring drawn tight on it clips the
       avatar. `scroll-mt-4` keeps the scrolled-to row off the rail's top edge. */
    <div
      ref={rowRef}
      className={`flex scroll-mt-4 gap-2.5 rounded-xl transition-shadow ${
        highlighted ? "-mx-2 px-2 py-2 ring-2 ring-pm-orange" : ""
      }`}
    >
      {post.authorAvatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.authorAvatarUrl}
          alt=""
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${avatarBg} font-mono text-[11px] font-semibold text-white`}
        >
          {initials(post.authorName)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          {/* A username is a machine handle, so it sets in the mono. */}
          <span className="truncate font-mono text-[13px] font-medium text-zinc-900">
            {post.authorName}
          </span>
          {/* Each scale renders as itself. A 0-100 plate rating and an old 1-5
              restaurant review answer different questions, and neither is ever
              redrawn as the other — see the rating note in lib/db.ts. */}
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

        {/* What the percent is *about*. A dish name used as a compact reference
            to a record sets in mono, not Fraunces — DESIGN.md's one exception
            to the type split, the same one the feed card's byline takes. */}
        {post.dishName && (
          <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">{post.dishName}</p>
        )}

        <p className="mt-0.5 text-sm leading-snug text-zinc-700">{post.text}</p>
        <p className="mt-0.5 font-mono text-xs text-zinc-500">{relativeTime(post.createdAt)}</p>
      </div>
    </div>
  );
}
