/**
 * One Yelp call per restaurant, doing four jobs at once.
 *
 *   node --env-file=.env.local scripts/fetch-yelp.mjs --dry
 *   node --env-file=.env.local scripts/fetch-yelp.mjs
 *   node --env-file=.env.local scripts/fetch-yelp.mjs --max-calls 300
 *
 * ## Why one script instead of four
 *
 * After the OpenStreetMap import the table holds every restaurant in San Diego
 * County and almost nothing about them: 5,017 rows with no photo, no rating and
 * no way to tell whether the place is still trading. Four separate passes over
 * that list would cost four calls each against a 300-a-day quota, which is two
 * months of waiting for something Yelp already returns in a single response.
 *
 * `businesses/search` gives back, per business:
 *
 *   image_url      the photo the readiness gate is blocked on
 *   rating         one of the two ratings the product needs
 *   review_count   the weight that makes a blended rating meaningful
 *   is_closed      whether this restaurant still exists at all
 *   url            carries the alias, which is the key to yelp.com/menu/<alias>
 *
 * That last one is why this script runs before any menu work. A probe over 40
 * restaurants in the tail found Yelp's menu tab to be the single most reliable
 * source, in consistent plain HTML - but only reachable if you know the alias,
 * and the alias only comes from here.
 *
 * ## is_closed is not a detail
 *
 * The same probe found 12% of the OSM rows permanently closed - roughly 600
 * restaurants countywide. Extracting menus for those would be weeks of work
 * producing listings for places that no longer exist, so a closed business gets
 * a `hold_reason` and drops out of every downstream queue immediately.
 *
 * ## Recording the ask, not just the answer
 *
 * `yelp_checked_at` is written whether or not anything matched. Yelp does not
 * carry every restaurant, and a row it has never heard of is indistinguishable
 * from one nobody has got to yet unless the attempt itself is written down. At
 * 300 calls a day, re-asking about the unmatched forever is the difference
 * between a job that finishes and one that does not.
 */

import { neon } from "@neondatabase/serverless";

const SEARCH_URL = "https://api.yelp.com/v3/businesses/search";

/** Below this, treat the match as untrustworthy and record a miss instead. */
const MIN_SIMILARITY = 0.55;

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}

/*
 * Yelp's free Starter plan allows 300 calls per 24 hours, resetting at midnight
 * UTC. Defaulting to exactly that means an unattended daily run uses the whole
 * allowance and never trips the 429, and the resumability above means tomorrow
 * picks up precisely where today stopped.
 */
const MAX_CALLS = flag("max-calls", 300);
const DRY_RUN = process.argv.includes("--dry");
/** Re-check restaurants already looked up. Off by default. */
const REFRESH = process.argv.includes("--refresh");

