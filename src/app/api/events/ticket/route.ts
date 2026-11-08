import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getTicket, getActivatedCount, withTicketsTable } from "@/lib/eventTickets";

/** The signed-in user's ticket for the current event, plus the server clock
    so the client can correct for a wrong phone clock, and how many tickets
    have been activated (slices handed out). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return withTicketsTable(async () =>
    NextResponse.json(
      { ticket: await getTicket(user.id), activated: await getActivatedCount(), serverNow: Date.now() },
      { headers: { "Cache-Control": "no-store" } },
    ),
  );
}
