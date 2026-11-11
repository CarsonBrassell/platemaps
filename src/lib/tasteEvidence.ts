// Signed taste evidence: turns one person's posts into a positive (liked) or
// negative (counts against) number per post. Pure functions, no I/O.
//
// Only a low rating counts against: under `lowBelow` on any scale, or under
// `againstBelow` and a clear step below what that person usually gives. Every
// other post is at least a weak like, so a steady or a harsh rater never has
// their whole history read as dislike. Going back to a place only ever counts
// for it: repeat visits strengthen a like and soften a low rating.

export type EvidencePost = { restaurantId: string; at: number; rating?: number | null };

export type EvidenceConfig = {
  siteMean: number; // average rating across the site, the prior for a personal scale
  siteSd: number; // spread of ratings across the site
  shrinkK: number; // how many ratings the site prior is worth
  zClip: number; // largest |z| kept when scoring a post
  zUse: number; // |z| that maps to the full rating share
  ratingShare: number; // weight of the rating part of y
  behaviourShare: number; // weight of the revisit part of y
  behaviour: readonly [number, number, number]; // revisit signal for 1, 2, 3+ visits
  confPerDoubling: number; // confidence gained each time visits double
  gapRatio: number; // latest gap this many times the one before reads as drifting away
  gapFade: number; // confidence multiplier when drifting away
  lowBelow: number; // ratings under this always count against, whatever their other ratings are
  lowCap: number; // highest y allowed for a rating that counts against
  againstBelow: number; // only a rating under this can count against
  againstZ: number; // ... and only when it also sits this many spreads under what they usually give
  mehY: number; // y of a post under their usual rating that is not low: a weak like, never a dislike
  timeZone: string; // zone used to decide what counts as one calendar day
};

export const TASTE_EVIDENCE: EvidenceConfig = {
  siteMean: 83, // site-wide average rating
  siteSd: 10, // site-wide spread
  shrinkK: 5, // prior weight in ratings
  zClip: 2.5, // clip on the personal z-score
  zUse: 2, // z that earns the full rating share
  ratingShare: 0.7, // rating weight in y
  behaviourShare: 0.3, // revisit weight in y
  behaviour: [0.25, 0.6, 0.85], // revisit signal by visit count
  confPerDoubling: 0.6, // confidence per doubling of visits
  gapRatio: 2, // gap growth that triggers the fade
  gapFade: 0.7, // confidence kept when faded
  lowBelow: 50, // below this a rating is a clear miss on any scale
  lowCap: -0.25, // y ceiling for a rating that counts against
  againstBelow: 70, // the lowest eighth of ratings on the site: 11 of 88 sat under 70 on 2026-11-10
  againstZ: 1, // one spread under their usual rating
  mehY: 0.02, // just above zero: seeds at about the weakest liked weight
  timeZone: 'America/Los_Angeles', // calendar days are local to the site
};

export type PlaceEvidence = {
  visits: number;
  confidence: number;
  behaviour: number;
  faded: boolean;
  last: number;
  y: number;
  e: number;
};

export type Evidence = {
  e: number[];
  y: number[];
  z: (number | null)[];
  places: Map<string, PlaceEvidence>;
  mean: number; // their average, blended with the site's
  ref: number; // the level a rating is read against: the lower of `mean` and their own plain average
  sd: number;
  top: number;
};

const clip = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

const isRated = (r: unknown): r is number => typeof r === 'number' && Number.isFinite(r);

// Going back only ever counts for a place: confidence scales a like, never a low rating. A place rated low and
// visited again counts against a little less (the revisit part of y), not more.
const signedOf = (y: number, confidence: number): number => (y < 0 ? y : confidence * y);

// Revisit signal: more visits to a place means more trust that they liked it.
export function behaviourOf(visits: number, cfg: EvidenceConfig = TASTE_EVIDENCE): number {
  if (!(visits >= 2)) return cfg.behaviour[0];
  if (visits < 3) return cfg.behaviour[1];
  return cfg.behaviour[2];
}

// Confidence grows with log2 of the visit count, and fades when the latest gap
// between visits is much longer than the one before it.
export function confidenceOf(
  visitTimes: readonly number[],
  cfg: EvidenceConfig = TASTE_EVIDENCE,
): { confidence: number; faded: boolean } {
  const v = visitTimes.length > 0 ? visitTimes.length : 1;
  let confidence = 1 + cfg.confPerDoubling * Math.log2(v);
  let faded = false;
  if (v >= 3) {
    const last = visitTimes[v - 1] - visitTimes[v - 2];
    const before = visitTimes[v - 2] - visitTimes[v - 3];
    if (before > 0 && last > cfg.gapRatio * before) {
      confidence *= cfg.gapFade;
      faded = true;
    }
  }
  return { confidence, faded };
}

