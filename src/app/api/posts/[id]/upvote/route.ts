import { NextResponse } from "next/server";
import { getPostById, toggleUpvote, awardPoints } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { POINT_RULES, milestoneFor } from "@/lib/points";

/**
 * Discover's reaction. Public in every direction: the count this returns is
 * exactly what any other viewer of the post already sees.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to upvote posts." }, { status: 401 });
  }

  const { id } = await params;
  const post = await getPostById(id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const { upvoted, upvoteCount, firstTimeUpvote } = await toggleUpvote(id, user.id);

  // Points go to the author, not the upvoter. `firstTimeUpvote` is true only
  // the first time this particular user upvotes this post, so un-upvoting and
  // upvoting again can't farm the author's total. Self-upvotes pay nothing.
  const isSelfUpvote = post.userId === user.id;
  let authorPointsEarned = 0;

  if (firstTimeUpvote && !isSelfUpvote) {
    await awardPoints(post.userId, POINT_RULES.receiveUpvote, `upvote:${id}:${user.id}`);
    authorPointsEarned += POINT_RULES.receiveUpvote;
  }

  // Milestones fire on the exact crossing, so a post that dips below and
  // climbs back doesn't pay out twice (the ledger's unique reason also guards).
  const milestone = upvoted ? milestoneFor(upvoteCount) : null;
  if (milestone && !isSelfUpvote) {
    await awardPoints(post.userId, milestone.bonus, `milestone:${id}:${milestone.upvotes}`);
    authorPointsEarned += milestone.bonus;
  }

  return NextResponse.json({
    upvoted,
    upvoteCount,
    authorId: post.userId,
    authorName: post.authorName,
    authorPointsEarned,
    milestone: milestone && !isSelfUpvote ? milestone : null,
  });
}
