/**
 * Runs the per-aspect scoring model against hand-built scenarios and prints
 * the result, so the model can be judged and tuned before anything in the app
 * depends on it.
 *
 *   node scripts/preview-aspect-scores.mjs
 *   node scripts/preview-aspect-scores.mjs --k 8     # try a different damping
 *
 * Nothing here touches the database.
 */
import { CONFIDENCE_K, aspectScores, bestAspect, weakestAspect } from "../src/lib/aspectScores.ts";
import { BEST_AT_LABELS } from "../src/data/reviewScales.ts";

/** Whichever chips the composer currently offers, scored as-is. */
const ASPECTS = BEST_AT_LABELS;

const kArg = process.argv.indexOf("--k");
const K = kArg !== -1 ? Number(process.argv[kArg + 1]) : CONFIDENCE_K;

/** Sparse votes by aspect name — anything omitted is 0 praise, 0 faults. */
function v(byAspect) {
  return Object.fromEntries(
    Object.entries(byAspect).map(([a, [praised, faulted]]) => [a, { praised, faulted }]),
  );
}

const SCENARIOS = [
  {
    title: "Your example — 4.5 stars, food dominant",
    note: "The case you worked by hand. Your share formula gave food 4.9.",
    overall: 4.5,
    reviews: 20,
    votes: v({ Food: [18, 0], Service: [2, 6], Value: [0, 3] }),
  },
  {
    title: "Genuinely good at everything — 4.6 stars",
    note: "The row a share-of-votes model cannot produce: every voted aspect above the overall.",
    overall: 4.6,
    reviews: 25,
    votes: v({ Food: [9, 0], Service: [7, 0], Ambiance: [6, 1], Value: [3, 0] }),
  },
  {
    title: "Great food, bad service — 3.8 stars",
    note: "The weakness you wanted visible. Service is faulted outright, not inferred from silence.",
    overall: 3.8,
    reviews: 30,
    votes: v({ Food: [21, 1], Service: [1, 17], Ambiance: [4, 2], Value: [3, 4] }),
  },
  {
    title: "Taco stand — 4.1 stars",
    note: "Drinks are never mentioned at a taco stand. They stay unremarked, not bad.",
    overall: 4.1,
    reviews: 24,
    votes: v({ Food: [14, 0], Value: [7, 0], "Menu variety": [3, 0], Ambiance: [0, 5] }),
  },
  {
    title: "Cocktail bar, weak kitchen — 3.9 stars",
    note: "Two aspects pull in opposite directions on the same review pool.",
    overall: 3.9,
    reviews: 26,
    votes: v({ Drinks: [16, 0], Ambiance: [6, 0], Food: [1, 12], Value: [0, 5] }),
  },
  {
    title: "Brand new — 1 review",
    note: "Damping at work. One tap must not pin an aspect to 5.0.",
    overall: 4.0,
    reviews: 1,
    votes: v({ Food: [1, 0] }),
  },
  {
    title: "Same 100% ratio, 40 reviews",
    note: "Identical ratio to the row above, but now the sample earns the move.",
    overall: 4.0,
    reviews: 40,
    votes: v({ Food: [40, 0] }),
  },
  {
    title: "Nobody voted on aspects — 4.2 stars",
    note: "Silence returns the overall rating, and every row is flagged unremarked.",
    overall: 4.2,
    reviews: 12,
    votes: v({}),
  },
  {
    title: "Near-perfect place — 4.95 stars",
    note: "Almost no headroom, so praise barely moves anything. Nothing exceeds 5.",
    overall: 4.95,
    reviews: 22,
    votes: v({ Food: [20, 0], Service: [1, 0], Value: [0, 1] }),
  },
  {
    title: "Widely disliked — 1.6 stars",
    note: "Little room below either. Complaints can't push an aspect under 1.",
    overall: 1.6,
    reviews: 15,
    votes: v({ Food: [1, 9], Service: [0, 4], Ambiance: [6, 0], Value: [0, 2] }),
  },
  {
    title: "Divisive service — 4.0 stars",
    note: "9 praise service, 9 fault it. They cancel: net 0, so it sits at the overall.",
    overall: 4.0,
    reviews: 20,
    votes: v({ Food: [2, 0], Service: [9, 9] }),
  },
];

