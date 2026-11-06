import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { sql } from "@/lib/sqlClient";
import { clientIp } from "@/lib/loginThrottle";
import { isSameOriginRequest } from "@/lib/originCheck";
import { limitOrReject } from "@/lib/rateLimit";
import { FREE_FOOD_ENDS_AT, FREE_FOOD_EVENT_KEY, FREE_FOOD_MAX_PER_IP } from "@/lib/freeFoodEvent";
import { getTicket, pgCode, toRow, withTicketsTable } from "@/lib/eventTickets";

const fail = (error: string, status: number, code?: string) =>
  NextResponse.json({ error, code }, { status });

/** Claim the free ticket. Idempotent per account; one per phone; capped per IP. */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return fail("Bad request.", 403);
  const user = await getCurrentUser();
  if (!user) return fail("Sign in first.", 401);

  const limited = await limitOrReject({
    scope: "ticket-claim:user",
    key: user.id,
    max: 20,
    windowMinutes: 60,
  });
  if (limited) return limited;

  if (Date.now() >= FREE_FOOD_ENDS_AT) return fail("This event has ended.", 410);

  let deviceId: unknown;
  try {
    ({ deviceId } = await req.json());
  } catch {
    deviceId = undefined;
  }
  if (typeof deviceId !== "string" || deviceId.length < 8 || deviceId.length > 80) {
    return fail("Bad request.", 400);
  }

  return withTicketsTable(async () => {
    const posts = await sql`SELECT 1 FROM posts WHERE user_id = ${user.id} LIMIT 1`;
    if (posts.length === 0) return fail("Post your first plate to claim.", 403, "no_posts");

    const existing = await getTicket(user.id);
    if (existing) return NextResponse.json({ ticket: existing, serverNow: Date.now() });

    const other = await sql`
      SELECT 1 FROM event_tickets
      WHERE event_key = ${FREE_FOOD_EVENT_KEY} AND device_id = ${deviceId} AND user_id <> ${user.id}`;
    if (other.length > 0) return fail("This phone already claimed a ticket.", 409, "device_used");

    const ip = clientIp(req);
    const byIp = await sql`
      SELECT count(*)::int AS n FROM event_tickets
      WHERE event_key = ${FREE_FOOD_EVENT_KEY} AND ip = ${ip}`;
    if ((byIp[0]?.n as number) >= FREE_FOOD_MAX_PER_IP) {
      return fail("Too many tickets claimed from this network.", 429, "ip_limit");
    }

    try {
      const rows = await sql`
        INSERT INTO event_tickets (event_key, user_id, device_id, ip)
        VALUES (${FREE_FOOD_EVENT_KEY}, ${user.id}, ${deviceId}, ${ip})
        RETURNING claimed_at, activated_at`;
      return NextResponse.json({ ticket: toRow(rows[0]), serverNow: Date.now() });
    } catch (e) {
      if (pgCode(e) === "23505") {
        // Lost a race: this account just claimed, or the phone did.
        const again = await getTicket(user.id);
        if (again) return NextResponse.json({ ticket: again, serverNow: Date.now() });
        return fail("This phone already claimed a ticket.", 409, "device_used");
      }
      throw e;
    }
  });
}
