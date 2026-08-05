import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getPostById, addComment, awardPoints } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { POINT_RULES } from "@/lib/points";

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
    text: String(text).trim().slice(0, 1_000),
  });

  // The author earns for the discussion their post attracts; commenting on
  // your own post pays nothing.
  const isSelfComment = post.userId === user.id;
  if (!isSelfComment) {
    await awardPoints(post.userId, POINT_RULES.receiveComment, `comment:${comment.id}`);
  }

  return NextResponse.json({
    comment,
    authorId: post.userId,
    authorName: post.authorName,
    authorPointsEarned: isSelfComment ? 0 : POINT_RULES.receiveComment,
  });
}
