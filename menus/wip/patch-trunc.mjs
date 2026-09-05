/*
 * Teaches route-menus.mjs's DoorDash reader to cross-check its schema.org Menu
 * read against the page's own menu book, which is what the rendered category
 * nav is drawn from. Splices literal text from two side files so no escaping
 * ever passes through a shell or a JS string literal.
 *
 * Every step refuses loudly rather than writing a half-patched file.
 */
import fs from "fs";

const P = "scripts/route-menus.mjs";
let t = fs.readFileSync(P, "utf8");

if (t.includes("function missingSections")) {
  console.log("REFUSING: already patched");
  process.exit(1);
}

const helpers = fs.readFileSync("menus/wip/dd-helpers.txt", "utf8");
const newReturn = fs.readFileSync("menus/wip/dd-return.txt", "utf8");

/** Replace exactly one region, from `from` through the end of `to`. */
function splice(from, to, replacement, label) {
  const a = t.indexOf(from);
  if (a === -1) {
    console.log(`REFUSING: ${label} - start anchor not found`);
    process.exit(1);
  }
  if (t.indexOf(from, a + 1) !== -1) {
    console.log(`REFUSING: ${label} - start anchor is not unique`);
    process.exit(1);
  }
  const b = t.indexOf(to, a);
  if (b === -1) {
    console.log(`REFUSING: ${label} - end anchor not found after start`);
    process.exit(1);
  }
  t = t.slice(0, a) + replacement + t.slice(b + to.length);
  console.log(`  ok: ${label}`);
}

/* 1. The RSC reader's inline normaliser becomes a call to the shared one. */
splice(
  "  const text = html.includes(",
  "    : html;",
  "  const text = ddText(html);",
  "rsc normaliser",
);

/* 2. The RSC reader's menu-book loop becomes a call to the shared one. */
splice(
  "  /* The menu book lists every category",
  "  return { rows, expected };",
  `  /* The menu book lists every category with its item count, which is the only
   * way to tell a complete RSC read from a slice of one. */
  expected = menuBook(html).expected;
  return { rows, expected };`,
  "rsc expected loop",
);

/* 3. The JSON-LD result needs somewhere to live when it turns out to be short. */
splice(
  "    if (menu) {\n      const got = rowsFromSchemaMenu(menu);",
  "      const multiOffer = got.multiOffer;",
  `    let ld = null;
    if (menu) {
      const got = rowsFromSchemaMenu(menu);
      const multiOffer = got.multiOffer;`,
  "ld declaration",
);

/* 4. The return path itself: cross-check, prefer the fuller read, mark a cut. */
splice(
  '      if (rows.length) {\n        const notes = ["read from the DoorDash schema.org Menu block"];',
  "      return { rows, sourceUrl: res.finalUrl, address, place, payloadName, notes, partial, gateable: true };\n    }",
  newReturn,
  "doordash return block",
);

/* 5. Helpers go in last, so their own `: html;` cannot confuse step 1. */
const ANCHOR = "function rowsFromDoorDashRsc(html) {";
if (!t.includes(ANCHOR)) {
  console.log("REFUSING: helper anchor not found");
  process.exit(1);
}
t = t.replace(ANCHOR, helpers + ANCHOR);
console.log("  ok: helpers inserted");

fs.writeFileSync(P, t);
console.log("patched " + P);
