"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/feed/Dialog";
import { Composer } from "@/components/feed/Composer";
import { HeartIcon } from "@/components/icons";
import { initials, avatarPalette, relativeTime, postedDate } from "@/lib/format";
import type { ShelfPost } from "@/components/ProfileShelves";

/**
 * One of your own plates, opened up: the photo, what it scored, who hearted
 * it, and the conversation underneath.
 *
 * ## Why the heart list only exists here
 *
 * A heart is private by design everywhere else in this app. `hydratePosts`
 * reads exactly one heart fact — "did *this* viewer heart it" — and
 * `toggleHeart` deliberately returns no count, so that no code path can hand
 * a heart tally to an arbitrary caller. The single exception is
 * `getHeartsForAuthor`, which throws unless the requester is the post's own
 * author, and `GET /api/posts/[id]/heart`, which 403s on that throw.
 *
 * This sheet is a caller of that exception and nothing more. It is reached
 * only from your own profile, where every plate is yours by construction, and
 * it asks the server rather than trusting that: if this component were ever
 * mounted against somebody else's post the request would simply 403 and the
 * cluster would render empty. Do not add a prop that passes a heart list in
 * from outside — the access check has to stay on the server side of the wire.
 *
 * ## Two disclosures, deliberately staged
 *
 * The faces sit on the photo because a stack of three avatars answers "did
 * anyone I know like this?" at a glance, which is the question actually being
 * asked. They run down the corner rather than across it, which costs the
 * photo a narrow strip of its edge instead of a band of its bottom — a plate
 * shot is composed around its centre and its widest dimension is the one it
 * can least afford to have a bar laid across. The names behind them are one
 * tap further in, because a list of everyone who liked your lunch is a
 * different, slower thing to read and it should not be occupying the photo.
 * Comments sit below the fold of the photo for the same reason: the plate
 * first, the conversation second.
 *
 * ## The conversation is writable
 *
 * It was a transcript for one round: the author could read what people had
 * said about their plate and had nowhere to answer it, so the one place you
 * reliably go to find out that somebody commented was the one place you could
 * not reply. Everything the thread needs was already in the payload —
 * `/api/posts?mine=1` sends whole comments, `parent_id` included — so the
 * replies nest here the way they do in `CommentsScreen`, against the same
 * `POST /api/posts/[id]/comments` route.
 *
 * This is deliberately the *short* thread, not that screen: no sort switch, no
 * collapsing, no votes. A plate's own author reading their own plate is not
 * moderating a discussion, and the surface is a sheet over a profile rather
 * than a destination. If a thread here ever grows past what a sheet can hold,
 * the answer is to link out to the feed's screen, not to grow a second copy of
 * it in this file.
 */

export type DetailComment = {
  id: string;
  /** Null at the top of the thread; a comment id on a reply. */
  parentId?: string | null;
  userId?: string;
  authorName: string;
  authorAvatarUrl?: string;
  text: string;
  createdAt: string;
};

/** One comment and everything hanging off it. */
type CommentNode = { comment: DetailComment; replies: CommentNode[] };

/**
 * Flat comments in, reply tree out. The rows arrive oldest-first from the
 * server and anything posted in this session is appended, so every level comes
 * out in the order it was written without a sort — which is the reading order
 * a conversation wants.
 *
 * A reply whose parent isn't in the list is promoted to the top rather than
 * dropped, the same rule `buildThread` follows in CommentsScreen: a comment
 * that lost its parent is still something a person said on this plate, and
 * silently swallowing it is the worse failure.
 */
