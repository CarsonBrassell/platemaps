/**
 * Fills `restaurants.website` from Google results, via Serper, for the rows
 * that arrived without one.
 *
 *   node --env-file=.env.local scripts/find-websites.mjs --dry
 *   node --env-file=.env.local scripts/find-websites.mjs --max-queries 2400
 *
 * ## Why this exists
 *
 * Every cheap extraction tier starts from `restaurants.website`. The router,
 * Firecrawl and Jina all take the site as their input, so a row with no
 * website is not merely slower to extract - it is invisible to all of them and
 * falls through to an agent, which is the most expensive way this project has
 * of learning a restaurant's domain name.
 *
 * The county permit import landed ~2,800 such rows in a day. Under the
 * no-spend rule, Google enrichment fills websites at about a thousand a month,
 * so left alone the router would be starved into the winter while agents burnt
 * their context rediscovering addresses. Serper returns Google's own organic
 * results as an API and gives 2,500 free queries on signup, one-time, no card.
 * One query per restaurant closes the gap in about an hour.
 *
 * ## What this script must never do
 *
 * - **Never buy queries.** The free tier is 2,500 and this script stops at
 *   2,400, counted off a ledger on disk rather than off anything the API says.
 *   `--max-queries` defaults to 0, so a bare run is a no-op: spending has to be
 *   asked for by number, every time.
 * - **Never ask for more than 10 results.** Serper bills one credit per ten.
 *   `num` above 10 silently doubles the cost of the run.
 * - **Never re-query a restaurant that has a cached response.** The raw payload
 *   is written to disk BEFORE anything parses it, so a picker bug costs a
 *   re-parse and not 2,800 credits. Re-runs are free by construction.
 * - **Never overwrite a website.** The UPDATE carries its own emptiness check,
 *   so a row that gained a site between the query and the write keeps it.
 * - **Never add a column, and never touch `scripts/migrate.mjs`.** The
 *   provenance ("this came from Serper, here is what else it saw and why this
 *   one won") lives in `data/serper-found.notes.json`. A `website_source`
 *   column would be a migration for a fact only this script and its report
 *   care about.
 *
 * ## What "the website" means here
 *
 * Not necessarily the restaurant's own domain. An ordering-platform storefront
 * - Toast, Clover, ChowNow, Popmenu, Menufy - counts, and is often the better
 * answer, because the router can read prices off it and cannot read them off a
 * JS-rendered brochure site. What does NOT count is anything that sells
 * somebody else's restaurants: delivery marketplaces, review sites and the
 * directory farms `screen-menus.mjs` already knows about.
 */

import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

/*
 * `verify-coverage.mjs` is owned by another session, but it guards its main
 * body behind an entry-point check precisely so its normalisers can be
 * imported without opening a database connection or rescanning 17,503 permit
 * records. `nameTokens` is the same identifying-word split the permit matcher
 * uses, which is what we want: a result whose title shares no identifying word
 * with the record is about a different restaurant.
 */
import { nameTokens } from "./verify-coverage.mjs";

/* ---------- flags ---------- */

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const num = (name, fallback) => {
  const v = value(name, null);
  return v == null ? fallback : Number(v);
};

