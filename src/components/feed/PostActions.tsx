"use client";

import { useEffect, useState } from "react";
import {
  HeartIcon,
  ChatIcon,
  ShareIcon,
  BookmarkIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
} from "@/components/icons";

/**
 * Every control in this row is color-only on press — nothing scales, pops or
 * bursts. A row of icons that grows under the cursor makes the whole card
 * twitch at the moment you're trying to read what you just did to it, so
 * state changes here are carried entirely by fill and hue.
 */
const action =
  "flex min-h-11 items-center gap-1.5 rounded-full px-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900 disabled:opacity-45 disabled:hover:text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/** Which way this viewer voted. Mirrors VoteDirection in lib/db.ts. */
export type VoteDirection = "up" | "down";

type SharedProps = {
  commentCount: number;
  saved: boolean;
  canInteract: boolean;
  /** e.g. "+1 point for maya" — floats once then clears itself. */
  pointsToast: string | null;
  onComment: () => void;
  onSave: () => void;
  /** Resolves with a short confirmation to flash, or null to stay silent. */
  onShare: () => Promise<string | null>;
  /** Called instead of the action when nobody is signed in. */
  onRequireSignIn: () => void;
};

/**
 * Which card the reaction belongs to decides which control renders — a post
 * is never shown with both. This is a discriminated union rather than two
 * optional props specifically so a Friends-surface call site cannot pass
 * `upvoteCount`: the count simply isn't a field that type accepts, so
 * leaking it isn't a discipline problem, it's a type error.
 */
type PostActionsProps =
  | (SharedProps & {
      surface: "discover";
      /** Public — the same numbers every viewer of this post already sees. */
      upvoteCount: number;
      downvoteCount: number;
      /** null when this viewer hasn't voted. Never both directions at once. */
      myVote: VoteDirection | null;
      onVote: (direction: VoteDirection) => void;
      /**
       * "arrows" (default) is the web card's thumb N thumb — unchanged unless a
       * caller opts out. "pill" is the phone feed's rounded, icon-button
       * trough (see VotePill below); nothing switches to it on its own.
       */
      voteStyle?: "arrows" | "pill";
    })
  | (SharedProps & {
      surface: "friends";
      /** No count field exists here on purpose — see the type's own comment. */
      hearted: boolean;
      onReact: () => void;
    });

