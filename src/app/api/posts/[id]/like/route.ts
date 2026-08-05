import { NextResponse } from "next/server";
import { getPostById, toggleLike, awardPoints } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { POINT_RULES, milestoneFor } from "@/lib/points";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to like posts." }, { status: 401 });
  }

  const { id } = await params;
  const post = await getPostById(id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const { liked, likeCount, firstTimeLike } = await toggleLike(id, user.id);

  // Points go to the author, not the liker. `firstTimeLike` is true only the
  // first time this particular user likes this post, so unlike/relike can't
  // farm the author's total. Self-likes pay nothing.
  const isSelfLike = post.userId === user.id;
  let authorPointsEarned = 0;

  if (firstTimeLike && !isSelfLike) {
    await awardPoints(post.userId, POINT_RULES.receiveLike, `like:${id}:${user.id}`);
    authorPointsEarned += POINT_RULES.receiveLike;
  }

  // Milestones fire on the exact crossing, so a post that dips below and
  // climbs back doesn't pay out twice (the ledger's unique reason also guards).
  const milestone = liked ? milestoneFor(likeCount) : null;
  if (milestone && !isSelfLike) {
    await awardPoints(post.userId, milestone.bonus, `milestone:${id}:${milestone.likes}`);
    authorPointsEarned += milestone.bonus;
  }

  return NextResponse.json({
    liked,
    likeCount,
    authorId: post.userId,
    authorName: post.authorName,
    authorPointsEarned,
    milestone: milestone && !isSelfLike ? milestone : null,
  });
}
