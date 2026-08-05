import { NextResponse } from "next/server";
import { getFollowingIds, followUser, unfollowUser } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ following: [] });
  return NextResponse.json({ following: await getFollowingIds(user.id) });
}

/** Toggles the follow edge and echoes the resulting state. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to follow people." }, { status: 401 });
  }

  const { userId } = await req.json();
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "No user provided." }, { status: 400 });
  }
  if (userId === user.id) {
    return NextResponse.json({ error: "You can't follow yourself." }, { status: 400 });
  }

  const following = await getFollowingIds(user.id);
  const isFollowing = following.includes(userId);

  if (isFollowing) {
    await unfollowUser(user.id, userId);
  } else {
    await followUser(user.id, userId);
  }

  return NextResponse.json({ following: !isFollowing });
}
