import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getPostById, addComment, awardPoints, getCommentContext, getBlockStatus } from "@/lib/db";
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

  const { text, parentId } = await req.json();
  if (!text || !String(text).trim()) {
    return NextResponse.json({ error: "Write a comment first." }, { status: 400 });
  }

  const { id } = await params;
  const post = await getPostById(id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  if ((await getBlockStatus(user.id, post.userId)) !== "none") {
    return NextResponse.json({ error: "You can't comment on this post." }, { status: 403 });
  }

  // A reply's parent has to be a comment on *this* post. Without the check a
  // crafted parentId would graft a reply from one thread onto another, where
  // it would render under a post its author never opened.
  const parent = parentId ? String(parentId) : null;
  if (parent && (await getCommentContext(parent))?.postId !== id) {
    return NextResponse.json({ error: "That comment is no longer here." }, { status: 400 });
  }

  const comment = await addComment(id, {
    id: randomUUID(),
    userId: user.id,
    text: String(text).trim().slice(0, 1_000),
    parentId: parent,
  });

  // The author earns for the discussion their post attracts; commenting on
  // your own post pays nothing.
  const isSelfComment = post.userId === user.id;
  let awarded = false;
  if (!isSelfComment) {
    ({ awarded } = await awardPoints(
      post.userId,
      POINT_RULES.receiveComment,
      `comment:${comment.id}`,
    ));
  }

  return NextResponse.json({
    comment,
    authorId: post.userId,
    authorName: post.authorName,
    authorPointsEarned: awarded ? POINT_RULES.receiveComment : 0,
  });
}