function buildComments(comments: DetailComment[]): CommentNode[] {
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
 * How deep a reply steps right before it stops stepping. Lower than the
 * comments screen's four because this is a sheet, not a viewport: at 375px the
 * body has 343px to spend and each step costs 14 of it.
 */
const MAX_INDENT_DEPTH = 2;

type HeartedBy = { userId: string; name: string; avatarUrl?: string };

/**
 * How many faces the closed stack shows before the rest become "+N".
 *
 * Height is the scarce axis here, and `max-h-[46dvh]` on the photo makes the
 * column look far roomier than it is: that cap is a ceiling, not a floor. The
 * image is `w-full object-cover` with no minimum height, so a wide plate shot is
 * only as tall as its aspect ratio makes it — on the narrowest phone the sheet
 * is 375px wide and the body's `px-4` leaves the photo 343px, putting a 3:1 shot
 * at ~114px. Three faces shingled plus the "+N" stand 61px, which that photo
 * clears; each further face costs another 13px.
 *
 * The number it shows is constant in height but not in value: everyone past
 * the third is folded into the "+N", so a plate with three likers and one with
 * three hundred draw exactly the same closed control.
 */
const FACES_SHOWN = 3;

function Face({
  name,
  url,
  size,
  ring,
}: {
  name: string;
  url?: string;
  size: number;
  ring?: boolean;
}) {
  /* The palette hands back Tailwind classes, not colours — same helper the
     feed's and the comments screen's avatars use, so a person keeps the same
     face wherever they show up.

     **A real profile picture wins.** The initials disc is DESIGN.md's answer
     to a *missing* avatar, the same rule the grids follow for a missing photo
     — never a stand-in for one that exists. `getHeartsForAuthor` selects
     `avatar_url` and hands it through, so this branch is the whole of it. */
  const box = { width: size, height: size };
  /* A white hairline — 1px, not the 2px it used to be, and not the charcoal
     that was tried in its place. The ring is only there to keep a face from
     bleeding into the photo behind it and into the face shingled under it,
     and at this size that is a job for the thinnest mark that does it. Two
     pixels of anything around a 22px circle is a quarter of its diameter
     spent on trim; in charcoal the shingled column read as a chain of dark
     rings rather than as faces. Do not thicken it back up. */
  const ringClass = ring ? "ring-1 ring-white" : "";
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      style={box}
      className={`shrink-0 rounded-full object-cover ${ringClass}`}
    />
  ) : (
    <span
      aria-hidden="true"
      style={box}
      className={`flex shrink-0 items-center justify-center rounded-full ${
        avatarPalette(name).avatarBg
      } font-mono text-[10px] font-semibold text-white ${ringClass}`}
    >
      {initials(name)}
    </span>
  );
}

/**
 * The stack, and the names it unfurls into.
 *
 * ## The shape
 *
 * Closed, three faces shingle into a single object with a `+N` capping it and
 * a bare heart on the bottom one. Open, the stack fans apart and every face's
 * name slides out beside it. The faces do not re-order, re-sort or reflow —
 * the thing you pressed is visibly the thing that answered, which is the whole
 * reason this shape beat a panel that opened somewhere else.
 *
 * ## Three things that are load-bearing
 *
 * **Rows carry their own offset, not one formula.** Rows past the third have
 * to park *behind* the top visible face; with a uniform step their empty slots
 * leave a visible gap between the stack and the `+N`. See `closedOffset`.
 *
 * **The badge collapses to zero width, not zero opacity.** An invisible but
 * present badge still reserves its width, which pushes the bottom face out of
 * the column and breaks the stack's straight right edge.
 *
 * **The heart retires on open.** It is pinned to the bottom face so it never
 * moves — but once names are on screen, a heart sitting on one avatar reads as
 * marking *that person* rather than the list, so it fades out instead. Its job
 * was to say "this stack is likes", and a column of names beside their own
 * faces does not need telling. Do not "fix" this by moving it; moving it is
 * what made it stop belonging in the first place.
 */

/** A face plus its 4px gap — the pitch of one row in the fanned column. */
const ROW_PITCH = 26;
/** How far a shingled face peeks past the one below it when closed. */
const SHINGLE = 13;
/**
 * How many names the fan will hold.
 *
 * The column cannot grow without bound: a plate with sixty likers would stand
 * a 1,560px list on a photo that is often shorter than 200px. Six is what a
 * typical plate shot carries without the fan reaching its top edge, and
 * anything past it stays folded into the `+N`.
 */
const FAN_MAX = 6;

/** Where a row sits when closed, measured against its open position. */
function closedOffset(i: number) {
  return i * ROW_PITCH - Math.min(i, FACES_SHOWN - 1) * SHINGLE;
}

const EASE = "ease-[cubic-bezier(0.2,0.9,0.25,1)]";

