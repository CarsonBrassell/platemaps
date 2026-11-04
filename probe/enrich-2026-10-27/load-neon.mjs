// node --env-file=.env.local probe/enrich-2026-10-27/load-neon.mjs [--apply]
// Loads profiles.json into Neon (Calvin, 2026-11-02: "just do both").
//   1. restaurant_profiles: one upsert per restaurant, the whole profile as jsonb.
//   2. restaurants: cuisine = main, cuisine_secondary = secondaries (ok rows);
//      hold_reason = 'menu_enrich: <reason>' + listed = false (held rows that are not held already).
// Dry by default: prints the diff counts. --apply snapshots every touched row first to
// probe/snapshots/retag-2026-11-02.json (refuses to overwrite it) and only then writes.
// Every write is a parameterised statement with WHERE id = $1; nothing is split from text.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { CUISINES } from '../../src/data/cuisines.ts';

const DIR = fileURLToPath(new URL('.', import.meta.url));
// --snap=<name> picks a fresh snapshot file for a later run (each run refuses to overwrite its own).
const SNAP_NAME = process.argv.find((a) => a.startsWith('--snap='))?.slice(7) ?? 'retag-2026-11-02';
const SNAP = fileURLToPath(new URL(`../snapshots/${SNAP_NAME}.json`, import.meta.url));
const APPLY = process.argv.includes('--apply');
const sql = neon(process.env.DATABASE_URL);
const VALID = new Set(CUISINES);

const profiles = JSON.parse(fs.readFileSync(`${DIR}profiles.json`, 'utf8'));
const ids = Object.keys(profiles);

/* Same text as the last two statements in scripts/migrate.mjs; run alone so this
   does not also apply unrelated pending DDL from other work in the tree. */
if (APPLY) {
  await sql`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cuisine_secondary TEXT[]`;
  await sql`CREATE TABLE IF NOT EXISTS restaurant_profiles (
    restaurant_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    main_cuisine TEXT,
    secondary_cuisines TEXT[] NOT NULL DEFAULT '{}',
    styles TEXT[] NOT NULL DEFAULT '{}',
    dish_types TEXT[] NOT NULL DEFAULT '{}',
    confidence TEXT,
    profile JSONB NOT NULL,
    source TEXT NOT NULL,
    enriched_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
}
const hasSec = (await sql`SELECT 1 FROM information_schema.columns
  WHERE table_name = 'restaurants' AND column_name = 'cuisine_secondary'`).length > 0;
const rows = await sql.query(
  `SELECT id, cuisine, cuisine_tags, ${hasSec ? 'cuisine_secondary' : 'NULL::text[] AS cuisine_secondary'},
          listed, hold_reason FROM restaurants WHERE id = ANY($1)`,
  [ids],
);
const current = new Map(rows.map((r) => [r.id, r]));

const plan = [];
const t = { profiles: ids.length, captureHoldSkipped: 0, unknownId: 0, badMain: 0, droppedSec: 0, mainChange: 0, secSet: 0, hold: 0, alreadyHeld: 0, unchanged: 0 };
const sameArr = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
for (const id of ids) {
  const p = profiles[id];
  const cur = current.get(id);
  if (!cur) { t.unknownId++; continue; }
  if (p.status === 'hold') {
    // m9001+ came from unpublished captures (prep-nomenu.mjs): a bad capture is not grounds to hide the restaurant.
    if (+String(p.menu).slice(1) >= 9001) { t.captureHoldSkipped++; continue; }
    if (cur.hold_reason) { t.alreadyHeld++; continue; }
    t.hold++;
    plan.push({ id, kind: 'hold', reason: `menu_enrich: ${p.hold_reason || 'junk_menu'}` });
    continue;
  }
  if (!VALID.has(p.main_cuisine)) { t.badMain++; continue; }
  const sec = [];
  for (const s of p.secondary_cuisines ?? []) {
    if (VALID.has(s) && s !== p.main_cuisine && !sec.includes(s)) sec.push(s);
    else t.droppedSec++;
  }
  const secs = sec.slice(0, 3);
  if (cur.cuisine === p.main_cuisine && sameArr(cur.cuisine_secondary, secs.length ? secs : null)) { t.unchanged++; continue; }
  if (cur.cuisine !== p.main_cuisine) t.mainChange++;
  if (secs.length) t.secSet++;
  plan.push({ id, kind: 'retag', main: p.main_cuisine, secs: secs.length ? secs : null });
}
console.log(JSON.stringify(t));
const reasons = {};
for (const x of plan) if (x.kind === 'hold') reasons[x.reason] = (reasons[x.reason] ?? 0) + 1;
console.log('hold reasons', JSON.stringify(reasons));
if (!APPLY) { console.log(`dry run: ${plan.length} restaurant updates + ${ids.length} profile upserts. Pass --apply.`); process.exit(0); }

// Snapshot every row this run can touch, before any write.
if (fs.existsSync(SNAP)) throw new Error(`${SNAP} exists; refusing to overwrite the snapshot`);
const touched = new Set(plan.map((x) => x.id));
const snap = rows.filter((r) => touched.has(r.id));
fs.writeFileSync(SNAP, JSON.stringify(snap));
const back = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
if (back.length !== touched.size || !back.length) throw new Error(`snapshot has ${back.length} rows, expected ${touched.size}`);
console.log(`snapshot ${back.length} rows -> ${SNAP}`);

async function pool(items, n, fn) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const x = items[i++];
      await fn(x);
      if (++done % 1000 === 0) console.log(`  ${done}/${items.length}`);
    }
  }));
}

let updated = 0;
await pool(plan, 8, async (x) => {
  const r = x.kind === 'hold'
    ? await sql.query('UPDATE restaurants SET hold_reason = $2, listed = FALSE WHERE id = $1 AND hold_reason IS NULL', [x.id, x.reason], { fullResults: true })
    : await sql.query('UPDATE restaurants SET cuisine = $2, cuisine_secondary = $3 WHERE id = $1', [x.id, x.main, x.secs], { fullResults: true });
  updated += r.rowCount;
});
console.log(`restaurants updated: ${updated}/${plan.length}`);

const arr = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []);
await pool(ids.filter((id) => current.has(id)), 8, async (id) => {
  const p = profiles[id];
  const { menu, menu_stats, previous_cuisine, audited, ...profile } = p;
  await sql.query(
    `INSERT INTO restaurant_profiles (restaurant_id, status, main_cuisine, secondary_cuisines, styles, dish_types, confidence, profile, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (restaurant_id) DO UPDATE SET status = EXCLUDED.status, main_cuisine = EXCLUDED.main_cuisine,
       secondary_cuisines = EXCLUDED.secondary_cuisines, styles = EXCLUDED.styles, dish_types = EXCLUDED.dish_types,
       confidence = EXCLUDED.confidence, profile = EXCLUDED.profile, source = EXCLUDED.source, enriched_at = now()`,
    [id, p.status, p.main_cuisine ?? null, arr(p.secondary_cuisines), arr(p.styles), arr(p.dish_types),
     p.confidence ?? null, JSON.stringify({ ...profile, menu_stats, previous_cuisine, audited: !!audited }), `menu-enrich-2026-10-27:${menu}`],
  );
});
const [{ n }] = await sql`SELECT count(*)::int AS n FROM restaurant_profiles`;
console.log(`restaurant_profiles rows: ${n}`);
