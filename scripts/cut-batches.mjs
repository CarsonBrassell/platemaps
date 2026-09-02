/**
 * Cuts the menu queue into small work-list files for extraction agents.
 *
 *   node --env-file=.env.local scripts/cut-batches.mjs --size 6 --count 40
 *
 * This exists because cutting the queue by hand went wrong on 2026-08-29: a set
 * of batches was carved straight out of the queue while four agents were
 * already working, and one of those batches came back holding five restaurants
 * another agent had finished an hour earlier. The agent that drew it
 * re-extracted four of them before noticing, compared its results against the
 * files already on disk, found they matched, and deleted its own duplicates
 * rather than filing them. That was the right call and it still cost a whole
 * batch of somebody's time.
 *
 * The queue query alone cannot prevent this. A restaurant an agent is working
 * on right now still has no dishes and no `menu_lookups` row - it is
 * indistinguishable from one nobody has touched, and it stays that way until
 * its result file is screened and loaded. So the exclusion has to come from the
 * files themselves.
 *
 * So "already spoken for" is read off the files: every restaurant named by any
 * batch or result file in `menus/wip` that has been touched RECENTLY. See
 * `spokenFor` below for why recency rather than existence - excluding on
 * existence alone locked out every restaurant ever attempted, including the
 * blocked ones that are supposed to come back.
 *
 * `--window <hours>` tunes it; the default of 3 comfortably covers an agent's
 * lifetime.
 */

import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const SIZE = flag("size", 6);
const COUNT = flag("count", 40);
const PREFIX = args.includes("--prefix") ? args[args.indexOf("--prefix") + 1] : "six";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const WIP = "menus/wip";

/*
 * Every restaurant id named by a RECENTLY TOUCHED batch or result file.
 *
 * The recency window is the whole point and the second bug this function has
 * had. Matching every file in the directory looked safer and was worse: a
 * restaurant that was blocked gets no `menu_lookups` row, so it correctly
 * returns to the queue - and its id is still sitting in the batch file from the
 * run that blocked it. Excluding on that basis locked out every restaurant ever
 * attempted. The first run after that change reported "queue 1440, already
 * spoken for 1440, cutting from 0".
 *
 * What actually needs excluding is work IN FLIGHT: a restaurant an agent is
 * holding right now has no dishes and no ledger row, so the queue query cannot
 * see it. Agents finish inside an hour or two, so a file untouched for longer
 * than the window is finished work, and anything of its still in the queue is
 * there because it was blocked and deserves another look.
 */
const WINDOW_HOURS = Number(
  args.includes("--window") ? args[args.indexOf("--window") + 1] : 3,
);

async function spokenFor() {
  const ids = new Set();
  let files = [];
  try {
    files = await readdir(WIP);
  } catch {
    return ids;
  }
  const cutoff = Date.now() - WINDOW_HOURS * 3600_000;
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    /*
     * Every file in this directory names restaurants that are spoken for, so
     * match on shape rather than on a list of known prefixes.
     *
     * The first version listed `six|next|result` explicitly and was correct
     * until the day a new `night-NN` prefix was introduced for a fresh set of
     * batches. The script silently stopped excluding them, and the very next
     * cut produced a batch overlapping SIX restaurants another agent was
     * working on at that moment - the exact failure the script exists to
     * prevent, reintroduced by the script itself.
     *
     * `clean.json`, `quarantine.json` and the `ready-*` files are included
     * deliberately: they are already loaded, so excluding them costs nothing
     * and skipping the check would be another special case to get wrong.
     */
    if (f === "queue.json") continue;
    /*
     * The router's notes file names every restaurant the router LOOKED AT,
     * filed or not - 663 rows on its first run. Those are not in flight: the
     * router is synchronous and its menus are loaded before anyone cuts. The
     * first cut after that run treated all 605 with-website rows as spoken
     * for and handed agents nothing but website-less rows, which inverts the
     * priority THROUGHPUT.md asks for.
     */
    if (/^router-.*\.notes\.json$/.test(f)) continue;
    let parsed;
    try {
      const info = await stat(`${WIP}/${f}`);
      if (info.mtimeMs < cutoff) continue;
      parsed = JSON.parse(await readFile(`${WIP}/${f}`, "utf8"));
    } catch {
      // A file an agent is mid-write on will not parse. Skip it rather than
      // failing the cut - the worst case is one restaurant re-queued, and the
      // alternative is a crash that stops the pipeline over a transient.
      continue;
    }
    for (const e of Array.isArray(parsed) ? parsed : [parsed]) {
      const id = e?.restaurantId ?? e?.id;
      if (id != null) ids.add(String(id));
    }
  }
  return ids;
}

