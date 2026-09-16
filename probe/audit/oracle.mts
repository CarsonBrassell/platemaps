/**
 * Search oracle: generated queries with known right answers, scored against the
 * shipping search (getDiscoverPage + suggest), so "breakfast did not show
 * Broken Yolk" becomes a number that moves when the code moves.
 *
 *   npx tsx --env-file=.env.local probe/audit/oracle.mts                 120 restaurants
 *   npx tsx --env-file=.env.local probe/audit/oracle.mts --sample 400
 *   npx tsx --env-file=.env.local probe/audit/oracle.mts --seed 7 --quiet
 *
 * Read-only. Writes probe/audit/findings/oracle-<ts>.md (pass rates and the
 * worst failures per check), probe/audit/oracle-latest.json (summary plus
 * findings for the triage inbox) and probe/audit/corpus-sample.json (names,
 * cuisines, dishes and neighbourhoods the agent sessions draw their targets
 * from). The test cases are generated from the corpus, never collected from
 * memory: every listed restaurant is a candidate, every night.
 *
 * Checks, and what a failure means to a visitor:
 *   name-exact          typed the name as spelled; not in the top 3
 *   name-lower          lowercase, punctuation dropped; not in the top 3
 *   name-drop-word      left off the last word; not in the top 5
 *   name-swap           two words in the other order; not in the top 3
 *   name-typo           one letter missing; not in the top 5
 *   name-transpose      two adjacent letters swapped; not in the top 5
 *   name-the            leading "The" left off, or and/& swapped; not in top 3
 *   suggest-prefix      typed the first word and two letters; dropdown does not offer it
 *   dish                searched a dish it serves, standing at the door; not in the top 10
 *   cuisine-precision   searched a cuisine word near an anchor; under half of page 1 is that
 *                       canonical cuisine (tag-only rows such as coffee shops tagged
 *                       "Breakfast" do not count)
 *   cuisine-nearby      a restaurant of that cuisine within 1.5 mi is missing from page 1
 *                       while a tag-only, unrelated, or farther row made it
 *
 * What it cannot see: a restaurant that is not in the corpus. "Broken Yolk
 * near SDSU" is that case (six listed, none within five miles); the agents'
 * local-knowledge scenario is the probe for coverage gaps.
 *   cuisine-over-dish   a dish-only match outranks a cuisine match on page 1
 *   neighborhood        searched a neighbourhood; under 90% of page 1 is in it
 *   abbrev (soft)       "broyo"-style shorthand; informational, not a pass/fail
 *   duplicates          two listed rows with the same name within 300 m
 */
import { neon } from "@neondatabase/serverless";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDiscoverPage, loadCorpus } from "../../src/lib/discover";
import { suggest } from "../../src/lib/suggest";
import type { RestaurantView } from "../../src/data/restaurantTypes";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FINDINGS = path.join(HERE, "findings");
const LATEST = path.join(HERE, "oracle-latest.json");
const SAMPLE_FILE = path.join(HERE, "corpus-sample.json");

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const SAMPLE = Number(arg("sample") ?? 120);
const SEED = Number(arg("seed") ?? new Date().toISOString().slice(0, 10).replace(/-/g, ""));
const QUIET = process.argv.includes("--quiet");
const ANCHORS = [
  { name: "SDSU", lat: 32.7757, lng: -117.0719 },
  { name: "Downtown", lat: 32.7157, lng: -117.1611 },
  { name: "Pacific Beach", lat: 32.7978, lng: -117.2395 },
];

/* ---------------------------------------------------------------- utils */

function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(SEED);
const pickN = <T,>(a: readonly T[], n: number): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b.slice(0, n); };
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (s: string) => fold(s).split(" ").filter(Boolean);
const miles = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 3958.8, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i; i += 1; out[k] = await fn(items[k]); } }));
  return out;
}

type Result = { check: string; query: string; expect: string; ok: boolean; rank: number | null; top: string[]; note?: string; soft?: boolean };
const results: Result[] = [];
const seen = new Set<string>();
function record(r: Result) {
  const key = `${r.check}|${r.query}|${r.expect}`;
  if (seen.has(key)) return;
  seen.add(key);
  results.push(r);
}

