// The corpus in twelve numbers, read-only, about 300 tokens of output.
//
//   npm run db:stats            print the table
//   npm run db:stats -- --json  also write probe/stats.json (timestamped)
//
// This replaces the `node -e "const {neon}..."` one-liners that used to be
// pasted into STATE.md and the menu-wave skill and re-derived every session.
// Anything that needs the numbers - an agent brief, RESUME.md, a question in
// the ask terminal - runs this or reads probe/stats.json. Nothing else should
// be querying counts by hand.
//
// Definitions match probe/STATE.md:
//   held      hold_reason IS NOT NULL (retired, closed, not-food, duplicate...)
//   live      hold_reason IS NULL
//   listed    live AND listed = true - the only rows a visitor can see
//   with_menu at least one row in dishes
//   queue     live, no dishes, no menu_lookups row - never tried
//   not_found menu_lookups.status = 'not_found' (a permanent "no menu exists")
//
// Touches no table. Safe to run at any time, from any terminal.

import { neon } from "@neondatabase/serverless";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sql = neon(process.env.DATABASE_URL);
const json = process.argv.includes("--json");

const [c] = await sql`
  SELECT
    count(*)::int                                            AS total,
    count(*) FILTER (WHERE hold_reason IS NOT NULL)::int     AS held,
    count(*) FILTER (WHERE hold_reason IS NULL)::int         AS live,
    count(*) FILTER (WHERE hold_reason IS NULL AND listed)::int AS listed,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id))::int AS with_menu,
    count(*) FILTER (WHERE hold_reason IS NULL AND listed
      AND EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id))::int AS listed_with_menu,
    count(*) FILTER (WHERE hold_reason IS NULL
      AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM menu_lookups m WHERE m.restaurant_id = r.id))::int AS queue
  FROM restaurants r`;

const [d] = await sql`SELECT count(*)::int AS dishes FROM dishes`;

const lookups = Object.fromEntries(
  (await sql`SELECT status, count(*)::int AS n FROM menu_lookups GROUP BY status`)
    .map((x) => [x.status, x.n]),
);

const bySource = Object.fromEntries(
  (await sql`
    SELECT coalesce(split_part(source_key, ':', 1), '(none)') AS src, count(*)::int AS n
    FROM restaurants GROUP BY 1 ORDER BY 2 DESC`).map((x) => [x.src, x.n]),
);

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const stats = {
  measured_at: new Date().toISOString(),
  ...c,
  dishes: d.dishes,
  not_found: lookups.not_found ?? 0,
  lookups,
  by_source: bySource,
  listed_menu_pct: pct(c.listed_with_menu, c.listed),
  live_menu_pct: pct(c.with_menu, c.live),
};

const n = (x) => x.toLocaleString("en-US");
console.log(
  `restaurants  total ${n(c.total)}  held ${n(c.held)}  live ${n(c.live)}  listed ${n(c.listed)}\n` +
  `menus        with_menu ${n(c.with_menu)} (${stats.live_menu_pct}% of live)  ` +
  `listed_with_menu ${n(c.listed_with_menu)} (${stats.listed_menu_pct}% of listed)\n` +
  `todo         queue ${n(c.queue)}  not_found ${n(stats.not_found)}  ` +
  `listed_without_menu ${n(c.listed - c.listed_with_menu)}\n` +
  `dishes       ${n(d.dishes)}\n` +
  `by_source    ${Object.entries(bySource).map(([k, v]) => `${k} ${n(v)}`).join("  ")}\n` +
  `measured_at  ${stats.measured_at}`,
);

if (json) {
  const out = join(dirname(fileURLToPath(import.meta.url)), "..", "probe", "stats.json");
  writeFileSync(out, JSON.stringify(stats, null, 2) + "\n");
  console.log(`wrote ${out}`);
}
