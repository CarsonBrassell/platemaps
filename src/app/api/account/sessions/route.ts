import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteOtherSessions } from "@/lib/db";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/session";

/**
 * Sign out every other device, keeping this one.
 *
 * There is no list of sessions to show alongside this, and that is a choice
 * rather than a gap: the `sessions` table stores a token and a user, with no
 * device name, no location and no last-seen. A list built from that would read
 * "3 unknown devices" — enough to alarm, not enough to act on. The single
 * button answers the actual question ("get everyone else out") without
 * pretending to knowledge the table doesn't have.
 *
 * DELETE because it destroys something. Sessions cascade with the user row on
 * account deletion, so this is the only place they are removed by hand.
 */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const cookieStore = await cookies();
  // Empty string can't match a real token (they're UUIDs), so a missing cookie
  // degrades to "end every session" — the safe direction for a request whose
  // whole purpose is ending sessions. getCurrentUser already proved there is a
  // valid one, so in practice this is never empty.
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const endedElsewhere = await deleteOtherSessions(user.id, token);

  return NextResponse.json({ ok: true, endedElsewhere });
}