const STOP = new Set(["the", "and", "bar", "grill", "restaurant", "cafe", "kitchen", "house", "co", "company", "of", "at", "in", "on", "de", "la", "el", "los", "las", "san", "diego"]);

async function search(q: string, here: { lat: number; lng: number } | null, scope?: string) {
  const page = await getDiscoverPage(`?q=${encodeURIComponent(q)}${scope ? `&in=${scope}` : ""}`, { here });
  return page.results;
}
const label = (r: RestaurantView) => `${r.name} [${r.cuisine ?? "-"}${r.matchedDish ? ` / dish:${r.matchedDish.name}` : ""}]`;

async function expectRank(check: string, q: string, r: RestaurantView, maxRank: number, here: { lat: number; lng: number } | null, soft = false) {
  const res = await search(q, here);
  const i = res.findIndex((x) => x.id === r.id);
  const rank = i >= 0 ? i + 1 : null;
  const sameName = i < 0 ? res.findIndex((x) => fold(x.name) === fold(r.name)) : -1;
  record({
    check, query: q, expect: r.name, ok: rank != null && rank <= maxRank, rank,
    top: res.slice(0, 5).map(label),
    note: sameName >= 0 ? `a different row with the same name is at #${sameName + 1} (duplicate?)` : undefined,
    soft,
  });
}

/* --------------------------------------------------------------- checks */

async function nameChecks(r: RestaurantView) {
  const here = { lat: r.lat, lng: r.lng };
  const w = words(r.name);
  await expectRank("name-exact", r.name, r, 3, null);
  if (fold(r.name) !== r.name) await expectRank("name-lower", fold(r.name), r, 3, null);
  if (w.length >= 2) {
    const dropped = w.slice(0, -1).join(" ");
    if (dropped.length >= 4 && !STOP.has(dropped)) await expectRank("name-drop-word", dropped, r, 5, here);
    await expectRank("name-swap", [w[1], w[0], ...w.slice(2)].join(" "), r, 3, null);
  }
  const plain = fold(r.name).replace(/ /g, "");
  if (plain.length >= 6) {
    const s = fold(r.name);
    const cand = [...s].map((c, i) => i).filter((i) => s[i] !== " " && i > 0 && i < s.length - 1);
    const i = cand[Math.floor(rnd() * cand.length)];
    await expectRank("name-typo", s.slice(0, i) + s.slice(i + 1), r, 5, here);
    const j = cand.find((k) => k > i && s[k + 1] && s[k + 1] !== " ") ?? cand[0];
    if (j != null && s[j + 1] && s[j + 1] !== " ") await expectRank("name-transpose", s.slice(0, j) + s[j + 1] + s[j] + s.slice(j + 2), r, 5, here);
  }
  if (/^the\s/i.test(r.name)) await expectRank("name-the", r.name.replace(/^the\s+/i, ""), r, 3, null);
  else if (/&/.test(r.name)) await expectRank("name-the", r.name.replace(/&/g, "and"), r, 3, null);
  else if (/\band\b/i.test(r.name)) await expectRank("name-the", r.name.replace(/\band\b/i, "&"), r, 3, null);
  // Suggest: first word plus two letters of the second, or five letters of a one-word name.
  const prefix = w.length >= 2 ? `${w[0]} ${w[1].slice(0, 2)}` : w[0]?.slice(0, 5);
  if (prefix && prefix.length >= 3 && !STOP.has(w[0])) {
    // The dropdown names the place only when the prefix reads as exactly one
    // restaurant; otherwise it offers a "restaurants" line that opens a scoped
    // search. Pass if the line names it, or if that scoped page has it in the
    // top 3. No restaurant line at all is a fail.
    const ans = await suggest(prefix);
    const scope = ans.scopes.find((s) => s.kind === "restaurant");
    let rank: number | null = null;
    if (scope) {
      if (scope.value === r.id || fold(scope.label) === fold(r.name)) rank = 1;
      else {
        const res = await search(prefix, null, "restaurant");
        const i = res.findIndex((x) => x.id === r.id);
        rank = i >= 0 ? i + 1 : null;
      }
    }
    record({ check: "suggest-prefix", query: prefix, expect: r.name, ok: rank != null && rank <= 3, rank, top: ans.scopes.map((s) => `${s.kind}:${s.label}${s.count != null ? ` (${s.count})` : ""}`).slice(0, 5), note: scope ? undefined : "no restaurant line offered" });
  }
  // Informal shorthand: first three letters + first two of the next word ("broyo"), and initials.
  if (w.length >= 2 && w[0].length >= 3 && w[1].length >= 2 && !STOP.has(w[0])) {
    await expectRank("abbrev", w[0].slice(0, 3) + w[1].slice(0, 2), r, 5, here, true);
  }
}

