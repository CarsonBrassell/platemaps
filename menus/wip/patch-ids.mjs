/*
 * Lets an explicit `--ids` run seed from the menu URL the ledger already holds
 * when a restaurant has no website on file. Touches ONLY the --ids branch; the
 * unattended queue below it still requires a real website.
 */
import fs from "fs";

const P = "scripts/route-menus.mjs";
let t = fs.readFileSync(P, "utf8");

if (t.includes("m.source_url IS NOT NULL")) {
  console.log("REFUSING: already patched");
  process.exit(1);
}

const FROM = "SELECT id, name, address, website, review_count FROM restaurants";
const TO = "WHERE id = ANY($1::text[]) AND website IS NOT NULL";

const a = t.indexOf(FROM);
if (a === -1) {
  console.log("REFUSING: --ids select not found");
  process.exit(1);
}
if (t.indexOf(FROM, a + 1) !== -1) {
  console.log("REFUSING: --ids select is not unique");
  process.exit(1);
}
const b = t.indexOf(TO, a);
if (b === -1 || b - a > 400) {
  console.log("REFUSING: --ids where clause not found next to the select");
  process.exit(1);
}

const REPLACEMENT = `SELECT r.id, r.name, r.address,
              /* An explicit --ids run is a re-read of a restaurant we already
               * know something about, so it may start from the menu URL the
               * ledger already holds. That is the only way the DoorDash-
               * truncated restaurants with no website on file can be re-read
               * at all. The unattended queue below is untouched: it still
               * routes from a real website and nothing else. */
              COALESCE(r.website, (SELECT m.source_url FROM menu_lookups m
                                    WHERE m.restaurant_id = r.id
                                      AND m.source_url IS NOT NULL
                                    ORDER BY m.attempted_at DESC LIMIT 1)) AS website,
              r.review_count
         FROM restaurants r
        WHERE r.id = ANY($1::text[])
          AND (r.website IS NOT NULL
               OR EXISTS (SELECT 1 FROM menu_lookups m
                           WHERE m.restaurant_id = r.id AND m.source_url IS NOT NULL))`;

t = t.slice(0, a) + REPLACEMENT + t.slice(b + TO.length);
fs.writeFileSync(P, t);
console.log("patched the --ids query");
