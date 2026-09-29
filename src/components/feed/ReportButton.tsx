"use client";

import { useState } from "react";
import { ReportSheet } from "@/components/feed/ReportSheet";

/**
 * A "Report" control for a comment or a person, wrapping the same reason sheet
 * the plate cards use — one list of reasons, one route (`/api/reports`), one
 * moderator inbox (App Store Guideline 1.2).
 *
 * Renders nothing for a signed-out viewer or for your own comment / profile:
 * the route rejects both, so offering the button would only lead to an error.
 * After a successful send it swaps itself for a quiet "Reported" so the same
 * person is not invited to file twice.
 */
export function ReportButton({
  kind,
  targetId,
  authorId,
  currentUserId,
  className,
}: {
  kind: "comment" | "user";
  targetId: string;
  /** Who wrote the comment / whose profile it is — compared to the viewer. */
  authorId: string;
  currentUserId: string | null;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  if (!currentUserId || currentUserId === authorId) return null;

  if (done) {
    return (
      <span role="status" className={`${className} pointer-events-none opacity-70`}>
        Reported
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={className}
      >
        Report
      </button>
      {open && (
        <ReportSheet
          {...(kind === "comment" ? { commentId: targetId } : { userId: targetId })}
          onClose={() => setOpen(false)}
          onReported={() => {
            setOpen(false);
            setDone(true);
          }}
        />
      )}
    </>
  );
}