async function dishCheck(r: RestaurantView, dish: string | null) {
  if (!dish) return;
  await expectRank("dish", dish, r, 10, { lat: r.lat, lng: r.lng });
}

async function cuisineChecks(all: RestaurantView[], cuisines: string[]) {
  const seenWord = new Set<string>();
  for (const cuisine of cuisines) {
    for (const w of words(cuisine).filter((x) => x.length >= 4 && !STOP.has(x))) {
      if (seenWord.has(w)) continue;
      seenWord.add(w);
      // "strong" is the canonical cuisine (a Breakfast & Brunch place for
      // "breakfast"); "weak" adds the tags, where 800-odd coffee shops carry
      // the word Breakfast. A page of weak-only rows is what Calvin saw near
      // SDSU: coffee shops on top, the actual breakfast places nowhere.
      const strong = (r: RestaurantView) => fold(r.cuisine ?? "").split(" ").includes(w);
      const weak = (r: RestaurantView) => strong(r) || fold(r.cuisineTags ?? "").split(" ").includes(w);
      const matches = strong;
      const pool_ = all.filter(strong);
      if (pool_.length < 5) continue;
      for (const a of ANCHORS) {
        const res = await search(w, a);
        const hits = res.filter(strong).length;
        const weakOnly = res.filter((x) => weak(x) && !strong(x)).length;
        const precision = res.length ? hits / res.length : 0;
        record({ check: "cuisine-precision", query: w, expect: `${cuisine} places near ${a.name}`, ok: precision >= 0.5, rank: null, top: res.slice(0, 5).map(label), note: `${hits}/${res.length} on page 1 are ${cuisine}; ${weakOnly} only carry "${w}" as a tag` });
        // A nearby match is "missing" only when something worse took its
        // place: a non-matching row, or a matching row that is farther away.
        // A page of 24 closer matches is the right answer, not a failure.
        const nearby = pool_.map((r) => ({ r, d: miles(a, r) })).filter((x) => x.d <= 1.5).sort((x, y) => x.d - y.d).slice(0, 12);
        const onPage = new Set(res.map((x) => x.id));
        const farthestOnPage = res.filter(matches).reduce((m, x) => Math.max(m, miles(a, x)), 0);
        const intruder = res.find((x) => !strong(x));
        let failed = 0;
        for (const { r, d } of nearby) {
          if (onPage.has(r.id)) continue;
          const displaced = intruder
            ? `#${res.indexOf(intruder) + 1} is ${weak(intruder) ? `tag-only ${label(intruder)}` : `unrelated ${label(intruder)}`}`
            : farthestOnPage > d ? `page 1 holds a ${cuisine} row ${farthestOnPage.toFixed(1)} mi out` : null;
          if (!displaced) continue;
          failed += 1;
          record({ check: "cuisine-nearby", query: w, expect: `${r.name} (${d.toFixed(1)} mi from ${a.name})`, ok: false, rank: null, top: res.slice(0, 5).map(label), note: `${res.length} rows on page 1; ${displaced}` });
        }
        if (nearby.length && !failed) record({ check: "cuisine-nearby", query: w, expect: `the ${nearby.length} ${w} places within 1.5 mi of ${a.name}`, ok: true, rank: null, top: [] });
        const firstDishOnly = res.findIndex((x) => x.matchedDish && !weak(x));
        const lastMatch = res.map((x) => matches(x)).lastIndexOf(true);
        if (firstDishOnly >= 0 && lastMatch > firstDishOnly) {
          record({ check: "cuisine-over-dish", query: w, expect: `${w} places above dish-only matches near ${a.name}`, ok: false, rank: firstDishOnly + 1, top: res.slice(0, 5).map(label), note: `dish-only ${label(res[firstDishOnly])} at #${firstDishOnly + 1}, ${w} row still at #${lastMatch + 1}` });
        } else record({ check: "cuisine-over-dish", query: w, expect: `${w} places above dish-only matches near ${a.name}`, ok: true, rank: null, top: [] });
      }
    }
  }
}

