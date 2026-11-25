import { NextResponse } from "next/server";
import { readiness } from "@/lib/oauth/providers";
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from "@/lib/oauth/publicIds";

// Read off process.env at request time; never a build-time snapshot.
export const dynamic = "force-dynamic";

/**
 * Which sign-in buttons this deployment can actually honour.
 *
 * **The server decides, and the page only asks.** There is no NEXT_PUBLIC
 * flag for this: a flag set by hand can say "on" while the Apple key in the
 * environment is missing a line, and the result is a Continue with Apple
 * button that fails in front of an App Store reviewer. `readiness()` signs a
 * real client secret with the installed key to find out.
 *
 * `native.pair` is one boolean for both in-app buttons — Apple and Google
 * appear together or not at all (guideline 4.8).
 *
 * With nothing configured — the shipped state — every flag is false and both
 * ids are empty strings, so no screen draws anything new.
 *
 * Booleans and public client ids only: no secrets, and no *reasons*. "Why is
 * Apple off" is for the server log, not for anyone who can fetch a URL.
 */
export async function GET() {
  const ready = readiness();
  return NextResponse.json(
    {
      web: { google: ready.webGoogle },
      native: {
        pair: ready.nativePair,
        // Handed out only alongside a true `pair`, so a client cannot
        // initialise the native SDK against a server that would refuse it.
        googleWebClientId: ready.nativePair ? GOOGLE_WEB_CLIENT_ID : "",
        googleIosClientId: ready.nativePair ? GOOGLE_IOS_CLIENT_ID : "",
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
