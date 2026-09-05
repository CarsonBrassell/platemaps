/**
 * Serper-only enrichment: a row that already has a Google place id but no
 * rating, filled in from Serper's `/maps` endpoint instead of a Google Place
 * Details call.
 *
 *   node --env-file=.env.local scripts/enrich-serper.mjs --dry
 *   node --env-file=.env.local scripts/enrich-serper.mjs --apply --max-calls 0   # cached-only pass
 *   node --env-file=.env.local scripts/enrich-serper.mjs --apply --max-calls 50
 *   node --env-file=.env.local scripts/enrich-serper.mjs --apply --max-calls 1219
 *
 * ## Why a new file rather than `--via serper` on enrich-places.mjs
 *
 * enrich-places.mjs is already forked on `--mask` across two Google Place
 * Details SKUs, and every one of its moving parts — the ledger file
 * (`data/google-calls.jsonl`), the cache directory (`data/places-details`),
 * the candidate query (dishes/demo/deh priority buckets), the photo call, the
 * hours conversion — is Google-shaped. Serper's `/maps` returns rating,
 * review count and website in the *search* response with no separate details
 * call, has its own ledger and budget (shared with resolve-places.mjs's
 * `--via serper` and find-websites.mjs, not enrich-places' Google budget),
 * and matches by scanning a result list for our place id rather than fetching
 * a single known id. Threading a third axis through enrich-places.mjs would
 * mean forking `detailsFor`, both cache helpers and the candidate query for a
 * source with an entirely different shape; a second file that mirrors
 * resolve-places.mjs's already-proven `--via serper` section is smaller and
 * cannot regress the Google path.
 *
 * ## What this finishes
 *
 * ~1,219 restaurants (mostly OSM imports) hold a `google_place_id` from
 * resolve-places.mjs or fetch-restaurants.mjs but no rating —
 * enrich-places.mjs would ask Google Place Details Enterprise ($20/1,000
 * after 1,000 free) for the same numbers Serper's Maps search already
 * returns for 3 credits. This spends from the Serper pool instead, so the
 * Google Enterprise budget stays for rows Serper cannot resolve.
 *
 * ## Selection
 *
 * `google_place_id IS NOT NULL AND rating IS NULL AND hold_reason IS NULL`,
 * ordered `listed DESC, id::int` (a text `id` sorts "10" before "2" — see
 * AGENTS.md's note on `sort_order`). Once a row is written here its `rating`
 * is no longer NULL, so a re-run's SELECT already excludes it — no separate
 * "done" flag is needed for the happy path. `google_checked_at` is set only
 * on a placeId match (see below), which also drops the row out of
 * enrich-places.mjs's own candidate query (`AND google_checked_at IS NULL`),
 * so a row Serper resolved is never re-asked of Google Place Details either.
 *
 * ## Money, and what stops it being spent
 *
 * Same one-time, shared Serper credit pool resolve-places.mjs's `--via
 * serper` and find-websites.mjs already spend from — `SERPER_BUDGET` here is
 * the identical env var and default those files use, and the ledger
 * (`data/serper-calls.jsonl`) is the same file, summed regardless of which
 * script wrote a line, on purpose: one pool, one check.
 *
 *  1. `--max-calls` defaults to **0** — no request is made unless a cap is
 *     passed explicitly. A cache hit is still applied at `--max-calls 0`,
 *     which is what makes a `--max-calls 0` pass after a crash free: it
 *     writes every row a prior run already paid for and queries nothing new.
 *  2. Every call is appended to the ledger before the response is looked at.
 *  3. This month's — actually this pool's, Serper credits don't reset
 *     monthly the way Google's do — spend plus the requested cap must stay
 *     under `SERPER_BUDGET`, or the script refuses to start.
 *  4. Every response is cached at `data/places-cache/serper_row_<id>.json`
 *     before it is evaluated, and a row with a cache file is never
 *     re-queried — delete the file to re-ask. A cached error is cached too;
 *     the same file has to be deleted to retry a transient failure, exactly
 *     as enrich-places.mjs's Place Details cache behaves.
 *
 * ## Matching
 *
 * Serper's `/maps` is a search, not a lookup by id, so its result list is
 * scanned for the one entry whose `placeId` (or `place_id`) equals our
 * `google_place_id` — an *exact* id match, never a name/address guess the
 * way resolve-places.mjs's `pickMatch` has to when there is no id yet to
 * check against. No match (empty result, or a result list with none of that
 * id): nothing is written to the row, and the cache records
 * `status: "no-id-match"` so the cache file alone — not `google_checked_at`
 * — is what keeps the row from being re-queried.
 *
 * ## The MIN_REVIEWS floor
 *
 * Matches `MIN_REVIEWS` in blend-ratings.mjs, enrich-google.mjs,
 * enrich-places.mjs and import-deh.mjs/deh-rows.mjs: below 20 reviews a
 * rating is too thin to publish, so `rating` and `review_count` move
 * together and neither is written when the count falls short — the same
 * pairing rule enrich-places.mjs's header spells out for the Google Details
 * column pair, applied here to Serper's `rating`/`ratingCount` pair instead.
 * The raw values are still written to the cache file regardless, so a later
 * change to the floor (or a manual read) doesn't need the call repeated.
 *
 * ## What this will not overwrite
 *
 * Every write is a COALESCE (review_count treats a stored `0` as "not
 * sourced", via `NULLIF(review_count, 0)` — see the long comment in
 * enrich-places.mjs for why that default lies). `website` is written only
 * when ours is NULL, per the brief.
 */

