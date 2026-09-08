// Where to set the fuzzy floor in lib/textMatch.ts, measured rather than guessed.
//
//   npx tsx --env-file=.env.local probe/typo-calibrate.mts
//   npx tsx --env-file=.env.local probe/typo-calibrate.mts --sample=1200
//
// Read-only. Reads listed restaurant names, derives misspellings from each one
// in the shapes people actually produce, and reports - per candidate floor -
// how often the real restaurant comes back FIRST and how many rows come back
// with it. The floor is the trade between those two numbers:
//
//   too high  the typo returns nothing, which is the bug this is fixing
//   too low   8,935 rows all "match" and the grid is noise
//
// The test cases are generated, not collected. Asking a human to remember which
// searches failed out of 8,935 restaurants produces five anecdotes; this
// produces tens of thousands of pairs across the real name distribution, and it
// re-runs whenever the corpus or the scorer changes.
//
// It calls the shipping scorer (explainName) rather than a copy of it, so what
// is calibrated is what runs.

import { neon } from "@neondatabase/serverless";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { explainName, prepare, TIER, type Prepared } from "../src/lib/textMatch";

const sql = neon(process.env.DATABASE_URL!);

const sampleArg = process.argv.find((a) => a.startsWith("--sample="));
const SAMPLE = sampleArg ? Number(sampleArg.split("=")[1]) : 600;
const FLOORS = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85];

/* --- Deterministic randomness -------------------------------------------- */

/** Seeded so two runs over the same corpus produce the same table, and a
 *  changed number means a changed scorer rather than a changed dice roll. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260907);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

/* --- The typo shapes ------------------------------------------------------ */

/** QWERTY neighbours, so a substitution is a slip of the finger rather than a
 *  random letter — the difference matters, because a neighbour usually shares
 *  no bigram with the original and is the harder case to recover. */
const NEIGHBOURS: Record<string, string> = {
  a: "qwsz", b: "vghn", c: "xdfv", d: "serfcx", e: "wsdr", f: "drtgvc",
  g: "ftyhbv", h: "gyujnb", i: "ujko", j: "huikmn", k: "jiolm", l: "kop",
  m: "njk", n: "bhjm", o: "iklp", p: "ol", q: "wa", r: "edft", s: "awedxz",
  t: "rfgy", u: "yhji", v: "cfgb", w: "qase", x: "zsdc", y: "tghu", z: "asx",
};

type Variant = { kind: string; query: string };

function letterPositions(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) if (/[a-z]/.test(s[i])) out.push(i);
  return out;
}

function variantsFor(name: string): Variant[] {
  const lower = name.toLowerCase();
  const spots = letterPositions(lower);
  const words = lower.split(/\s+/).filter(Boolean);
  const out: Variant[] = [];
  if (spots.length < 4) return out;

  const at = () => pick(spots);

  // One adjacent-key substitution.
  {
    const i = at();
    const swap = NEIGHBOURS[lower[i]];
    if (swap) out.push({ kind: "substitute", query: lower.slice(0, i) + pick([...swap]) + lower.slice(i + 1) });
  }
  // Two adjacent letters swapped.
  {
    const candidates = spots.filter((i) => /[a-z]/.test(lower[i + 1] ?? ""));
    if (candidates.length) {
      const i = pick(candidates);
      out.push({ kind: "transpose", query: lower.slice(0, i) + lower[i + 1] + lower[i] + lower.slice(i + 2) });
    }
  }
  // One letter missing.
  {
    const i = at();
    out.push({ kind: "drop-letter", query: lower.slice(0, i) + lower.slice(i + 1) });
  }
  // One letter typed twice.
  {
    const i = at();
    out.push({ kind: "double-letter", query: lower.slice(0, i) + lower[i] + lower.slice(i) });
  }
  // The name without its last word - "Kairoa Brewing" for "Kairoa Brewing Company".
  if (words.length > 1) {
    out.push({ kind: "drop-word", query: words.slice(0, -1).join(" ") });
  }
  // The words remembered in the wrong order.
  if (words.length > 1) {
    out.push({ kind: "reorder", query: [...words.slice(1), words[0]].join(" ") });
  }
  // A misspelling AND a missing word, which is the realistic compound case.
  if (words.length > 1 && spots.length > 6) {
    const i = at();
    const typo = lower.slice(0, i) + lower.slice(i + 1);
    const kept = typo.split(/\s+/).filter(Boolean).slice(0, -1).join(" ");
    if (kept) out.push({ kind: "drop-word+typo", query: kept });
  }
  return out;
}

