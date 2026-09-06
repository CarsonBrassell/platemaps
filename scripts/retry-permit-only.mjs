/**
 * Second lookup for the 404 permit-only rows whose *first* Google lookup
 * (`resolve-places.mjs`, name + street address, via `geocode-permits.mjs`'s
 * `permit-only: no public listing found (DEH ...)` hold) found nothing.
 *
 *   node --env-file=.env.local scripts/retry-permit-only.mjs --dry
 *   node --env-file=.env.local scripts/retry-permit-only.mjs --apply --max-calls 0   # cached-only pass
 *   node --env-file=.env.local scripts/retry-permit-only.mjs --apply --max-calls 404
 *
 * ## Why the query shape has to be different, not just repeated
 *
 * The first attempt was `<name> <street address>` — a Text Search string that
 * only matches when the sign out front and the county's permit name spell the
 * business the same way, or when the address on the permit is written close
 * enough to how Google formats it. A permit-only row is exactly the row where
 * one of those two things is already known to have failed. Repeating the same
 * string against a different endpoint would fail for the same reason.
 *
 * So this asks a different question: `q = "<name>, <city>, CA"` — no street —
 * with `ll = "@<lat>,<lng>,14z"` centring Serper's `/maps` search on the row's
 * own geocoded point instead. Local/maps search ranks by name-similarity plus
 * *proximity to the viewport centre*, not by matching a formatted address
 * string, which lets a business with a slightly different display name still
 * surface at the top because it sits right where the permit's address
 * geocoded to.
 *
 * ## Matching: two independent rules, two different distance caps
 *
 * Serper's `/maps` is a search, not a lookup by id — same situation
 * `sweep-serper.mjs` and `resolve-places.mjs` are in, unlike `enrich-serper.mjs`,
 * which already has a `google_place_id` to check candidates against exactly.
 * Here there is no id yet, only an address and a name, and the two are not
 * equally trustworthy signals:
 *
 *   (a) street number match — the result's address starts with the same
 *       number as the permit's, and the coordinates land within 1.0 km.
 *       A shared street number is a strong, hard-to-fake signal even when the
 *       trade name printed on the permit and the one on the sign are
 *       completely different words (a landlord's name vs. the shop's name),
 *       so this rule can afford a loose 1.0 km leash — the risk of a false
 *       positive is low even a few blocks away, because two different
 *       businesses sharing both a street number *and* rough proximity to the
 *       permit's geocode is rare.
 *   (b) name match — the normalised names are equal or one contains the
 *       other, with no address confirmation at all. Name-only matching is
 *       much easier to get wrong (two unrelated "Taco Shop"s, a mini-chain
 *       with several locations), so it only counts within 400 m — tight
 *       enough that a same-named business a mile away (a different branch,
 *       a coincidence) is correctly rejected as `no-match` instead of merged
 *       into the wrong row.
 *
 * Results are scanned in the order Serper returned them and the first one
 * satisfying either rule wins; every candidate is also required to pass
 * `inCounty` regardless of which rule it satisfies (see "outside San Diego
 * County" note in sweep-serper.mjs's header for why that guard exists at all).
 *
 * ## Chains, food type, duplicates — same rules as everywhere else
 *
 * A name that matches `data/excluded-chains.json` never reaches Serper at
 * all — the pattern-compiling here (groups, per-group `re`, `_allow_ids`
 * bypass) is copied verbatim from `exclude-chains.mjs`, not imported, because
 * that file has no exports; the `excluded: generic chain (<pattern>)` string
 * this writes is deliberately identical so a row held here reads the same as
 * one `exclude-chains.mjs` would have held on its own next run.
 *
 * A matched place whose type fails `isFoodType` (copied from `sweep-serper.mjs`,
 * likewise not exported there) is held `permit-only: not a restaurant
 * (<type>)` rather than cleared — the DEH permit is real, but a landlord's
 * business license or a market's deli counter is not what this directory
 * lists. A matched place id that is already on a *different* row is held
 * `duplicate of <other id>` instead of merged, following `apply-existing.mjs`'s
 * duplicate handling; the in-run `google_place_id` map is updated on every
 * write (not just applied ones) so two permit-only rows that both resolve to
 * the same place inside one run catch each other, dry or not.
 *
 * ## Money and caching — identical discipline to enrich-serper.mjs
 *
 * Same ledger (`data/serper-calls.jsonl`), same SKU (`SerperMaps`), same
 * 3-credits-per-call cost, same `SERPER_BUDGET` env var and default, one
 * shared pool across every Serper script. `--max-calls` defaults to 0, so a
 * bare run never spends. Every response is cached at
 * `data/places-cache/serper_retry_<id>.json` *before* it is matched, and a
 * cache hit is free and reused even under `--dry` — the raw `places` array is
 * what's cached, and matching is re-derived from it on every read, so a rule
 * change above can be re-run at `--max-calls 0` without spending anything.
 *
 * ## Snapshot
 *
 * `hold_reason` and `listed` have no history in this database, so — exactly
 * like `exclude-chains.mjs` and `apply-existing.mjs` — the full target set's
 * `id`/`listed`/`hold_reason` is written to
 * `%TEMP%/claude/deh/retry-permit-only-snapshot-<ts>.json` before the first
 * UPDATE this run makes, whether that first write is a chain hold, a
 * not-a-restaurant hold, a duplicate hold, or a real match.
 *
 * Dated 2026-09-05.
 */