async function neighborhoodChecks(all: RestaurantView[], hoods: string[]) {
  for (const h of hoods) {
    const res = await search(h, null);
    const inHood = res.filter((r) => fold(r.neighborhood) === fold(h)).length;
    const rate = res.length ? inHood / res.length : 0;
    record({ check: "neighborhood", query: h, expect: `places in ${h}`, ok: rate >= 0.9, rank: null, top: res.slice(0, 5).map((r) => `${r.name} [${r.neighborhood}]`), note: `${inHood}/${res.length} on page 1 are in ${h}` });
  }
}

function duplicateCheck(all: RestaurantView[]) {
  const groups = new Map<string, RestaurantView[]>();
  for (const r of all) { const k = fold(r.name); (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
  const dupes: string[] = [];
  for (const [, rows] of groups) {
    if (rows.length < 2) continue;
    for (let i = 0; i < rows.length; i += 1) for (let j = i + 1; j < rows.length; j += 1) {
      if (miles(rows[i], rows[j]) <= 0.2) dupes.push(`${rows[i].name}: ${rows[i].id} / ${rows[j].id} (${rows[i].neighborhood}, ${(miles(rows[i], rows[j]) * 5280).toFixed(0)} ft apart)`);
    }
  }
  return dupes;
}

/* ------------------------------------------------------------------ main */

const t0 = Date.now();
const { restaurants } = await loadCorpus();
const listed = restaurants.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
const sampled = pickN(listed, Math.min(SAMPLE, listed.length));
const forAgents = pickN(listed, 200);
const cuisines = [...new Set(listed.map((r) => r.cuisine).filter((c): c is string => !!c))].sort();
const hoods = [...new Set(listed.map((r) => r.neighborhood).filter(Boolean))];

const sql = neon(process.env.DATABASE_URL!);
const ids = [...new Set([...sampled, ...forAgents].map((r) => r.id))];
const dishRows = (await sql`
  SELECT DISTINCT ON (restaurant_id) restaurant_id, name
  FROM dishes
  WHERE restaurant_id = ANY(${ids}) AND length(name) BETWEEN 6 AND 40 AND name !~ '[0-9]'
  ORDER BY restaurant_id, random()`) as { restaurant_id: string; name: string }[];
const dishOf = new Map(dishRows.map((d) => [d.restaurant_id, d.name]));

if (!QUIET) console.log(`oracle: ${listed.length} listed, sampling ${sampled.length}, seed ${SEED}`);
await pool(sampled, 4, async (r) => { await nameChecks(r); await dishCheck(r, dishOf.get(r.id) ?? null); });
await cuisineChecks(listed, cuisines);
await neighborhoodChecks(listed, pickN(hoods, 25));
const dupes = duplicateCheck(listed);

/* --------------------------------------------------------------- report */

const byCheck = new Map<string, Result[]>();
for (const r of results) (byCheck.get(r.check) ?? byCheck.set(r.check, []).get(r.check)!).push(r);
const prev = existsSync(LATEST) ? JSON.parse(readFileSync(LATEST, "utf8")) : null;
const checks: Record<string, { n: number; pass: number; rate: number; soft: boolean; delta: number | null }> = {};
for (const [name, rs] of byCheck) {
  const pass = rs.filter((r) => r.ok).length;
  const rate = rs.length ? pass / rs.length : 1;
  checks[name] = { n: rs.length, pass, rate, soft: !!rs[0].soft, delta: prev?.checks?.[name] ? rate - prev.checks[name].rate : null };
}

const stampStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const mdFile = `oracle-${stampStr}.md`;
const lines: string[] = [`# Search oracle - ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, "", `Sample ${sampled.length} of ${listed.length} listed, seed ${SEED}, ${results.length} checks in ${Math.round((Date.now() - t0) / 1000)}s.`, "", "| check | n | pass | rate | vs last |", "|---|---|---|---|---|"];
for (const [name, c] of Object.entries(checks)) lines.push(`| ${name}${c.soft ? " (soft)" : ""} | ${c.n} | ${c.pass} | ${(c.rate * 100).toFixed(1)}% | ${c.delta == null ? "-" : `${c.delta >= 0 ? "+" : ""}${(c.delta * 100).toFixed(1)}`} |`);
lines.push("", `Duplicate listed rows (same name within 300 m): ${dupes.length}`, ...dupes.slice(0, 30).map((d) => `- ${d}`), "");
for (const [name, rs] of byCheck) {
  const fails = rs.filter((r) => !r.ok);
  if (!fails.length) continue;
  lines.push(`## ${name}: ${fails.length} failures`, "");
  // At most three per query so one broad word ("american") cannot crowd out
  // the query somebody actually complained about.
  const perQuery = new Map<string, number>();
  const shown = fails.filter((f) => { const n = perQuery.get(f.query) ?? 0; perQuery.set(f.query, n + 1); return n < 3; }).slice(0, 40);
  for (const f of shown) {
    lines.push(`- **"${f.query}"** expected ${f.expect}${f.rank ? ` (found at #${f.rank})` : " (not on page 1)"}${f.note ? ` - ${f.note}` : ""}`);
    if (f.top.length) lines.push(`  got: ${f.top.join(" | ")}`);
  }
  lines.push("");
}
mkdirSync(FINDINGS, { recursive: true });
writeFileSync(path.join(FINDINGS, mdFile), lines.join("\n"));

/* Findings for the triage inbox: one per weak check, plus duplicates. */
const findings: object[] = [];
const THRESH: Record<string, number> = { "name-exact": 0.97, "name-lower": 0.97, "name-drop-word": 0.9, "name-swap": 0.9, "name-typo": 0.85, "name-transpose": 0.85, "name-the": 0.95, "suggest-prefix": 0.85, dish: 0.85, "cuisine-precision": 0.9, "cuisine-nearby": 0.9, "cuisine-over-dish": 0.95, neighborhood: 0.9 };
for (const [name, c] of Object.entries(checks)) {
  const need = THRESH[name];
  if (need == null || c.rate >= need) continue;
  const fails = byCheck.get(name)!.filter((r) => !r.ok).slice(0, 4);
  findings.push({
    severity: c.rate < need - 0.3 ? "major" : "minor",
    area: "search",
    title: `oracle: ${name} passes ${(c.rate * 100).toFixed(0)}% (${c.pass}/${c.n}), floor ${need * 100}%`,
    url: "",
    steps: fails.map((f) => `search "${f.query}" expecting ${f.expect}`),
    expected: `${name} should pass at least ${need * 100}% of generated cases`,
    actual: fails.map((f) => `"${f.query}" -> ${f.rank ? `#${f.rank}` : "absent"}; top: ${f.top.slice(0, 3).join(" | ")}${f.note ? ` (${f.note})` : ""}`).join("\n"),
    evidence: `findings/${mdFile}`,
  });
}
if (dupes.length) findings.push({ severity: "minor", area: "discover", title: `oracle: ${dupes.length} duplicate listed restaurants (same name within 300 m)`, url: "", steps: [], expected: "one row per restaurant", actual: dupes.slice(0, 6).join("\n"), evidence: `findings/${mdFile}` });

writeFileSync(LATEST, JSON.stringify({ ts: new Date().toISOString(), sample: sampled.length, seed: SEED, file: mdFile, checks, duplicates: dupes.length, findings }, null, 1));
writeFileSync(SAMPLE_FILE, JSON.stringify({
  ts: new Date().toISOString(),
  restaurants: forAgents.map((r) => ({ id: r.id, name: r.name, cuisine: r.cuisine, neighborhood: r.neighborhood, lat: r.lat, lng: r.lng, dish: dishOf.get(r.id) ?? null })),
  cuisines, neighborhoods: hoods,
}, null, 1));

if (!QUIET) {
  console.log(lines.slice(4, 6 + Object.keys(checks).length).join("\n"));
  console.log(`\nduplicates: ${dupes.length}   findings: ${findings.length}   -> probe/audit/findings/${mdFile}`);
}
