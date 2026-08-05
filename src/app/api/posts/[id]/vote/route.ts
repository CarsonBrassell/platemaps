import { NextResponse } from "next/server";
import { getPostById, castVote, awardPoints } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { POINT_RULES } from "@/lib/points";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to vote." }, { status: 401 });
  }

  const { vote } = await req.json();
  if (typeof vote !== "boolean") {
    return NextResponse.json({ error: "Vote must be yes or no." }, { status: 400 });
  }

  const { id } = await params;
  const post = await getPostById(id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const result = await castVote(id, user.id, vote);

  // The voter earns, once per post — this is the engagement nudge, so the
  // reward goes to the person doing the voting rather than the author.
  // Changing or clearing a verdict later pays nothing more.
  let points = user.points;
  if (result.firstVote) {
    const fresh = await awardPoints(user.id, POINT_RULES.castVote, `vote:${id}:${user.id}`);
    points = fresh?.points ?? points;
  }

  return NextResponse.json({
    ...result,
    pointsEarned: result.firstVote ? POINT_RULES.castVote : 0,
    points,
  });
}
