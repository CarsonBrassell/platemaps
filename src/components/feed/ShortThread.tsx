"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Composer } from "@/components/feed/Composer";
import { VotePair, type VoteDirection } from "@/components/feed/PostActions";
import { VoteArrowUpIcon, VoteArrowDownIcon } from "@/components/icons";
import { StarRating } from "@/components/StarRating";
import { avatarPalette, initials, relativeTime } from "@/lib/format";
import type { Comment } from "@/components/feed/types";

/**
 * The short thread: one post, its arrows, and the replies under it.
 *
 * Three places show a post outside the feed — the restaurant page's
 * "Comments & reviews" rail, the dish sheet's "What people said" card, and
 * (with its own chrome) your own plate in PlateDetailSheet. The first two used
 * to be read-only mirrors of the feed card: a plate you could vote on and
 * answer on `/feed` arrived there stripped of both, and the dish sheet drew a
 * thumbs-up you couldn't press. This is the one row they both render now.
 *
 * It is deliberately the *short* thread, as PlateDetailSheet describes its
 * own: no sort switch, no collapsing, replies folded behind their count. If a
 * thread ever outgrows a 400px column, link out to the feed's CommentsScreen
 * rather than growing a second copy of it here.
 *
 * Every write goes through the feed's routes — `POST /api/posts/[id]/vote`,
 * `/api/posts/[id]/comments`, `/api/comments/[id]/vote` — with the same
 * three-state, optimistic-then-reconcile shape as `usePostFeed.ts`, so the
 * points rules stay decided in one place.
 */

/**
 * The slice of `/api/posts` (and `getDishPosts`) a short thread reads — a
 * narrowed mirror of `Post` in components/feed/types.ts. Declaring what is
 * actually rendered keeps either caller from quietly growing into a second
 * feed card.
 */
export type ShortPost = {
  id: string;
  userId: string;
  authorName: string;
  authorAvatarUrl?: string;
  text: string;
  dishName?: string;
  /** Native scale: 1-5 stars with ratingKind "restaurant", 0-100% with "dish". */
  rating?: number;
  ratingKind?: "restaurant" | "dish";
  /**
   * The plate. Already gated server-side: `hydratePosts` in lib/db.ts hands
   * back `[]` for a post whose author hasn't opted into public photos, so
   * whatever arrives here is showable.
   */
  media?: { url: string; type: "image" | "video"; alt?: string }[];
  createdAt: string;
  /** Public, shown as the net score — never on its own. */
  upvoteCount: number;
  downvoteCount: number;
  upvotedByMe: boolean;
  /** Never true at the same time as upvotedByMe — see castVote in lib/db.ts. */
  downvotedByMe: boolean;
  comments: Comment[];
};

/** Photos shown per post; the cap the dish sheet set for its width. */
const VISIBLE_PHOTOS = 3;

/** One comment and everything hanging off it. */
type CommentNode = { comment: Comment; replies: CommentNode[] };

/**
 * Past this depth replies stop indenting and just keep the rail, the floor
 * PlateDetailSheet holds — at 400px a third indent leaves a column too
 * narrow for a sentence.
 */
const MAX_INDENT_DEPTH = 2;

/**
 * Flat comments in, reply tree out. Rows arrive oldest-first and anything
 * written in this session is appended, so every level comes out in the order
 * it was said without a sort. A reply whose parent isn't in the list is
 * promoted to the top rather than dropped — the rule `buildThread` in
 * CommentsScreen and `buildComments` in PlateDetailSheet both follow.
 */
