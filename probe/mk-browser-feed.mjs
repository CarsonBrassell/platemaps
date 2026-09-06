/* Builds a browser-menus notes file from every queue row that has a website.
 * The router only ever hands the browser tier what IT tried this run; the DB
 * holds thousands more rows with a stored website that no browser pass has
 * ever opened. Marked "needs-browser" because that is the outcome the browser
 * script filters on. Read-only. */
import { neon } from '@neondatabase/serverless';
import { writeFileSync } from 'node:fs';
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT r.id, r.name, r.website, r.review_count FROM restaurants r
  WHERE r.hold_reason IS NULL
    AND r.website IS NOT NULL AND r.website <> ''
    AND r.lat BETWEEN 32.534 AND 33.44 AND r.lng BETWEEN -117.6 AND -116.08
    AND (r.address IS NULL OR r.address !~* 'tijuana|tecate|rosarito|ensenada|baja|m[eé]xico')
    AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id)
  ORDER BY r.review_count DESC NULLS LAST`;
const BOOZE = /(^|[^a-z])(brew(ing|ery|ers?)?|taproom|tap room|tap house|cider|meadery|winery|wine bar|wine works|vineyard|distiller(y|ies)|cellars|hookah|saloon)([^a-z]|$)/i;
const keep = rows.filter((r) => !BOOZE.test(r.name));
const notes = keep.map((r) => ({
  restaurantId: String(r.id), name: r.name, website: r.website,
  platform: null, outcome: "needs-browser",
  detail: "queued by mk-browser-feed: stored website never opened in a browser",
}));
const out = `menus/wip/feed-${new Date().toISOString().slice(0,19).replace(/[-:T]/g,'').slice(0,13)}.notes.json`;
writeFileSync(out, JSON.stringify(notes, null, 2));
console.log(`${rows.length} queue rows with a website, ${rows.length - keep.length} bar/brewery dropped, wrote ${notes.length} to ${out}`);
