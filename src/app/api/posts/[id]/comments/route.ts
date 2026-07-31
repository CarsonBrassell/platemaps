import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getPosts, savePosts, getUsers, saveUsers, addPoints } from "@/lib/db";
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
  const posts = getPosts();
  const post = posts.find((p) => p.id === id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const comment = {
    id: randomUUID(),
    userId: user.id,
    authorName: user.name,
    text: String(text).trim(),
    createdAt: new Date().toISOString(),
  };
  post.comments.push(comment);
  savePosts(posts);

  const users = getUsers();
  const freshUser = users.find((u) => u.id === user.id);
  if (freshUser) {
    addPoints(freshUser, COMMENT_POINTS);
    saveUsers(users);
  }

  return NextResponse.json({
    comment,
    pointsEarned: COMMENT_POINTS,
    points: freshUser?.points ?? user.points + COMMENT_POINTS,
  });
}
