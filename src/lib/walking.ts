/**
 * Real walking distance and time for restaurants near the visitor, from
 * OpenRouteService's matrix API, behind a cache shared by everyone standing
 * in roughly the same place.
 *
 * Server-only — imports sqlClient.ts, the same standing rule as db.ts.
 *
 * ## Why a grid cell instead of the raw coordinate
 *
 * ORS's free tier is metered (500 requests/day, ~3,500 source×destination
 * pairs per request) and every visitor's browser reports a slightly different
 * GPS fix even standing still. Caching on the exact coordinate would mean the
 * cache almost never hits — two readers a few feet apart would each pay for
 * their own matrix call for the same answer. Snapping to a ~150m grid
 * (`cellOf` below) means everyone in that cell shares one set of answers,
 * routed from the cell's centre rather than any one visitor's exact spot —
 * close enough that the few metres of slop never changes which mile marker a
 * card prints.
 *
 * ## Why estimates exist and are never cached
 *
 * `walkingFor` must never throw and never hang the page behind a flaky third
 * party: a 2.5s timeout and any other failure (quota, missing key, a
 * non-2xx, an unroutable pair) fall back to a straight-line guess — distance
 * × 1.3 for the fact that streets are not as-the-crow-flies, at a flat 3mph
 * for time. That guess is marked `estimated: true` so the card can say so
 * (`~0.7 mi`, see `formatWalk` in lib/geo.ts) and it is never
 * written to `walk_cache` — caching a guess would let one bad ORS response
 * outlive the outage that caused it.
 */

import type { RestaurantView } from "@/data/restaurantTypes";
import { milesBetween, type Coords } from "@/lib/geo";
import { sql } from "@/lib/sqlClient";

export type WalkInfo = { meters: number; seconds: number; estimated: boolean };

/** Only restaurants this close even ask ORS a question — see discover.ts's
    `withDistance`, which is what still answers everything farther out. */
const WALK_RADIUS_MI = 3;

/** ~150m: small enough that routing from the cell's centre rather than the
    visitor's exact spot never changes which mile marker a card prints. */
const LAT_STEP = 0.00135;
const LNG_STEP = 0.0016;

const ORS_URL = "https://api.openrouteservice.org/v2/matrix/foot-walking";
const TIMEOUT_MS = 2500;
/** ORS's free tier tops out around 3,500 source×destination pairs per
    request; with one source that is destinations, so this stays comfortably
    under it per call while still needing only one call in the ordinary case
    (a page of Discover results is a few dozen rows, never thousands). */
const CHUNK_SIZE = 3000;

const ESTIMATE_MULTIPLIER = 1.3;
const ESTIMATE_MPH = 3;
const METERS_PER_MILE = 1609.34;

/** How long a cache row may sit unread before `walkingFor` touches it again —
    past this, a hit is worth a write so the row's clock reflects real use. */
const TOUCH_AFTER = "1 day";
/** How long an untouched row survives at all. Run on ~1% of calls rather than
    every one, so expiry costs a stray DELETE now and then instead of a write
    on the hot path of every request. */
const EXPIRE_AFTER = "90 days";
const EXPIRE_SAMPLE_RATE = 0.01;

function estimateFor(here: Coords, there: Coords): WalkInfo {
  const miles = milesBetween(here, there) * ESTIMATE_MULTIPLIER;
  return {
    meters: Math.round(miles * METERS_PER_MILE),
    seconds: Math.round((miles / ESTIMATE_MPH) * 3600),
    estimated: true,
  };
}

/** Snaps a position to its grid cell and that cell's centre — the point ORS
    is actually asked to route from, so every visitor in the cell shares one
    answer regardless of where inside it they are standing. */
function cellOf(here: Coords): { cell: string; center: Coords } {
  const latIndex = Math.round(here.lat / LAT_STEP);
  const lngIndex = Math.round(here.lng / LNG_STEP);
  return {
    cell: `${latIndex}:${lngIndex}`,
    center: { lat: latIndex * LAT_STEP, lng: lngIndex * LNG_STEP },
  };
}

/** Fire-and-forget: awaited internally so a rejection never becomes an
    unhandled promise, but not awaited by the caller — an occasional missed
    expiry just means a handful of stale rows live a little past 90 days. */
function maybeExpireCache(): void {
  if (Math.random() >= EXPIRE_SAMPLE_RATE) return;
  void (async () => {
    try {
      await sql`DELETE FROM walk_cache WHERE last_used_at < now() - interval '${sql.unsafe(EXPIRE_AFTER)}'`;
    } catch {
      /* best-effort; the next 1%-sampled call tries again */
    }
  })();
}

/** One ORS matrix call (or several, chunked) from `center` to `misses`,
    falling back to a per-row estimate for anything the response leaves null
    and to an estimate for every row in a chunk that fails outright. */
