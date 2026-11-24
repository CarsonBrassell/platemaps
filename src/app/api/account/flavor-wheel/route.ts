import { NextResponse } from "next/server";
import { eaterTypeOf, type EaterRow } from "@/lib/eaterType";
import { isForMeUser } from "@/lib/forMeGate";
import { FLAVOR_WHEELS } from "@/lib/flavorWheelSnapshots";
import { getCurrentUser } from "@/lib/session";
import { sql } from "@/lib/sqlClient";

/**
 * The caller's own flavor wheel, for the gated accounts only (lib/forMeGate.ts).
 *
 * No `userId` parameter, and there must never be one: the snapshot holds what
 * each person ate, plate by plate, and the only id that can reach it is the
 * session's own. Everyone else, signed out included, gets `wheel: null` rather
 * than a status code, the same way /api/account/activity answers.
 *
 * `eaterType` (lib/eaterType.ts) is computed live from the same caller's posts.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isForMeUser(user.id)) return NextResponse.json({ wheel: null, eaterType: null });
  let eaterType = null;
  try {
    const rows = (await sql`SELECT p.dish_name, p.rating, p.restaurant_id, p.restaurant_lat lat, p.restaurant_lng lng,
        r.cuisine, d.place_count
      FROM posts p LEFT JOIN restaurants r ON r.id = p.restaurant_id
      LEFT JOIN dish_names d ON d.name = p.dish_name_folded
      WHERE p.user_id = ${user.id} ORDER BY p.created_at`) as EaterRow[];
    eaterType = eaterTypeOf(rows);
  } catch {
    // The wheel still renders without a type.
  }
  return NextResponse.json({ wheel: FLAVOR_WHEELS[user.id] ?? null, eaterType });
}