const excluded = await spokenFor();

const rows = await sql`
  SELECT r.id, r.name, r.address, r.website, r.review_count
  FROM restaurants r
  WHERE r.hold_reason IS NULL
    AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id)
    AND NOT EXISTS (SELECT 1 FROM menu_lookups m WHERE m.restaurant_id = r.id)
  ORDER BY r.review_count DESC NULLS LAST`;

/*
 * Join the router's notes (`menus/wip/router-*.notes.json`, newest file wins
 * per restaurant) so every work item says which ordering platform
 * `route-menus.mjs` already found and why it did not file. THROUGHPUT.md §4:
 * an agent that starts from the router's note skips the discovery half of
 * the job, which is where most of its context used to go.
 *
 * Two outcomes are not agent work and are skipped by default: `gated` (a
 * closed-store price gate - the noon router run picks it up for free) and
 * `needs-browser` (owned by `browser-menus.mjs`; an agent on the shared pane
 * is the most expensive way to read a store-pick storefront). Override with
 * `--skip-outcomes ""` or a different comma list.
 */
const SKIP_OUTCOMES = new Set(
  (args.includes("--skip-outcomes")
    ? args[args.indexOf("--skip-outcomes") + 1]
    : "gated,needs-browser"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

async function routerNotes() {
  const byId = new Map();
  let files = [];
  try {
    files = (await readdir(WIP)).filter((f) => /^router-.*\.notes\.json$/.test(f)).sort();
  } catch {
    return byId;
  }
  for (const f of files) {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(`${WIP}/${f}`, "utf8"));
    } catch {
      continue;
    }
    for (const n of Array.isArray(parsed) ? parsed : []) {
      if (n?.restaurantId == null) continue;
      byId.set(String(n.restaurantId), {
        platform: n.platform ?? null,
        outcome: n.outcome ?? null,
        detail: n.detail ?? null,
      });
    }
  }
  return byId;
}

const notes = await routerNotes();

const fresh = rows.filter((r) => {
  if (excluded.has(String(r.id))) return false;
  const note = notes.get(String(r.id));
  return !(note && SKIP_OUTCOMES.has(note.outcome));
});

const skippedByOutcome = rows.filter((r) => {
  const note = notes.get(String(r.id));
  return !excluded.has(String(r.id)) && note && SKIP_OUTCOMES.has(note.outcome);
}).length;

console.log(
  `queue ${rows.length}, already spoken for ${rows.length - fresh.length - skippedByOutcome}, ` +
    `skipped by router outcome (${[...SKIP_OUTCOMES].join(",")}) ${skippedByOutcome}, ` +
    `router notes for ${rows.filter((r) => notes.has(String(r.id))).length}, cutting from ${fresh.length}`,
);

let n = 0;
for (let i = 0; i < fresh.length && n < COUNT; i += SIZE) {
  const slice = fresh.slice(i, i + SIZE);
  if (slice.length === 0) break;
  n += 1;
  await writeFile(
    `${WIP}/${PREFIX}-${String(n).padStart(2, "0")}.json`,
    JSON.stringify(
      slice.map((r) => {
        const note = notes.get(String(r.id));
        return {
          restaurantId: String(r.id),
          name: r.name,
          address: r.address,
          website: r.website,
          reviewCount: r.review_count,
          // What the deterministic router already tried. `null` means the
          // router never saw this restaurant (usually: no website on record).
          router: note ?? null,
        };
      }),
      null,
      2,
    ),
  );
}

console.log(`wrote ${n} batches of ${SIZE} as ${WIP}/${PREFIX}-NN.json (${n * SIZE} restaurants)`);
