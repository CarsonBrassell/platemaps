// The "PlateMaps users rated it well" bonus for the 40-axis For me path (Calvin only, see forMeGate.ts).
// Other people's rated posts about a place nudge its score up, never down. Pure functions, no I/O: the rows come
// in from lib/crowdIndex.ts. Nothing here ever reaches a response: the bonus is a silent multiplier.

import { evidenceOf, type EvidencePost } from "@/lib/tasteEvidence";

export const CROWD = {
  cap: 0.08, // the multiplier tops out at 1 + cap
  k: 0.6, // how fast it climbs: bonus = cap * (1 - exp(-k * net)), net = sum over distinct posters
} as const;

/** One public, rated post. `userId` is read only to count distinct posters and to leave the viewer out. */
export type CrowdPost = { userId: string; restaurantId: string; at: number; rating: number };

/** Per place, one signed evidence value per poster (the mean of their posts there, read against their own usual). */
export type CrowdIndex = Map<string, { u: string; e: number }[]>;

export function buildCrowd(posts: readonly CrowdPost[]): CrowdIndex {
  const byUser = new Map<string, EvidencePost[]>();
  for (const p of posts) {
    if (!Number.isFinite(p.rating)) continue;
    const list = byUser.get(p.userId);
    const post = { restaurantId: p.restaurantId, at: p.at, rating: p.rating };
    if (list) list.push(post);
    else byUser.set(p.userId, [post]);
  }
  const out: CrowdIndex = new Map();
  for (const [u, list] of byUser) {
    const ev = evidenceOf(list);
    for (const [rid, pe] of ev.places) {
      const row = out.get(rid);
      if (row) row.push({ u, e: pe.e });
      else out.set(rid, [{ u, e: pe.e }]);
    }
  }
  return out;
}

/** The multiplier for one place from its posters' values: 1 (nothing) up to 1 + cap. Negative evidence only cancels. */
export function crowdMultiplier(values: readonly number[]): number {
  let net = 0;
  for (const e of values) if (Number.isFinite(e)) net += e;
  if (!(net > 0)) return 1;
  return 1 + CROWD.cap * (1 - Math.exp(-CROWD.k * net));
}

/** Multipliers by place for one viewer: their own posts and anyone blocked either way are left out; only > 1 is kept. */
export function crowdMultipliers(crowd: CrowdIndex, viewerId: string, blocked: ReadonlySet<string> = new Set()): Map<string, number> {
  const out = new Map<string, number>();
  for (const [rid, rows] of crowd) {
    const m = crowdMultiplier(rows.filter((r) => r.u !== viewerId && !blocked.has(r.u)).map((r) => r.e));
    if (m > 1) out.set(rid, m);
  }
  return out;
}
