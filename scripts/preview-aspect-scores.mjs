/**
 * Runs the per-category model against hand-built scenarios and prints the
 * result, so it can be judged and tuned without a database or a browser.
 *
 *   node scripts/preview-aspect-scores.mjs
 *   node scripts/preview-aspect-scores.mjs --k 8          # try a different damping
 *   node scripts/preview-aspect-scores.mjs --spread 2.2   # try a wider spread
 *
 * Nothing here touches the database.
 *
 * Two lines to watch at the end of every block, both asserted rather than
 * trusted — the script exits non-zero if either breaks:
 *
 *   1. the five ratings average to the restaurant's own rating, exactly
 *   2. no category with zero votes sits above that rating
 */
import {
  aspectScores,
  meanScore,
  CONFIDENCE_K,
  SPREAD,
  FAULT_WEIGHT,
  MAX_REACH,
  MIN_REVIEWS,
} from "../src/lib/aspectScores.ts";
import { BEST_AT_LABELS } from "../src/data/reviewScales.ts";

/** Whichever chips the composer currently offers, scored as-is. Food is not
    among them — the plate score is the food rating. */
const ASPECTS = BEST_AT_LABELS;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? Number(process.argv[i + 1]) : fallback;
};
const K = arg("k", CONFIDENCE_K);
const SP = arg("spread", SPREAD);

/** Sparse votes by category — anything omitted is 0 praise, 0 faults. */
function v(byAspect) {
  return Object.fromEntries(
    Object.entries(byAspect).map(([a, [praised, faulted]]) => [a, { praised, faulted }]),
  );
}

const SCENARIOS = [
  {
    title: "The worked case — 4.5 place, service is the standout",
    note: "A third of reviewers name service. It lands ~4.8; the quiet categories pay for it.",
    base: 4.5,
    reviews: 36,
    votes: v({ Service: [12, 0], Ambiance: [4, 0], Drinks: [2, 0], "Menu variety": [1, 0], Value: [1, 0] }),
  },
  {
    title: "Nobody singled anything out",
    note: "No votes at all. Every category IS the restaurant's rating — the honest answer to no signal.",
    base: 4.5,
    reviews: 36,
    votes: v({}),
  },
  {
    title: "One category is hated",
    note: "Value faulted by half the room. It drops hard; everything else drifts up to balance it.",
    base: 4.2,
    reviews: 40,
    votes: v({ Service: [6, 0], Ambiance: [5, 0], Drinks: [3, 0], "Menu variety": [2, 0], Value: [0, 20] }),
  },
  {
    title: "Great drinks, bad service — a bar",
    note: "Two categories pulling opposite ways on one review pool.",
    base: 4.3,
    reviews: 50,
    votes: v({ Drinks: [22, 0], Ambiance: [9, 0], Service: [1, 14], "Menu variety": [2, 1], Value: [0, 6] }),
  },
  {
    title: `Below the floor — 5 reviews (needs ${MIN_REVIEWS})`,
    note: "No ratings at all. The votes are real; ranking five categories on five reviews isn't.",
    base: 4.4,
    reviews: 5,
    votes: v({ "Menu variety": [2, 0], Drinks: [1, 0], Value: [0, 2] }),
  },
  {
    title: `Just over the floor — ${MIN_REVIEWS} reviews`,
    note: "Ratings appear, but damping keeps the row tight at this sample size.",
    base: 4.4,
    reviews: MIN_REVIEWS,
    votes: v({ "Menu variety": [4, 0], Drinks: [2, 0], Value: [0, 3] }),
  },
  {
    title: "Same shape, 60 reviews",
    note: "The sample now earns the spacing the thin one couldn't.",
    base: 4.5,
    reviews: 60,
    votes: v({ Service: [40, 0], Ambiance: [20, 0] }),
  },
  {
    title: "Low-rated place with one bright spot",
    note: "Little room below, plenty above. The uniform fit handles the bound without clipping.",
    base: 2.4,
    reviews: 30,
    votes: v({ Value: [14, 0], Drinks: [1, 0], "Menu variety": [0, 2], Ambiance: [0, 6], Service: [0, 9] }),
  },
  {
    title: "Near-perfect place — 4.9",
    note: "Almost no headroom. The fit shrinks every deviation equally so the mean still holds.",
    base: 4.9,
    reviews: 45,
    votes: v({ Service: [25, 0], Ambiance: [8, 0], Value: [0, 7] }),
  },
  {
    title: "Divisive service",
    note: "12 praise it, 12 fault it. They cancel: net 0, so it sits with the unmentioned ones.",
    base: 4.0,
    reviews: 40,
    votes: v({ Service: [12, 12], Drinks: [6, 0] }),
  },
];