/* --- Run ------------------------------------------------------------------ */

const rows = (await sql`
  SELECT id, name FROM restaurants WHERE listed ORDER BY sort_order, id
`) as { id: string; name: string }[];

console.log(`corpus  ${rows.length} listed names`);

const names: Prepared[] = rows.map((r) => prepare(r.name));

// Sampled, because every query is scored against every name: the full corpus
// would be 8,935 x 8,935 x 7 comparisons and take an hour to say the same thing.
const order = rows.map((_, i) => i);
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [order[i], order[j]] = [order[j], order[i]];
}
const sample = order.slice(0, Math.min(SAMPLE, order.length));

type Bucket = { first: number; total: number; results: number[] };
const perFloor = new Map<number, Bucket>(
  FLOORS.map((f) => [f, { first: 0, total: 0, results: [] as number[] }]),
);
const perKind = new Map<string, Map<number, { first: number; total: number }>>();

// Reused across queries so this is not 53,000 array allocations.
const score = new Float64Array(rows.length);
const isFuzzy = new Uint8Array(rows.length);

let queries = 0;
for (const target of sample) {
  for (const variant of variantsFor(rows[target].name)) {
    const q = prepare(variant.query);
    if (!q.text) continue;
    queries++;

    for (let i = 0; i < rows.length; i++) {
      const m = explainName(q, names[i]);
      score[i] = m.score;
      isFuzzy[i] = m.fuzzy ? 1 : 0;
    }

    for (const floor of FLOORS) {
      const admit = TIER.NAME_FUZZY + Math.round(100 * floor);
      const keep = (i: number) => (isFuzzy[i] && score[i] < admit ? 0 : score[i]);

      const mine = keep(target);
      let better = 0;
      let matched = 0;
      for (let i = 0; i < rows.length; i++) {
        const s = keep(i);
        if (s > 0) matched++;
        if (s > mine) better++;
      }

      const bucket = perFloor.get(floor)!;
      bucket.total++;
      bucket.results.push(matched);
      if (mine > 0 && better === 0) bucket.first++;

      const byKind = perKind.get(variant.kind) ?? new Map();
      const k = byKind.get(floor) ?? { first: 0, total: 0 };
      k.total++;
      if (mine > 0 && better === 0) k.first++;
      byKind.set(floor, k);
      perKind.set(variant.kind, byKind);
    }
  }
}

const quantile = (xs: number[], q: number) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

console.log(`sample  ${sample.length} names -> ${queries} typo queries\n`);
console.log("floor   first   median results   p90 results");
const report: Record<string, unknown>[] = [];
for (const floor of FLOORS) {
  const b = perFloor.get(floor)!;
  const first = (100 * b.first) / b.total;
  const median = quantile(b.results, 0.5);
  const p90 = quantile(b.results, 0.9);
  report.push({ floor, firstPercent: Number(first.toFixed(2)), median, p90 });
  console.log(
    `${floor.toFixed(2)}   ${first.toFixed(1).padStart(5)}%   ${String(median).padStart(14)}   ${String(p90).padStart(11)}`,
  );
}

console.log("\nby typo shape (percent where the real restaurant came first)");
const kinds = [...perKind.keys()].sort();
console.log(`${"shape".padEnd(16)}${FLOORS.map((f) => f.toFixed(2).padStart(7)).join("")}`);
for (const kind of kinds) {
  const byFloor = perKind.get(kind)!;
  const cells = FLOORS.map((f) => {
    const k = byFloor.get(f)!;
    return `${((100 * k.first) / k.total).toFixed(0)}%`.padStart(7);
  }).join("");
  console.log(`${kind.padEnd(16)}${cells}`);
}

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(
  join(here, "typo-calibration.json"),
  JSON.stringify({ at: new Date().toISOString(), corpus: rows.length, queries, report }, null, 2),
);
console.log("\nwrote probe/typo-calibration.json");
