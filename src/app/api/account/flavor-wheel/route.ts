import { NextResponse } from "next/server";
import { isForMeUser } from "@/lib/forMeGate";
import { FLAVOR_WHEELS } from "@/lib/flavorWheelSnapshots";
import { getCurrentUser } from "@/lib/session";

/**
 * The caller's own flavor wheel, for the gated accounts only (lib/forMeGate.ts).
 *
 * No `userId` parameter, and there must never be one: the snapshot holds what
 * each person ate, plate by plate, and the only id that can reach it is the
 * session's own. Everyone else, signed out included, gets `wheel: null` rather
 * than a status code, the same way /api/account/activity answers.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isForMeUser(user.id)) return NextResponse.json({ wheel: null });
  return NextResponse.json({ wheel: FLAVOR_WHEELS[user.id] ?? null });
}