import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { sql } from "./sql-client.mjs";

const SERPER_URL = "https://google.serper.dev/maps";
const SERPER_SKU = "SerperMaps";
/* A /maps call is billed 3 credits — same constant, same value, as
 * enrich-serper.mjs / sweep-serper.mjs. */
const SERPER_CREDITS_PER_CALL = 3;
const SERPER_LEDGER = "data/serper-calls.jsonl";
/* Same env var and default every other Serper script uses — one shared pool. */
const SERPER_BUDGET = Number(process.env.SERPER_BUDGET) || 52500;

const CACHE_DIR = "data/places-cache";
const SNAP_DIR = "C:/Users/CALVIN~1/AppData/Local/Temp/claude/deh";

/** Matches MIN_REVIEWS in blend-ratings.mjs, enrich-google.mjs, enrich-places.mjs,
 * enrich-serper.mjs, import-deh.mjs/deh-rows.mjs, apply-existing.mjs. */
const MIN_REVIEWS = 20;

/* --- chain patterns, copied from exclude-chains.mjs (no exports there) ----- */

const chainCfg = JSON.parse(readFileSync("data/excluded-chains.json", "utf8"));
const chainGroups = Object.entries(chainCfg).filter(([k]) => !k.startsWith("_"));
const chainPatterns = chainGroups.flatMap(([group, list]) =>
  list.map((p) => ({ group, src: p, re: new RegExp(`(^|[^a-z0-9])(?:${p})(?![a-z0-9])`, "i") })),
);
const CHAIN_ALLOW = new Set(chainCfg._allow_ids ?? []);
function chainMatchOf(row) {
  if (CHAIN_ALLOW.has(row.id)) return undefined;
  return chainPatterns.find((p) => p.re.test(row.name));
}

/* --- county + food-type helpers, copied from sweep-serper.mjs (no exports) - */

const SD_COUNTY_BBOX = { minLat: 32.5, maxLat: 33.55, minLng: -117.65, maxLng: -116.0 };
function inCounty(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= SD_COUNTY_BBOX.minLat &&
    lat <= SD_COUNTY_BBOX.maxLat &&
    lng >= SD_COUNTY_BBOX.minLng &&
    lng <= SD_COUNTY_BBOX.maxLng &&
    !(lat > 33.39 && lng < -117.58)
  );
}