// Signed strength of one post, in -1..1, before confidence is applied. A missing z counts as 0; evidenceOf
// gives a post with no rating the z of their own average instead, so that only matters to a direct caller.
export function yOf(z: number | null, behaviour: number, cfg: EvidenceConfig = TASTE_EVIDENCE): number {
  const zz = z === null || !Number.isFinite(z) ? 0 : z;
  const y = cfg.ratingShare * (clip(zz, -cfg.zUse, cfg.zUse) / cfg.zUse) + cfg.behaviourShare * behaviour;
  return clip(y, -1, 1);
}

export function evidenceOf(posts: readonly EvidencePost[], cfg: EvidenceConfig = TASTE_EVIDENCE): Evidence {
  // Personal scale, shrunk toward the site prior so a few ratings cannot swing it.
  const ratings: number[] = [];
  for (const p of posts) if (isRated(p.rating)) ratings.push(p.rating);
  const n = ratings.length;
  let meanU = 0;
  let varU = 0;
  if (n > 0) {
    meanU = ratings.reduce((s, r) => s + r, 0) / n;
    if (n >= 2) varU = ratings.reduce((s, r) => s + (r - meanU) * (r - meanU), 0) / n;
  }
  const mean = (n * meanU + cfg.shrinkK * cfg.siteMean) / (n + cfg.shrinkK);
  const sd = Math.sqrt((n * varU + cfg.shrinkK * cfg.siteSd * cfg.siteSd) / (n + cfg.shrinkK));

  // The level a rating is read against: the lower of their own average and the blended one. Someone who rates
  // everything the same, or everything low, is read on their own scale (their usual rating is z = 0, never a
  // dislike); a generous rater is pulled toward the site. A rating is never read as lower than it is on either.
  const ref = n > 0 ? Math.min(mean, meanU) : mean;
  const zAt = (r: number): number => (sd > 0 ? clip((r - ref) / sd, -cfg.zClip, cfg.zClip) : 0);
  const z: (number | null)[] = posts.map((p) => (isRated(p.rating) ? zAt(p.rating) : null));
  // A post with no rating reads as one rated at their own average.
  const zUnrated = n > 0 ? zAt(meanU) : 0;

  // Group posts by place, then count distinct local calendar days as visits.
  const byPlace = new Map<string, number[]>();
  posts.forEach((p, i) => {
    const list = byPlace.get(p.restaurantId);
    if (list) list.push(i);
    else byPlace.set(p.restaurantId, [i]);
  });

  const placeInfo = new Map<string, { visits: number; confidence: number; behaviour: number; faded: boolean; last: number }>();
  for (const [id, idxs] of byPlace) {
    const days = new Map<string, number>();
    let last = -Infinity;
    for (const i of idxs) {
      const at = posts[i].at;
      if (at > last) last = at;
      let key: string;
      try {
        key = new Date(at).toLocaleDateString('en-CA', { timeZone: cfg.timeZone });
      } catch {
        key = String(at);
      }
      const seen = days.get(key);
      if (seen === undefined || at < seen) days.set(key, at);
    }
    const times = [...days.values()].sort((a, b) => a - b);
    const { confidence, faded } = confidenceOf(times, cfg);
    placeInfo.set(id, {
      visits: times.length,
      confidence,
      behaviour: behaviourOf(times.length, cfg),
      faded,
      last: Number.isFinite(last) ? last : 0,
    });
  }

  const y: number[] = [];
  const e: number[] = [];
  const sums = new Map<string, number>();
  posts.forEach((p, i) => {
    const info = placeInfo.get(p.restaurantId)!;
    const zi = z[i] ?? zUnrated;
    let yi = yOf(zi, info.behaviour, cfg);
    // Counts against only when the rating is low: under `lowBelow` on any scale, or under `againstBelow` and a
    // clear step below what they usually give. Anything else they posted is at least a weak like.
    // A post with no rating is judged as one rated at their own average.
    const r = isRated(p.rating) ? p.rating : n > 0 ? meanU : null;
    const low = r !== null && (r < cfg.lowBelow || (r < cfg.againstBelow && zi <= -cfg.againstZ));
    yi = low ? Math.min(yi, cfg.lowCap) : Math.max(yi, cfg.mehY);
    y.push(yi);
    e.push(signedOf(yi, info.confidence));
    sums.set(p.restaurantId, (sums.get(p.restaurantId) ?? 0) + yi);
  });

  const places = new Map<string, PlaceEvidence>();
  for (const [id, info] of placeInfo) {
    const count = byPlace.get(id)!.length;
    const py = (sums.get(id) ?? 0) / count;
    places.set(id, { ...info, y: py, e: signedOf(py, info.confidence) });
  }

  let top = 0;
  for (const v of e) if (v > top) top = v;

  return { e, y, z, places, mean, ref, sd, top };
}
