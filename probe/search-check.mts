/**
 * What Discover returns for a handful of hand-typed queries.
 *
 * Read-only. The calibration sweep (probe/typo-calibrate.mts) proves the floor
 * over thousands of generated typos; this is the other half — a look at the
 * actual page, including the dish half of the query, which the sweep skips
 * because it scores names alone.
 *
 *   npx tsx --env-file=.env.local probe/search-check.mts "kairoa brewng"
 *   npx tsx --env-file=.env.local probe/search-check.mts --near=32.7757,-117.0719 "breakfast"
 */
import { getDiscoverPage } from "../src/lib/discover";

/* --near=lat,lng ranks by distance from there, the way the phone does with location on.
   SDSU is --near=32.7757,-117.0719. Without it the order inside a rung is corpus order. */
const nearArg = process.argv.find((a) => a.startsWith("--near="));
const here = nearArg ? (() => { const [lat, lng] = nearArg.slice(7).split(",").map(Number); return { lat, lng }; })() : null;
const queries = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (queries.length === 0) {
  console.error('usage: search-check.mts "query" ["another query"] ...');
  process.exit(1);
}

for (const q of queries) {
  const page = await getDiscoverPage(`?q=${encodeURIComponent(q)}`, { here });
  console.log(`\n"${q}" -> ${page.total} results, filters.q=${JSON.stringify(page.filters.q)}`);
  for (const [i, r] of page.results.slice(0, 6).entries()) {
    const dish = r.matchedDish ? `  dish:${r.matchedDish.name}` : "";
    console.log(`  ${i + 1}. ${r.name}  [${r.cuisine ?? "-"} / ${r.neighborhood}]${dish}`);
  }
}