const FOOD_TYPES = new Set([
  "restaurant", "cafe", "cafeteria", "coffee_shop", "bar", "bar_and_grill",
  "pub", "bakery", "meal_takeaway", "meal_delivery", "fast_food_restaurant",
  "sandwich_shop", "pizza_restaurant", "ice_cream_shop", "dessert_shop",
  "dessert_restaurant", "donut_shop", "bagel_shop", "juice_shop", "tea_house",
  "brewery", "wine_bar", "food_court", "diner", "deli", "buffet_restaurant",
  "breakfast_restaurant", "brunch_restaurant", "fine_dining_restaurant",
  "steak_house", "seafood_restaurant", "sushi_restaurant", "ramen_restaurant",
  "pizzeria", "barbecue_restaurant", "hamburger_restaurant",
  "chicken_restaurant", "acai_shop", "bubble_tea_store", "juice_bar",
  "frozen_yogurt_shop", "creperie", "poke_bar", "cookie_shop", "coffee_stand",
  "candy_store", "chocolate_shop", "pizza_delivery", "cake_shop",
  "pastry_shop", "salad_shop", "bistro", "sports_bar", "cocktail_bar",
  "hookah_bar", "irish_pub", "beer_garden", "brewpub", "winery", "food",
  "confectionery", "american_restaurant", "african_restaurant",
  "afghani_restaurant", "asian_restaurant", "brazilian_restaurant",
  "chinese_restaurant", "french_restaurant", "greek_restaurant",
  "hamburger_restaurant", "indian_restaurant", "indonesian_restaurant",
  "italian_restaurant", "japanese_restaurant", "korean_restaurant",
  "lebanese_restaurant", "mediterranean_restaurant", "mexican_restaurant",
  "middle_eastern_restaurant", "pizza_restaurant", "spanish_restaurant",
  "thai_restaurant", "turkish_restaurant", "vegan_restaurant",
  "vegetarian_restaurant", "vietnamese_restaurant",
]);
function isFoodType(type) {
  if (!type) return false;
  if (FOOD_TYPES.has(type)) return true;
  return /_restaurant$/.test(type);
}
function normalizeType(label) {
  if (!label) return null;
  return String(label)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/* --- distance, copied from discover-serper.mjs's distanceM ----------------- */

function distanceM(aLat, aLng, bLat, bLng) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR, dLng = (bLng - aLng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* --- name/address matching -------------------------------------------------- */

function streetNumber(addr) {
  const m = String(addr || "").trim().match(/^(\d+)/);
  return m ? m[1] : null;
}
const NAME_STOPWORDS = new Set(["the", "a", "restaurant", "cafe", "grill", "kitchen"]);
function normName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NAME_STOPWORDS.has(w))
    .join(" ")
    .trim();
}
function itemLatLng(item) {
  const lat = item.latitude ?? item.position?.lat ?? null;
  const lng = item.longitude ?? item.position?.lng ?? null;
  return { lat: typeof lat === "number" ? lat : null, lng: typeof lng === "number" ? lng : null };
}

/**
 * First result satisfying rule (a) or (b) — see header. `places` is scanned
 * in Serper's own order; every candidate must also pass `inCounty`.
 */
function pickMatch(row, places) {
  const rowNum = streetNumber(row.address);
  const rowName = normName(row.name);
  const rowTokens = new Set(rowName.split(" ").filter((w) => w.length >= 3));
  for (const item of places ?? []) {
    const { lat, lng } = itemLatLng(item);
    if (lat == null || lng == null || !inCounty(lat, lng)) continue;
    const dist = distanceM(row.lat, row.lng, lat, lng);
    const itemNum = streetNumber(item.address);
    const itemName = normName(item.title);
    const itemTokens = itemName.split(" ").filter((w) => w.length >= 3);
    /* At least one real word in common. Without this, rule (a) hands a closed
     * taco shop the place id of whichever neighbour shares its plaza address —
     * the row keeps the permit's name and displays the neighbour's rating. */
    const sharesToken = itemTokens.some((w) => rowTokens.has(w));
    const ruleA = Boolean(rowNum && itemNum && rowNum === itemNum && dist <= 1000 && sharesToken);
    /* Whole-name agreement, token-bounded so "el" inside "el pescador" and a
     * substring like "place" inside "marketplace" do not count. */
    const shorter = rowName.length <= itemName.length ? rowName : itemName;
    const longer = shorter === rowName ? itemName : rowName;
    const namesAgree =
      Boolean(rowName && itemName) &&
      shorter.length >= 4 &&
      (rowName === itemName || ` ${longer} `.includes(` ${shorter} `));
    const ruleB = namesAgree && dist <= 400;
    if (ruleA || ruleB) return { item, lat, lng, dist, rule: ruleA ? "a" : "b" };
  }
  return null;
}

/* --- flags ------------------------------------------------------------- */

function numFlag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY; /* --dry is the default; the flag exists so intent can be written out. */
const MAX_CALLS = numFlag("max-calls", 0);
const LIMIT = numFlag("limit", Infinity);

