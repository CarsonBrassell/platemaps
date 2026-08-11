"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Dialog } from "./Dialog";
import { ChatIcon } from "@/components/icons";
import { initials, relativeTime, avatarPalette } from "@/lib/format";
import type { VoteDirection } from "./PostActions";
import type { Comment, Post } from "./types";

function handleFor(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

function score(comment: Comment) {
  return comment.upvoteCount - comment.downvoteCount;
}

/**
 * How far replies step right before they stop stepping. Past this the thread
 * keeps nesting in the data and keeps drawing its line, it just stops eating
 * the reading column — six levels of indent on a phone leaves about nine
 * characters per line.
 */
const MAX_INDENT_DEPTH = 4;

type Sort = "top" | "new";

/** One comment plus everything hanging off it, ready to render. */
type ThreadNode = { comment: Comment; replies: ThreadNode[] };

/**
 * Where each comment sits, worked out once — when the screen opens and again
 * whenever the sort is changed — rather than continuously.
 *
 * Sorting live off the current score looked right until it was used: upvoting
 * re-ranks a comment mid-click, so the thing you just pressed slides up the
 * page and your cursor is now over somebody else's reply. Every site with
 * threads this shape freezes the order for the same reason.
 */
function rankComments(comments: Comment[], sort: Sort): Map<string, number> {
  return new Map(
    comments.map((c) => [c.id, sort === "top" ? score(c) : Date.parse(c.createdAt)]),
  );
}

/**
 * Assembles the flat comment list into a reply tree, sorted at every level.
 *
 * Orphans matter here: a reply whose parent isn't in the list (deleted mid-
 * session, or arriving before its parent does) would otherwise vanish from a
 * thread it is still part of, so anything whose parent can't be found is
 * promoted to the top level rather than dropped.
 */
function buildThread(comments: Comment[], rank: Map<string, number>): ThreadNode[] {
  const nodes = new Map<string, ThreadNode>(
    comments.map((comment) => [comment.id, { comment, replies: [] }]),
  );
  const roots: ThreadNode[] = [];

  for (const comment of comments) {
    const node = nodes.get(comment.id)!;
    const parent = comment.parentId ? nodes.get(comment.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }

  // A comment with no rank was posted after the order was fixed, which on a
  // screen with no polling means you posted it — so it pins to the top of its
  // level rather than sinking in among the other zero-score replies.
  const rankOf = (c: Comment) => rank.get(c.id) ?? Number.POSITIVE_INFINITY;

  const compare = (a: ThreadNode, b: ThreadNode) =>
    rankOf(b.comment) - rankOf(a.comment) ||
    // Equal standing reads oldest-first, so a conversation stays a conversation.
    Date.parse(a.comment.createdAt) - Date.parse(b.comment.createdAt);

  const sortLevel = (level: ThreadNode[]) => {
    level.sort(compare);
    for (const node of level) sortLevel(node.replies);
  };
  sortLevel(roots);

  return roots;
}

function countReplies(node: ThreadNode): number {
  return node.replies.reduce((sum, child) => sum + 1 + countReplies(child), 0);
}

/**
 * The comments for one plate, as a screen of its own rather than a panel
 * beside the feed.
 *
 * It used to be a right-hand drawer, which capped a conversation at a phone's
 * width on a 27" display and left the thread nowhere to indent into. A thread
 * needs horizontal room the way a feed card doesn't, so this takes the whole
 * viewport, puts the post it belongs to at the top so you keep your bearings,
 * and gives the replies the width to nest in.
 */
export function CommentsScreen({
  post,
  currentUserId,
  onClose,
  onSubmit,
  onVoteComment,
  reactPoints,
}: {
  post: Post;
  currentUserId: string | null;
  onClose: () => void;
  /** Resolves with an error to show, or null on success. */
  onSubmit: (postId: string, text: string, parentId: string | null) => Promise<string | null>;
  onVoteComment: (postId: string, commentId: string, direction: VoteDirection) => void;
  /** Points an upvote just paid a comment's author, keyed by comment id. */
  reactPoints: Record<string, number>;
}) {
  const [sort, setSort] = useState<Sort>("top");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<string | null>(null);

  /* Fixed at open and re-taken only when the sort changes — see rankComments. */
  const [rank, setRank] = useState(() => rankComments(post.comments, "top"));

  const thread = useMemo(() => buildThread(post.comments, rank), [post.comments, rank]);

  function chooseSort(next: Sort) {
    setSort(next);
    setRank(rankComments(post.comments, next));
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function submit(text: string, parentId: string | null) {
    const failure = await onSubmit(post.id, text, parentId);
    if (failure) return failure;
    // A reply landing inside a collapsed subtree would post into thin air.
    if (parentId) {
      setCollapsed((prev) => {
        if (!prev.has(parentId)) return prev;
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
    }
    setReplyTo(null);
    return null;
  }

  const title = post.dishName ?? post.restaurant ?? "Comments";

  return (
    <Dialog
      title={title}
      onClose={onClose}
      variant="screen"
      headerAside={
        // On the cream header band, so pm-grey-text rather than zinc-500.
        <span className="shrink-0 font-mono text-xs tabular-nums text-pm-grey-text">
          {post.comments.length} {post.comments.length === 1 ? "comment" : "comments"}
        </span>
      }
      footer={
        currentUserId ? (
          <Composer
            key="root"
            placeholder="Add a comment…"
            submitLabel="Post"
            onSubmit={(text) => submit(text, null)}
          />
        ) : (
          <p className="py-1.5 text-sm text-pm-grey-text">
            <Link
              href="/account"
              className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500"
            >
              Sign in
            </Link>{" "}
            to join the conversation.
          </p>
        )
      }
    >
      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4 sm:px-5">
        {/* What everyone below is talking about. The feed card isn't behind
            this any more, so the post travels with the thread. */}
        <article className="rounded-2xl bg-white px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Avatar name={post.authorName} avatarUrl={post.authorAvatarUrl} size="sm" />
            <span className="font-mono text-[13px] font-medium text-zinc-900">
              {handleFor(post.authorName)}
            </span>
            <span className="font-mono text-xs text-zinc-500">
              · {relativeTime(post.createdAt)}
            </span>
          </div>
          {post.text && <p className="mt-2 text-sm leading-relaxed text-zinc-800">{post.text}</p>}
          {(post.restaurant || post.dishName) && (
            <p className="mt-2 truncate text-[13px] leading-snug">
              {post.restaurant && <span className="text-zinc-600">{post.restaurant}</span>}
              {post.restaurant && post.dishName && <span className="text-zinc-400"> · </span>}
              {post.dishName && (
                <span className="font-mono font-medium text-zinc-900">{post.dishName}</span>
              )}
            </p>
          )}
        </article>

        {/* Sort: a local switch, so it wears the segmented tan track — one
            rank below the screen tabs in the feed behind it. */}
        {post.comments.length > 1 && (
          <div className="mt-4 flex items-center gap-2">
            <span className="mono-label text-pm-grey-text">Sort</span>
            <div
              role="tablist"
              aria-label="Sort comments"
              className="inline-flex rounded-full bg-pm-grey-tint p-1"
            >
              {(["top", "new"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={sort === option}
                  onClick={() => chooseSort(option)}
                  className={`min-h-8 rounded-full px-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                    sort === option ? "bg-white text-zinc-900" : "text-pm-grey-text hover:text-zinc-900"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}

        {post.comments.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-2xl bg-white px-6 py-14 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-pm-grey-tint text-pm-grey-text">
              <ChatIcon className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-zinc-800">No comments yet</p>
            <p className="mt-1 text-sm text-zinc-500">
              Be the first to say something about this plate.
            </p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100 rounded-2xl bg-white px-4 py-1">
            {thread.map((node) => (
              <li key={node.comment.id} className="py-3">
                <CommentNode
                  node={node}
                  depth={0}
                  postAuthorId={post.userId}
                  currentUserId={currentUserId}
                  collapsed={collapsed}
                  onToggleCollapsed={toggleCollapsed}
                  replyTo={replyTo}
                  onReplyTo={setReplyTo}
                  onSubmitReply={submit}
                  onVote={(commentId, direction) => onVoteComment(post.id, commentId, direction)}
                  reactPoints={reactPoints}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function CommentNode({
  node,
  depth,
  postAuthorId,
  currentUserId,
  collapsed,
  onToggleCollapsed,
  replyTo,
  onReplyTo,
  onSubmitReply,
  onVote,
  reactPoints,
}: {
  node: ThreadNode;
  depth: number;
  postAuthorId: string;
  currentUserId: string | null;
  collapsed: Set<string>;
  onToggleCollapsed: (id: string) => void;
  replyTo: string | null;
  onReplyTo: (id: string | null) => void;
  onSubmitReply: (text: string, parentId: string) => Promise<string | null>;
  onVote: (commentId: string, direction: VoteDirection) => void;
  reactPoints: Record<string, number>;
}) {
  const { comment, replies } = node;
  const isCollapsed = collapsed.has(comment.id);
  const hidden = isCollapsed ? countReplies(node) : 0;
  const handle = handleFor(comment.authorName);

  /* The [-] toggle and the thread line down the left do the same thing, the
     way they do on the site this borrows from: one is reachable while you're
     reading the top of a comment, the other while you're lost somewhere in
     its replies. */
  const toggleLabel = isCollapsed
    ? `Expand ${handle}'s comment`
    : `Collapse ${handle}'s comment`;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleCollapsed(comment.id)}
          aria-expanded={!isCollapsed}
          aria-label={toggleLabel}
          className="-ml-1 flex h-6 w-5 shrink-0 items-center justify-center rounded font-mono text-xs leading-none text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <span aria-hidden="true">{isCollapsed ? "+" : "–"}</span>
        </button>

        <Avatar name={comment.authorName} avatarUrl={comment.authorAvatarUrl} size="xs" />

        <span className="truncate font-mono text-[13px] font-medium text-zinc-900">{handle}</span>

        {comment.userId === postAuthorId && (
          <span className="mono-label shrink-0 rounded-full bg-pm-grey-tint px-1.5 py-0.5 text-pm-grey-text">
            OP
          </span>
        )}

        <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-500">
          · {relativeTime(comment.createdAt)}
        </span>

        {isCollapsed && hidden > 0 && (
          <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-500">
            · {hidden} {hidden === 1 ? "reply" : "replies"}
          </span>
        )}
      </div>

      {!isCollapsed && (
        <>
          {/* Indented to clear the toggle, so body copy lines up with the
              handle above it rather than with the control beside it. */}
          <div className="pl-6">
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
              {comment.text}
            </p>

            <div className="relative mt-0.5 flex items-center gap-1">
              <CommentVotes
                comment={comment}
                canVote={!!currentUserId}
                onVote={(direction) => onVote(comment.id, direction)}
              />

              {/* What that upvote just paid the person who wrote this, in the
                  same floating chip the card uses. Polite live region: the
                  float is feedback, not something to steal focus. */}
              {reactPoints[comment.id] > 0 && (
                <span
                  role="status"
                  className="points-float pointer-events-none absolute -top-4 left-0 whitespace-nowrap rounded-full bg-pm-orange px-2 py-0.5 font-mono text-[11px] font-semibold text-[#F7F4EC]"
                >
                  +{reactPoints[comment.id]} point{reactPoints[comment.id] === 1 ? "" : "s"}
                </span>
              )}

              {currentUserId && (
                <button
                  type="button"
                  onClick={() => onReplyTo(replyTo === comment.id ? null : comment.id)}
                  aria-expanded={replyTo === comment.id}
                  className="min-h-11 rounded-full px-2 font-mono text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  Reply
                </button>
              )}
            </div>

            {replyTo === comment.id && (
              <div className="pb-2 pt-1">
                <Composer
                  autoFocus
                  placeholder={`Reply to ${handle}…`}
                  submitLabel="Reply"
                  onCancel={() => onReplyTo(null)}
                  onSubmit={(text) => onSubmitReply(text, comment.id)}
                />
              </div>
            )}
          </div>

          {replies.length > 0 && (
            <div
              className={`relative mt-1 ${
                depth < MAX_INDENT_DEPTH ? "pl-5 sm:pl-6" : "pl-3"
              }`}
            >
              {/* The rail is the control: a full-height hit area with a
                  hairline drawn inside it, which is why it's a button and not
                  a border on the container. */}
              <button
                type="button"
                onClick={() => onToggleCollapsed(comment.id)}
                aria-label={toggleLabel}
                tabIndex={-1}
                className="group absolute bottom-0 left-1 top-0 flex w-4 justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                <span
                  aria-hidden="true"
                  className="h-full w-px bg-zinc-200 transition-colors group-hover:bg-pm-orange"
                />
              </button>

              <ul>
                {replies.map((child) => (
                  <li key={child.comment.id} className="pt-3">
                    <CommentNode
                      node={child}
                      depth={depth + 1}
                      postAuthorId={postAuthorId}
                      currentUserId={currentUserId}
                      collapsed={collapsed}
                      onToggleCollapsed={onToggleCollapsed}
                      replyTo={replyTo}
                      onReplyTo={onReplyTo}
                      onSubmitReply={onSubmitReply}
                      onVote={onVote}
                      reactPoints={reactPoints}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * `▲ 12 ▼` — the post card's vote pair at comment scale, and the same rules:
 * one solid glyph per direction (never swapped for a hollow one, which renders
 * at a different size and makes the arrow grow under the cursor), the net
 * score between them, and a fixed-width score so a thread doesn't shuffle
 * sideways as votes land.
 */
function CommentVotes({
  comment,
  canVote,
  onVote,
}: {
  comment: Comment;
  canVote: boolean;
  onVote: (direction: VoteDirection) => void;
}) {
  const net = score(comment);

  const arrow = (direction: VoteDirection) => {
    const active = comment.myVote === direction;
    const up = direction === "up";
    return (
      <button
        type="button"
        onClick={() => onVote(direction)}
        disabled={!canVote}
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
        className={`flex h-11 w-5 items-center justify-center font-mono text-xs leading-none transition-colors disabled:opacity-40 disabled:hover:text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
          active ? "text-pm-orange" : "text-zinc-400 hover:text-pm-orange-text"
        }`}
      >
        <span aria-hidden="true">{up ? "▲" : "▼"}</span>
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

/**
 * One text field and a send button, used both by the screen's own composer and
 * by every inline reply. Each instance owns its own draft, so typing a reply
 * in one thread and then opening another doesn't carry the text across.
 */
function Composer({
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (text: string) => Promise<string | null>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const failure = await onSubmit(text.trim());
    setSubmitting(false);
    if (failure) {
      setError(failure);
      return;
    }
    setText("");
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor={`composer-${submitLabel}-${placeholder}`}>
          {placeholder}
        </label>
        <input
          id={`composer-${submitLabel}-${placeholder}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          maxLength={1000}
          // Only ever true on an inline reply box, which exists because the
          // reader just asked for it — the focus goes where they were headed.
          autoFocus={autoFocus}
          className="min-h-11 flex-1 rounded-full bg-pm-grey-tint/60 px-4 text-sm transition-colors placeholder:text-pm-grey-text focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange"
        />
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 shrink-0 rounded-full px-3 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="min-h-11 shrink-0 rounded-full bg-pm-orange px-4 text-sm font-medium text-[#F7F4EC] transition-transform hover:brightness-105 active:scale-[0.97] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          {submitting ? "Posting…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Avatar({
  name,
  avatarUrl,
  size,
}: {
  name: string;
  avatarUrl?: string;
  size: "xs" | "sm";
}) {
  const box = size === "xs" ? "h-6 w-6" : "h-8 w-8";
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt="" className={`${box} shrink-0 rounded-full object-cover`} />
    );
  }
  return (
    <span
      className={`${box} flex shrink-0 items-center justify-center rounded-full ${
        avatarPalette(name).avatarBg
      } font-mono text-[10px] font-semibold text-white`}
    >
      {initials(name)}
    </span>
  );
}
