import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { limitOrReject } from "@/lib/rateLimit";

/**
 * Turns a typed address into coordinates, for Discover's "Use an address"
 * fallback (lib/nearby.ts) when GPS is off, denied, or just pointed at the
 * wrong place.
 *
 * Proxied rather than called from the browser for two reasons: a `fetch` from
 * client code can't set `User-Agent`, and this app's CSP (`next.config.ts`)
 * only allows `connect-src 'self'` — Nominatim's usage policy asks for an
 * identifying UA on every request, and the CSP would block the call anyway.
 *
 * Signed-in and rate-limited like every other mutating-ish route here, even
 * though nothing is written: an open geocoder proxy is a free relay for
 * hitting Nominatim through this app's IP, and a per-user cap keeps that from
 * becoming this app's problem.
 *
 * The address itself is never logged — only its length and the outcome.
 */

const MAX_ADDRESS_LENGTH = 200;

/**
 * Loosely centred on San Diego County, as a bias box (not a hard bound) —
 * Nominatim's `viewbox` nudges ranking toward this area without refusing a
 * real match outside it, which matters for a visitor typing an address just
 * across a county line.
 */
const SAN_DIEGO_VIEWBOX = "-117.6,33.51,-116.08,32.53";

function siteOrigin(): string {
  return process.env.PLATEMAPS_APP_URL ?? "https://platemaps.com";
}

/** Nominatim's `display_name` is the whole administrative chain; a card only
    needs enough to recognise the place — the first two or three parts. */
function shortLabel(displayName: string): string {
  return displayName.split(",").slice(0, 3).join(",").trim();
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to use an address." }, { status: 401 });
  }

  const limited = await limitOrReject({
    scope: "geocode:user",
    key: user.id,
    max: 20,
    windowMinutes: 60,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const { address } = (body ?? {}) as { address?: unknown };
  if (typeof address !== "string" || !address.trim()) {
    return NextResponse.json({ error: "Enter an address." }, { status: 400 });
  }
  const trimmed = address.trim();
  if (trimmed.length > MAX_ADDRESS_LENGTH) {
    return NextResponse.json({ error: "That address is too long." }, { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("viewbox", SAN_DIEGO_VIEWBOX);
  url.searchParams.set("q", trimmed);

  let results: unknown;
  try {
    const res = await fetch(url, {
      headers: {
        // Nominatim's usage policy requires an identifying UA; browsers
        // cannot set this header themselves, which is the other reason this
        // is a server-side proxy rather than a direct client call.
        "User-Agent": `PlateMaps/1.0 (+${siteOrigin()})`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Lookup failed. Try again." }, { status: 502 });
    }
    results = await res.json();
  } catch {
    return NextResponse.json({ error: "Lookup failed. Try again." }, { status: 502 });
  }

  const first = Array.isArray(results) ? results[0] : null;
  const lat = Number(first?.lat);
  const lng = Number(first?.lon);
  const displayName = typeof first?.display_name === "string" ? first.display_name : null;

  if (!first || !Number.isFinite(lat) || !Number.isFinite(lng) || !displayName) {
    return NextResponse.json({ error: "Couldn't find that address." }, { status: 404 });
  }

  return NextResponse.json({ lat, lng, label: shortLabel(displayName) });
}
