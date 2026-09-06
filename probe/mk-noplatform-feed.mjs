/*
 * Builds a browser feed from the gap rows the browser pass has NEVER OPENED.
 *
 * browser-menus.mjs:781 admits only `needs-browser` and `gated` notes. Rows the
 * router marked `no-platform` - it found no known ordering platform - are
 * dropped, even when the restaurant has a perfectly readable website sitting on
 * its row. That is not a guard: the script reads `website` straight out of the
 * DB and never needs the router's platform at all. The filter is simply
 * narrower than the tool behind it, and 1,326 listed rows with a website have
 * been invisible to the browser because of it.
 *
 * Measured 2026-09-06: of 200 randomly classified gap rows, `no-platform` was
 * the prior outcome for 28/49 fetch-failed, 13/20 image-menu-likely and 63/91
 * no-prices-anywhere. Two rows pulled out of this class by hand the same day -
 * F Street Cafe (prices printed on its own homepage) and Docent Brewing (28
 * items behind a harmless age gate) - both filed clean on the first open.
 *
 * Rather than widen the filter in a script other runs share, this rewrites the
 * outcome to `needs-browser` in a feed of its own. Same effect, nothing else
 * changes underneath anyone.
 *
 * Read-only against the DB.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const LIMIT = Number(process.argv.includes("--limit") ? process.argv[process.argv.indexOf("--limit")+1] : 0);

const seen = new Map();
for (const f of readdirSync("menus/wip")) {
  if (!/\.notes\.json$/.test(f)) continue;
  try {
    for (const n of JSON.parse(readFileSync(`menus/wip/${f}`, "utf8")))
      if (n?.restaurantId != null) seen.set(String(n.restaurantId), n);
  } catch { /* a half-written notes file is not worth failing a cut over */ }
}

const gap = await sql`
  SELECT r.id, r.name, r.website, r.review_count
  FROM restaurants r
  WHERE r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL
    AND r.website IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id::text)
  ORDER BY r.review_count DESC NULLS LAST`;

const feed = [];
for (const r of gap) {
  const prior = seen.get(String(r.id));
  if (prior?.outcome !== "no-platform") continue;
  feed.push({
    restaurantId: String(r.id),
    name: r.name,
    website: r.website,
    platform: null,
    outcome: "needs-browser",
    detail: `relabelled from no-platform by mk-noplatform-feed - the browser has never opened this row. Router said: ${prior.detail ?? "(no detail)"}`,
  });
  if (LIMIT && feed.length >= LIMIT) break;
}

const tag = `noplatform-${Date.now().toString(36)}`;
const out = `menus/wip/${tag}.notes.json`;
writeFileSync(out, JSON.stringify(feed, null, 2));
console.log(`${gap.length} gap rows with a website; ${feed.length} were no-platform and never browsed`);
console.log(`wrote ${out}`);