function HeartCluster({
  hearts,
  expanded,
  onToggle,
  anchored,
}: {
  hearts: HeartedBy[];
  expanded: boolean;
  onToggle: () => void;
  /** Floating in the photo's corner, or standing in the flow without one. */
  anchored: boolean;
}) {
  if (hearts.length === 0) return null;

  /* Index 0 is the bottom row, so the newest like sits beside the heart. */
  const rows = hearts.slice(0, FAN_MAX);
  /* "and N more", counted against what is actually on screen right now —
     three faces when closed, however many the fan holds when open. */
  const overflow = expanded
    ? hearts.length - rows.length
    : hearts.length - Math.min(hearts.length, FACES_SHOWN);
  /* The closed stack's height: the top edge of the highest thing showing.
     Without it the column reserves its full open height and hands the button
     a hit area covering most of the photo. */
  const closedHeight =
    (overflow > 0 ? SHINGLE * FACES_SHOWN : SHINGLE * (FACES_SHOWN - 1)) + 22;
  const capOffset = rows.length * ROW_PITCH - SHINGLE * FACES_SHOWN;

  const label =
    hearts.length +
    (hearts.length === 1 ? " person" : " people") +
    " liked this — " +
    (expanded ? "hide" : "show") +
    " who";

  const rowBase =
    "mb-1 flex h-[22px] items-center justify-end transition-transform duration-300 last:mb-0 " +
    EASE +
    " motion-reduce:transition-none";

  return (
    <div
      className={
        (anchored ? "absolute bottom-2 right-2 z-10" : "relative mb-3 ml-auto w-max") +
        /* The bottom alignment that the whole closed stack is measured
           against, and it has to be on THIS element rather than on the list
           inside it.

           `closedOffset` moves every row *downward* from where flow put it, on
           the assumption that the list's bottom edge is the corner it is
           anchored to. It wasn't: the container carries an explicit
           `closedHeight` and the `ul` is an ordinary block child, so the list
           started at the container's TOP and ran its full content height —
           178px of column hanging out of a 61px box — and then the rows
           translated further down still. Everything below the photo's edge was
           cut off by the `overflow-hidden` on the frame, which for a plate
           with more than a couple of likes is the entire stack. It degraded
           with popularity: two likes happened to line up, three sat low, nine
           were gone completely.

           `justify-end` against negative free space overflows the start edge,
           which is exactly what the list wants to do — grow up out of the
           corner and let the parked rows disappear off the top. It is dropped
           while expanded, where the height cap and `overflow-y-auto` make the
           box scrollable and content overflowing the top of a flex-end
           scroller cannot be scrolled back to. */
        " flex flex-col" +
        /* pb-0.5 pays for the ring. Each face carries `ring-1`, which paints
           outside its 22px box, so the column measures taller than the rows
           that make it up — enough to trip `overflow-y-auto` into showing a
           scrollbar on a list that fits perfectly well. */
        (expanded ? " max-h-[calc(100%-1rem)] overflow-y-auto pb-0.5" : " justify-end")
      }
      style={expanded ? undefined : { height: closedHeight }}
    >
      {/* Bottom-aligned, so the column grows upward out of its anchored corner
          and the rows parked out of sight overflow off the top, where nothing
          is drawn. The alignment lives on the container above — `justify-end`
          here only ever positioned the rows inside a list that was already
          exactly as tall as they are. */}
      <ul className="flex flex-col items-end">
        {overflow > 0 && (
          <li
            className={rowBase}
            style={{
              transform: expanded ? undefined : "translateY(" + capOffset + "px)",
            }}
          >
            {/* Same circle and ring as a face, so the overflow reads as the
                column continuing rather than a caption stuck beside it — the
                ring width has to track `Face`'s or this circle sits a pixel
                wider than the ones it is capping. */}
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white/95 font-mono text-[9.5px] font-semibold tabular-nums text-pm-orange-text ring-1 ring-white">
              +{overflow}
            </span>
          </li>
        )}

        {rows
          .map((h, i) => ({ h, i }))
          .reverse()
          .map(({ h, i }) => (
            <li
              key={h.userId}
              className={rowBase}
              style={{
                transform: expanded
                  ? undefined
                  : "translateY(" + closedOffset(i) + "px)",
              }}
            >
              <span
                title={h.name}
                className={
                  "overflow-hidden truncate whitespace-nowrap rounded-full bg-white/95 text-[11.5px] text-zinc-900 transition-[opacity,transform] duration-300 motion-reduce:transition-none " +
                  EASE +
                  (expanded
                    ? " mr-1.5 max-w-[22ch] px-2 py-0.5 opacity-100"
                    : " w-0 translate-x-2.5 px-0 opacity-0")
                }
              >
                {h.name}
              </span>
              <span className="relative">
                <Face name={h.name} url={h.avatarUrl} size={22} ring />
                {i === 0 && (
                  <HeartIcon
                    filled
                    className={
                      "pointer-events-none absolute -bottom-0.5 -left-px h-[13px] w-[13px] text-pm-red transition-opacity duration-200 [filter:drop-shadow(0_0_2px_rgba(255,255,255,0.95))_drop-shadow(0_0_3px_rgba(255,255,255,0.85))] motion-reduce:transition-none " +
                      (expanded ? "opacity-0" : "opacity-100")
                    }
                  />
                )}
              </span>
            </li>
          ))}
      </ul>

      {/* The control itself, laid over the column. A <button> may only hold
          phrasing content, so the names cannot live inside one — this keeps
          the markup valid while still making the whole stack one target. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={label}
        className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      />
    </div>
  );
}


/**
 * One comment, its Reply control, and its replies under it.
 *
 * The thread line is a plain left border rather than the comments screen's
 * full-height button: that button exists to collapse a subtree, and nothing
 * here collapses. A border that does nothing should not be shaped like a
 * control that does.
 */
function CommentRow({
  node,
  depth,
  postAuthorId,
  replyTo,
  onReplyTo,
  onSubmitReply,
}: {
  node: CommentNode;
  depth: number;
  /** Whose plate this is, so the author's own comments are marked. */
  postAuthorId?: string;
  replyTo: string | null;
  onReplyTo: (id: string | null) => void;
  onSubmitReply: (text: string, parentId: string) => Promise<string | null>;
}) {
  const { comment, replies } = node;
  const open = replyTo === comment.id;

  return (
    <li>
      <div className="flex items-start gap-2.5 rounded-xl bg-pm-grey-tint/40 px-3 py-2.5">
        <Face name={comment.authorName} url={comment.authorAvatarUrl} size={28} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13px] font-semibold text-zinc-900">
              {comment.authorName}
            </span>
            {/* The author's own replies are marked the same way the comments
                screen marks them, so a thread you have answered reads as
                answered rather than as one more person agreeing. */}
            {postAuthorId && comment.userId === postAuthorId && (
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
          <button
            type="button"
            onClick={() => onReplyTo(open ? null : comment.id)}
            aria-expanded={open}
            className="-ml-2 mt-0.5 min-h-11 rounded-full px-2 font-mono text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Reply
          </button>
        </div>
      </div>

      {open && (
        <div className="pl-3 pt-2">
          <Composer
            autoFocus
            placeholder={`Reply to ${comment.authorName}…`}
            submitLabel="Reply"
            onCancel={() => onReplyTo(null)}
            onSubmit={(text) => onSubmitReply(text, comment.id)}
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
              replyTo={replyTo}
              onReplyTo={onReplyTo}
              onSubmitReply={onSubmitReply}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function PlateDetailSheet({
  post,
  onClose,
  onCommentAdded,
}: {
  post: ShelfPost;
  onClose: () => void;
  /**
   * A comment this sheet just wrote, handed back so the profile's own copy of
   * the post grows with it.
   *
   * The sheet does not keep the comment itself: the tile behind it prints a
   * comment count off the same array, and a reply that lived only in here
   * would leave the tile reading one short until the next page load. The post
   * this component renders is looked up by id in the profile's list on every
   * render, so patching that list is what puts the reply on screen.
   */
  onCommentAdded?: (comment: DetailComment) => void;
}) {
  const [hearts, setHearts] = useState<HeartedBy[]>([]);
  const [heartsOpen, setHeartsOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  /* Author-only, and checked server-side: a 403 here is a correct answer, not
     an error to surface — it just means this is not your plate, and the
     cluster stays empty. */
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/posts/${post.id}/heart`)
      .then((res) => (res.ok ? res.json() : { heartedBy: [] }))
      .then((data: { heartedBy?: HeartedBy[] }) => {
        if (!cancelled) setHearts(data.heartedBy ?? []);
      })
      .catch(() => {
        /* The plate still reads without its faces. */
      });
    return () => {
      cancelled = true;
    };
  }, [post.id]);

  const photo = post.media?.find((m) => m.type === "image");
  const pct =
    post.ratingKind === "dish" && post.rating != null
      ? Math.round(post.rating)
      : null;
  const comments = post.comments ?? [];
  const thread = buildComments(comments);
  const name = post.dishName ?? post.restaurant ?? post.text;

  /**
   * Post a comment or a reply. The same route the feed's thread writes
   * through, so the points rules apply unchanged — and on your own plate that
   * means nothing is paid, which `/api/posts/[id]/comments` decides rather
   * than this component.
   */
  async function submit(text: string, parentId: string | null): Promise<string | null> {
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, parentId }),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? "Couldn't post that comment.";
      onCommentAdded?.(data.comment as DetailComment);
      setReplyTo(null);
      return null;
    } catch {
      return "Couldn't reach PlateMaps. Check your connection.";
    }
  }

  return (
    <Dialog
      title={name}
      onClose={onClose}
      variant="sheet"
      footer={
        <Composer
          key="root"
          placeholder="Add a comment…"
          submitLabel="Post"
          onSubmit={(text) => submit(text, null)}
        />
      }
    >
      <div className="px-4 pb-5 pt-1">
        {/* `overflow-hidden` is the guarantee behind FACES_SHOWN: the column is
            sized to fit the shortest photo anyone plausibly posts, and this
            clips it against the image if that estimate is ever wrong. Escaping
            upward would land it on the restaurant name, which is worse than a
            cropped avatar. */}
        {photo && (
          <div className="relative mb-3 overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.alt ?? ""}
              className="block max-h-[46dvh] w-full rounded-xl object-cover"
            />
            <HeartCluster
              anchored
              hearts={hearts}
              expanded={heartsOpen}
              onToggle={() => setHeartsOpen((v) => !v)}
            />
          </div>
        )}

        {/* Without a photo there is nowhere to hang the cluster, so the same
            control stands in the photo's place rather than being silently
            unavailable. It moved up here from below the score line for the
            same reason the names moved: the control and the list it opens
            have to stay next to each other, and an 84px column cannot be
            absolutely positioned inside the 32px strip that used to hold the
            horizontal pill. */}
        {!photo && (
          <HeartCluster
            anchored={false}
            hearts={hearts}
            expanded={heartsOpen}
            onToggle={() => setHeartsOpen((v) => !v)}
          />
        )}

        {/* The names land directly under whichever control opened them, which
            is now the photo's bottom edge. Horizontally the cluster was a
            wide bar and the list could sit a couple of lines further down
            without losing its parent; a column pinned in a corner has one
            adjacent slot and this is it. Anything between the two — the
            restaurant line, the score line — would read as content the panel
            had pushed aside rather than content it belongs to. */}
        {/* Named the same way the shelf card names it, so the plate you tapped
            is unmistakably the plate you got. */}
        {post.dishName && post.restaurant && (
          <p className="mb-1 text-[13px] text-zinc-500">{post.restaurant}</p>
        )}

        {/* Separated by the same middot the shelf cards use — without it
            "▲ 27 9 likes" runs two unrelated numbers together and reads as
            one. */}
        <p className="mb-3 flex items-baseline gap-2 font-mono text-[13px] tabular-nums text-zinc-700">
          <span>▲ {post.upvoteCount}</span>
          {pct !== null && (
            <>
              <span aria-hidden="true" className="text-zinc-400">
                ·
              </span>
              <span className="text-pm-orange-text">{pct}%</span>
            </>
          )}
          {hearts.length > 0 && (
            <>
              <span aria-hidden="true" className="text-zinc-400">
                ·
              </span>
              <span className="text-zinc-500">
                {hearts.length} {hearts.length === 1 ? "like" : "likes"}
              </span>
            </>
          )}
          {/* The day, not "324d ago" — this line is about a plate in an
              archive, and the tile that opened it prints the same date. */}
          <span aria-hidden="true" className="text-zinc-400">
            ·
          </span>
          <span className="text-zinc-500">{postedDate(post.createdAt)}</span>
        </p>

        {post.text && (
          <p className="mb-4 whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-800">
            {post.text}
          </p>
        )}

        <p className="mono-label mb-2 text-zinc-500">
          {comments.length > 0
            ? `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`
            : "Comments"}
        </p>

        {comments.length === 0 ? (
          <p className="rounded-xl bg-pm-grey-tint/50 px-4 py-5 text-center text-[13px] text-zinc-600">
            No comments on this plate yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {thread.map((node) => (
              <CommentRow
                key={node.comment.id}
                node={node}
                depth={0}
                postAuthorId={post.userId}
                replyTo={replyTo}
                onReplyTo={setReplyTo}
                onSubmitReply={submit}
              />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
