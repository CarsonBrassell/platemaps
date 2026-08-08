"use client";

import { useEffect, useState } from "react";
import { ArrowUpIcon, ArrowDownIcon, ChatIcon, ShareIcon, BookmarkIcon } from "@/components/icons";

const action =
  "flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 disabled:opacity-45 disabled:hover:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

const voteButton =
  "flex h-11 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

export function PostActions({
  upvotes,
  downvotes,
  myVote,
  commentCount,
  saved,
  canInteract,
  pointsToast,
  onVote,
  onComment,
  onSave,
  onShare,
  onRequireSignIn,
}: {
  upvotes: number;
  downvotes: number;
  /** true = upvoted, false = downvoted, null = neither. */
  myVote: boolean | null;
  commentCount: number;
  saved: boolean;
  canInteract: boolean;
  /** e.g. "+1 point for maya" — floats once then clears itself. */
  pointsToast: string | null;
  /** Tapping the side already voted clears the vote — handled upstream. */
  onVote: (vote: boolean) => void;
  onComment: () => void;
  onSave: () => void;
  /** Resolves with a short confirmation to flash, or null to stay silent. */
  onShare: () => Promise<string | null>;
  /** Called instead of the action when nobody is signed in. */
  onRequireSignIn: () => void;
}) {
  const [burst, setBurst] = useState(false);
  const [savePop, setSavePop] = useState(false);
  const [savedToast, setSaved_toast] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const score = upvotes - downvotes;

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

  function handleVote(vote: boolean) {
    if (!canInteract) {
      onRequireSignIn();
      return;
    }
    // Only the upvote pops, and only on the way in — a downvote celebrating
    // itself reads as the wrong kind of feedback.
    if (vote && myVote !== true) {
      setBurst(true);
      setTimeout(() => setBurst(false), 300);
    }
    onVote(vote);
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
      {/* Score sits between the arrows rather than beside them, so the pair
          reads as one control and the number is unambiguously theirs. */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => handleVote(true)}
          aria-pressed={myVote === true}
          aria-label={myVote === true ? "Remove upvote" : "Upvote this plate"}
          className={`${voteButton} ${
            myVote === true ? "text-pm-orange" : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <ArrowUpIcon className={`h-[19px] w-[19px] ${burst ? "like-burst" : ""}`} />
        </button>

        <span
          aria-live="polite"
          className={`min-w-[1.5ch] text-center text-sm tabular-nums ${
            myVote === true
              ? "font-semibold text-pm-orange-text"
              : myVote === false
                ? "font-semibold text-zinc-500"
                : "text-zinc-600"
          }`}
        >
          {score}
        </span>

        <button
          type="button"
          onClick={() => handleVote(false)}
          aria-pressed={myVote === false}
          aria-label={myVote === false ? "Remove downvote" : "Downvote this plate"}
          className={`${voteButton} ${
            myVote === false ? "text-zinc-800" : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <ArrowDownIcon className="h-[19px] w-[19px]" />
        </button>
      </div>

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
