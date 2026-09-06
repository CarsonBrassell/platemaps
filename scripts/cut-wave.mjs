/**
 * Cuts a wave of agent batches from rows the deterministic router already
 * tried and could not resolve on its own.
 *
 *   node --env-file=.env.local scripts/cut-wave.mjs --size 20 --count 20
 *
 * This exists next to cut-batches.mjs rather than replacing it: cut-batches
 * hands out the raw queue (including rows nothing has ever looked at);
 * cut-wave hands out only the LEFTOVER after route-menus.mjs has run over
 * that queue — rows with a router note whose outcome was not "filed". An
 * agent reading a wave batch never has to do the discovery half of the job
 * the router already does for free; it starts from what the router found
 * (or ruled out) and spends its budget on judgement, not search.
 *
 * Same "spoken for" file-recency exclusion as cut-batches.mjs (see that file
 * for why existence-based exclusion is wrong), same router-notes join, same
 * blocked-log skip — but the blocked window here defaults to 30 DAYS, not
 * 24 hours. A restaurant an agent blocked yesterday for "needs-browser" is
 * still needs-browser today; putting it back in a wave a day later just
 * spends another agent's budget re-discovering the same wall. 2026-09-05:
 * Popeyes and El Salvador Pupuseria (see screen-menus.mjs's BLOCKED_LOG
 * comment) were re-blocked for the identical reason inside 24 hours more
 * than once — 30 days is long enough that whatever caused the block has
 * usually either resolved or been reclassified by a fresher router pass.
 *
 * Additionally, a restaurant with a `menu_lookups` row of status `error`
 * (written only by the on-demand, user-triggered lookup in src/lib/db.ts —
 * load-menus.mjs itself only ever writes `found`/`not_found`) is treated the
 * same way: excluded while the error is recent, eligible again after 30
 * days. `found` and `not_found` stay excluded forever, same as always —
 * `not_found` is permanent by design (posts never expire) and `found` means
 * dishes already exist. Without this, one failed on-demand click would
 * permanently hide a restaurant from every future wave with no path back.
 *
 * Each batch file is an OBJECT, not a bare array (cut-batches' batches stay
 * arrays; this is a different consumer — process-result.sh and the LITE
 * agent brief — so the shape can carry more):
 *
 *   {
 *     "tier": "haiku" | "sonnet",
 *     "tried": { "<restaurantId>": { platform, outcome, detail } | null, ... },
 *     "restaurants": [
 *       { restaurantId, name, address, website, reviewCount, router: note|null },
 *       ...
 *     ]
 *   }
 *
 * `tier` is "haiku" only when EVERY row in the batch already has a website
 * or a platform the router found — there's nothing left to search for, so
 * the cheaper model can follow the router's breadcrumb straight to the
 * payload. A single row needing fresh discovery drops the whole batch to
 * "sonnet".
 */

import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const SIZE = flag("size", 20);
const COUNT = flag("count", 20);
const PREFIX = args.includes("--prefix") ? args[args.indexOf("--prefix") + 1] : "wave";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const WIP = "menus/wip";

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
    if (f === "queue.json") continue;
    if (/^router-.*\.notes\.json$/.test(f)) continue;
    let parsed;
    try {
      const info = await stat(`${WIP}/${f}`);
      if (info.mtimeMs < cutoff) continue;
      parsed = JSON.parse(await readFile(`${WIP}/${f}`, "utf8"));
    } catch {
      continue;
    }
    // Wave batch files are objects with a `restaurants` array, not bare
    // arrays — handle both shapes so a wave file mid-flight also excludes.
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.restaurants)
        ? parsed.restaurants
        : [parsed];
    for (const e of list) {
      const id = e?.restaurantId ?? e?.id;
      if (id != null) ids.add(String(id));
    }
  }
  return ids;
}

// 30 days, default. `--blocked-window <hours>` overrides; 0 restores no skip.
const BLOCKED_WINDOW_HOURS = Number(
  args.includes("--blocked-window") ? args[args.indexOf("--blocked-window") + 1] : 24 * 30,
);

async function recentlyBlocked() {
  const ids = new Set();
  if (!BLOCKED_WINDOW_HOURS) return ids;
  let raw = "";
  try {
    raw = await readFile("menus/blocked-log.jsonl", "utf8");
  } catch {
    return ids;
  }
  const cutoff = Date.now() - BLOCKED_WINDOW_HOURS * 3600_000;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e?.restaurantId != null && new Date(e.at).getTime() > cutoff) {
        ids.add(String(e.restaurantId));
      }
    } catch {
      /* a partial line at the tail of the log is not worth failing a cut over */
    }
  }
  return ids;
}

