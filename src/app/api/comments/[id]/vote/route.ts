import { NextResponse } from "next/server";
import { castCommentVote, getCommentContext, awardPoints } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { POINT_RULES } from "@/lib/points";

/**
 * Replaces /api/comments/[id]/like. A comment carries a score now, not a like
 * count, and it pays its author on the same terms a post does — see the
 * award block below.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to vote on comments." }, { status: 401 });
  }

  const { direction } = await req.json();
  if (direction !== "up" && direction !== "down") {
    return NextResponse.json({ error: "Unknown vote direction." }, { status: 400 });
  }

  const { id } = await params;
  const comment = await getCommentContext(id);
  if (!comment) {
    return NextResponse.json({ error: "That comment is no longer here." }, { status: 404 });
  }

  const { myVote, upvoteCount, downvoteCount, firstTimeUpvote } = await castCommentVote(
    id,
    user.id,
    direction,
  );

  // Identical terms to a post's upvote: the writer is paid, not the voter;
  // only upvotes pay, so a pile-on can never drain someone's total; and
  // upvoting yourself is worth nothing.
  //
  // No milestone bonuses here — those are written per post ("your post hit 25
  // upvotes") and a comment crossing 25 is a different, much smaller event.
  const isSelfVote = comment.userId === user.id;
  let authorPointsEarned = 0;

  // Pay-once in the ledger, keyed by (comment, voter): un-voting and voting
  // again counts the vote but pays nothing, so `awarded` — not the fact that
  // we asked — is what the client is told about.
  if (firstTimeUpvote && !isSelfVote) {
    const { awarded } = await awardPoints(
      comment.userId,
      POINT_RULES.receiveCommentUpvote,
      `comment-upvote:${id}:${user.id}`,
    );
    if (awarded) authorPointsEarned = POINT_RULES.receiveCommentUpvote;
  }

  return NextResponse.json({
    myVote,
    upvoteCount,
    downvoteCount,
    authorId: comment.userId,
    authorPointsEarned,
  });
}
