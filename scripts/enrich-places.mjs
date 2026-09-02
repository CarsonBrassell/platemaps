/**
 * Stage 04: gives a row that already has a Google place id the four things the
 * listing gate wants — a rating, a review count, a photo — plus a website and
 * opening hours on the way past.
 *
 *   node --env-file=.env.local scripts/enrich-places.mjs --dry --limit 20
 *   node --env-file=.env.local scripts/enrich-places.mjs --apply --max-calls 5
 *   node --env-file=.env.local scripts/enrich-places.mjs --apply --max-calls 940
 *   node --env-file=.env.local scripts/enrich-places.mjs --apply --ids 6036,6968
 *
 * ## What this finishes
 *
 * `import-deh.mjs` inserted 2,431 rows from the county permit list with a name,
 * an address, a pin and a `google_place_id` — and nothing else. Every one of
 * them fails `publish-check.mjs`, which needs `rating`, `review_count`,
 * `lat`/`lng` and a `photo` before a row may appear on the site. The pin and
 * the place id came from `resolve-places.mjs` (Text Search Pro); the rest lives
 * behind Place Details, which is a different SKU and a different call. This is
 * that call.
 *
 * It is deliberately NOT `fetch-google.mjs`. That script searches for a place
 * it has no id for, and pays Text Search Enterprise ($35/1,000) to do it. Here
 * the id is already known and correct, so a Place Details lookup ($20/1,000,
 * 1,000 free a month) answers the same question for less — the split
 * `enrich-google.mjs` documents. Every field this writes is stored in exactly
 * the shape `fetch-google.mjs` stores it, because two scripts writing the same
 * column two ways is how a corpus stops being readable.
 *
 * ## Money, and the four things that stop it being spent
 *
 * **Calvin's rule is that this costs nothing.** Two SKUs are touched and both
 * have a 1,000-a-month free allowance:
 *
 *   Place Details **Enterprise**  $20/1,000 after 1,000 free
 *     — `rating`, `userRatingCount`, `websiteUri`, `regularOpeningHours` and
 *       `nationalPhoneNumber` are all Enterprise fields; asking for one bills
 *       the whole call at Enterprise, so there is no saving in trimming the
 *       list. `photos` and `businessStatus` are Pro-tier and ride along on the
 *       same call for no extra charge, which is why the photo reference costs
 *       nothing to obtain — only fetching the image does.
 *   Place **Photo** media       $7/1,000 after 1,000 free
 *
 *  1. `--max-calls` defaults to **0**, per SKU. With no cap the script reads
 *     the cache, reports what it already knows and makes no request at all.
 *  2. Every call is appended to `data/google-calls.jsonl` — the same ledger
 *     `resolve-places.mjs` writes, same row shape — before the next one goes
 *     out. That file, not a counter in memory, is what the monthly check reads,
 *     so it survives a crash, a re-run and a second terminal.
 *  3. This month's calls **for that SKU** plus the requested cap must stay
 *     under MONTHLY_BUDGET (950 of the 1,000 free). Over that, the script
 *     refuses to start rather than trimming the cap quietly.
 *  4. Every response is written to `data/places-details/<place id>.json`
 *     before anything is decided about it, and a place with a cache file is
 *     never requested again. Re-running the matching or the write rules over
 *     the whole corpus therefore costs zero calls. Delete a cache file to
 *     re-ask.
 *
 * Text Search is not touched here at all. That SKU is at 4,540 of its 5,000
 * free calls for September and this stage has no reason to search — it holds
 * the id already.
 *
 * ## Order of work
 *
 * (a) rows that already have dishes, because a chain-shared or router-extracted
 *     menu is sitting on them and enrichment is the only thing between that
 *     menu and a visitor; (b) the demo restaurants by name; (c) the imported
 *     `deh:` rows, round-robined across neighborhoods so the map fills evenly
 *     instead of one district at a time; (d) everything else.
 *
 * ## What it will not overwrite
 *
 * Nothing that is already there. Every write is a COALESCE, and `rating` has a
 * floor on top of that: below MIN_REVIEWS Google reviews the number is too thin
 * to present as a sourced rating, so it stays NULL and the row stays unlisted.
 * That floor is `blend-ratings.mjs`'s and `enrich-google.mjs`'s, deliberately —
 * three scripts disagreeing about what counts as a real rating would put three
 * standards on one grid.
 */

