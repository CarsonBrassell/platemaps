import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getPosts, createPost, addPointsToUser } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const POINTS_PER_POST = 10;

export async function GET() {
  const posts = await getPosts();
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

  const { text, restaurant } = await req.json();
  if (!text || !String(text).trim()) {
    return NextResponse.json({ error: "Write something to post." }, { status: 400 });
  }

  const post = await createPost({
    id: randomUUID(),
    userId: user.id,
    authorName: user.name,
    authorAvatarUrl: user.avatarUrl,
    text: String(text).trim(),
    restaurant: restaurant ? String(restaurant).trim() : undefined,
  });

  const freshUser = await addPointsToUser(user.id, POINTS_PER_POST);

  return NextResponse.json({
    post,
    points: freshUser?.points ?? user.points + POINTS_PER_POST,
    pointsEarned: POINTS_PER_POST,
  });
}
