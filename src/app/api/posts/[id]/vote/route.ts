import { NextResponse } from "next/server";
import { getPostById, castVote, awardPoints } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { POINT_RULES, milestoneFor } from "@/lib/points";

/**
 * Discover's reaction. Public in every direction: the counts this returns are
 * exactly what any other viewer of the post already sees.
 *
 * Body is `{ direction: "up" | "down" }`. Sending the direction the caller
 * already holds clears their vote — castVote owns that three-state logic, the
 * route just passes the press through.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to vote on posts." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const direction = (body as { direction?: string }).direction;
  if (direction !== "up" && direction !== "down") {
    return NextResponse.json({ error: "direction must be 'up' or 'down'." }, { status: 400 });
  }

  const { id } = await params;
  const post = await getPostById(id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const { myVote, upvoteCount, downvoteCount, firstTimeUpvote } = await castVote(
    id,
    user.id,
    direction,
  );

  // Points go to the author, not the voter, and only upvotes pay: a downvote
  // never debits the author, so a pile-on can't drain someone's total. Self
  // votes pay nothing either way.
  const isSelfVote = post.userId === user.id;
  let authorPointsEarned = 0;

  if (firstTimeUpvote && !isSelfVote) {
    await awardPoints(post.userId, POINT_RULES.receiveUpvote, `upvote:${id}:${user.id}`);
    authorPointsEarned += POINT_RULES.receiveUpvote;
  }

  // Milestones fire on the exact crossing, so a post that dips below and
  // climbs back doesn't pay out twice (the ledger's unique reason also guards).
  const milestone = myVote === "up" ? milestoneFor(upvoteCount) : null;
  if (milestone && !isSelfVote) {
    await awardPoints(post.userId, milestone.bonus, `milestone:${id}:${milestone.upvotes}`);
    authorPointsEarned += milestone.bonus;
  }

  return NextResponse.json({
    myVote,
    upvoteCount,
    downvoteCount,
    authorId: post.userId,
    authorName: post.authorName,
    authorPointsEarned,
    milestone: milestone && !isSelfVote ? milestone : null,
  });
}