export function PostActions(props: PostActionsProps) {
  const { commentCount, saved, canInteract, pointsToast, onComment, onSave, onShare, onRequireSignIn } =
    props;

  // Driven by the click rather than by `saved` changing, so only the person
  // who pressed it hears about it.
  const [savedToast, setSaved_toast] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  function handleSave() {
    if (!canInteract) {
      onRequireSignIn();
      return;
    }
    // Only confirm adding, not removing.
    if (!saved) {
      setSaved_toast(true);
      setTimeout(() => setSaved_toast(false), 1650);
    }
    onSave();
  }

  function handleHeart() {
    if (!canInteract) {
      onRequireSignIn();
      return;
    }
    if (props.surface === "friends") props.onReact();
  }

  function handleVote(direction: VoteDirection) {
    if (!canInteract) {
      onRequireSignIn();
      return;
    }
    if (props.surface === "discover") props.onVote(direction);
  }

  useEffect(() => {
    if (!shareNote) return;
    const t = setTimeout(() => setShareNote(null), 2000);
    return () => clearTimeout(t);
  }, [shareNote]);

  async function handleShare() {
    setShareNote(await onShare());
  }

  return (
    /* The row splits: the verdict on the left, what you do about it on the
       right. Voting is the one control here that changes the post's standing
       for everybody else, so it gets the reading-order position and its own
       side rather than queueing behind three utilities. */
    <div className="relative flex w-full items-center justify-between gap-2">
      {props.surface === "discover" ? (
        // One number between the controls either way, and it's the NET
        // score, not the upvote total — see the shared reasoning on
        // VotePair below; VotePill just wears it in a different shape.
        props.voteStyle === "pill" ? (
          <VotePill
            upvoteCount={props.upvoteCount}
            downvoteCount={props.downvoteCount}
            myVote={props.myVote}
            onVote={handleVote}
          />
        ) : (
          <VotePair
            upvoteCount={props.upvoteCount}
            downvoteCount={props.downvoteCount}
            myVote={props.myVote}
            onVote={handleVote}
          />
        )
      ) : (
        // Friends has no vote pair at all, so the left side is empty here and
        // the utilities keep their right-hand position via ml-auto below.
        <span />
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" onClick={onComment} className={action} aria-label="Open comments">
          <ChatIcon className="h-[19px] w-[19px]" />
          <span className="font-mono text-xs tabular-nums">{commentCount}</span>
        </button>

        <button type="button" onClick={handleShare} className={action} aria-label="Share this plate">
          <ShareIcon className="h-[18px] w-[18px]" />
        </button>

        {/* Not disabled when signed out — a dead control gives no clue why
            nothing happened, so it prompts to sign in instead. */}
        <button
          type="button"
          onClick={handleSave}
          aria-pressed={saved}
          aria-label={saved ? "Remove from saved" : "Save this plate"}
          className={action}
        >
          <BookmarkIcon
            filled={saved}
            className={`h-[18px] w-[18px] ${saved ? "text-pm-orange" : ""}`}
          />
        </button>

        {/* Heart: outline icon, no count anywhere in this render — see
            PostActionsProps. Purely acknowledgment, nothing to compare. It
            closes the right-hand group on Friends, where the left is empty. */}
        {props.surface === "friends" && (
          <button
            type="button"
            onClick={handleHeart}
            aria-pressed={props.hearted}
            aria-label={props.hearted ? "Remove heart" : "Heart this plate"}
            className={`${action} ${props.hearted ? "text-pm-orange hover:text-pm-orange" : ""}`}
          >
            <HeartIcon filled={props.hearted} className="h-[19px] w-[19px]" />
          </button>
        )}
      </div>

      {/* Both toasts are polite live regions so a screen reader hears them
          without the visual float stealing focus. */}
      {pointsToast && (
        <span
          role="status"
          className="points-float pointer-events-none absolute -top-6 right-0 whitespace-nowrap rounded-full bg-pm-orange px-2 py-0.5 font-mono text-[11px] font-semibold text-[#F7F4EC]"
        >
          {pointsToast}
        </span>
      )}
      {savedToast && (
        <span
          role="status"
          className="save-toast pointer-events-none absolute -top-6 right-0 rounded-full bg-pm-charcoal px-2 py-0.5 font-mono text-[11px] font-medium text-white"
        >
          Saved
        </span>
      )}
      {shareNote && (
        <span
          role="status"
          className="pointer-events-none absolute -top-6 right-0 whitespace-nowrap rounded-full bg-pm-charcoal px-2 py-0.5 font-mono text-[11px] font-medium text-white"
        >
          {shareNote}
        </span>
      )}
    </div>
  );
}

/**
 * Up arrow, net score, down arrow — the whole cluster in the accent, since a
 * vote count is one of the three things allowed to be orange.
 *
 * Every dimension here is fixed on purpose. The arrows sit in square boxes so
 * the hollow and solid glyphs occupy identical space, and the score reserves
 * room for a minus sign and two digits in tabular figures, so a plate crossing
 * from 9 to 10 (or from 1 to -1) doesn't shove the arrows sideways under the
 * cursor that just pressed one.
 */
function VotePair({
  upvoteCount,
  downvoteCount,
  myVote,
  onVote,
}: {
  upvoteCount: number;
  downvoteCount: number;
  myVote: VoteDirection | null;
  onVote: (direction: VoteDirection) => void;
}) {
  const score = upvoteCount - downvoteCount;

  const arrow = (direction: VoteDirection) => {
    const active = myVote === direction;
    const up = direction === "up";
    const Thumb = up ? ThumbsUpIcon : ThumbsDownIcon;
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
              ? "Upvote this plate"
              : "Downvote this plate"
        }
        className={`flex h-11 w-7 items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
          active
            ? "text-pm-orange"
            : "text-zinc-400 hover:text-pm-orange-text"
        }`}
      >
        {/* Same path, same box, outline or filled — so pressing it changes
            colour and weight but never size. That was the bug in the ▲/△ text
            glyphs this replaced: the two characters come out of different
            fallback fonts at different optical sizes, so the arrow appeared to
            jump on click. */}
        <Thumb filled={active} className="h-[18px] w-[18px]" />
      </button>
    );
  };

  return (
    /* Pulled left by the thumb box's own optical padding so the icon lines
       up with the restaurant name above it rather than floating inboard of it.
       The 44px target itself is unchanged — it just overhangs into the card's
       gutter, which is empty. */
    <div className="-ml-1.5 flex items-center">
      {arrow("up")}
      {/* Reads as one value to a screen reader; the arrows already announce
          their own state, so this only needs to say what the number means. */}
      <span
        aria-label={`Net score ${score}`}
        className="min-w-[3ch] text-center font-mono text-sm font-semibold tabular-nums text-pm-orange-text"
      >
        {score}
      </span>
      {arrow("down")}
    </div>
  );
}

/**
 * The phone feed's vote control — a single rounded trough (matching the
 * `bg-pm-grey-tint` pill language every other secondary control on that
 * screen already wears) instead of two bare glyphs floating in the row.
 * Your own vote fills its half of the pill solid orange with a white icon,
 * rather than just recoloring a tiny arrow — a bigger, more obviously
 * pressed state for a surface read at arm's length and tapped with a thumb.
 *
 * Same thumbs as VotePair, at pill scale — the two controls are the same
 * gesture in two shapes and must not use two different marks. Net score only,
 * same reasoning as VotePair: one number, not an upvote/downvote scoreboard
 * under someone's dinner.
 */
function VotePill({
  upvoteCount,
  downvoteCount,
  myVote,
  onVote,
}: {
  upvoteCount: number;
  downvoteCount: number;
  myVote: VoteDirection | null;
  onVote: (direction: VoteDirection) => void;
}) {
  const score = upvoteCount - downvoteCount;

  const segment = (direction: VoteDirection) => {
    const active = myVote === direction;
    const Icon = direction === "up" ? ThumbsUpIcon : ThumbsDownIcon;
    return (
      <button
        type="button"
        onClick={() => onVote(direction)}
        aria-pressed={active}
        aria-label={
          active
            ? direction === "up"
              ? "Remove upvote"
              : "Remove downvote"
            : direction === "up"
              ? "Upvote this plate"
              : "Downvote this plate"
        }
        className={`flex min-h-11 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
          active ? "bg-pm-orange text-white" : "text-zinc-500 hover:text-pm-orange-text"
        }`}
      >
        <Icon filled={active} className="h-4 w-4" />
      </button>
    );
  };

  return (
    <div className="-ml-0.5 flex items-center rounded-full bg-pm-grey-tint p-0.5">
      {segment("up")}
      <span
        aria-label={`Net score ${score}`}
        className="min-w-[2ch] px-0.5 text-center font-mono text-sm font-semibold tabular-nums text-pm-orange-text"
      >
        {score}
      </span>
      {segment("down")}
    </div>
  );
}
