import { NextResponse } from "next/server";
import { getDiscoverPage, loadCorpus, loadProfileTraits } from "@/lib/discover";
import { FOR_ME_PARAM, filtersFromSearch, parseShown } from "@/lib/discoverFilters";
import { toWire } from "@/lib/discoverWire";
import { cachedJson } from "@/lib/httpCache";
import { clientIp } from "@/lib/loginThrottle";
import { traitIndexFor } from "@/lib/profileTraits";
import { limitForMe, limitOrReject } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";
import { rankTaste } from "@/lib/taste";
import { resolveTasteContext } from "@/lib/tasteContext";

/**
 * Discover's query, answered as JSON.
 *
 * `/` and `/m` are static shells (probe/PERF-PLAN.md S3): the server renders
 * the unfiltered first page and anything in the query string is answered
 * here, by the same `getDiscoverPage` that used to render the route. GET
 * carries the filters exactly as the page URL does — `?cuisine=Thai&shown=48`
 * — and is public and cacheable at the edge, keyed by that string, so the
 * hundredth visitor asking for Thai gets the CDN's copy.
 *
 * The one case the URL cannot carry is "Nearby". Coordinates do not belong in
 * a query string — one is shared, logged by every hop, and kept in browser
 * history, and where somebody is standing is not the kind of thing to put in
 * one. So the URL carries the intent (`nearby=1`) and the position comes to
 * POST in a body, which is never cached.
 *
 * The position is used to answer this request and is neither stored nor logged.
 *
 * ## For me
 *
 * "For me" is the second thing the URL cannot carry, for the opposite reason:
 * its answer is about one person. It is a mode, not a filter — the page URL
 * says `?foryou=1` and the client turns that into `forMe: true` in a POST body,
 * together with the visitor's local taste (`prefs`) when they are signed out.
 * Everything personal happens on this branch and nowhere else:
 *
 *  - it reads the session cookie, and the response is `private, no-store` with
 *    `Vary: Cookie`, so neither the CDN nor a shared proxy can hold a copy;
 *  - the GET refuses `foryou` outright, so a For me flavored URL can never be
 *    answered, and therefore never cached, by the public path;
 *  - signed in or out it is rate limited (lib/rateLimit.ts `limitForMe`),
 *    because ranking the corpus against someone's history is real CPU.
 *
 * Identity comes from the session only. There is no user id in the body, as in
 * `/api/account/taste`, and `prefs` is validated against the corpus before it is
 * used and never stored. See probe/for-me/PLAN.md section 3.4.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.has(FOR_ME_PARAM)) {
    // Not `cachedJson`: even an error for a personal URL must not be kept.
    return NextResponse.json(
      { error: "For me is personal and is requested with POST." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const shown = parseShown(url.searchParams.get("shown"));
  // `shown` is not a filter; `getDiscoverPage` takes it as an option and the
  // parser would otherwise see it as an unknown key.
  url.searchParams.delete("shown");
  const page = await getDiscoverPage(url.searchParams.toString(), { shown, here: null });
  return cachedJson(req, toWire(page));
}

/** Everything a For me answer sends. `Vary: Cookie` because the same URL and
    body answer differently once somebody signs in. */
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function POST(req: Request) {
  const limited = await limitOrReject({
    scope: "discover:ip",
    key: clientIp(req),
    max: 240,
    windowMinutes: 10,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const { search, shown, coords, forMe, prefs } = (body ?? {}) as {
    search?: unknown;
    shown?: unknown;
    coords?: unknown;
    forMe?: unknown;
    prefs?: unknown;
  };

  // Far longer than any filter string the page can build.
  if (typeof search !== "string" || search.length > 2_000) {
    return NextResponse.json({ error: "Missing filters." }, { status: 400 });
  }

  // Validated rather than trusted: these reach `milesBetween`, and a NaN there
  // would quietly make every distance comparison false — an empty grid with no
  // stated cause, which is the failure this codebase keeps designing against.
  const position =
    typeof coords === "object" && coords !== null
      ? (coords as { lat?: unknown; lng?: unknown })
      : null;
  const lat = Number(position?.lat);
  const lng = Number(position?.lng);
  const here =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng }
      : null;

  const limit = parseShown(typeof shown === "number" ? String(shown) : undefined);

  if (forMe !== true) {
    const page = await getDiscoverPage(search, { shown: limit, here });
    // Entry lists for the Maps -- see lib/discoverWire.ts.
    return NextResponse.json(toWire(page));
  }

  const user = await getCurrentUser();
  const forMeLimited = await limitForMe(req, user);
  if (forMeLimited) return forMeLimited;

  // Typed search wins over For me (decision D3): the answer is plain relevance
  // and the viewer's history is not needed, so skip reading it. `getDiscoverPage`
  // decides this again for itself; this only saves the work.
  const corpus = await loadCorpus();
  if (filtersFromSearch(search, corpus.restaurants).q) {
    const page = await getDiscoverPage(search, { shown: limit, here, forMe: null });
    return NextResponse.json(toWire(page), { headers: PRIVATE_HEADERS });
  }

  // The profile rows are the slowest read on a cold cache and need nothing the
  // viewer's context does, so the two go out together. `loadProfileTraits` never
  // rejects (a failed read is an empty list), so there is nothing to catch if
  // `resolveTasteContext` throws first.
  const traitRows = loadProfileTraits();
  const ctx = await resolveTasteContext({ user, corpus, prefs });
  const traits = traitIndexFor(corpus.restaurants, await traitRows);
  const page = await getDiscoverPage(search, {
    shown: limit,
    here,
    forMe: rankTaste({
      restaurants: corpus.restaurants,
      plates: corpus.plates,
      prefs: ctx.prefs,
      postedIds: ctx.postedIds,
      favoriteCuisine: ctx.favoriteCuisine,
      friendVisits: ctx.friendVisits,
      traits,
      ratingMean: corpus.ratingMean,
    }),
  });

  return NextResponse.json(toWire(page), { headers: PRIVATE_HEADERS });
}
