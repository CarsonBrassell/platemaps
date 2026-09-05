/*
 * The page you are standing on is a link you have. `allLinks` was built from
 * the hrefs in the body and never included the URL of the body itself, so a
 * restaurant whose website IS its ordering page routed as if that page were
 * merely a site with some markup on it.
 *
 * That is how Ali Baba came back as 91 dishes: seeded from its DoorDash store
 * URL, `ddLinks` found no /store/ href on the page (a store page does not link
 * to itself), the DoorDash branch declined, and the generic JSON-LD reader
 * picked it up - keeping the 12-item "Most Ordered" carousel and inheriting
 * none of the DoorDash branch's truncation cross-check. 12 + 79 = 91.
 */
import fs from "fs";

const P = "scripts/route-menus.mjs";
let t = fs.readFileSync(P, "utf8");

const FROM = "allLinks: [...new Set(allLinks)]";
const TO = "allLinks: [...new Set([homeUrl, ...allLinks])]";

if (t.includes(TO)) {
  console.log("REFUSING: already patched");
  process.exit(1);
}
const n = t.split(FROM).length - 1;
if (n !== 1) {
  console.log(`REFUSING: expected 1 occurrence of the allLinks return, found ${n}`);
  process.exit(1);
}

t = t.replace(FROM, TO);
fs.writeFileSync(P, t);
console.log("patched: the seed URL is now one of its own links");
