import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getPostById, addComment, addPointsToUser } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const COMMENT_POINTS = 5;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to comment." }, { status: 401 });
  }

  const { text } = await req.json();
  if (!text || !String(text).trim()) {
    return NextResponse.json({ error: "Write a comment first." }, { status: 400 });
  }

  const { id } = await params;
  const post = await getPostById(id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const comment = await addComment(id, {
    id: randomUUID(),
    userId: user.id,
    text: String(text).trim(),
  });

  const freshUser = await addPointsToUser(user.id, COMMENT_POINTS);

  return NextResponse.json({
    comment,
    pointsEarned: COMMENT_POINTS,
    points: freshUser?.points ?? user.points + COMMENT_POINTS,
  });
}
