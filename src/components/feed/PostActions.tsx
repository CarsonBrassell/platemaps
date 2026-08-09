"use client";

import { useEffect, useState } from "react";
import { ChatIcon, ShareIcon, BookmarkIcon } from "@/components/icons";

const action =
  "flex min-h-9 items-center gap-1.5 rounded-full px-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * The quiet row under a post. Voting lives in the rail down the left edge, so
 * everything here is secondary and sized to match the metadata around it.
 */
export function PostActions({
  commentCount,
  saved,
  canInteract,
  onComment,
  onSave,
  onShare,
  onRequireSignIn,
}: {
  commentCount: number;
  saved: boolean;
  canInteract: boolean;
  onComment: () => void;
  onSave: () => void;
  /** Resolves with a short confirmation to flash, or null to stay silent. */
  onShare: () => Promise<string | null>;
  /** Called instead of the action when nobody is signed in. */
  onRequireSignIn: () => void;
}) {
  const [savePop, setSavePop] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  function handleSave() {
    if (!canInteract) {
      onRequireSignIn();
      return;
    }
    // Only celebrate adding, not removing.
    if (!saved) {
      setSavePop(true);
      setSavedToast(true);
      setTimeout(() => setSavePop(false), 460);
      setTimeout(() => setSavedToast(false), 1650);
    }
    onSave();
  }

  useEffect(() => {
    if (!shareNote) return;
    const t = setTimeout(() => setShareNote(null), 2000);
    return () => clearTimeout(t);
  }, [shareNote]);

  return (
    <div className="relative flex items-center gap-1">
      <button type="button" onClick={onComment} className={action} aria-label="Open comments">
        <ChatIcon className="h-4 w-4" />
        {commentCount > 0 && <span>{commentCount}</span>}
      </button>

      <button
        type="button"
        onClick={handleSave}
        aria-pressed={saved}
        aria-label={saved ? "Remove from saved" : "Save this plate"}
        className={action}
      >
        <BookmarkIcon
          filled={saved}
          className={`h-4 w-4 ${saved ? "text-pm-orange" : ""} ${savePop ? "save-pop" : ""}`}
        />
      </button>

      <button
        type="button"
        onClick={async () => setShareNote(await onShare())}
        className={action}
        aria-label="Share this plate"
      >
        <ShareIcon className="h-4 w-4" />
      </button>

      {savedToast && (
        <span
          role="status"
          className="save-toast pointer-events-none absolute -top-6 left-0 rounded-full bg-pm-orange px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
        >
          Saved
        </span>
      )}
      {shareNote && (
        <span
          role="status"
          className="pointer-events-none absolute -top-6 left-0 rounded-full bg-pm-charcoal px-2 py-0.5 text-[11px] font-medium text-white shadow-sm"
        >
          {shareNote}
        </span>
      )}
    </div>
  );
}
