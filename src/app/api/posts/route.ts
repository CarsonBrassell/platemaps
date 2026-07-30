import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getPosts, savePosts, getUsers, saveUsers } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const POINTS_PER_POST = 10;

export async function GET() {
  const posts = getPosts();
  return NextResponse.json({ posts: posts.slice().reverse() });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to post to the feed." },
      { status: 401 }
    );
  }

  const { text } = await req.json();
  if (!text || !String(text).trim()) {
    return NextResponse.json({ error: "Write something to post." }, { status: 400 });
  }

  const posts = getPosts();
  const post = {
    id: randomUUID(),
    userId: user.id,
    authorName: user.name,
    text: String(text).trim(),
    createdAt: new Date().toISOString(),
  };
  posts.push(post);
  savePosts(posts);

  const users = getUsers();
  const freshUser = users.find((u) => u.id === user.id);
  if (freshUser) {
    freshUser.points += POINTS_PER_POST;
    saveUsers(users);
  }

  return NextResponse.json({
    post,
    points: freshUser?.points ?? user.points + POINTS_PER_POST,
    pointsEarned: POINTS_PER_POST,
  });
}
