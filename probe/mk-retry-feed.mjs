/* Builds a browser feed of listed rows with a website that are worth ONE more
 * open: never attempted by any pass, or last seen with a transient outcome
 * (fetch-failed, gated, wrong-branch, too-few, screened-out). Deliberately
 * excludes "needs-browser" and "no-platform" — those mean the browser already
 * read the DOM and found no prices, so re-opening them changes nothing.
 * Read-only. */
import { neon } from '@neondatabase/serverless';
import { readdir, readFile, writeFile } from 'node:fs/promises';
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT r.id, r.name, r.website, r.review_count FROM restaurants r
  WHERE r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL
    AND r.website IS NOT NULL AND r.website <> ''
    AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id::text)
  ORDER BY r.review_count DESC NULLS LAST`;
const seen = new Map();
for (const f of (await readdir('menus/wip')).filter(f => /\.notes\.json$/.test(f))) {
  try { for (const n of JSON.parse(await readFile(`menus/wip/${f}`, 'utf8')))
    if (n?.restaurantId != null) seen.set(String(n.restaurantId), n.outcome ?? null);
  } catch {}
}
const RETRY = new Set(['fetch-failed','gated','wrong-branch','too-few','screened-out','gate-personal']);
const keep = rows.filter(r => { const o = seen.get(String(r.id)); return o === undefined || RETRY.has(o); });
const notes = keep.map(r => ({
  restaurantId: String(r.id), name: r.name, website: r.website,
  platform: null, outcome: 'needs-browser',
  detail: `retry feed: ${seen.get(String(r.id)) ?? 'never attempted'}`,
}));
const out = `menus/wip/retry-${Date.now().toString(36)}.notes.json`;
await writeFile(out, JSON.stringify(notes, null, 2));
const tally = {};
for (const r of keep) { const o = seen.get(String(r.id)) ?? 'never attempted'; tally[o]=(tally[o]??0)+1; }
console.log(`${rows.length} listed-no-menu-with-website; retrying ${notes.length}`, tally);
console.log(out);
