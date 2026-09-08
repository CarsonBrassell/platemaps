import { NextResponse } from "next/server";
import { suggest } from "@/lib/suggest";

/**
 * `GET /api/discover/suggest?q=` — the four readings of the term the search
 * dropdown offers while someone is typing, each with the number of restaurants
 * behind it. See lib/suggest.ts for how the counts are measured and why the
 * readings are ordered the way they are.
 *
 * Public, and cached at the edge for a minute. Everything in the answer is
 * public data — restaurant names, the cuisine and neighbourhood vocabularies,
 * the dish vocabulary — and none of it is per-visitor, so two people typing
 * "birr" should not cost two corpus reads. `stale-while-revalidate` matters
 * more than the TTL here: a keystroke is the least forgiving latency in the
 * product, and serving a slightly stale answer beats holding the dropdown blank
 * while a new restaurant's name is fetched.
 *
 * A query the guards refuse (under two characters) is answered with empty
 * readings and a 200 rather than a 400 — it is a normal state of a field someone
 * is typing into, not a caller error, and the client should not have to
 * distinguish "too short" from "nothing matched".
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const answer = await suggest(q);

  return NextResponse.json(answer, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