const bar = (stars) => {
  const filled = Math.round(stars);
  return "█".repeat(filled) + "░".repeat(5 - filled);
};

console.log(`\nPer-aspect scoring model — CONFIDENCE_K = ${K}\n`);
console.log("  score = overall + (5 − overall) × net × conf     when net ≥ 0");
console.log("  score = overall + (overall − 1) × net × conf     when net < 0");
console.log("  net   = (praised − faulted) / reviews      conf = reviews / (reviews + K)\n");

for (const s of SCENARIOS) {
  const scores = aspectScores(ASPECTS, s.overall, s.votes, s.reviews, K);
  const best = bestAspect(scores);
  const weak = weakestAspect(scores);

  console.log("─".repeat(78));
  console.log(`${s.title}`);
  console.log(`  ${s.note}`);
  console.log(`  overall ${s.overall.toFixed(2)}★   ${s.reviews} review${s.reviews === 1 ? "" : "s"}   confidence ${(scores[0].confidence * 100).toFixed(0)}%\n`);
  /* Only aspects anyone actually voted on get a row — this is what the
     restaurant page would show. The rest are named on one muted line, because
     eight rows of "inherits the overall" is noise, and listing them as scores
     would imply they were measured. */
  const voted = scores.filter((a) => !a.unremarked).sort((x, y) => y.stars - x.stars);
  const silent = scores.filter((a) => a.unremarked);

  if (voted.length === 0) {
    console.log("    no aspect votes yet — nothing to show on the page");
  } else {
    console.log(`    ${"aspect".padEnd(13)} ${"praise".padStart(6)} ${"fault".padStart(6)}  ${"net".padStart(6)}   ${"score".padStart(5)}`);
    for (const a of voted) {
      console.log(
        `    ${a.aspect.padEnd(13)} ${String(a.praised).padStart(6)} ${String(a.faulted).padStart(6)}  ${a.net.toFixed(2).padStart(6)}   ${a.stars.toFixed(2).padStart(5)}  ${bar(a.stars)}`,
      );
    }
  }
  if (silent.length > 0) {
    console.log(`\n    not yet rated: ${silent.map((a) => a.aspect).join(", ")}`);
  }

  console.log(
    `\n    best: ${best ? `${best.aspect} (${best.stars.toFixed(2)})` : "— nothing voted on"}` +
      `    weakest: ${weak ? `${weak.aspect} (${weak.stars.toFixed(2)})` : "— nothing faulted"}`,
  );

  /* Does it conserve? If the aspect scores average back to the restaurant's
     own rating, a single high aspect is paid for by the rest and the block
     can't flatter the place overall. Drift is reported both across every
     aspect and across only the voted ones, because the unremarked rows sit
     exactly at the overall and drag any average toward it. */
  const meanAll = scores.reduce((sum, a) => sum + a.stars, 0) / scores.length;
  const meanVoted =
    voted.length > 0 ? voted.reduce((sum, a) => sum + a.stars, 0) / voted.length : null;
  const sign = (n) => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
  console.log(
    `    mean of all ${scores.length}: ${meanAll.toFixed(2)} (${sign(meanAll - s.overall)} vs overall)` +
      (meanVoted === null
        ? ""
        : `    mean of ${voted.length} voted: ${meanVoted.toFixed(2)} (${sign(meanVoted - s.overall)})`) +
      "\n",
  );
}

console.log("─".repeat(78));
console.log("\nTry a different damping with:  node scripts/preview-aspect-scores.mjs --k 8\n");