async function recentlyQuarantined() {
  const ids = new Set();
  if (!BLOCKED_WINDOW_HOURS) return ids;
  const cutoff = Date.now() - BLOCKED_WINDOW_HOURS * 3600_000;
  let files = [];
  try {
    files = await readdir(WIP);
  } catch {
    return ids;
  }
  const filed = new Set();
  for (const f of files) {
    if (!/^result-.*\.json$/.test(f)) continue;
    try {
      const info = await stat(`${WIP}/${f}`);
      if (info.mtimeMs < cutoff) continue;
      for (const e of JSON.parse(await readFile(`${WIP}/${f}`, "utf8"))) {
        if (e?.restaurantId != null && e?.dishes?.length) filed.add(String(e.restaurantId));
      }
    } catch {
      continue;
    }
  }
  if (!filed.size) return ids;
  const loaded = await sql`
    SELECT DISTINCT restaurant_id FROM dishes WHERE restaurant_id = ANY(${[...filed]})`;
  const have = new Set(loaded.map((r) => String(r.restaurant_id)));
  for (const id of filed) if (!have.has(id)) ids.add(id);
  return ids;
}

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

const SKIP_OUTCOMES = new Set(
  (args.includes("--skip-outcomes")
    ? args[args.indexOf("--skip-outcomes") + 1]
    : "gated,needs-browser"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const excluded = await spokenFor();
const blockedRecently = await recentlyBlocked();
const quarantinedRecently = await recentlyQuarantined();
for (const id of quarantinedRecently) blockedRecently.add(id);
const notes = await routerNotes();

/*
 * Same San Diego County / CA-zip / Mexico-keyword predicate as cut-batches,
 * but the `menu_lookups` exclusion carves out an exception for `error` rows
 * older than the blocked window — see the header comment for why.
 */
const rows = await sql`
  SELECT r.id, r.name, r.address, r.website, r.review_count
  FROM restaurants r
  WHERE r.hold_reason IS NULL
    AND r.lat BETWEEN 32.534 AND 33.44 AND r.lng BETWEEN -117.6 AND -116.08
    AND (r.address IS NULL OR r.address ~ 'CA[[:space:]]+9(19[0-9][0-9]|2[01][0-9][0-9])' OR r.address !~ '[A-Z]{2}[[:space:]]+[0-9]{5}')
    AND (r.address IS NULL OR r.address !~* 'tijuana|tecate|rosarito|ensenada|baja|m[eé]xico')
    AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id)
    AND NOT EXISTS (
      SELECT 1 FROM menu_lookups m
      WHERE m.restaurant_id = r.id
        AND (m.status != 'error' OR m.attempted_at > now() - (${BLOCKED_WINDOW_HOURS} || ' hours')::interval)
    )
  ORDER BY r.review_count DESC NULLS LAST`;

// Only rows the router actually attempted, and only if it did not file
// (a "filed" note with no dishes yet in the DB means its result file is
// sitting unloaded somewhere — not this cutter's job to duplicate).
const attempted = rows.filter((r) => {
  const note = notes.get(String(r.id));
  return note != null && note.outcome !== "filed";
});

/*
 * `--with-website` keeps only rows an agent can work without a web search:
 * a stored website, or a router note that already names a platform. Cut this
 * way when the Serper account is out of credits — an agent handed a row with
 * no website and no search can only file "blocked", which costs a Sonnet call
 * and teaches the project nothing. (Serper ran dry mid-wave on 2026-09-05 and
 * w8-04 came back 0 found / 20 blocked for exactly this reason.)
 */
const WITH_WEBSITE = args.includes("--with-website");

const fresh = attempted.filter((r) => {
  if (excluded.has(String(r.id))) return false;
  if (blockedRecently.has(String(r.id))) return false;
  const note = notes.get(String(r.id));
  if (WITH_WEBSITE && !r.website && !note?.platform) return false;
  return !SKIP_OUTCOMES.has(note.outcome);
});

console.log(
  `queue ${rows.length}, router-attempted-and-failed ${attempted.length}, ` +
    `already spoken for ${attempted.filter((r) => excluded.has(String(r.id))).length}, ` +
    `blocked in the last ${BLOCKED_WINDOW_HOURS}h ${attempted.filter((r) => !excluded.has(String(r.id)) && blockedRecently.has(String(r.id))).length}, ` +
    `skipped by router outcome (${[...SKIP_OUTCOMES].join(",")}) ` +
    `${attempted.filter((r) => !excluded.has(String(r.id)) && !blockedRecently.has(String(r.id)) && SKIP_OUTCOMES.has(notes.get(String(r.id)).outcome)).length}, ` +
    `cutting from ${fresh.length}`,
);

let n = 0;
for (let i = 0; i < fresh.length && n < COUNT; i += SIZE) {
  const slice = fresh.slice(i, i + SIZE);
  if (slice.length === 0) break;
  n += 1;

  const restaurants = slice.map((r) => {
    const note = notes.get(String(r.id)) ?? null;
    return {
      restaurantId: String(r.id),
      name: r.name,
      address: r.address,
      website: r.website,
      reviewCount: r.review_count,
      router: note,
    };
  });

  const tried = Object.fromEntries(restaurants.map((r) => [r.restaurantId, r.router]));
  const tier = restaurants.every((r) => r.website || r.router?.platform) ? "haiku" : "sonnet";

  await writeFile(
    `${WIP}/${PREFIX}-${String(n).padStart(2, "0")}.json`,
    JSON.stringify({ tier, tried, restaurants }, null, 2),
  );
}

console.log(`wrote ${n} batches of up to ${SIZE} as ${WIP}/${PREFIX}-NN.json (tier tagged per batch)`);