import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { sql } from "./sql-client.mjs";

const SERPER_URL = "https://google.serper.dev/maps";
const SERPER_SKU = "SerperMaps";
/* A /maps call is billed 3 credits — measured by resolve-places.mjs
 * 2026-09-04 ("credits": 3). Not duplicated as a fresh number: this is the
 * same constant, same value. */
const SERPER_CREDITS_PER_CALL = 3;
const SERPER_LEDGER = "data/serper-calls.jsonl";
/* Same env var and same default resolve-places.mjs / find-websites.mjs use —
 * one shared pool, so this must never pick a different number. */
const SERPER_BUDGET = Number(process.env.SERPER_BUDGET) || 52500;

const CACHE_DIR = "data/places-cache";

/** Matches MIN_REVIEWS in blend-ratings.mjs, enrich-google.mjs, enrich-places.mjs, deh-rows.mjs. */
const MIN_REVIEWS = 20;

/* --- flags ------------------------------------------------------------- */

function numFlag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}
function strFlag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY; /* --dry is the default; the flag exists so intent can be written out. */
const MAX_CALLS = numFlag("max-calls", 0);
const LIMIT = numFlag("limit", Infinity);
const ONLY_IDS = strFlag("ids", null);

if (MAX_CALLS < 0) {
  console.error("--max-calls cannot be negative.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- ledger (shared file, shape matches resolve-places.mjs's --via serper) - */

async function ledgerLines() {
  if (!existsSync(SERPER_LEDGER)) return [];
  return (await readFile(SERPER_LEDGER, "utf8")).split("\n").filter((l) => l.trim());
}

function creditsSpent(lines) {
  return lines.reduce((acc, line) => {
    try {
      const e = JSON.parse(line);
      return acc + (Number.isFinite(e.credits) ? e.credits : 1);
    } catch {
      return acc + 1;
    }
  }, 0);
}

async function recordCall(entry) {
  await mkdir("data", { recursive: true });
  await appendFile(SERPER_LEDGER, `${JSON.stringify(entry)}\n`, "utf8");
}

/* --- cache --------------------------------------------------------------- */

const cacheFile = (id) => `${CACHE_DIR}/serper_row_${String(id).replace(/[^A-Za-z0-9._-]/g, "_")}.json`;

async function readCache(id) {
  const path = cacheFile(id);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function writeCache(id, payload) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cacheFile(id), JSON.stringify(payload, null, 1), "utf8");
}

/* --- query --------------------------------------------------------------- */

/** `${name} ${address}, ${city}, CA` — tolerant of a null address or city. */
function serperQueryFor(row) {
  const city = row.city || "San Diego";
  const namePart = [row.name, row.address].filter(Boolean).join(" ");
  return `${namePart}, ${city}, CA`.replace(/\s+/g, " ").trim();
}

class StopRun extends Error {}

let calls = 0;

/**
 * One Serper `/maps` call for a row, cached before it is evaluated.
 *
 * The cache carries the raw `places` array plus the match already worked out
 * against *this* row's `google_place_id` — cheap to redo on every read, but
 * recorded once so a re-run's summary doesn't have to re-derive it.
 */
async function serperResultFor(row, apiKey) {
  const cached = await readCache(row.id);
  if (cached) return { ...cached, cached: true };

  if (DRY_RUN) return { status: "dry-run", cached: false };
  if (calls >= MAX_CALLS) throw new StopRun(`--max-calls ${MAX_CALLS} reached`);

  const q = serperQueryFor(row);
  const started = new Date().toISOString();
  let http = 0;
  let json = null;
  let error = null;
  try {
    const res = await fetch(SERPER_URL, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q, gl: "us", hl: "en" }),
      signal: AbortSignal.timeout(20_000),
    });
    http = res.status;
    const text = await res.text();
    json = text ? JSON.parse(text) : {};
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err.message;
  }
  calls += 1;

  const places = json?.places ?? [];
  /* Ledger first, always — a call that happened and was not recorded is a
   * call the shared-pool check cannot see. Same line shape resolve-places.mjs
   * writes: query, credits (off Serper's own response when present, else the
   * worst case of 1), result count, timestamp. */
  await recordCall({
    ts: started,
    sku: SERPER_SKU,
    query: q,
    sourceKey: row.source_key ?? null,
    restaurantId: row.id,
    credits: Number.isFinite(json?.credits) ? json.credits : 1,
    results: places.length,
    ...(error ? { error } : {}),
  });

  const match = error
    ? null
    : places.find((p) => String(p.placeId ?? p.place_id ?? "") === row.google_place_id);
  const status = error ? "error" : match ? "matched" : "no-id-match";

  const payload = {
    restaurantId: row.id,
    googlePlaceId: row.google_place_id,
    query: q,
    fetchedAt: started,
    sku: SERPER_SKU,
    http,
    status,
    ...(error ? { error } : {}),
    ...(json?.error ? { serperError: json.error } : {}),
    places,
    match: match ?? null,
  };
  await writeCache(row.id, payload);

  if (http === 429) throw new StopRun("Serper returned 429 (quota spent)");
  return { ...payload, cached: false };
}