if (MAX_CALLS < 0) {
  console.error("--max-calls cannot be negative.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- ledger ------------------------------------------------------------- */

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

const cacheFile = (id) => `${CACHE_DIR}/serper_retry_${String(id).replace(/[^A-Za-z0-9._-]/g, "_")}.json`;

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

/* --- query shape (see header: no street, ll centred on the row's point) ---- */

function serperQueryFor(row) {
  const city = row.city || "San Diego";
  return `${row.name}, ${city}, CA`.replace(/\s+/g, " ").trim();
}
function llFor(row) {
  return `@${Number(row.lat).toFixed(6)},${Number(row.lng).toFixed(6)},14z`;
}

class StopRun extends Error {}
let calls = 0;

/**
 * One Serper `/maps` call for a row, cached before matching is attempted.
 * The cache carries only the raw `places` array — matching is re-derived on
 * every read (see header), so a rule change doesn't invalidate the cache.
 */
async function serperResultFor(row, apiKey) {
  const cached = await readCache(row.id);
  if (cached) return { ...cached, cached: true };

  if (DRY_RUN) return { status: "dry-run", cached: false, places: [] };
  if (calls >= MAX_CALLS) throw new StopRun(`--max-calls ${MAX_CALLS} reached`);

  const q = serperQueryFor(row);
  const ll = llFor(row);
  const started = new Date().toISOString();
  let http = 0, json = null, error = null;
  try {
    const res = await fetch(SERPER_URL, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q, gl: "us", hl: "en", ll }),
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

  const payload = {
    restaurantId: row.id,
    query: q,
    ll,
    fetchedAt: started,
    sku: SERPER_SKU,
    http,
    status: error ? "error" : "ok",
    ...(error ? { error } : {}),
    ...(json?.error ? { serperError: json.error } : {}),
    places,
  };
  await writeCache(row.id, payload);

  if (http === 429) throw new StopRun("Serper returned 429 (quota spent)");
  return { ...payload, cached: false };
}

/* --- run ------------------------------------------------------------------ */

const lines = await ledgerLines();
const spent = creditsSpent(lines);

console.log(`retry-permit-only  ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
console.log(`  Serper credits used (shared pool): ${spent} of ${SERPER_BUDGET}`);
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

const targetRows = await sql`
  SELECT id::text AS id, name, address, city, lat, lng, source_key, listed, hold_reason
  FROM restaurants
  WHERE hold_reason LIKE 'permit-only%' AND google_place_id IS NULL
  ORDER BY id::int`;

const ordered = targetRows.slice(0, LIMIT === Infinity ? undefined : LIMIT);

console.log(
  `\n${targetRows.length} target rows (hold_reason LIKE 'permit-only%%', google_place_id IS NULL).\n` +
    `${ordered.length} in this run's working set.\n`,
);

const known = await sql`SELECT id::text AS id, google_place_id FROM restaurants WHERE google_place_id IS NOT NULL`;
const knownPlaceIds = new Map(known.map((r) => [r.google_place_id, r.id]));

let snapshotWritten = false;
async function ensureSnapshot() {
  if (snapshotWritten || !APPLY) return;
  snapshotWritten = true;
  await mkdir(SNAP_DIR, { recursive: true });
  const snapPath = `${SNAP_DIR}/retry-permit-only-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(
    snapPath,
    JSON.stringify(targetRows.map(({ id, listed, hold_reason }) => ({ id, listed, hold_reason })), null, 1),
  );
  console.log(`snapshot (${targetRows.length} rows): ${snapPath}\n`);
}

const tally = { chain: 0, notFood: 0, matched: 0, duplicate: 0, noMatch: 0, errors: 0 };
let notAttempted = 0;
let fromCache = 0;
let stopped = null;

for (const row of ordered) {
  const line = `  ${row.id.padStart(5)} | ${String(row.name).slice(0, 42).padEnd(42)}`;

  const hit = chainMatchOf(row);
  if (hit) {
    tally.chain += 1;
    const reason = `excluded: generic chain (${hit.src})`;
    if (APPLY) {
      await ensureSnapshot();
      await sql`
        UPDATE restaurants SET hold_reason = ${reason}
        WHERE id = ${row.id} AND hold_reason LIKE 'permit-only%'`;
    }
    console.log(`${line} chain      ${reason}`);
    continue;
  }

  if (!DRY_RUN && calls >= MAX_CALLS && !existsSync(cacheFile(row.id))) {
    notAttempted += 1;
    stopped = stopped ?? `--max-calls ${MAX_CALLS} reached`;
    console.log(`${line} not-attempted  (--max-calls ${MAX_CALLS} reached)`);
    continue;
  }

  let result;
  try {
    result = await serperResultFor(row, apiKey);
  } catch (err) {
    if (err instanceof StopRun) {
      stopped = err.message;
      break;
    }
    tally.errors += 1;
    console.log(`${line} error      ${err.message}`);
    continue;
  }

  if (result.status === "dry-run") {
    notAttempted += 1;
    console.log(`${line} not-attempted  (dry run; would query "${serperQueryFor(row)}" ll=${llFor(row)})`);
    continue;
  }
  if (result.cached) fromCache += 1;
  if (result.status === "error") {
    tally.errors += 1;
    console.log(`${line} error      ${result.error ?? "Serper error"}`);
    continue;
  }

  const found = pickMatch(row, result.places);
  if (!found) {
    tally.noMatch += 1;
    console.log(`${line} no-match   (${(result.places ?? []).length} results${result.cached ? ", cache" : ""})`);
    continue;
  }

  /* The matched Google title is checked against the chain list too: the
   * permit may say "Valley Pkwy Food LLC" while the sign says Starbucks. */
  const titleHit = chainMatchOf({ id: row.id, name: found.item.title ?? "" });
  if (titleHit) {
    tally.chain += 1;
    const reason = `permit-only: not a restaurant (chain premises: ${titleHit.src})`;
    if (APPLY) {
      await ensureSnapshot();
      await sql`
        UPDATE restaurants SET hold_reason = ${reason}
        WHERE id = ${row.id} AND hold_reason LIKE 'permit-only%'`;
    }
    console.log(`${line} chain      ${reason}  (Google title: ${found.item.title})`);
    continue;
  }

  /* Primary `type` only. The secondary `types` list is too generous — a
   * country club lists "Fine dining restaurant" among nine types — and a
   * result with no type at all is an unverified listing, so it is left on its
   * permit hold as no-match rather than given a new one. */
  const type = normalizeType(found.item.type ?? found.item.category ?? null);
  if (!type) {
    tally.noMatch += 1;
    console.log(`${line} no-match   (matched "${found.item.title}" carries no type)`);
    continue;
  }
  if (!isFoodType(type)) {
    tally.notFood += 1;
    const reason = `permit-only: not a restaurant (${type})`;
    if (APPLY) {
      await ensureSnapshot();
      await sql`
        UPDATE restaurants SET hold_reason = ${reason}
        WHERE id = ${row.id} AND hold_reason LIKE 'permit-only%'`;
    }
    console.log(`${line} not-food   ${type}`);
    continue;
  }

  const placeId = found.item.placeId ?? found.item.place_id ?? null;
  if (!placeId) {
    tally.noMatch += 1;
    console.log(`${line} no-match   (matched result carried no placeId)`);
    continue;
  }

  const dupeOf = knownPlaceIds.get(placeId);
  if (dupeOf && dupeOf !== row.id) {
    tally.duplicate += 1;
    const reason = `duplicate of ${dupeOf}`;
    if (APPLY) {
      await ensureSnapshot();
      await sql`
        UPDATE restaurants SET hold_reason = ${reason}
        WHERE id = ${row.id} AND hold_reason LIKE 'permit-only%'`;
    }
    console.log(`${line} duplicate  ${reason}`);
    continue;
  }

  const ratingCount = Number.isFinite(found.item.ratingCount) ? found.item.ratingCount : null;
  const ratingOk = found.item.rating != null && ratingCount != null && ratingCount >= MIN_REVIEWS;
  const rating = ratingOk ? found.item.rating : null;
  const reviewCount = ratingOk ? ratingCount : null;
  const website = found.item.website || null;
  const addr = found.item.address || null;

  tally.matched += 1;
  knownPlaceIds.set(placeId, row.id); // guard a later row in this run matching the same place
  if (APPLY) {
    await ensureSnapshot();
    await sql`
      UPDATE restaurants SET
        google_place_id   = ${placeId},
        rating             = COALESCE(rating, ${rating}),
        review_count       = COALESCE(NULLIF(review_count, 0), ${reviewCount}),
        website            = COALESCE(website, ${website}),
        lat                = ${found.lat},
        lng                = ${found.lng},
        address            = COALESCE(${addr}, address),
        google_checked_at  = now(),
        hold_reason        = NULL
      WHERE id = ${row.id} AND hold_reason LIKE 'permit-only%'`;
  }
  console.log(
    `${line} matched    rule-${found.rule}  ${placeId}  ${Math.round(found.dist)}m` +
      (ratingOk ? `  rating ${rating} (${reviewCount})` : ""),
  );
  if (!result.cached) await sleep(120);
}

/* --- report ---------------------------------------------------------------- */

const afterSpent = creditsSpent(await ledgerLines());

console.log(
  `\n${ordered.length} rows in working set, ${fromCache} answered from cache, ${calls} live calls, ${notAttempted} not attempted.\n`,
);
console.log(
  `  ${tally.chain} chain   ${tally.notFood} not-food   ${tally.matched} matched   ` +
    `${tally.duplicate} duplicate   ${tally.noMatch} no-match   ${tally.errors} errors`,
);
console.log(
  `\nSerper credits: ${spent} -> ${afterSpent} of ${SERPER_BUDGET} shared pool (this run spent ${afterSpent - spent}).`,
);

if (DRY_RUN) {
  console.log("\nDry run — no calls made, nothing written. Re-run with --apply --max-calls N.");
}
if (stopped) console.log(`\nStopped: ${stopped}`);

console.log("\nRun publish-check.mjs next so any newly-eligible row's listed flag gets recomputed:");
console.log("  node --env-file=.env.local scripts/publish-check.mjs");
