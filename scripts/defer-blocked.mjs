/**
 * Retires restaurants that keep getting blocked for the same reason.
 *
 *   node --env-file=.env.local scripts/defer-blocked.mjs --dry
 *   node --env-file=.env.local scripts/defer-blocked.mjs
 *
 * ## The problem this closes
 *
 * `blocked` exists so that a TEMPORARY obstacle does not permanently retire a
 * restaurant. A blocked entry writes no `menu_lookups` row, so it re-queues and
 * gets another chance. That was the right fix for a real bug - overnight waves
 * were quietly retiring restaurants whose ordering platform simply hides prices
 * while the store is shut.
 *
 * But it re-queues IMMEDIATELY, and some obstacles are not temporary in any
 * useful sense. Popeyes was blocked three waves running by the same store
 * picker; El Salvador Pupuseria three times by the same `res-menu.net` 403.
 * Each attempt cost an agent ten minutes to rediscover a fact this project had
 * already written down twice.
 *
 * So: blocked once or twice is a retry. Blocked THRESHOLD times for the same
 * reason is a finding, and the finding is "this is not reachable right now".
 *
 * ## Why a row rather than a hold
 *
 * These restaurants are not closed and not mislocated - a `hold_reason` would
 * unlist them, which is wrong, because the restaurant is fine and only its menu
 * is unreachable. A `menu_lookups` row with `confidence = 'blocked-persistent'`
 * takes it out of the work queue and leaves the listing alone.
 *
 * Fully reversible, and deliberately easy to reverse when a host recovers:
 *
 *   DELETE FROM menu_lookups WHERE confidence = 'blocked-persistent';
 *
 * `res-menu.net` in particular is expected back, and a good number of these are
 * waiting on exactly that.
 */

import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const DRY_RUN = process.argv.includes("--dry");

/** Blocks for the same restaurant at or above this count stop being retries. */
const THRESHOLD = 3;

const LOG = "menus/blocked-log.jsonl";

let raw = "";
try {
  raw = await readFile(LOG, "utf8");
} catch {
  console.log(`No ${LOG} yet - nothing has been blocked. Nothing to do.`);
}

const entries = raw
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

/*
 * Counted per restaurant rather than per restaurant+reason. Two agents describe
 * the same obstacle in different words - "AWS WAF" and "SSL handshake failure"
 * are the same Popeyes wall - and keying on the prose would reset the count
 * every time the wording drifted, which is precisely when it matters most.
 *
 * ## Occasions, not rows
 *
 * The threshold is meant to count ATTEMPTS - "three separate waves went looking
 * and three separate waves hit a wall". But the log records screener RUNS, and
 * the screener gets run more than once per wave as a matter of course: reading
 * its output means re-running it, and every run re-appends the same blocks.
 *
 * That inflation was silently retiring restaurants early. Taco Bell, Birdseye
 * and Cotijas each carried four log rows from two real waves - two thirds of
 * the way to the threshold on a single genuine failure apiece, for a status
 * whose whole job is to say "we tried repeatedly".
 *
 * Re-runs of one wave land within minutes of each other; genuine re-attempts
 * are waves apart. So entries for the same restaurant inside one window are
 * collapsed into a single occasion. Fixing it here rather than at the write
 * site also repairs the history already on disk.
 */
const OCCASION_WINDOW_MS = 60 * 60 * 1000;

const counts = new Map();
for (const e of entries) {
  const id = String(e.restaurantId);
  if (!counts.has(id)) counts.set(id, { name: e.name, n: 0, reasons: new Set(), last: -Infinity, rows: 0 });
  const c = counts.get(id);
  c.rows += 1;
  c.reasons.add(String(e.reason).slice(0, 80));

  const t = Date.parse(e.at);
  // An unparseable timestamp counts on its own rather than being folded into a
  // neighbour - erring toward keeping the restaurant in the queue.
  if (!Number.isFinite(t) || t - c.last > OCCASION_WINDOW_MS) {
    c.n += 1;
    c.last = Number.isFinite(t) ? t : c.last;
  } else {
    c.last = Math.max(c.last, t);
  }
}

const collapsed = [...counts.values()].reduce((s, c) => s + (c.rows - c.n), 0);
if (collapsed > 0) {
  console.log(`Collapsed ${collapsed} same-wave duplicate row(s) into single occasions.\n`);
}

const repeat = [...counts.entries()]
  .filter(([, c]) => c.n >= THRESHOLD)
  .sort((a, b) => b[1].n - a[1].n);

if (repeat.length === 0) {
  console.log(`Nothing blocked ${THRESHOLD}+ times yet (${counts.size} restaurants in the log).`);
} else {
  console.log(`Blocked ${THRESHOLD}+ times:\n`);
  for (const [id, c] of repeat) {
    console.log(`  ${id}\t${c.name}\t${c.n}x`);
    for (const r of c.reasons) console.log(`      ${r}`);
  }
}

if (DRY_RUN) {
  console.log(`\nDry run - nothing written.`);
} else if (repeat.length > 0) {
  for (const [id, c] of repeat) {
    await sql`
      INSERT INTO menu_lookups (restaurant_id, status, source_url, confidence, dish_count, attempted_at)
      VALUES (${id}, 'not_found', null, 'blocked-persistent', 0, now())
      ON CONFLICT (restaurant_id) DO UPDATE SET
        status = 'not_found', confidence = 'blocked-persistent', dish_count = 0, attempted_at = now()
    `;
    console.log(`deferred ${id} (${c.name}) after ${c.n} blocks`);
  }

  const [{ n: queue }] = await sql`
    SELECT count(*)::int AS n FROM restaurants r
    WHERE r.hold_reason IS NULL
      AND NOT EXISTS (SELECT 1 FROM menu_lookups m WHERE m.restaurant_id = r.id)
  `;
  console.log(`\nQueue is now ${queue}.`);
  console.log(`Reverse with: DELETE FROM menu_lookups WHERE confidence = 'blocked-persistent';`);
}
