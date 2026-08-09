import { NextResponse } from "next/server";
import { getActivityForAuthor } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * Reactions and comments other people left on the caller's own plates.
 *
 * There is no `userId` parameter and there must never be one: the only id this
 * route can pass down is the session's own, which is what keeps "you can only
 * see the hearts on your own posts" true at the HTTP edge as well as inside
 * getActivityForAuthor. A query string here would hand any signed-in user
 * anyone else's private heart list.
 *
 * Signed out returns an empty list rather than a 401, matching
 * /api/friends/list — /account renders its own auth form and a status code
 * would just be console noise.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ activity: [] });

  return NextResponse.json({ activity: await getActivityForAuthor(user.id) });
}
