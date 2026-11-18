// The "PlateMaps users rated it well" multiplier for the 40-axis For me path (Calvin only, see forMeGate.ts).
// Only other people's ratings drive it: a post's presence or photos count for nothing. Pure functions, no I/O: the rows
// come in from lib/crowdIndex.ts. Nothing here ever reaches a response: the bonus is a silent multiplier.

export const CROWD = {
  cap: 0.3, // the multiplier tops out at 1 + cap
  floor: 0.85, // and never drops under this
  down: 0.15, // the most low ratings can take off (1 - down = floor)
  k: 1.2, // saturation: 1 - exp(-k * net), net = sum of per-poster scores; 2-3 strong ratings get most of it
  strongFrom: 4.5, // stars: at or above adds
  flatFrom: 4.0, // stars: 4.0 up to strongFrom adds nothing; under it subtracts
} as const;

/** One public, rated post. `userId` is read only to count distinct posters and to leave the viewer out. `rating` is 0-100. */
export type CrowdPost = { userId: string; restaurantId: string; at: number; rating: number };

/** Per place, one rating per poster (the mean of their posts there, in stars 0-5). */
export type CrowdIndex = Map<string, { u: string; r: number }[]>;

const stars = (rating: number) => (rating <= 5 ? rating : rating / 20);

export function buildCrowd(posts: readonly CrowdPost[]): CrowdIndex {
  const sums = new Map<string, { u: string; rid: string; s: number; n: number }>();
  for (const p of posts) {
    if (!Number.isFinite(p.rating)) continue;
    const key = p.restaurantId + "|" + p.userId;
    const row = sums.get(key);
    if (row) {
      row.s += stars(p.rating);
      row.n += 1;
    } else sums.set(key, { u: p.userId, rid: p.restaurantId, s: stars(p.rating), n: 1 });
  }
  const out: CrowdIndex = new Map();
  for (const { u, rid, s, n } of sums.values()) {
    const row = out.get(rid);
    if (row) row.push({ u, r: s / n });
    else out.set(rid, [{ u, r: s / n }]);
  }
  return out;
}

/** One poster's signed score from their star rating: 4.5 -> +0.6, 5.0 -> +1, 4.0-4.49 -> 0, under 4.0 -> negative (to -1). */
export function ratingScore(r: number): number {
  if (!Number.isFinite(r)) return 0;
  if (r >= CROWD.strongFrom) return Math.min(1, 0.6 + 0.8 * (r - CROWD.strongFrom));
  if (r >= CROWD.flatFrom) return 0;
  return -Math.min(1, 0.1 + 0.3 * (CROWD.flatFrom - r));
}

/** The multiplier for one place from its posters' star ratings: floor (0.85) up to 1 + cap (1.30). */
export function crowdMultiplier(ratings: readonly number[]): number {
  let net = 0;
  for (const r of ratings) net += ratingScore(r);
  if (net > 0) return 1 + CROWD.cap * (1 - Math.exp(-CROWD.k * net));
  if (net < 0) return 1 - CROWD.down * (1 - Math.exp(CROWD.k * net));
  return 1;
}

/** Multipliers by place for one viewer: their own posts and anyone blocked either way are left out; only != 1 is kept. */
export function crowdMultipliers(crowd: CrowdIndex, viewerId: string, blocked: ReadonlySet<string> = new Set()): Map<string, number> {
  const out = new Map<string, number>();
  for (const [rid, rows] of crowd) {
    const m = crowdMultiplier(rows.filter((r) => r.u !== viewerId && !blocked.has(r.u)).map((r) => r.r));
    if (m !== 1) out.set(rid, m);
  }
  return out;
}