const apiKey = process.env.YELP_API_KEY;
if (!apiKey) {
  console.error("YELP_API_KEY is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let calls = 0;
class QuotaReached extends Error {}

/* --- Matching ------------------------------------------------------------ */

/**
 * Lowercase, fold accents, drop punctuation, collapse whitespace.
 *
 * The accent fold is not cosmetic. Without it the punctuation strip turns every
 * accented letter into a space, so OpenStreetMap's "Pokéz" normalised to
 * "pok z" and scored 0.3 against Yelp's "Pokez" - a restaurant with 1,750
 * reviews and a photo, recorded as "not on Yelp". In a city whose menu is
 * substantially Mexican, that one line is worth hundreds of matches: José,
 * Güero, Peña, Mazatlán, Cevichería all failed the same way.
 *
 * NFD splits a letter into its base plus a combining mark; the range strip
 * removes the marks and leaves the base, so "é" becomes "e" rather than " ".
 *
 * An earlier version also stripped words like "kitchen", "cafe" and "bar" as
 * filler. That was wrong: those words are load-bearing parts of real names, so
 * "Prep Kitchen" collapsed to "prep" and stopped matching the actual
 * Prepkitchen. Only "&"/"and" is unified, since sources genuinely disagree on
 * that one.
 */
function normalize(name) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dice coefficient over character bigrams - tolerant of small spelling drift. */
function similarity(a, b) {
  const [x, y] = [normalize(a), normalize(b)];
  if (!x || !y) return 0;
  if (x === y) return 1;

  // Yelp often carries a location suffix the local name omits ("Prepkitchen
  // Little Italy" vs "Prep Kitchen"). Treat full containment as a strong match,
  // since bigram overlap alone under-scores it badly.
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  if (longer.includes(shorter) && shorter.length >= 4) return 0.9;
  if (longer.replace(/\s/g, "").includes(shorter.replace(/\s/g, "")) && shorter.length >= 6) {
    return 0.85;
  }

  const bigrams = (s) => {
    const out = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };

  const [bx, by] = [bigrams(x), bigrams(y)];
  let shared = 0;
  for (const [g, count] of bx) shared += Math.min(count, by.get(g) ?? 0);
  const total =
    [...bx.values()].reduce((n, c) => n + c, 0) +
    [...by.values()].reduce((n, c) => n + c, 0);
  return total === 0 ? 0 : (2 * shared) / total;
}

async function findOnYelp({ name, lat, lng }) {
  if (calls >= MAX_CALLS) throw new QuotaReached(`--max-calls ${MAX_CALLS} reached`);
  calls += 1;

  const url = new URL(SEARCH_URL);
  url.searchParams.set("term", name);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  // ~1 mile. These are exact coordinates, so a wider radius only adds wrong
  // branches of the same chain.
  url.searchParams.set("radius", "1600");
  url.searchParams.set("limit", "5");

  /*
   * Retried, because a run of several hundred calls will hit a connect timeout
   * eventually and losing the rest of the day's quota to one dropped packet is
   * absurd. A timeout is not a Yelp answer, so it does not count against the
   * quota and does not mark the restaurant as checked - only a real response,
   * match or no match, does that.
   */
  let res = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(attempt * 2000);
    }
  }

  if (res.status === 429) throw new QuotaReached("Yelp returned 429 (daily quota spent)");
  if (!res.ok) throw new Error(`Yelp ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const { businesses = [] } = await res.json();

  // Best name match among the nearby hits, not simply the first result.
  let best = null;
  for (const b of businesses) {
    const score = similarity(name, b.name);
    if (!best || score > best.score) best = { score, business: b };
  }
  if (!best || best.score < MIN_SIMILARITY) return null;
  return { ...best.business, matchScore: best.score };
}

/* --- Run ----------------------------------------------------------------- */

/*
 * Order matters more than it looks, for two reasons.
 *
 * Restaurants that still need a photo come first, always. Dropping that clause
 * once cost 60 calls re-checking rows the Yelp import had already filled in -
 * the run reported 60 matches and moved the photo count by zero.
 *
 * `id` is TEXT, so ordering by it lexicographically walks "1000".."1099" before
 * "11" - a contiguous slab of one import rather than a cross-section. The first
 * 110 rows processed that way came back 40% bars and produced a 59% match rate
 * that said nothing about the corpus. `id::int` restores insertion order.
 *
 * Bars go last on purpose. OpenStreetMap's `amenity=bar` is a wide net that
 * caught a suit shop ("3 Day Suit Broker"), and dive bars are the thinnest part
 * of Yelp's coverage - 44 of the first 45 misses were bars. At 300 calls a day
 * the queue order decides what the site looks like three days from now, and it
 * should be filling up with restaurants people search for, not cocktail lounges
 * Yelp has never heard of.
 */
const targets = await sql`
  SELECT id, name, lat, lng
  FROM restaurants
  WHERE lat IS NOT NULL AND lng IS NOT NULL
    AND hold_reason IS NULL
    AND (${REFRESH} OR yelp_checked_at IS NULL)
  ORDER BY (photo IS NOT NULL), (cuisine = 'Bar'), id::int
`;

const [{ n: alreadyDone }] = await sql`
  SELECT count(*)::int AS n FROM restaurants WHERE yelp_checked_at IS NOT NULL
`;

console.log(
  `${targets.length} restaurants still to look up (${alreadyDone} already done).\n` +
    `This run will make at most ${Math.min(targets.length, MAX_CALLS)} Yelp calls.\n`,
);

if (targets.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}
if (DRY_RUN) {
  console.log("Dry run - no calls made, nothing written.");
  process.exit(0);
}

let matched = 0;
let missed = 0;
let closed = 0;
let photos = 0;
let stopped = null;

for (const [i, r] of targets.entries()) {
  try {
    const hit = await findOnYelp(r);

    if (!hit) {
      // Recorded as checked with nothing found, so tomorrow's run skips it.
      await sql`UPDATE restaurants SET yelp_checked_at = now() WHERE id = ${r.id}`;
      missed += 1;
    } else if (hit.is_closed) {
      await sql`
        UPDATE restaurants SET
          yelp_checked_at = now(),
          hold_reason = ${"Yelp reports this business as permanently closed"}
        WHERE id = ${r.id}`;
      closed += 1;
    } else {
      /*
       * `rating` is the blended figure the app displays and blend-ratings.mjs
       * later recomputes from Yelp plus Google. Until a Google match exists the
       * Yelp rating IS the blend, which is why it is written to both - the
       * alternative is a null rating that the readiness gate would hold back
       * for no reason. COALESCE on photo so a hand-picked image is never
       * overwritten by a re-run.
       */
      await sql`
        UPDATE restaurants SET
          yelp_checked_at   = now(),
          yelp_rating       = ${hit.rating},
          yelp_review_count = ${hit.review_count},
          rating            = COALESCE(rating, ${hit.rating}),
          review_count      = COALESCE(review_count, ${hit.review_count}),
          photo             = COALESCE(photo, ${hit.image_url || null}),
          yelp_url          = COALESCE(yelp_url, ${hit.url})
        WHERE id = ${r.id}`;
      matched += 1;
      if (hit.image_url) photos += 1;
    }

    process.stdout.write(`\r  ${i + 1}/${targets.length}  (${calls} calls)`);
    // Yelp does not publish a per-second limit, but hammering a quota endpoint
    // is how a daily allowance turns into a 429 with calls left on it.
    await sleep(150);
  } catch (err) {
    if (err instanceof QuotaReached) {
      stopped = err.message;
      break;
    }
    // A transient failure leaves yelp_checked_at NULL, so the row is simply
    // retried tomorrow. That is cheaper than reasoning about which errors are
    // permanent.
    console.log(`\n  ! ${r.name}: ${err.message}`);
  }
}

const [after] = await sql`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE photo IS NOT NULL)::int AS with_photo,
         count(*) FILTER (WHERE rating IS NOT NULL)::int AS with_rating,
         count(*) FILTER (WHERE yelp_checked_at IS NULL AND hold_reason IS NULL)::int AS remaining
  FROM restaurants`;

const days = Math.ceil(after.remaining / MAX_CALLS);

console.log(
  `\n\n${calls} Yelp calls used.\n` +
    `  ${matched} matched  (${photos} brought a photo)\n` +
    `  ${missed} not on Yelp\n` +
    `  ${closed} permanently closed - held\n\n` +
    `${after.with_photo}/${after.total} now have a photo, ` +
    `${after.with_rating} have a rating.\n` +
    `${after.remaining} still to check` +
    (days > 0 ? ` - about ${days} more ${days === 1 ? "day" : "days"} at this rate.` : "."),
);
if (stopped) console.log(`\nStopped: ${stopped}\nRe-run tomorrow; finished rows are skipped.`);
