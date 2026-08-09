import { NextResponse } from "next/server";
import { getFriends } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * The friends list as people — names and avatars, for the /friends page.
 *
 * Deliberately not part of GET /api/friends. That route is called on every
 * feed load to resolve friend-button state across a page of posts and returns
 * bare ids for exactly that reason; the profile join belongs here, on the one
 * screen that actually renders faces.
 *
 * Signed out returns an empty list rather than a 401 — the page renders its
 * own sign-in prompt, and an error status would just be noise in the console.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ friends: [] });

  return NextResponse.json({ friends: await getFriends(user.id) });
}
