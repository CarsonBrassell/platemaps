import { NextResponse } from "next/server";
import { getFriendsFeed } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * Mutual friends only, strictly chronological — see getFriendsFeed in
 * lib/db.ts. Signed out has no friends to show, not an error.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ posts: [] });

  const posts = await getFriendsFeed(user.id);
  return NextResponse.json({ posts });
}
