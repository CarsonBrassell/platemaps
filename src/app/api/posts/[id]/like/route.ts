import { NextResponse } from "next/server";
import { getPostById, toggleLike, addPointsToUser } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const LIKE_POINTS = 2;

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
  const pointsEarned = firstTimeLike ? LIKE_POINTS : 0;

  let points = user.points;
  if (pointsEarned > 0) {
    const freshUser = await addPointsToUser(user.id, pointsEarned);
    points = freshUser?.points ?? points;
  }

  return NextResponse.json({ liked, likeCount, pointsEarned, points });
}