function buildComments(comments: Comment[]): CommentNode[] {
  const nodes = new Map<string, CommentNode>(
    comments.map((comment) => [comment.id, { comment, replies: [] }]),
  );
  const roots: CommentNode[] = [];
  for (const comment of comments) {
    const node = nodes.get(comment.id)!;
    const parent = comment.parentId ? nodes.get(comment.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

/**
 * The writes, for a caller that owns a list of `ShortPost`s in whatever
 * state shape suits it. `getPost` reads the current row; `patchPost` swaps
 * it. Everything else — the three-state arithmetic, the round trip, the
 * rollback — is here, so the restaurant rail and the dish sheet cannot drift.
 */
export function useShortThreadActions<P extends ShortPost>({
  getPost,
  patchPost,
}: {
  getPost: (postId: string) => P | undefined;
  patchPost: (postId: string, patch: (p: P) => P) => void;
}) {
  /* A vote that didn't land. One line rather than a banner: the row has
     already rolled back, so this only has to say why. Clears itself. */
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  /**
   * Cast or clear a vote on a post. Same three-state toggle as `vote()` in
   * usePostFeed.ts: pressing the direction already held clears it, the other
   * one switches sides, and the optimistic patch mirrors that arithmetic so
   * the score doesn't jump by one and then correct by two on a switch.
   */
  async function votePost(postId: string, direction: VoteDirection) {
    const current = getPost(postId);
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
    } catch {
      patchPost(postId, (p) => ({ ...p, ...before }));
      setError("Couldn't save your vote.");
    }
  }

  /** `votePost`'s twin for one comment in one post's list. */
  async function voteComment(postId: string, commentId: string, direction: VoteDirection) {
    const before = getPost(postId)?.comments.find((c) => c.id === commentId);
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
    } catch {
      patchComment((c) => ({
        ...c,
        myVote: before.myVote,
        upvoteCount: before.upvoteCount,
        downvoteCount: before.downvoteCount,
      }));
      setError("Couldn't save your vote.");
    }
  }

  /**
   * A reply. `parentId` null answers the post; a comment id answers that
   * comment. Resolves with an error string for the Composer to show, or null
   * once the row is in the list — the contract `comment()` in usePostFeed.ts
   * keeps, so the same Composer sits behind both. The route hands back the
   * created row already hydrated, so it is spliced in rather than refetched.
   */
  async function addComment(
    postId: string,
    text: string,
    parentId: string | null,
  ): Promise<string | null> {
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, parentId }),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? "Couldn't post that reply.";
      patchPost(postId, (p) => ({ ...p, comments: [...p.comments, data.comment as Comment] }));
      return null;
    } catch {
      return "Couldn't reach PlateMaps. Check your connection.";
    }
  }

  return { votePost, voteComment, addComment, error };
}

/**
 * The "Sign in" link both surfaces already print, at the size of the line it
 * sits in.
 */
function SignInLink({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href="/account"
      className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500"
    >
      {children}
    </Link>
  );
}

/**
 * One post and the fold under it. The caller wraps it in whatever list item
 * or ring it needs and hands down the three writes from `useShortThreadActions`.
 */
