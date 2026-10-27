// After loading a re-extract batch, clear the fingerprint of the restaurants
// that loaded so the next freshness run takes a new baseline.
//   node --env-file=.env.local probe/sweep-2026-10-25/rx-rebaseline.mjs NN
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const nn = process.argv[2];
const ids = JSON.parse(readFileSync(`menus/wip/ready-rx-${nn}.json`, "utf8")).filter((e) => e.dishes?.length).map((e) => e.restaurantId);
if (!Array.isArray(ids) || ids.length === 0) { console.log("no ids"); process.exit(0); }
if (ids.length > 10) throw new Error(`refusing: ${ids.length} ids, batch max is 10`);
const rows = await sql`UPDATE menu_lookups SET source_fingerprint = NULL
  WHERE restaurant_id = ANY(${ids}) RETURNING restaurant_id`;
console.log(`rebaselined ${rows.length}`);
