/**
 * Fills in every restaurant's real weekly opening hours, straight into Postgres.
 *
 *   node --env-file=.env.local scripts/fetch-hours.mjs --max-calls 300
 *   node --env-file=.env.local scripts/fetch-hours.mjs            # until done
 *
 * ## Why this exists
 *
 * The corpus had closing times and nothing else, so the only question the site
 * could ask was "is it before closing" — and a dinner-only steakhouse answered
 * "Open til 10pm" at nine in the morning. Every dinner-only restaurant did, and
 * the "Open now" filter returned all of them. The opening times were never
 * missing from Yelp; fetch-restaurants.mjs read `slot.end` and dropped the rest
 * of the payload on the floor.
 *
 * This asks for the same detail record and keeps the whole week.
 *
 * ## One call per restaurant
 *
 * Yelp's search endpoint does not return hours, so there is no batching to be
 * had: 682 restaurants is 682 calls, against a daily quota. Hence --max-calls,
 * and hence resumability — restaurants that already have hours are skipped, so
 * running this every day for three days finishes the job without repeating a
 * single call. A run that stops early is not a run that has to start over.
 */

import { neon } from "@neondatabase/serverless";

const DETAIL_URL = "https://api.yelp.com/v3/businesses";

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const MAX_CALLS = flag("max-calls", Infinity);
const DRY_RUN = process.argv.includes("--dry");
/** Re-fetch restaurants that already have hours. Off by default. */
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

async function yelp(url) {
  if (calls >= MAX_CALLS) throw new QuotaReached(`--max-calls ${MAX_CALLS} reached`);
  calls += 1;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (res.status === 429) throw new QuotaReached("Yelp returned 429 (rate limited)");
  if (!res.ok) throw new Error(`Yelp ${res.status}: ${await res.text()}`);
  return res.json();
}

/** The stable business identity, as stored in the yelp_url. */
function aliasFrom(yelpUrl) {
  const match = /yelp\.com\/biz\/([^/?#]+)/.exec(yelpUrl ?? "");
  return match?.[1] ?? null;
}

const rows = await sql`
  SELECT id, name, yelp_url, hours
  FROM restaurants
  ORDER BY review_count DESC NULLS LAST, id
`;

const targets = rows.filter(
  (r) => aliasFrom(r.yelp_url) && (REFRESH || r.hours === null),
);

console.log(
  `${rows.length} restaurants, ${rows.filter((r) => r.hours !== null).length} with hours already.\n` +
    `Fetching ${Math.min(targets.length, MAX_CALLS)} of ${targets.length} remaining.\n`,
);

if (targets.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

let filled = 0;
let noHours = 0;
let stopped = null;

for (const [i, r] of targets.entries()) {
  try {
    const detail = await yelp(`${DETAIL_URL}/${aliasFrom(r.yelp_url)}`);

    /*
     * `hours[0].open` is the regular weekly schedule. A restaurant with split
     * services has two entries for the same day, which is exactly why the whole
     * array is kept rather than one open/close pair — that shape is the only
     * one that can say "lunch, then closed, then dinner".
     *
     * Yelp's day numbering is 0 = Monday. JavaScript's getDay() is 0 = Sunday.
     * Storing Yelp's convention unchanged and converting at read time keeps one
     * conversion in one place instead of two that can disagree.
     */
    const open = detail.hours?.find((h) => h.hours_type === "REGULAR")?.open ?? detail.hours?.[0]?.open;

    if (!open?.length) {
      // Recorded as an empty array, not left NULL: NULL means "not asked yet"
      // and would make this restaurant a target on every future run forever.
      if (!DRY_RUN) await sql`UPDATE restaurants SET hours = '[]'::jsonb WHERE id = ${r.id}`;
      noHours += 1;
    } else {
      const week = open.map((slot) => ({
        day: slot.day,
        start: slot.start,
        end: slot.end,
        ...(slot.is_overnight ? { overnight: true } : {}),
      }));
      if (!DRY_RUN) {
        await sql`UPDATE restaurants SET hours = ${JSON.stringify(week)}::jsonb WHERE id = ${r.id}`;
      }
      filled += 1;
    }

    process.stdout.write(`\r  ${i + 1}/${targets.length}  (${calls} calls)`);
    await sleep(120);
  } catch (err) {
    if (err instanceof QuotaReached) {
      stopped = err.message;
      break;
    }
    // A business that has vanished from Yelp keeps NULL hours and will be
    // retried; that is cheaper than reasoning about which errors are permanent.
    console.log(`\n  ! ${r.name}: ${err.message}`);
  }
}

console.log("");

const [{ n: withHours }] = await sql`
  SELECT count(*)::int AS n FROM restaurants WHERE hours IS NOT NULL AND hours != '[]'::jsonb
`;

console.log(
  `\n${DRY_RUN ? "Dry run. " : ""}${filled} filled, ${noHours} publish no hours on Yelp.` +
    `\n${calls} API calls used.` +
    `\n${withHours}/${rows.length} restaurants now have real hours.`,
);
if (stopped) {
  console.log(`\nStopped: ${stopped}\nRe-run to continue — finished restaurants are skipped.`);
}