async function fetchFromORS(
  key: string,
  here: Coords,
  center: Coords,
  misses: readonly RestaurantView[],
): Promise<Map<string, WalkInfo>> {
  const result = new Map<string, WalkInfo>();

  for (let start = 0; start < misses.length; start += CHUNK_SIZE) {
    const chunk = misses.slice(start, start + CHUNK_SIZE);
    try {
      const locations = [[center.lng, center.lat], ...chunk.map((r) => [r.lng, r.lat])];
      const res = await fetch(ORS_URL, {
        method: "POST",
        headers: { Authorization: key, "Content-Type": "application/json" },
        body: JSON.stringify({
          locations,
          sources: [0],
          destinations: chunk.map((_, i) => i + 1),
          metrics: ["distance", "duration"],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`ORS matrix responded ${res.status}`);

      const data = (await res.json()) as {
        distances?: (number | null)[][];
        durations?: (number | null)[][];
      };
      const distances = data.distances?.[0] ?? [];
      const durations = data.durations?.[0] ?? [];

      chunk.forEach((r, i) => {
        const meters = distances[i];
        const seconds = durations[i];
        result.set(
          r.id,
          meters == null || seconds == null
            ? estimateFor(here, { lat: r.lat, lng: r.lng })
            : { meters: Math.round(meters), seconds: Math.round(seconds), estimated: false },
        );
      });
    } catch {
      // Timeout, quota, network error, a non-2xx: the whole chunk falls back
      // rather than partially failing, since there is no partial response to
      // salvage here.
      for (const r of chunk) result.set(r.id, estimateFor(here, { lat: r.lat, lng: r.lng }));
    }
  }

  return result;
}

/** Writes only the routed (non-estimated) rows a chunk actually produced —
    estimates are never cached, see the module comment. One INSERT for the
    whole batch, `ON CONFLICT DO NOTHING`: a race with another request
    caching the same cell/restaurant pair just keeps whichever wrote first. */
async function cacheRoutedRows(
  cell: string,
  rows: readonly RestaurantView[],
  info: ReadonlyMap<string, WalkInfo>,
): Promise<void> {
  const routed = rows.filter((r) => {
    const w = info.get(r.id);
    return w && !w.estimated;
  });
  if (routed.length === 0) return;

  const values: string[] = [];
  const params: unknown[] = [];
  for (const r of routed) {
    const w = info.get(r.id)!;
    const base = params.length;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    params.push(cell, r.id, w.meters, w.seconds);
  }

  try {
    await sql.query(
      `INSERT INTO walk_cache (cell, restaurant_id, meters, seconds)
       VALUES ${values.join(", ")}
       ON CONFLICT DO NOTHING`,
      params,
    );
  } catch {
    // A cache write failing doesn't change the answer already computed for
    // this request — it only means the next visitor in this cell pays for
    // another ORS call.
  }
}

/**
 * Walking distance/time for the restaurants in `restaurants` that are within
 * {@link WALK_RADIUS_MI} of `here` and have coordinates. Never throws — every
 * failure path resolves to an estimate instead.
 *
 * Intended to be called with one page's worth of rows (the slice Discover is
 * actually about to show), not the whole corpus — see lib/discover.ts.
 */
export async function walkingFor(
  here: Coords,
  restaurants: readonly RestaurantView[],
): Promise<Map<string, WalkInfo>> {
  const result = new Map<string, WalkInfo>();

  const candidates = restaurants.filter((r) => {
    if (r.lat == null || r.lng == null || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) {
      return false;
    }
    return milesBetween(here, { lat: r.lat, lng: r.lng }) <= WALK_RADIUS_MI;
  });
  if (candidates.length === 0) return result;

  maybeExpireCache();

  const { cell, center } = cellOf(here);
  const ids = candidates.map((r) => r.id);

  let hits: { restaurant_id: string; meters: number; seconds: number }[] = [];
  try {
    hits = (await sql`
      SELECT restaurant_id, meters, seconds
      FROM walk_cache
      WHERE cell = ${cell} AND restaurant_id = ANY(${ids})
    `) as typeof hits;
  } catch {
    // Treat as a total cache miss — the ORS/estimate path below still answers.
    hits = [];
  }

  const hitIds: string[] = [];
  for (const row of hits) {
    hitIds.push(row.restaurant_id);
    result.set(row.restaurant_id, { meters: row.meters, seconds: row.seconds, estimated: false });
  }

  if (hitIds.length > 0) {
    try {
      // One UPDATE, not a write per read: only rows a day or older actually
      // get touched, so a cell that is read constantly costs nothing extra.
      await sql`
        UPDATE walk_cache SET last_used_at = now()
        WHERE cell = ${cell} AND restaurant_id = ANY(${hitIds})
          AND last_used_at < now() - interval '${sql.unsafe(TOUCH_AFTER)}'
      `;
    } catch {
      /* best-effort; a missed touch only means this row expires a bit early */
    }
  }

  const misses = candidates.filter((r) => !result.has(r.id));
  if (misses.length === 0) return result;

  const key = process.env.ORS_API_KEY;
  if (!key) {
    for (const r of misses) result.set(r.id, estimateFor(here, { lat: r.lat, lng: r.lng }));
    return result;
  }

  const routed = await fetchFromORS(key, here, center, misses);
  for (const [id, info] of routed) result.set(id, info);

  await cacheRoutedRows(cell, misses, routed);

  return result;
}
