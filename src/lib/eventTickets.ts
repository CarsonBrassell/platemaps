import { NextResponse } from "next/server";
import { sql } from "@/lib/sqlClient";
import { FREE_FOOD_EVENT_KEY } from "@/lib/freeFoodEvent";

/** The event_tickets row as the client sees it. */
export type TicketRow = { claimedAt: string; activatedAt: string | null };

export function toRow(r: Record<string, unknown>): TicketRow {
  return {
    claimedAt: new Date(r.claimed_at as string).toISOString(),
    activatedAt: r.activated_at ? new Date(r.activated_at as string).toISOString() : null,
  };
}

export async function getTicket(userId: string): Promise<TicketRow | null> {
  const rows = await sql`
    SELECT claimed_at, activated_at FROM event_tickets
    WHERE event_key = ${FREE_FOOD_EVENT_KEY} AND user_id = ${userId}`;
  return rows[0] ? toRow(rows[0]) : null;
}

/** Postgres error code (42P01 missing table, 23505 unique violation), either driver. */
export const pgCode = (e: unknown) => (e as { code?: string } | null)?.code;

/** A missing table (migration not run yet) is a 503, not a crash. */
export async function withTicketsTable(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    if (pgCode(e) === "42P01") {
      return NextResponse.json({ error: "Tickets aren't open yet" }, { status: 503 });
    }
    throw e;
  }
}

/** Tickets activated at the counter so far: slices handed out. The counter
    shows FREE_FOOD_TOTAL_SLICES minus this. */
export async function getActivatedCount(): Promise<number> {
  const rows = await sql`
    SELECT count(*)::int AS n FROM event_tickets
    WHERE event_key = ${FREE_FOOD_EVENT_KEY} AND activated_at IS NOT NULL`;
  return Number(rows[0]?.n ?? 0);
}