/* --- run ------------------------------------------------------------------ */

const lines = await ledgerLines();
const spent = creditsSpent(lines);

console.log(`enrich-serper  ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
console.log(
  `  Serper credits used (shared pool, resolve-places.mjs + find-websites.mjs): ${spent} of ${SERPER_BUDGET}`,
);
console.log(`  --max-calls: ${MAX_CALLS}${MAX_CALLS === 0 ? "  (default — no request will be made)" : ""}`);

if (spent + MAX_CALLS * SERPER_CREDITS_PER_CALL > SERPER_BUDGET) {
  console.error(
    `\nRefusing to run: ${spent} + ${MAX_CALLS} x ${SERPER_CREDITS_PER_CALL} credits = ` +
      `${spent + MAX_CALLS * SERPER_CREDITS_PER_CALL} would pass the ${SERPER_BUDGET}-credit shared pool.`,
  );
  console.error("Lower --max-calls, or account for what the other Serper scripts have already spent.");
  process.exit(1);
}

let apiKey = "";
if (!DRY_RUN) {
  apiKey = process.env.SERPER_API_KEY || "";
  if (MAX_CALLS > 0 && !apiKey) {
    console.error("\nSERPER_API_KEY is not set. Re-run with --env-file=.env.local");
    process.exit(1);
  }
}

const wantedIds = ONLY_IDS
  ? new Set(ONLY_IDS.split(",").map((s) => s.trim()).filter(Boolean))
  : null;

const all = await sql`
  SELECT r.id::text AS id, r.name, r.address, r.city, r.source_key,
         r.google_place_id, r.website
  FROM restaurants r
  WHERE r.google_place_id IS NOT NULL
    AND r.rating IS NULL
    AND r.hold_reason IS NULL
  ORDER BY r.listed DESC, r.id::int`;

const pool = wantedIds ? all.filter((r) => wantedIds.has(r.id)) : all;
const ordered = pool.slice(0, LIMIT === Infinity ? undefined : LIMIT);

console.log(
  `\n${all.length} rows eligible (google_place_id present, rating NULL, no hold).\n` +
    (wantedIds ? `${pool.length} named by --ids.\n` : "") +
    `${ordered.length} in this run's working set.\n`,
);

