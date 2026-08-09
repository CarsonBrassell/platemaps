import { NextResponse } from "next/server";
import { getFriendIds, getPendingFriendRequests, unfriend } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * Everything the client needs to render friend-button state across a whole
 * feed of posts in one request, rather than one getFriendStatus lookup per
 * post author: the full friend-id list plus both directions of pending
 * requests. `outgoing` here is why a post from someone you've already
 * requested renders "Request sent" instead of "Add friend" again.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ friendIds: [], incoming: [], outgoing: [] });
  }

  const [friendIds, pending] = await Promise.all([
    getFriendIds(user.id),
    getPendingFriendRequests(user.id),
  ]);

  return NextResponse.json({
    friendIds,
    incoming: pending.incoming,
    outgoing: pending.outgoing,
  });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { userId } = await req.json();
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "No user provided." }, { status: 400 });
  }

  await unfriend(user.id, userId);
  return NextResponse.json({ ok: true });
}