import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { sql } from "./sql-client.mjs";

const DETAIL_URL = "https://places.googleapis.com/v1/places";

/**
 * Exactly the fields stage 04 needs, and no more.
 *
 * `rating`, `userRatingCount`, `websiteUri`, `regularOpeningHours` and
 * `nationalPhoneNumber` are Enterprise; `id`, `businessStatus` and `photos` are
 * Pro and ride along free because billing is at the highest tier requested.
 * Adding a field cannot make this cheaper and can make it dearer — do not.
 */
const FIELD_MASK =
  "id,rating,userRatingCount,websiteUri,regularOpeningHours,nationalPhoneNumber,businessStatus,photos";

const SKU_DETAILS = "PlaceDetailsEnterprise";
const SKU_PHOTO = "PlacePhoto";

const LEDGER = "data/google-calls.jsonl";
const CACHE_DIR = "data/places-details";

/** Google gives 1,000 of each SKU free per calendar month. This leaves 50 spare. */
const MONTHLY_BUDGET = 950;
const MONTHLY_FREE = 1000;
const COST_PER_1K = { [SKU_DETAILS]: 20, [SKU_PHOTO]: 7 };

/**
 * Below this a Google rating is too thin to present as a sourced number.
 * Matches `MIN_REVIEWS` in blend-ratings.mjs and enrich-google.mjs.
 */
const MIN_REVIEWS = 20;

/** The width the photo endpoint is asked for, and therefore the stored width. */
const PHOTO_MAX_WIDTH = 1200;

/**
 * The six restaurants Calvin and Carson demo to investors. Five were missing
 * from the corpus entirely until the permit import; whichever of them are in
 * the table go first, after the rows that already carry a menu.
 */
const DEMO_NAMES = [
  "Del Cerro Pizza and Beer",
  "Clems Station",
  "The Duke Cocktails and Grub",
  "Chamorro Grill",
  "KNB Bistro",
  "The Other Side Bar and Grill",
];

/* --- flags ---------------------------------------------------------------- */

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
/* --dry is the default and is accepted only so the intent can be written out. */
const DRY_RUN = !APPLY;
const MAX_CALLS = numFlag("max-calls", 0);
const LIMIT = numFlag("limit", Infinity);
const ONLY_IDS = strFlag("ids", null);

if (MAX_CALLS < 0) {
  console.error("--max-calls cannot be negative.");
  process.exit(1);
}

