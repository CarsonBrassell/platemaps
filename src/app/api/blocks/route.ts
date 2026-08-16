import { NextResponse } from "next/server";
import { getBlockedUsers, blockUser, unblockUser } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * Everyone the current user has blocked — used both by the account settings
 * list (with its unblock action) and by button state on a profile page or
 * post card, the same way GET /api/friends doubles as list and button state.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ blocked: [] });
  }
  const blocked = await getBlockedUsers(user.id);
  return NextResponse.json({ blocked });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { userId } = await req.json();
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "No user provided." }, { status: 400 });
  }
  if (userId === user.id) {
    return NextResponse.json({ error: "You can't block yourself." }, { status: 400 });
  }

  await blockUser(user.id, userId);
  return NextResponse.json({ ok: true });
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

  await unblockUser(user.id, userId);
  return NextResponse.json({ ok: true });
}
