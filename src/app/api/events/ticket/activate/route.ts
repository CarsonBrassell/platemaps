import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { sql } from "@/lib/sqlClient";
import { isSameOriginRequest } from "@/lib/originCheck";
import { limitOrReject } from "@/lib/rateLimit";
import { FREE_FOOD_ENDS_AT, FREE_FOOD_EVENT_KEY, FREE_FOOD_STARTS_AT } from "@/lib/freeFoodEvent";
import { getTicket, toRow, withTicketsTable } from "@/lib/eventTickets";

/** Start the ticket's 5 minutes. Only during the event; idempotent. */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Bad request." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const limited = await limitOrReject({
    scope: "ticket-activate:user",
    key: user.id,
    max: 30,
    windowMinutes: 60,
  });
  if (limited) return limited;

  return withTicketsTable(async () => {
    const ticket = await getTicket(user.id);
    if (!ticket) return NextResponse.json({ error: "Claim a ticket first." }, { status: 404 });
    if (ticket.activatedAt) return NextResponse.json({ ticket, serverNow: Date.now() });

    const now = Date.now();
    if (now < FREE_FOOD_STARTS_AT || now >= FREE_FOOD_ENDS_AT) {
      return NextResponse.json({ error: "Activation opens Thu Nov 19 at 5pm" }, { status: 409 });
    }
    // activated_at IS NULL in the WHERE keeps a double tap from restarting the clock.
    const rows = await sql`
      UPDATE event_tickets SET activated_at = now()
      WHERE event_key = ${FREE_FOOD_EVENT_KEY} AND user_id = ${user.id} AND activated_at IS NULL
      RETURNING claimed_at, activated_at`;
    const out = rows[0] ? toRow(rows[0]) : await getTicket(user.id);
    return NextResponse.json({ ticket: out, serverNow: Date.now() });
  });
}