/* --- credentials ---------------------------------------------------------- */

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}
const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) {
  console.error("GOOGLE_PLACES_API_KEY is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}
/*
 * Check the key's shape before spending it, exactly as enrich-google.mjs does.
 * The Yelp key slot in this repo once held a Postgres connection string and
 * seventy requests sent a database password to a third party before anyone
 * looked at the value.
 */
if (!/^AIza[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
  console.error(
    `GOOGLE_PLACES_API_KEY does not look like a Google key (got ${apiKey.length} characters; ` +
      `expected ~39 beginning "AIza"). Refusing to send it.`,
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- ledger (shape shared with resolve-places.mjs) ------------------------ */

async function ledgerEntries() {
  if (!existsSync(LEDGER)) return [];
  const text = await readFile(LEDGER, "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function recordCall(entry) {
  await mkdir("data", { recursive: true });
  await appendFile(LEDGER, `${JSON.stringify(entry)}\n`, "utf8");
}

const thisMonth = () => new Date().toISOString().slice(0, 7);

const countSku = (ledger, sku, month) =>
  ledger.filter((e) => e.sku === sku && String(e.ts).startsWith(month)).length;

/* --- cache ---------------------------------------------------------------- */

/* Place ids are already filename-safe, but a stray character must never be
 * able to write outside the cache directory. */
const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, "_");
const detailFile = (placeId) => `${CACHE_DIR}/${safe(placeId)}.json`;
const photoFile = (placeId) => `${CACHE_DIR}/${safe(placeId)}.photo.json`;

async function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/* --- hours ---------------------------------------------------------------- */

/**
 * `regularOpeningHours.periods` into the shape the site stores, character for
 * character the same conversion `fetch-google.mjs` does.
 *
 * Google numbers days 0 = Sunday; the table is 0 = Monday, the convention
 * fetch-hours.mjs established from Yelp. Converting on the way in keeps one
 * convention in the database rather than two that can disagree.
 */
function hoursFrom(regular) {
  const periods = regular?.periods;
  if (!periods?.length) return null;

  const slots = [];
  for (const p of periods) {
    if (!p.open) continue;
    // A 24-hour place has an open with no close.
    if (!p.close) {
      slots.push({ day: (p.open.day + 6) % 7, start: "0000", end: "2359" });
      continue;
    }
    const pad = (h, m) => `${String(h).padStart(2, "0")}${String(m ?? 0).padStart(2, "0")}`;
    slots.push({
      day: (p.open.day + 6) % 7,
      start: pad(p.open.hour, p.open.minute),
      end: pad(p.close.hour, p.close.minute),
      ...(p.close.day !== p.open.day ? { overnight: true } : {}),
    });
  }
  return slots.length > 0 ? slots : null;
}

/* --- calls ---------------------------------------------------------------- */

class StopRun extends Error {}

let detailCalls = 0;
let photoCalls = 0;

/**
 * One Place Details call, cached and ledgered.
 *
 * The cache is written before the response is looked at, so a crash inside the
 * write rules never costs the call again.
 */
async function detailsFor(row) {
  const cached = await readJson(detailFile(row.google_place_id));
  if (cached) return { place: cached.place ?? null, cached: true, error: cached.error ?? null };

  if (DRY_RUN) return { place: null, cached: false, error: "dry run" };
  if (detailCalls >= MAX_CALLS) throw new StopRun(`--max-calls ${MAX_CALLS} reached (details)`);

  const started = new Date().toISOString();
  let http = null;
  let json = null;
  let error = null;
  try {
    const res = await fetch(`${DETAIL_URL}/${encodeURIComponent(row.google_place_id)}`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
      signal: AbortSignal.timeout(20_000),
    });
    http = res.status;
    const text = await res.text();
    json = text ? JSON.parse(text) : {};
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err.message;
  }
  detailCalls += 1;

  /* Ledger first, always. A call that happened and was not recorded is a call
   * the monthly budget check cannot see. */
  await recordCall({
    ts: started,
    sku: SKU_DETAILS,
    query: row.google_place_id,
    sourceKey: row.source_key ?? null,
    restaurantId: row.id,
    http,
    results: json?.id ? 1 : 0,
    ...(error ? { error } : {}),
  });

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(
    detailFile(row.google_place_id),
    JSON.stringify(
      {
        placeId: row.google_place_id,
        restaurantId: row.id,
        fetchedAt: started,
        sku: SKU_DETAILS,
        fieldMask: FIELD_MASK,
        ...(error ? { error } : {}),
        place: error ? null : json,
        ...(json?.error ? { googleError: json.error } : {}),
      },
      null,
      1,
    ),
    "utf8",
  );

  if (http === 429) throw new StopRun("Google returned 429 on Place Details (quota spent)");
  return { place: error ? null : json, cached: false, error };
}

/**
 * A displayable image URL for a photo reference, cached and ledgered.
 *
 * `skipHttpRedirect` is what makes the result storable at all. Without it the
 * endpoint 302s to the image and the only URL we could keep would be the
 * request URL — which carries the API key and would be served to every visitor
 * in the page source. With it, Google answers with JSON containing a `photoUri`
 * on googleusercontent.com that needs no key.
 */
async function photoUriFor(row, photo) {
  const cached = await readJson(photoFile(row.google_place_id));
  if (cached) return { uri: cached.photoUri ?? null, cached: true };

  if (DRY_RUN) return { uri: null, cached: false };
  if (photoCalls >= MAX_CALLS) throw new StopRun(`--max-calls ${MAX_CALLS} reached (photo)`);

  const started = new Date().toISOString();
  let http = null;
  let json = null;
  let error = null;
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/${photo.name}/media` +
        `?maxWidthPx=${PHOTO_MAX_WIDTH}&skipHttpRedirect=true&key=${apiKey}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    http = res.status;
    const text = await res.text();
    json = text ? JSON.parse(text) : {};
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err.message;
  }
  photoCalls += 1;

  await recordCall({
    ts: started,
    sku: SKU_PHOTO,
    query: photo.name,
    sourceKey: row.source_key ?? null,
    restaurantId: row.id,
    http,
    results: json?.photoUri ? 1 : 0,
    ...(error ? { error } : {}),
  });

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(
    photoFile(row.google_place_id),
    JSON.stringify(
      {
        placeId: row.google_place_id,
        photoName: photo.name,
        fetchedAt: started,
        sku: SKU_PHOTO,
        maxWidthPx: PHOTO_MAX_WIDTH,
        widthPx: photo.widthPx ?? null,
        heightPx: photo.heightPx ?? null,
        ...(error ? { error } : {}),
        photoUri: json?.photoUri ?? null,
      },
      null,
      1,
    ),
    "utf8",
  );

  if (http === 429) throw new StopRun("Google returned 429 on Place Photo (quota spent)");
  return { uri: json?.photoUri ?? null, cached: false };
}

/**
 * The pixel size of the image that URL actually serves.
 *
 * Neither Yelp nor Google hands dimensions back with a photo URL, which is why
 * `backfill-photo-size.mjs` exists — but the `photos` entry on the Details
 * response carries the original `widthPx`/`heightPx`, and the media endpoint
 * scales the long edge down to `maxWidthPx`. So the served size is derivable
 * here for free, and the row lands complete instead of waiting for a second
 * pass. A photo narrower than the cap is served unscaled.
 *
 * Returns null when Google omitted the original size, which leaves the columns
 * NULL for backfill-photo-size.mjs to measure — the state every newly imported
 * restaurant is already in.
 */
function servedSize(photo) {
  const w = photo?.widthPx;
  const h = photo?.heightPx;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  if (w <= PHOTO_MAX_WIDTH) return { w, h };
  return { w: PHOTO_MAX_WIDTH, h: Math.round((h * PHOTO_MAX_WIDTH) / w) };
}

/* --- candidate selection -------------------------------------------------- */

/** Loose name match for the demo list: case, punctuation and "and"/"&" folded. */
function demoKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    /* Apostrophes are deleted rather than spaced, so a possessive stays one
     * word: "Clem's Station" has to meet the demo list's "Clems Station".
     * Spacing them gives "clem s station", which starts with neither. */
    .replace(/['‘’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const DEMO_KEYS = DEMO_NAMES.map(demoKey);

function isDemo(name) {
  const k = demoKey(name);
  return DEMO_KEYS.some((d) => k === d || k.startsWith(`${d} `) || d.startsWith(`${k} `));
}

/**
 * Interleave rows one neighborhood at a time.
 *
 * A plain `ORDER BY id` walks the permit import in the order the county filed
 * it, which is close enough to alphabetical-by-district that a 940-row run
 * would light up North County Inland and leave the rest of the map dark. The
 * budget is a month's worth of listings, so it should be spread over the city
 * a visitor might actually be standing in.
 */
function roundRobinByNeighborhood(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = r.neighborhood ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  /* Largest group first so the interleave stays even as small groups run out. */
  const queues = [...groups.values()].sort((a, b) => b.length - a.length);
  const out = [];
  for (let i = 0; out.length < rows.length; i++) {
    for (const q of queues) if (i < q.length) out.push(q[i]);
  }
  return out;
}

/* --- run ------------------------------------------------------------------ */

const ledger = await ledgerEntries();
const month = thisMonth();
const before = {
  [SKU_DETAILS]: countSku(ledger, SKU_DETAILS, month),
  [SKU_PHOTO]: countSku(ledger, SKU_PHOTO, month),
};

console.log(`enrich-places  ${DRY_RUN ? "DRY RUN" : "APPLY"}  month ${month}`);
for (const sku of [SKU_DETAILS, SKU_PHOTO]) {
  console.log(
    `  ${sku.padEnd(22)} ${String(before[sku]).padStart(4)} calls used of ` +
      `${MONTHLY_BUDGET} budgeted (${MONTHLY_FREE} free, then $${COST_PER_1K[sku]}/1,000)`,
  );
}
console.log(`  --max-calls: ${MAX_CALLS} per SKU${MAX_CALLS === 0 ? "  (default — no request will be made)" : ""}`);

for (const sku of [SKU_DETAILS, SKU_PHOTO]) {
  if (before[sku] + MAX_CALLS > MONTHLY_BUDGET) {
    console.error(
      `\nRefusing to run: ${before[sku]} + ${MAX_CALLS} = ${before[sku] + MAX_CALLS} would pass the ` +
        `${MONTHLY_BUDGET}-call budget for ${sku} in ${month}.`,
    );
    console.error(
      `Past ${MONTHLY_FREE} free calls this SKU costs $${COST_PER_1K[sku]} per 1,000. ` +
        `Wait for the next calendar month or lower --max-calls.`,
    );
    process.exit(1);
  }
}

const wantedIds = ONLY_IDS
  ? new Set(ONLY_IDS.split(",").map((s) => s.trim()).filter(Boolean))
  : null;

/*
 * `--ids` names rows deliberately, so it relaxes the "never checked, still
 * missing something" test that drives an unattended run. Naming a row that was
 * already enriched is how a write rule gets re-applied after a fix — and it
 * costs nothing, because the cached Details response answers it without a call.
 * Every write is still a COALESCE, so a re-run cannot displace anything.
 */
const all = wantedIds
  ? await sql`
      SELECT r.id::text AS id, r.name, r.neighborhood, r.source_key, r.google_place_id,
             r.rating, r.review_count, r.website, r.hours, r.photo, r.photo_w, r.photo_h,
             EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id) AS has_dishes
      FROM restaurants r
      WHERE r.hold_reason IS NULL AND r.google_place_id IS NOT NULL
      ORDER BY r.id::int`
  : await sql`
      SELECT r.id::text AS id, r.name, r.neighborhood, r.source_key, r.google_place_id,
             r.rating, r.review_count, r.website, r.hours, r.photo, r.photo_w, r.photo_h,
             EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id) AS has_dishes
      FROM restaurants r
      WHERE r.hold_reason IS NULL
        AND r.google_place_id IS NOT NULL
        AND (r.rating IS NULL OR r.photo IS NULL OR r.photo = '')
        AND r.google_checked_at IS NULL
      ORDER BY r.id::int`;

const pool = wantedIds ? all.filter((r) => wantedIds.has(r.id)) : all;

/* Priority buckets. Each row lands in exactly one — the tests are applied in
 * order, so a row with dishes is bucket (a) even if it is also a demo. */
const a = [];
const b = [];
const c = [];
const d = [];
for (const r of pool) {
  if (r.has_dishes) a.push(r);
  else if (isDemo(r.name)) b.push(r);
  else if (String(r.source_key ?? "").startsWith("deh:")) c.push(r);
  else d.push(r);
}
const bucketOf = new Map();
for (const [name, rows] of [["a", a], ["b", b], ["c", c], ["d", d]]) {
  for (const r of rows) bucketOf.set(r.id, name);
}

const ordered = [
  ...roundRobinByNeighborhood(a),
  ...b,
  ...roundRobinByNeighborhood(c),
  ...d,
].slice(0, LIMIT === Infinity ? undefined : LIMIT);

console.log(
  `\n${pool.length} rows ` +
    (wantedIds
      ? `named by --ids (of ${all.length} with a place id and no hold).\n`
      : `eligible (hold_reason NULL, place id present, rating or photo missing, never checked).\n`) +
    `  a  ${String(a.length).padStart(5)}  already carry dishes\n` +
    `  b  ${String(b.length).padStart(5)}  demo restaurants\n` +
    `  c  ${String(c.length).padStart(5)}  deh: imports (round-robined across ${new Set(c.map((r) => r.neighborhood)).size} neighborhoods)\n` +
    `  d  ${String(d.length).padStart(5)}  everything else\n` +
    `${ordered.length} in this run's working set.\n`,
);

const tally = {
  seen: 0,
  fromCache: 0,
  closed: 0,
  gainedRating: 0,
  thinRating: 0,
  gainedPhoto: 0,
  gainedWebsite: 0,
  gainedHours: 0,
  errors: 0,
};
const touched = [];
let stopped = null;

for (const r of ordered) {
  if (!DRY_RUN && detailCalls >= MAX_CALLS && !existsSync(detailFile(r.google_place_id))) {
    stopped = `--max-calls ${MAX_CALLS} reached`;
    break;
  }

  const bucket = bucketOf.get(r.id);
  const line = `  ${bucket} ${r.id.padStart(4)} ${String(r.name).slice(0, 38).padEnd(38)}`;

  try {
    const { place, cached, error } = await detailsFor(r);
    tally.seen += 1;
    if (cached) tally.fromCache += 1;

    if (DRY_RUN && !place) {
      console.log(`${line} would call Place Details${error === "dry run" ? "" : ` (${error})`}`);
      continue;
    }
    if (error || !place) {
      tally.errors += 1;
      console.log(`${line} ! ${error ?? "no place returned"}`);
      continue;
    }

    /* A business Google says is gone is held, not enriched, and costs no photo
     * call. `hold_reason` is the column that carries judgements a query cannot
     * make, and publish-check.mjs will never override it. */
    if (place.businessStatus === "CLOSED_PERMANENTLY") {
      const reason = `Google reports this business as permanently closed (enrich ${new Date()
        .toISOString()
        .slice(0, 10)})`;
      if (!DRY_RUN) {
        await sql`
          UPDATE restaurants
          SET hold_reason = ${reason}, listed = FALSE, google_checked_at = now()
          WHERE id = ${r.id}`;
      }
      tally.closed += 1;
      console.log(`${line} CLOSED_PERMANENTLY — held`);
      continue;
    }

    const count = Number.isFinite(place.userRatingCount) ? place.userRatingCount : null;
    const ratingOk = place.rating != null && count != null && count >= MIN_REVIEWS;
    /* rating and review_count move together. The listing gate needs both, and
     * blend-ratings.mjs writes them as a pair off the same floor — a review
     * count with no rating beside it is a number the card cannot use. */
    const rating = ratingOk ? place.rating : null;
    const reviewCount = ratingOk ? count : null;
    if (!ratingOk && place.rating != null) tally.thinRating += 1;

    const hours = hoursFrom(place.regularOpeningHours);
    const website = place.websiteUri ?? null;

    let photoUri = null;
    let size = null;
    const needsPhoto = r.photo == null || r.photo === "";
    const photo = place.photos?.[0];
    if (needsPhoto && photo?.name) {
      if (!DRY_RUN && photoCalls >= MAX_CALLS && !existsSync(photoFile(r.google_place_id))) {
        stopped = `--max-calls ${MAX_CALLS} reached (photo SKU)`;
      } else {
        const got = await photoUriFor(r, photo);
        photoUri = got.uri;
        if (photoUri) size = servedSize(photo);
      }
    }

    /*
     * `NULLIF(review_count, 0)` below, not a plain COALESCE, and it is not a
     * shortcut.
     *
     * review_count was INTEGER NOT NULL DEFAULT 0 back when every restaurant
     * arrived from Yelp carrying one. The migration that made it nullable
     * dropped the NOT NULL and left the DEFAULT standing, so every row inserted
     * without a review count — all 2,868 from the permit import — holds a 0
     * nobody measured. A plain COALESCE reads that as a value and keeps it,
     * which puts "4.3 (0 reviews)" on the card and lets the publish gate's
     * `review_count IS NOT NULL` pass on a row that has no review count at all.
     * migrate.mjs says it outright where it dropped the constraint: NULL means
     * "not sourced yet" and must never be backfilled with 0. A 0 in this column
     * is that default, not a measurement.
     *
     * Everything else is a straight COALESCE: this never displaces a value the
     * row already holds.
     */
    if (!DRY_RUN) {
      await sql`
        UPDATE restaurants SET
          google_checked_at   = now(),
          google_rating       = COALESCE(google_rating, ${place.rating ?? null}),
          google_review_count = COALESCE(google_review_count, ${count}),
          rating              = COALESCE(rating, ${rating}),
          review_count        = COALESCE(NULLIF(review_count, 0), ${reviewCount}),
          website             = COALESCE(website, ${website}),
          hours               = COALESCE(hours, ${hours ? JSON.stringify(hours) : null}::jsonb),
          photo               = COALESCE(NULLIF(photo, ''), ${photoUri}),
          photo_w             = COALESCE(photo_w, ${photoUri && size ? size.w : null}),
          photo_h             = COALESCE(photo_h, ${photoUri && size ? size.h : null})
        WHERE id = ${r.id}`;
    }

    const gained = [];
    if (r.rating == null && rating != null) {
      tally.gainedRating += 1;
      gained.push(`rating ${rating} (${reviewCount})`);
    } else if (!ratingOk) {
      gained.push(count == null ? "no rating" : `only ${count} reviews`);
    }
    if (needsPhoto && photoUri) {
      tally.gainedPhoto += 1;
      gained.push(size ? `photo ${size.w}x${size.h}` : "photo");
    } else if (needsPhoto) {
      gained.push("no photo");
    }
    if (r.website == null && website) {
      tally.gainedWebsite += 1;
      gained.push("website");
    }
    if (r.hours == null && hours) {
      tally.gainedHours += 1;
      gained.push(`hours ${hours.length}`);
    }

    touched.push(r.id);
    console.log(`${line} ${cached ? "[cache] " : ""}${gained.join(", ") || "nothing new"}`);
    if (!cached) await sleep(120);
  } catch (err) {
    if (err instanceof StopRun) {
      stopped = err.message;
      break;
    }
    /* A transient failure leaves google_checked_at NULL, so the row is retried
     * on the next run rather than being marked done. */
    tally.errors += 1;
    console.log(`${line} ! ${err.message}`);
  }
  if (stopped) break;
}

/* --- report --------------------------------------------------------------- */

const afterLedger = await ledgerEntries();
const after = {
  [SKU_DETAILS]: countSku(afterLedger, SKU_DETAILS, month),
  [SKU_PHOTO]: countSku(afterLedger, SKU_PHOTO, month),
};

console.log(`\n${tally.seen} rows examined (${tally.fromCache} answered from cache, 0 calls).`);
console.log(
  `  ${tally.gainedRating} gained a rating   ` +
    `${tally.gainedPhoto} a photo   ` +
    `${tally.gainedWebsite} a website   ` +
    `${tally.gainedHours} hours`,
);
console.log(
  `  ${tally.closed} permanently closed and held   ` +
    `${tally.thinRating} under the ${MIN_REVIEWS}-review floor   ` +
    `${tally.errors} errors`,
);

console.log(`\nCalls this run:  ${detailCalls} ${SKU_DETAILS}, ${photoCalls} ${SKU_PHOTO}`);
for (const sku of [SKU_DETAILS, SKU_PHOTO]) {
  console.log(
    `  ${sku.padEnd(22)} ${before[sku]} -> ${after[sku]} this month ` +
      `(${MONTHLY_BUDGET - after[sku]} left in budget, ${MONTHLY_FREE - after[sku]} free)`,
  );
}

if (!DRY_RUN && touched.length > 0) {
  const [gate] = await sql`
    SELECT count(*)::int AS ready,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM dishes d WHERE d.restaurant_id = restaurants.id))::int AS with_menu
    FROM restaurants
    WHERE id = ANY(${touched})
      AND hold_reason IS NULL
      AND rating IS NOT NULL AND review_count IS NOT NULL
      AND lat IS NOT NULL AND lng IS NOT NULL
      AND photo IS NOT NULL AND photo <> ''`;
  console.log(
    `\n${gate.ready} of the ${touched.length} rows written now pass the publish gate ` +
      `(${gate.with_menu} of those carry a menu).`,
  );
}

if (DRY_RUN) {
  console.log("\nDry run — no calls made, nothing written. Re-run with --apply --max-calls N.");
}
if (stopped) console.log(`\nStopped: ${stopped}`);
