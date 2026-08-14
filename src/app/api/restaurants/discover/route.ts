import { NextResponse } from "next/server";
import { getDiscoverPage, parseShown } from "@/lib/discover";

/**
 * Discover's query for the one case the URL cannot carry: "Nearby".
 *
 * Everything else about a Discover view lives in the query string, which is
 * what makes a filtered view shareable and server-rendered. Coordinates do not
 * belong there — a query string is shared, logged by every hop, and kept in
 * browser history, and where somebody is standing is not the kind of thing to
 * put in one. So the URL carries the intent (`nearby=1`) and the position comes
 * here in a POST body instead.
 *
 * POST rather than GET for the same reason: a GET would put the coordinates
 * back in a URL, just a different one.
 *
 * The position is used to answer this request and is neither stored nor logged.
 *
 * Public and viewer-independent otherwise: restaurants are public data, and
 * this returns exactly what the page would have returned had the URL been able
 * to express the question.
 */
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

  return NextResponse.json(page);
}
