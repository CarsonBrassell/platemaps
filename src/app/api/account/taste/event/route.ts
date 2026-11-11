import { NextResponse, type NextRequest } from "next/server";
import { isForMeUser } from "@/lib/forMeGate";
import { isSameOriginRequest } from "@/lib/originCheck";
import { limitOrReject } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";
import { TASTE_SURFACES, isBatchId, logTasteOpen, markTasteSeen, type TasteSurface } from "@/lib/tasteLog";

/**
 * What became of a row of For me picks after it was sent: which cards were
 * really on screen, and which one was opened. (Been here / Not for me are
 * logged by the picks route itself, off the op.)
 *
 * Takes no user id and must never grow one: the session says whose row it is,
 * and `lib/tasteLog.ts` only writes against a place that row really held for
 * that person. Body: `{ batch, surface, seen?: string[], open?: string }`.
 *
 * Only the accounts on `lib/forMeGate.ts` are logged. For any other signed-in
 * account this answers 204 without reading the body or touching the database.
 * A good request always answers 204 with no body, written or not.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

/** The most places one report may mark as seen (a row holds far fewer). */
const MAX_SEEN = 40;

const isId = (v: unknown): v is string => typeof v === "string" && v.length >= 1 && v.length <= 64;

const done = () => new NextResponse(null, { status: 204, headers: NO_STORE });
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE });

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return fail("Bad request.", 403);

  const user = await getCurrentUser();
  if (!user) return fail("Sign in first.", 401);
  if (!isForMeUser(user.id)) return done();

  // A row reports a handful of times (sightings are batched), so this is far above real use.
  const limited = await limitOrReject({
    scope: "taste-event:user",
    key: user.id,
    max: 300,
    windowMinutes: 10,
  });
  if (limited) {
    limited.headers.set("Cache-Control", "private, no-store");
    return limited;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Expected JSON.", 400);
  }
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  if (!isBatchId(b.batch)) return fail("Unknown batch.", 400);
  if (!(TASTE_SURFACES as readonly unknown[]).includes(b.surface)) return fail("Unknown surface.", 400);
  const batch = b.batch;
  const surface = b.surface as TasteSurface;

  if (b.seen !== undefined) {
    if (!Array.isArray(b.seen) || b.seen.length > MAX_SEEN || !b.seen.every(isId)) {
      return fail("Bad seen list.", 400);
    }
    await markTasteSeen(user.id, batch, [...new Set(b.seen)], surface);
  }
  if (b.open !== undefined) {
    if (!isId(b.open)) return fail("Bad place.", 400);
    await logTasteOpen(user.id, batch, b.open, surface);
  }
  return done();
}
