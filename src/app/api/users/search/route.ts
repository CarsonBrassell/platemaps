import { NextResponse } from "next/server";
import { searchUsers } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * Finds people by name/handle to friend. Signed-in only — search is how a
 * blocked pair could otherwise find their way back to each other, and
 * `searchUsers` already excludes both sides of a block, which only means
 * something once there's a viewer to exclude *for*.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ results: [] });
  }

  const q = new URL(req.url).searchParams.get("q") ?? "";
  // Below two characters a normalized query matches too much of the corpus
  // to be useful, and it's a network call on every keystroke otherwise.
  if (q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results = await searchUsers(q, user.id, 10);
  return NextResponse.json({ results });
}