export function ShortPostRow({
  post,
  canInteract,
  currentUserId,
  highlighted,
  rowRef,
  showDishName = true,
  onRequireSignIn,
  onVote,
  onVoteComment,
  onReply,
}: {
  post: ShortPost;
  /** Signed in. Signed out, every control here goes to `onRequireSignIn`. */
  canInteract: boolean;
  currentUserId: string | null;
  /** Deep-linked from the map — ringed for a moment so it can be found. */
  highlighted?: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
  /**
   * Print the plate's name under the handle. On by default; the dish sheet
   * turns it off because every post in it is about the one plate in its title.
   */
  showDishName?: boolean;
  /** Called instead of the action when nobody is signed in. */
  onRequireSignIn: () => void;
  onVote: (direction: VoteDirection) => void;
  onVoteComment: (commentId: string, direction: VoteDirection) => void;
  onReply: (text: string, parentId: string | null) => Promise<string | null>;
}) {
  const { avatarBg } = avatarPalette(post.authorName);
  const photos = (post.media ?? []).filter((m) => m.type === "image").slice(0, VISIBLE_PHOTOS);
  const thread = buildComments(post.comments);
  const count = post.comments.length;

  /* The replies sit behind their count. A restaurant with forty plates and a
     few answers under each is a page, not a list, if every thread is open at
     once — so a post shows its arrows and "3 replies", and the conversation
     unfolds under the one you pressed. `Reply` on a post with no replies yet
     opens the same fold with just the field in it. */
  const [open, setOpen] = useState(false);
  /* Which comment's inline Composer is showing, if any. One at a time. */
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const myVote: VoteDirection | null = post.upvotedByMe
    ? "up"
    : post.downvotedByMe
      ? "down"
      : null;

  function handleToggle() {
    if (!open && count === 0 && !canInteract) {
      onRequireSignIn();
      return;
    }
    setOpen((v) => !v);
    setReplyTo(null);
  }

  /* Not disabled when signed out — a dead control gives no clue why nothing
     happened, so it prompts to sign in instead. Same rule as PostActions. */
  function guarded<T extends unknown[]>(fn: (...args: T) => void) {
    return (...args: T) => {
      if (!canInteract) {
        onRequireSignIn();
        return;
      }
      fn(...args);
    };
  }

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
            to the type split, the same one the feed card's byline takes. The
            dish sheet leaves this off: every post in it is about the one
            plate in its title. */}
        {showDishName && post.dishName && (
          <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">{post.dishName}</p>
        )}

        <p className="mt-0.5 text-sm leading-snug text-zinc-700">{post.text}</p>

        {/* The plate. A lone photo takes the column at 4:3, two or three share
            the row as squares, inset and rounded per DESIGN.md. */}
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

        {/* Arrows, the fold, the time — the feed card's order, so the gesture
            doesn't move between surfaces. The pair is the feed's own VotePair:
            the same marks, the same cast animation, the same net score. */}
        <div className="mt-0.5 flex items-center gap-1">
          <VotePair
            upvoteCount={post.upvoteCount}
            downvoteCount={post.downvoteCount}
            myVote={myVote}
            onVote={guarded(onVote)}
          />
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={open}
            className="min-h-11 rounded-full px-2 font-mono text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            {count === 0 ? "Reply" : `${count} ${count === 1 ? "reply" : "replies"}`}
          </button>
          <span className="ml-auto shrink-0 font-mono text-xs text-zinc-500">
            {relativeTime(post.createdAt)}
          </span>
        </div>

        {open && (
          <div className="mt-1 flex flex-col gap-2">
            {thread.length > 0 && (
              <ul className="flex flex-col gap-2">
                {thread.map((node) => (
                  <CommentRow
                    key={node.comment.id}
                    node={node}
                    depth={0}
                    postAuthorId={post.userId}
                    currentUserId={currentUserId}
                    replyTo={replyTo}
                    onReplyTo={guarded(setReplyTo)}
                    onSubmitReply={(text, parentId) => onReply(text, parentId)}
                    onVote={guarded(onVoteComment)}
                  />
                ))}
              </ul>
            )}
            {canInteract ? (
              /* The field for answering the post itself, at the foot of its
                 replies. Hidden while a comment's own Reply field is open so
                 there is never a question of which one you are typing into. */
              replyTo === null && (
                <Composer
                  autoFocus={count === 0}
                  placeholder={`Reply to ${post.authorName}…`}
                  submitLabel="Reply"
                  onCancel={count === 0 ? () => setOpen(false) : undefined}
                  onSubmit={(text) => onReply(text, null)}
                />
              )
            ) : (
              <p className="text-xs text-zinc-500">
                <SignInLink>Sign in</SignInLink> to reply.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One reply and everything under it. PlateDetailSheet's `CommentRow` at
 * column scale — the same cream well, the same OP mark, votes then Reply in
 * the same order the feed's thread puts them in.
 */
function CommentRow({
  node,
  depth,
  postAuthorId,
  currentUserId,
  replyTo,
  onReplyTo,
  onSubmitReply,
  onVote,
}: {
  node: CommentNode;
  depth: number;
  /** Whose plate this is, so the author's own replies are marked. */
  postAuthorId: string;
  currentUserId: string | null;
  replyTo: string | null;
  onReplyTo: (id: string | null) => void;
  onSubmitReply: (text: string, parentId: string) => Promise<string | null>;
  onVote: (commentId: string, direction: VoteDirection) => void;
}) {
  const { comment, replies } = node;
  const open = replyTo === comment.id;
  const { avatarBg } = avatarPalette(comment.authorName);

  return (
    <li>
      <div className="flex items-start gap-2 rounded-xl bg-pm-grey-tint/40 px-3 py-2">
        {comment.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={comment.authorAvatarUrl}
            alt=""
            className="h-6 w-6 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${avatarBg} font-mono text-[9px] font-semibold text-white`}
          >
            {initials(comment.authorName)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate font-mono text-xs font-medium text-zinc-900">
              {comment.authorName}
            </span>
            {comment.userId === postAuthorId && (
              <span className="mono-label rounded-full bg-white px-1.5 py-0.5 text-pm-grey-text">
                OP
              </span>
            )}
            <span className="font-mono text-[10px] text-zinc-500">
              {relativeTime(comment.createdAt)}
            </span>
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-zinc-700">
            {comment.text}
          </p>
          <div className="flex items-center gap-1">
            <CommentVotes
              comment={comment}
              onVote={(direction) => onVote(comment.id, direction)}
            />
            <button
              type="button"
              onClick={() => onReplyTo(open ? null : comment.id)}
              aria-expanded={open}
              className="min-h-11 rounded-full px-2 font-mono text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Reply
            </button>
          </div>
        </div>
      </div>

      {open && currentUserId && (
        <div className="pl-3 pt-2">
          <Composer
            autoFocus
            placeholder={`Reply to ${comment.authorName}…`}
            submitLabel="Reply"
            onCancel={() => onReplyTo(null)}
            onSubmit={async (text) => {
              const failure = await onSubmitReply(text, comment.id);
              if (!failure) onReplyTo(null);
              return failure;
            }}
          />
        </div>
      )}

      {replies.length > 0 && (
        <ul
          className={`mt-2 flex flex-col gap-2 border-l border-zinc-200 ${
            depth < MAX_INDENT_DEPTH ? "ml-3 pl-3" : "pl-3"
          }`}
        >
          {replies.map((child) => (
            <CommentRow
              key={child.comment.id}
              node={child}
              depth={depth + 1}
              postAuthorId={postAuthorId}
              currentUserId={currentUserId}
              replyTo={replyTo}
              onReplyTo={onReplyTo}
              onSubmitReply={onSubmitReply}
              onVote={onVote}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The feed thread's vote pair at comment scale — PlateDetailSheet's
 * `CommentVotes`, for the same reasons: one mark per direction that only
 * changes colour and fill, never size, and a fixed-width score between them so
 * the row doesn't shuffle sideways as votes land.
 */
function CommentVotes({
  comment,
  onVote,
}: {
  comment: Comment;
  onVote: (direction: VoteDirection) => void;
}) {
  const net = comment.upvoteCount - comment.downvoteCount;

  const arrow = (direction: VoteDirection) => {
    const active = comment.myVote === direction;
    const up = direction === "up";
    const Arrow = up ? VoteArrowUpIcon : VoteArrowDownIcon;
    return (
      <button
        type="button"
        onClick={() => onVote(direction)}
        aria-pressed={active}
        aria-label={
          active
            ? up
              ? "Remove upvote"
              : "Remove downvote"
            : up
              ? "Upvote this comment"
              : "Downvote this comment"
        }
        className={`flex h-11 w-6 items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
          active ? "text-pm-orange" : "text-zinc-400 hover:text-pm-orange-text"
        }`}
      >
        <Arrow filled={active} className="h-3.5 w-3.5" />
      </button>
    );
  };

  return (
    <div className="-ml-1 flex items-center">
      {arrow("up")}
      <span
        aria-label={`Net score ${net}`}
        className="min-w-[3ch] text-center font-mono text-xs font-semibold tabular-nums text-pm-orange-text"
      >
        {net}
      </span>
      {arrow("down")}
    </div>
  );
}