const DRY = args.includes("--dry");
const LIMIT = num("limit", Infinity);
const IDS = String(value("ids", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
/*
 * Default 0 on purpose. A run that spends money (here: a finite, unrenewable
 * free allowance) should never be the thing that happens when someone types
 * the script's name to see what it does.
 */
const MAX_QUERIES = num("max-queries", 0);

/** Serper's free tier is 2,500 one-time. Stop with a margin, never buy a pack. */
const BUDGET = 2400;

const CACHE_DIR = "data/serper-cache";
const LEDGER = "data/serper-calls.jsonl";
const NOTES = "data/serper-found.notes.json";
const ENDPOINT = "https://google.serper.dev/search";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const KEY = process.env.SERPER_API_KEY || "";
/*
 * The key is required for live calls and only for live calls. `--dry` has to
 * work before Calvin has created the account, because the plan and the query
 * count are exactly what he needs in order to decide whether to create it.
 */
if (!KEY && !DRY) {
  console.error(
    "SERPER_API_KEY is not set. Live runs need it; re-run with --dry to see the plan without it.",
  );
  process.exit(1);
}

/* ---------- host rules ---------- */

/*
 * BARRED and UNTRUSTED below are COPIED from `scripts/screen-menus.mjs`
 * (which exports nothing, and which this job must not edit). They are the
 * same lists, kept in the same order, minus that file's long commentary - read
 * it there for why each entry is on the list. If screen-menus.mjs grows an
 * entry, this copy should grow the same one; the cost of drift is a directory
 * farm getting written into `website` and then poisoning every downstream
 * extraction that starts from it.
 */
const BARRED = [
  /(^|\.)yelp\.com$/i,
  /(^|\.)yelp\.[a-z.]+$/i,
  /(^|\.)locallya\.com$/i,
  /(^|\.)placejoys\.com$/i,
  /(^|\.)bestcafes\.online$/i,
  /(^|\.)weeblyte\.com$/i,
  /(^|\.)gotoeat\.net$/i,
  /(^|\.)foodjoyy\.com$/i,
];

const UNTRUSTED = [
  /(^|\.)menupedia\./i,
  /(^|\.)allmenus\.com$/i,
  /mojosalesandbranding\.com$/i,
  /(^|\.)menuswithprice\./i,
  /(^|\.)pricelisto\./i,
  /(^|\.)menuandprice/i,
  /(^|\.)restaurantguru\.com$/i,
  /(^|\.)beyondmenu\.com$/i,
];

/*
 * Marketplaces, review sites and reservation books. None of these is wrong
 * about the restaurant - they are simply not the restaurant, and a delivery
 * marketplace URL in `website` marks the row "done" for every tier that starts
 * from it while pointing them all at a menu with a delivery markup on it.
 *
 * Google's own hosts are here because a Google Maps or Business Profile link
 * is what Serper returns when a restaurant has no site at all; writing one
 * would convert "no website" into "a website that no extractor can read".
 */
const MARKETPLACE = [
  /(^|\.)tripadvisor\.[a-z.]+$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)fb\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)google\.[a-z.]+$/i,
  /(^|\.)goo\.gl$/i,
  /(^|\.)mapquest\.com$/i,
  /(^|\.)doordash\.com$/i,
  /(^|\.)ubereats\.com$/i,
  /(^|\.)grubhub\.com$/i,
  /(^|\.)postmates\.com$/i,
  /(^|\.)seamless\.com$/i,
  /(^|\.)foursquare\.com$/i,
  /(^|\.)zomato\.com$/i,
  /(^|\.)opentable\.[a-z.]+$/i,
  /(^|\.)restaurantji\.com$/i,
  /(^|\.)menupix\.com$/i,
];

/*
 * Ordering-platform storefronts. These ARE an acceptable answer: they are
 * per-restaurant pages the restaurant itself set up, and they carry prices in
 * markup the router can already read. A restaurant with only a Toast
 * storefront and no domain is a normal small restaurant, not a gap.
 */
const PLATFORM = [
  /(^|\.)toasttab\.com$/i,
  /(^|\.)toast\.site$/i,
  /(^|\.)cloveronline\.com$/i,
  /(^|\.)clover\.com$/i,
  /(^|\.)chownow\.com$/i,
  /(^|\.)popmenu\.com$/i,
  /(^|\.)menufy\.com$/i,
  /(^|\.)netwaiter\.com$/i,
  /(^|\.)slicelife\.com$/i,
  /(^|\.)square\.site$/i,
  /(^|\.)spoton\.com$/i,
  /(^|\.)owner\.com$/i,
  /(^|\.)olo\.com$/i,
  /(^|\.)order\.online$/i,
];

const hits = (list, host) => list.some((re) => re.test(host));

/* ---------- url canonicalisation ---------- */

/*
 * Tracking parameters only. Dropping the whole query string would be simpler
 * and would break the storefronts that carry a location id in it, which is the
 * half of the result set this script most wants to keep.
 */
const TRACKING = /^(utm_|fbclid|gclid|msclkid|mc_|_ga|ref|referrer|source|si|igshid|yclid)/i;

