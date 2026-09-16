import { NextResponse } from "next/server";
import { getDiscoverPage } from "@/lib/discover";
import { parseShown } from "@/lib/discoverFilters";
import { toWire } from "@/lib/discoverWire";
import { cachedJson } from "@/lib/httpCache";

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
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const shown = parseShown(url.searchParams.get("shown"));
  // `shown` is not a filter; `getDiscoverPage` takes it as an option and the
  // parser would otherwise see it as an unknown key.
  url.searchParams.delete("shown");
  const page = await getDiscoverPage(url.searchParams.toString(), { shown, here: null });
  return cachedJson(req, toWire(page));
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const { search, shown, coords } = (body ?? {}) as {
    search?: unknown;
    shown?: unknown;
    coords?: unknown;
  };

  if (typeof search !== "string") {
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

  const page = await getDiscoverPage(search, {
    shown: parseShown(typeof shown === "number" ? String(shown) : undefined),
    here,
  });

  // Entry lists for the Maps -- see lib/discoverWire.ts.
  return NextResponse.json(toWire(page));
}
