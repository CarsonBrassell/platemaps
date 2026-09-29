import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  REPORT_REASONS,
  createReport,
  getCommentContext,
  getPostById,
  getUserById,
  openReportCount,
  type ReportReason,
  type ReportTarget,
} from "@/lib/db";
import { sendReportNotice } from "@/lib/mail";
import { getCurrentUser } from "@/lib/session";
import { MAX_POST_TEXT } from "@/lib/postLimits";
import { limitOrReject } from "@/lib/rateLimit";

/**
 * Reporting a plate.
 *
 * **This route exists because the button did not.** "Report post" on both feed
 * cards set local component state and sent nothing anywhere — no row, no
 * notification, no record. App Store Guideline 1.2 requires a working way to
 * report user content on any app that hosts it, and a reviewer testing a social
 * app does press that button.
 *
 * Signed-in only. That is not gatekeeping the ability to complain: it is what
 * makes "one report per person per post" enforceable, and an anonymous endpoint
 * that writes a row per request is a spam amplifier pointed at the moderator's
 * inbox. Everything else on this app is readable signed-out; acting is not.
 *
 * A duplicate is answered **200, not 409**. From the reporter's side "I
 * reported this" is already true, and the card should show the same
 * confirmation either way — the only thing that changes is that no second row
 * and no second email are produced.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to report." }, { status: 401 });
  }

  const limited = await limitOrReject({
    scope: "reports:user",
    key: user.id,
    max: 20,
    windowMinutes: 60,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const { postId, commentId, userId, reason, note } = (body ?? {}) as {
    postId?: unknown;
    commentId?: unknown;
    userId?: unknown;
    reason?: unknown;
    note?: unknown;
  };

  /* Exactly one target: a plate, a comment, or a person (App Store Guideline
     1.2 covers all user-generated content). */
  const given = [postId, commentId, userId].filter((v) => v !== undefined && v !== null);
  if (given.length !== 1 || typeof given[0] !== "string" || !given[0]) {
    return NextResponse.json({ error: "Nothing to report." }, { status: 400 });
  }
  if (typeof reason !== "string" || !REPORT_REASONS.includes(reason as ReportReason)) {
    return NextResponse.json({ error: "Pick a reason." }, { status: 400 });
  }

  /* Checked before the row is written so the table cannot fill with reports
     against things that never existed — the id comes from a client. */
  let target: ReportTarget;
  let notePostId: string | null = null;
  if (typeof postId === "string") {
    const post = await getPostById(postId);
    if (!post) {
      return NextResponse.json({ error: "That post is no longer here." }, { status: 404 });
    }
    if (post.userId === user.id) {
      return NextResponse.json({ error: "You can't report your own post." }, { status: 400 });
    }
    target = { kind: "post", id: postId };
    notePostId = postId;
  } else if (typeof commentId === "string") {
    const comment = await getCommentContext(commentId);
    if (!comment) {
      return NextResponse.json({ error: "That comment is no longer here." }, { status: 404 });
    }
    if (comment.userId === user.id) {
      return NextResponse.json({ error: "You can't report your own comment." }, { status: 400 });
    }
    target = { kind: "comment", id: commentId };
    notePostId = comment.postId;
  } else {
    const uid = userId as string;
    if (uid === user.id) {
      return NextResponse.json({ error: "You can't report yourself." }, { status: 400 });
    }
    const reported = await getUserById(uid);
    if (!reported) {
      return NextResponse.json({ error: "That person is no longer here." }, { status: 404 });
    }
    target = { kind: "user", id: uid };
  }

  /* The note is optional free text and capped at the same length as a plate's
     own words — a report is a sentence about a post, not an essay. */
  const trimmedNote =
    typeof note === "string" && note.trim() ? note.trim().slice(0, MAX_POST_TEXT) : null;

  const filed = await createReport({
    id: randomUUID(),
    target,
    reporterId: user.id,
    reason: reason as ReportReason,
    note: trimmedNote,
  });

  if (filed) {
    /* Mail failure must not fail the report. The row is the record; the email
       is the nudge, and a moderator who misses one notification can still find
       everything in the table. Awaited rather than fired and forgotten because
       the function may be frozen the moment this handler returns. */
    const openCount = await openReportCount(target);
    await sendReportNotice({
      kind: target.kind,
      postId: notePostId,
      commentId: target.kind === "comment" ? target.id : null,
      reportedUserId: target.kind === "user" ? target.id : null,
      reason,
      note: trimmedNote,
      reporterName: user.name,
      openCount,
    }).catch(() => {
      /* Logged by deliver() in development; nothing to tell the reporter. */
    });
  }

  return NextResponse.json({ ok: true });
}