/** origin + path, tracking stripped, no fragment. Null if it will not parse. */
function canonical(raw) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.username = "";
  u.password = "";
  for (const k of [...u.searchParams.keys()]) {
    if (TRACKING.test(k)) u.searchParams.delete(k);
  }
  u.hostname = u.hostname.toLowerCase();
  // A bare "/" adds nothing and makes two spellings of the same homepage look
  // like two different websites in the notes file.
  let out = u.toString();
  if (u.pathname === "/" && !u.search) out = `${u.origin}`;
  return out;
}

function hostOf(raw) {
  try {
    return new URL(String(raw)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/* ---------- matching ---------- */

/*
 * `nameTokens` strips filler ("THE", "CAFE", "GRILL", "SAN", "DIEGO") and
 * store numbers, which is right for matching and occasionally leaves nothing
 * at all - "The Coffee Shop" reduces to the empty set. A record with no
 * identifying words cannot be confirmed by name, so fall back to its whole
 * words: worse at ignoring filler, but a real check rather than none.
 */
function identifying(name) {
  const tokens = nameTokens(name);
  if (tokens.size) return tokens;
  return new Set(
    String(name || "")
      .toUpperCase()
      .replace(/[^A-Z0-9ÑÁÉÍÓÚ]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 1),
  );
}

/** How many of the record's identifying words appear in a result's text. */
function overlap(tokens, text) {
  const words = identifying(text);
  let shared = 0;
  for (const w of tokens) if (words.has(w)) shared++;
  return shared;
}

/** The street number, which is the cheapest proof a result is THIS branch. */
function streetNumber(address) {
  const m = String(address || "").match(/\b(\d{1,6})\b/);
  return m ? m[1] : null;
}

/** "1234 Main St, San Diego, CA 92101" -> "1234 Main St" */
function streetOnly(address) {
  return String(address || "").split(",")[0].trim();
}

function buildQuery(row) {
  const street = streetOnly(row.address);
  const city = String(row.city || "").trim();
  const parts = [`"${String(row.name || "").trim()}"`];
  if (street) parts.push(street);
  // The address line usually already ends in the city; adding it twice makes
  // the query longer without making it better.
  if (city && !new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(street)) {
    parts.push(city);
  }
  parts.push("CA");
  return parts.join(" ");
}

/**
 * Chooses one result, or none.
 *
 * Ordering is deliberately not "whatever Google put first". Google's first
 * result for a small restaurant is very often Yelp, and its second a delivery
 * app; the first result that is actually the restaurant can be fifth. So
 * position is a tiebreak and the evidence - street number, name in the domain
 * - is what decides.
 */
function pick(row, payload) {
  const tokens = identifying(row.name);
  const number = streetNumber(row.address);
  const organic = Array.isArray(payload?.organic) ? payload.organic : [];
  const candidates = [];

  for (const [i, r] of organic.entries()) {
    const link = r?.link;
    const url = canonical(link);
    const host = hostOf(link);
    const text = `${r?.title || ""} ${r?.snippet || ""}`;
    const c = { url, host, position: r?.position ?? i + 1, title: r?.title ?? null };

    if (!url || !host) {
      candidates.push({ ...c, rejected: "unparseable url" });
      continue;
    }
    if (hits(BARRED, host)) {
      candidates.push({ ...c, rejected: "barred (screen-menus)" });
      continue;
    }
    if (hits(UNTRUSTED, host)) {
      candidates.push({ ...c, rejected: "untrusted (screen-menus)" });
      continue;
    }
    if (hits(MARKETPLACE, host)) {
      candidates.push({ ...c, rejected: "marketplace/aggregator/directory" });
      continue;
    }

    const shared = overlap(tokens, text);
    const platform = hits(PLATFORM, host);
    // The host is evidence too, and often the only evidence: a storefront
    // titled "Order Online" carries the name in `joespizza.toasttab.com`.
    const hostSlug = host.replace(/[^a-z0-9]/g, "").toUpperCase();
    const inHost = [...tokens].filter((w) => w.length > 2 && hostSlug.includes(w)).length;

    if (shared === 0 && inHost === 0) {
      candidates.push({ ...c, rejected: "no identifying word shared with the name" });
      continue;
    }

    const hasNumber = Boolean(number) && new RegExp(`\\b${number}\\b`).test(text);
    const score =
      (hasNumber ? 6 : 0) +
      inHost * 4 +
      shared * 2 +
      (platform ? 2 : 0) +
      Math.max(0, 10 - c.position) * 0.1;

    candidates.push({
      ...c,
      score: Number(score.toFixed(2)),
      shared,
      inHost,
      hasNumber,
      platform,
    });
  }

  const viable = candidates.filter((c) => c.score != null);
  if (viable.length === 0) {
    return { chosen: null, reason: "no-confident-result", candidates };
  }
  viable.sort((a, b) => b.score - a.score || a.position - b.position);
  const best = viable[0];
  const why = [
    best.hasNumber ? `street number ${number} in snippet` : null,
    best.inHost ? "name in domain" : null,
    best.shared ? `${best.shared} name word(s) shared` : null,
    best.platform ? "ordering-platform storefront" : null,
    `position ${best.position}`,
  ].filter(Boolean);
  return { chosen: best.url, reason: why.join("; "), candidates };
}

/* ---------- cache and ledger ---------- */

await mkdir(CACHE_DIR, { recursive: true });

const cached = new Set(
  (await readdir(CACHE_DIR).catch(() => []))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5)),
);

async function ledgerCount() {
  const raw = await readFile(LEDGER, "utf8").catch(() => "");
  return raw.split("\n").filter((l) => l.trim()).length;
}

let spent = await ledgerCount();

/*
 * Refuse to start, rather than stopping partway, when the ASK cannot fit. A
 * run that dies at 2,400 halfway through leaves the operator guessing how much
 * of the queue it covered; a run that refuses at the door leaves the ledger
 * untouched and the number on the screen.
 */
if (!DRY && MAX_QUERIES > 0 && spent + MAX_QUERIES > BUDGET) {
  console.error(
    `Refusing to start: ledger holds ${spent} calls and --max-queries ${MAX_QUERIES} ` +
      `would reach ${spent + MAX_QUERIES}, over the ${BUDGET} cap. ` +
      `At most --max-queries ${Math.max(0, BUDGET - spent)} is available.`,
  );
  process.exit(1);
}

/* ---------- the queue ---------- */

const all = await sql`
  SELECT id, name, address, city, review_count
  FROM restaurants
  WHERE hold_reason IS NULL
    AND coalesce(trim(website), '') = ''
  ORDER BY review_count DESC NULLS LAST`;

let rows = all;
if (IDS.length) {
  const want = new Set(IDS.map(String));
  rows = rows.filter((r) => want.has(String(r.id)));
}
if (Number.isFinite(LIMIT)) rows = rows.slice(0, LIMIT);

const needQuery = rows.filter((r) => !cached.has(String(r.id))).length;

console.log(
  `${all.length} restaurants have no website; this run looks at ${rows.length}` +
    (IDS.length ? ` (--ids ${IDS.length})` : "") +
    (Number.isFinite(LIMIT) ? ` (--limit ${LIMIT})` : "") +
    `.`,
);
console.log(
  `${rows.length - needQuery} already cached (free to re-parse), ${needQuery} would need a live query.`,
);
console.log(
  `ledger ${spent}/${BUDGET} used, ${BUDGET - spent} left; --max-queries ${MAX_QUERIES}` +
    (DRY ? " (--dry: no live calls, no writes)" : "") +
    ".",
);
if (!DRY && MAX_QUERIES === 0 && needQuery > 0) {
  console.log(
    "--max-queries is 0, so nothing will be queried. Pass --max-queries N to spend N credits.",
  );
}

/*
 * The plan, in dry mode: the actual query strings, because the query is the
 * thing worth checking before spending 2,400 of them. A name with a stray
 * "LLC" in it or an address line that already carries the city both show up
 * here and nowhere else.
 */
if (DRY) {
  const plan = rows.filter((r) => !cached.has(String(r.id)));
  console.log(`\nplan - ${plan.length} live queries would be sent, first ${Math.min(20, plan.length)}:`);
  for (const r of plan.slice(0, 20)) console.log(`  ${r.id}  ${buildQuery(r)}`);
  const fromCache = rows.filter((r) => cached.has(String(r.id)));
  if (fromCache.length) {
    console.log(`\n${fromCache.length} re-parsed from cache at no cost.`);
  }
}

/* ---------- run ---------- */

async function serper(query) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "X-API-KEY": KEY, "Content-Type": "application/json" },
      // `num` is never above 10: Serper bills one credit per ten results.
      body: JSON.stringify({ q: query, num: 10 }),
    });
    if (res.ok) return await res.json();
    // 429 and 5xx are worth another go; 401/403 mean the key is wrong and
    // retrying just burns the allowance faster.
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`Serper ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    if (attempt === 3) throw new Error(`Serper ${res.status} after 3 attempts`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  return null;
}

const notes = [];
let queried = 0;
let found = 0;
let unconfident = 0;
let skipped = 0;

for (const row of rows) {
  const id = String(row.id);
  const query = buildQuery(row);
  let payload = null;

  if (cached.has(id)) {
    payload = JSON.parse(await readFile(`${CACHE_DIR}/${id}.json`, "utf8").catch(() => "null"));
  } else if (DRY) {
    skipped++;
    continue;
  } else if (MAX_QUERIES === 0 || queried >= MAX_QUERIES) {
    skipped++;
    continue;
  } else if (spent >= BUDGET) {
    // Stop cleanly rather than throwing: everything already parsed still gets
    // written, and the remaining rows are simply "skipped".
    skipped++;
    continue;
  } else {
    try {
      payload = await serper(query);
    } catch (err) {
      console.error(`  ${id} ${row.name}: ${err instanceof Error ? err.message : err}`);
      skipped++;
      continue;
    }
    // Cache BEFORE parsing. A picker bug then costs a re-parse, not a credit.
    await writeFile(`${CACHE_DIR}/${id}.json`, JSON.stringify(payload, null, 1), "utf8");
    await appendFile(
      LEDGER,
      `${JSON.stringify({ id, ts: new Date().toISOString(), query })}\n`,
      "utf8",
    );
    cached.add(id);
    queried++;
    spent++;
    // Gentle on the endpoint; the run is an hour either way.
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!payload) {
    skipped++;
    continue;
  }

  const { chosen, reason, candidates } = pick(row, payload);
  notes.push({
    restaurantId: id,
    name: row.name,
    chosen,
    source: "serper",
    website_source: "serper",
    reason,
    query,
    candidates,
  });

  if (!chosen) {
    unconfident++;
    continue;
  }
  found++;

  if (!DRY) {
    // The emptiness check rides on the UPDATE itself, so a row that gained a
    // website between the query and this write keeps the one it has.
    await sql`
      UPDATE restaurants
      SET website = ${chosen}
      WHERE id = ${id} AND coalesce(trim(website), '') = ''`;
  }
}

/* ---------- report ---------- */

/*
 * Merge rather than overwrite. The queue is worked in slices - `--limit`, then
 * `--ids` for the ones that came back wrong - and a plain write would leave the
 * notes file holding only the last slice, throwing away the provenance for
 * every restaurant filled before it. Newest entry per restaurant wins.
 */
if (!DRY && notes.length) {
  const prior = await readFile(NOTES, "utf8")
    .then((t) => JSON.parse(t))
    .catch(() => []);
  const byId = new Map(
    (Array.isArray(prior) ? prior : []).map((n) => [String(n?.restaurantId), n]),
  );
  for (const n of notes) byId.set(String(n.restaurantId), n);
  await writeFile(NOTES, JSON.stringify([...byId.values()], null, 1), "utf8");
}

console.log(
  `\nqueried ${queried} (live) / found ${found} / no-confident-result ${unconfident} / skipped ${skipped}`,
);
console.log(`ledger now ${spent}/${BUDGET}.`);
if (!DRY && notes.length) console.log(`merged ${notes.length} entries into ${NOTES}`);
if (DRY) console.log("(--dry: nothing written to the database or to the notes file)");

const sample = notes.filter((n) => n.chosen).slice(0, 20);
if (sample.length) {
  console.log(`\nsample (${sample.length}):`);
  for (const n of sample) console.log(`  ${n.name} -> ${n.chosen}`);
}
const misses = notes.filter((n) => !n.chosen).slice(0, 10);
if (misses.length) {
  console.log(`\nno confident result (${misses.length} of ${unconfident} shown):`);
  for (const n of misses) console.log(`  ${n.name}`);
}
