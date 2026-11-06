import { NextResponse } from "next/server";
import { getPeopleYouMayKnow, searchUsers } from "@/lib/db";
import { limitOrReject } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";

/**
 * Finds people by name/handle to friend, or — with an empty `q` — suggests
 * people you may know. Signed-in only: search is how a blocked pair could
 * otherwise find their way back to each other, and `searchUsers` already
 * excludes both sides of a block, which only means something once there's a
 * viewer to exclude *for*. The ranking also reads the viewer's own friends.
 *
 * Rate-limited although it only reads. It is called on every keystroke from
 * the first letter now, so the ceiling is set well above anyone typing; what
 * it stops is walking the alphabet to list every member.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ results: [] }, { status: 401 });
  }

  const limited = await limitOrReject({
    scope: "users-search:user",
    key: user.id,
    max: 300,
    windowMinutes: 10,
  });
  if (limited) return limited;

  // Capped so a pasted essay can't become a giant LIKE pattern.
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 60);
  if (!q.trim()) {
    const results = await getPeopleYouMayKnow(user.id, 8);
    return NextResponse.json({ results });
  }

  const results = await searchUsers(q, user.id, 10);
  return NextResponse.json({ results });
}
