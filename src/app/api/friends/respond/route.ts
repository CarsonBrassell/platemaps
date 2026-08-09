import { NextResponse } from "next/server";
import { acceptFriendRequest, declineFriendRequest } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * Accept or decline an incoming request. Both db.ts functions check that
 * the responder is actually the request's recipient — a requester can't
 * accept their own outgoing request and will a friendship into existence
 * unilaterally, which is exactly what "both people must accept" rules out.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { requestId, action } = await req.json();
  if (typeof requestId !== "string" || (action !== "accept" && action !== "decline")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    if (action === "accept") {
      await acceptFriendRequest(requestId, user.id);
    } else {
      await declineFriendRequest(requestId, user.id);
    }
  } catch {
    return NextResponse.json(
      { error: "That request isn't yours to respond to." },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true });
}
