import { NextResponse } from "next/server";
import { getFlavorProfile } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * The caller's own cuisine mix, for the "Your flavor profile" card on the
 * account screens (which are client components and can't run the query).
 *
 * Takes no user id and must never grow one — same rule as
 * `/api/account/activity`: the only profile it can compute is the session's.
 * Signed out returns `flavor: null` rather than a 401, matching that route.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ flavor: null });

  return NextResponse.json(await getFlavorProfile(user.id));
}