const tally = {
  seen: 0,
  fromCache: 0,
  matched: 0,
  noIdMatch: 0,
  updated: 0,
  underFloor: 0,
  errors: 0,
};
let stopped = null;

for (const row of ordered) {
  if (!DRY_RUN && calls >= MAX_CALLS && !existsSync(cacheFile(row.id))) {
    stopped = `--max-calls ${MAX_CALLS} reached`;
    break;
  }

  const line = `  ${row.id.padStart(4)} ${String(row.name).slice(0, 40).padEnd(40)}`;

  try {
    const result = await serperResultFor(row, apiKey);
    tally.seen += 1;
    if (result.cached) tally.fromCache += 1;

    if (result.status === "dry-run") {
      console.log(`${line} would call Serper /maps: ${serperQueryFor(row)}`);
      continue;
    }
    if (result.status === "error") {
      tally.errors += 1;
      console.log(`${line} ! ${result.error ?? "Serper error"}`);
      continue;
    }
    if (result.status === "no-id-match") {
      tally.noIdMatch += 1;
      console.log(`${line} ${result.cached ? "[cache] " : ""}no placeId match (${result.places?.length ?? 0} results) — nothing written`);
      continue;
    }

    /* status === "matched" */
    tally.matched += 1;
    const m = result.match;
    const ratingCount = Number.isFinite(m.ratingCount) ? m.ratingCount : null;
    const ratingOk = m.rating != null && ratingCount != null && ratingCount >= MIN_REVIEWS;
    const rating = ratingOk ? m.rating : null;
    const reviewCount = ratingOk ? ratingCount : null;
    const website = m.website || null;
    if (!ratingOk) tally.underFloor += 1;

    if (!DRY_RUN) {
      await sql`
        UPDATE restaurants SET
          google_checked_at = now(),
          rating       = COALESCE(rating, ${rating}),
          review_count = COALESCE(NULLIF(review_count, 0), ${reviewCount}),
          website      = COALESCE(website, ${website})
        WHERE id = ${row.id}`;
      tally.updated += 1;
    }

    const gained = [];
    if (ratingOk) gained.push(`rating ${rating} (${reviewCount})`);
    else gained.push(ratingCount == null ? "no rating" : `only ${ratingCount} reviews`);
    if (row.website == null && website) gained.push("website");
    console.log(`${line} ${result.cached ? "[cache] " : ""}${gained.join(", ")}`);
    if (!result.cached) await sleep(120);
  } catch (err) {
    if (err instanceof StopRun) {
      stopped = err.message;
      break;
    }
    tally.errors += 1;
    console.log(`${line} ! ${err.message}`);
  }
  if (stopped) break;
}

/* --- report ---------------------------------------------------------------- */

const afterSpent = creditsSpent(await ledgerLines());

console.log(`\n${tally.seen} rows examined (${tally.fromCache} answered from cache, ${calls} live calls).`);
console.log(
  `  ${tally.matched} matched   ${tally.noIdMatch} no-id-match   ` +
    `${tally.updated} rows updated   ${tally.underFloor} matched but under the ${MIN_REVIEWS}-review floor   ` +
    `${tally.errors} errors`,
);
console.log(
  `\nSerper credits: ${spent} -> ${afterSpent} of ${SERPER_BUDGET} shared pool (this run spent ${afterSpent - spent}).`,
);

if (DRY_RUN) {
  console.log("\nDry run — no calls made, nothing written. Re-run with --apply --max-calls N.");
}
if (stopped) console.log(`\nStopped: ${stopped}`);
