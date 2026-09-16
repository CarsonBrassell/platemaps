import { NextResponse } from "next/server";
import { sendFriendRequest } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { limitOrReject } from "@/lib/rateLimit";

/**
 * Sends a friend request — or, if the target already requested this user,
 * accepts theirs instead of creating a second pending row. See
 * sendFriendRequest in lib/db.ts for why that reciprocal case matters:
 * two people requesting each other shouldn't need two accepts.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to add friends." }, { status: 401 });
  }

  const limited = await limitOrReject({
    scope: "friends-request:user",
    key: user.id,
    max: 20,
    windowMinutes: 60,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { userId } = body as { userId?: unknown };
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "No user provided." }, { status: 400 });
  }
  if (userId === user.id) {
    return NextResponse.json({ error: "You can't friend yourself." }, { status: 400 });
  }

  const status = await sendFriendRequest(user.id, userId);
  return NextResponse.json({ status });
}
