import { NextResponse } from "next/server";
import { purgeExpiredPhotos } from "@/lib/db";
import { PHOTO_RETENTION_DAYS } from "@/lib/photoRetention";

/**
 * The scheduled photo purge. Wired to `vercel.json`'s daily cron.
 *
 * ## Why this is locked the way it is
 *
 * It permanently deletes user content, and a route that does that must not be
 * reachable by anyone who guesses the path. Vercel signs its cron invocations
 * with `Authorization: Bearer $CRON_SECRET`, and this **fails closed**: with no
 * `CRON_SECRET` in the environment it refuses every request rather than
 * defaulting to open. That ordering is deliberate — the dangerous default for
 * a delete endpoint is "works without configuration".
 *
 * `force-dynamic` because the route must run per request; a cached response
 * would report a purge that never happened.
 *
 * `maxDuration` is set for the first real run, which meets the whole backlog
 * at once. `purgeExpiredPhotos` bounds itself with `limit` and returns
 * `remaining`, so a run that hits the cap simply reports what is left and the
 * next day's invocation takes the rest — no looping inside the request.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[purge-photos] refused: CRON_SECRET is not set");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await purgeExpiredPhotos({ dryRun: false });

  /* Logged rather than only returned: nobody reads a cron's response body, and
     the one question worth being able to answer later is "what did it take,
     and when". A day that clears far more than the day before is the shape of
     a mistake — a retention constant edited by accident, say — and this line
     is the only place that would show. */
  console.log(
    `[purge-photos] retention=${PHOTO_RETENTION_DAYS}d matched=${result.matched} ` +
      `cleared=${result.cleared} remaining=${result.remaining} ` +
      `freed≈${Math.round(result.bytesFreed / 1024)}KB`,
  );

  return NextResponse.json({ ok: true, retentionDays: PHOTO_RETENTION_DAYS, ...result });
}
