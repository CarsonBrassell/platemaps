"use client";

import { useEffect, useState } from "react";
import { ArrowUpIcon, HeartIcon, ChatIcon, ShareIcon, BookmarkIcon } from "@/components/icons";

const action =
  "flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 disabled:opacity-45 disabled:hover:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

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
      /** Public — the same number every viewer of this post already sees. */
      upvoteCount: number;
      upvoted: boolean;
      onReact: () => void;
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

  const [burst, setBurst] = useState(false);
  const [savePop, setSavePop] = useState(false);
  const [savedToast, setSaved_toast] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const reacted = props.surface === "discover" ? props.upvoted : props.hearted;

  // Driven by the click rather than by `saved` changing, so the bookmark only
  // pops for the person who pressed it.
  function handleSave() {
    if (!canInteract) {
      onRequireSignIn();
      return;
    }
    // Only celebrate adding, not removing.
    if (!saved) {
      setSavePop(true);
      setSaved_toast(true);
      setTimeout(() => setSavePop(false), 460);
      setTimeout(() => setSaved_toast(false), 1650);
    }
    onSave();
  }

  function handleReact() {
    if (!canInteract) {
      onRequireSignIn();
      return;
    }
    // Only pop on the way in — un-reacting celebrating itself reads wrong.
    if (!reacted) {
      setBurst(true);
      setTimeout(() => setBurst(false), 300);
    }
    props.onReact();
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
    <div className="relative flex items-center gap-1 px-2">
      {props.surface === "discover" ? (
        // Upvote: arrow icon, public count beside it. Visually distinct from
        // the heart below on purpose — the two reactions must never be
        // mistakable for each other.
        <button
          type="button"
          onClick={handleReact}
          aria-pressed={props.upvoted}
          aria-label={props.upvoted ? "Remove upvote" : "Upvote this plate"}
          className={`${action} ${props.upvoted ? "text-pm-orange" : ""}`}
        >
          <ArrowUpIcon className={`h-[21px] w-[21px] ${burst ? "like-burst" : ""}`} />
          <span className={props.upvoted ? "font-medium text-pm-orange-text" : ""}>
            {props.upvoteCount}
          </span>
        </button>
      ) : (
        // Heart: outline icon, no count anywhere in this render — see
        // PostActionsProps. Purely acknowledgment, nothing to compare.
        <button
          type="button"
          onClick={handleReact}
          aria-pressed={props.hearted}
          aria-label={props.hearted ? "Remove heart" : "Heart this plate"}
          className={`${action} ${props.hearted ? "text-pm-orange" : ""}`}
        >
          <HeartIcon
            filled={props.hearted}
            className={`h-[21px] w-[21px] ${props.hearted ? "text-pm-orange" : ""} ${
              burst ? "like-burst" : ""
            }`}
          />
        </button>
      )}

      <button type="button" onClick={onComment} className={action} aria-label="Open comments">
        <ChatIcon className="h-[22px] w-[22px]" />
        <span>{commentCount}</span>
      </button>

      <button type="button" onClick={handleShare} className={action} aria-label="Share this plate">
        <ShareIcon className="h-[21px] w-[21px]" />
      </button>

      {/* Not disabled when signed out — a dead control gives no clue why
          nothing happened, so it prompts to sign in instead. */}
      <button
        type="button"
        onClick={handleSave}
        aria-pressed={saved}
        aria-label={saved ? "Remove from saved" : "Save this plate"}
        className={`${action} ml-auto`}
      >
        <BookmarkIcon
          filled={saved}
          className={`h-[21px] w-[21px] ${saved ? "text-pm-orange" : ""} ${
            savePop ? "save-pop" : ""
          }`}
        />
      </button>

      {/* Both toasts are polite live regions so a screen reader hears them
          without the visual float stealing focus. */}
      {pointsToast && (
        <span
          role="status"
          className="points-float pointer-events-none absolute -top-1 left-2 rounded-full bg-pm-orange px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
        >
          {pointsToast}
        </span>
      )}
      {savedToast && (
        <span
          role="status"
          className="save-toast pointer-events-none absolute -top-1 right-2 rounded-full bg-pm-orange px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
        >
          Saved
        </span>
      )}
      {shareNote && (
        <span
          role="status"
          className="pointer-events-none absolute -top-1 right-2 rounded-full bg-pm-charcoal px-2 py-0.5 text-[11px] font-medium text-white shadow-sm"
        >
          {shareNote}
        </span>
      )}
    </div>
  );
}