const bar = (score) => {
  const filled = Math.round(score * 2);
  return "█".repeat(filled) + "░".repeat(Math.max(0, 10 - filled));
};

console.log(
  `\nPer-category model — CONFIDENCE_K = ${K}, SPREAD = ${SP}, ` +
    `FAULT_WEIGHT = ${FAULT_WEIGHT}, MAX_REACH = ${MAX_REACH}\n`,
);
console.log("  net_i   = (praised − faulted) / reviews       unweighted");
console.log("  d_i     = net_i − mean(net)                   centred, so Σd = 0");
console.log("  a_i     = d_i < 0 ? d_i × FAULT_WEIGHT : d_i  complaints amplified");
console.log("  b_i     = a_i, positives rescaled so Σb = 0");
console.log("  score_i = base + b_i × conf × SPREAD × fit\n");
console.log(`  fit shrinks every deviation equally so the widest uses at most`);
console.log(`  ${MAX_REACH} of the room available — uniform, so the mean survives.\n`);
console.log(`  Below ${MIN_REVIEWS} reviews no scores are returned at all.\n`);

let failures = 0;

for (const s of SCENARIOS) {
  const scored = aspectScores(ASPECTS, s.base, s.votes, s.reviews, K, SP);
  const rated = scored[0].score !== null;
  const ranked = [...scored].sort((a, b) =>
    rated ? b.score - a.score : b.net - a.net,
  );

  console.log("─".repeat(78));
  console.log(s.title);
  console.log(`  ${s.note}`);
  console.log(
    `  rating ${s.base.toFixed(1)}   ${s.reviews} review${s.reviews === 1 ? "" : "s"}   confidence ${(scored[0].confidence * 100).toFixed(0)}%\n`,
  );
  console.log(
    `    ${"category".padEnd(14)} ${"praise".padStart(6)} ${"fault".padStart(6)} ${"net".padStart(7)} ${"dev".padStart(7)}   ${"rating".padStart(6)}`,
  );
  for (const a of ranked) {
    const cells = rated
      ? `${a.score.toFixed(2).padStart(6)}  ${(a.score - s.base >= 0 ? "+" : "") + (a.score - s.base).toFixed(2)}  ${bar(a.score)}`
      : `${"—".padStart(6)}  ${"".padStart(5)}  (no rating yet)`;
    console.log(
      `    ${a.aspect.padEnd(14)} ${String(a.praised).padStart(6)} ${String(a.faulted).padStart(6)}` +
        ` ${a.net.toFixed(3).padStart(7)} ${a.deviation.toFixed(3).padStart(7)}   ${cells}` +
        (a.unremarked ? "  (unmentioned)" : ""),
    );
  }

  /* Two assertions, both by construction rather than by luck:
       1. the row averages to `base` — uniform `fit` and the rebalance preserve it
       2. no category with zero votes sits above `base` — silence is never praise
     If either prints FAIL, that is the part that broke. */
  if (!rated) {
    console.log(`\n    no ratings below the floor — ${s.reviews} of ${MIN_REVIEWS} reviews\n`);
    continue;
  }

  const mean = meanScore(scored);
  const exact = Math.abs(mean - s.base) < 1e-9;
  const silentAbove = scored.filter((a) => a.unremarked && a.score - s.base > 1e-9);
  if (!exact) failures++;
  if (silentAbove.length > 0) failures++;
  console.log(
    `\n    mean of ${scored.length} = ${mean.toFixed(4)}   rating = ${s.base.toFixed(4)}   ` +
      (exact ? "EXACT" : `FAIL, off by ${(mean - s.base).toFixed(4)}`) +
      (silentAbove.length > 0
        ? `   FAIL: ${silentAbove.map((a) => a.aspect).join(", ")} above base on no votes`
        : "   silence never above base") +
      "\n",
  );
}

console.log("─".repeat(78));
console.log(
  failures === 0
    ? "\nEvery scored scenario averages back to the rating, and no unmentioned\n" +
        "category sits above it.\n"
    : `\n${failures} assertion failure(s).\n`,
);
console.log("Try:  node scripts/preview-aspect-scores.mjs --k 8 --spread 2.2\n");
process.exit(failures === 0 ? 0 : 1);
