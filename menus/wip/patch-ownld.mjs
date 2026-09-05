/*
 * extractOwnJsonLd is the branch that catches a restaurant whose only known
 * URL is its own storefront - including, since --ids learned to seed from the
 * ledger, DoorDash store pages. It was keeping the "Most Ordered" carousel and
 * inheriting none of the DoorDash branch's truncation cross-check, which is
 * how Ali Baba and Frutimania both came back as exactly 91: 12 + 79.
 *
 * Both fixes are no-ops on a real restaurant's own site - it has no carousel
 * and no menu book - so this is safe to apply to the branch as a whole.
 */
import fs from "fs";

const P = "scripts/route-menus.mjs";
let t = fs.readFileSync(P, "utf8");

if (t.includes("CAROUSEL_SECTION")) {
  console.log("REFUSING: already patched");
  process.exit(1);
}

function sub(from, to, label) {
  const n = t.split(from).length - 1;
  if (n !== 1) {
    console.log(`REFUSING: ${label} - expected 1 occurrence, found ${n}`);
    process.exit(1);
  }
  t = t.replace(from, to);
  console.log("  ok: " + label);
}

/* 1. Name the carousels once. */
sub(
  "async function extractOwnJsonLd(ctx) {",
  `/* A carousel is a second copy of dishes that already live in real sections.
 * It is never a section of a catalog, on any platform. */
const CAROUSEL_SECTION = /^(most ordered|picked for you|featured items|popular items?)$/i;

async function extractOwnJsonLd(ctx) {`,
  "carousel constant",
);

/* 2. Keep the body that won, so it can be cross-checked. */
sub(
  "let best = { rows: [], url: null, address: null,",
  "let best = { rows: [], url: null, body: null, address: null,",
  "best initialiser",
);
sub("      best = {\n        rows,\n        url,", "      best = {\n        rows,\n        url,\n        body,", "best assignment");

/* 3. Drop carousel rows as they are collected. */
{
  /* The same three lines appear in more than one extractor, so this one is
   * found by position: the first occurrence inside extractOwnJsonLd. */
  const FN = "async function extractOwnJsonLd(ctx) {";
  const BLOCK =
    "      multiOffer += got.multiOffer;\n      rows.push(...got.rows);";
  const fnAt = t.indexOf(FN);
  if (fnAt === -1) {
    console.log("REFUSING: carousel filter - extractOwnJsonLd not found");
    process.exit(1);
  }
  const at = t.indexOf(BLOCK, fnAt);
  if (at === -1 || at - fnAt > 2000) {
    console.log("REFUSING: carousel filter - block not found inside extractOwnJsonLd");
    process.exit(1);
  }
  t =
    t.slice(0, at) +
    `      multiOffer += got.multiOffer;
      rows.push(...got.rows.filter((r) => !CAROUSEL_SECTION.test(collapse(r.section))));` +
    t.slice(at + BLOCK.length);
  console.log("  ok: carousel filter");
}

/* 4. Cross-check against a menu book if the page happens to carry one. */
sub(
  '  const notes = ["read from schema.org Menu JSON-LD on the restaurant\'s own page"];',
  `  const notes = ["read from schema.org Menu JSON-LD on the restaurant's own page"];
  /* If this page carries a DoorDash menu book, hold the read to the same
   * standard the DoorDash branch applies: a section the book advertises and
   * the markup never mentions is a section that was cut off. On a page with no
   * menu book - every real restaurant site - this finds nothing. */
  const missing = missingSections(best.body ?? "", best.rows);
  if (missing.length)
    notes.push(
      "TRUNCATED: the page's own menu book lists " +
        missing.length +
        " section(s) the markup never carried - " +
        missing.join(", "),
    );`,
  "truncation cross-check",
);

/* 5. Say so on the way out. */
{
  /* Positional for the same reason as the carousel filter. */
  const FN = "async function extractOwnJsonLd(ctx) {";
  const BLOCK = "    ownDomain: true,\n    notes,\n  };";
  const fnAt = t.indexOf(FN);
  const at = t.indexOf(BLOCK, fnAt);
  if (fnAt === -1 || at === -1 || at - fnAt > 4000) {
    console.log("REFUSING: partial flag - return block not found inside extractOwnJsonLd");
    process.exit(1);
  }
  t =
    t.slice(0, at) +
    "    ownDomain: true,\n    partial: missing.length > 0,\n    notes,\n  };" +
    t.slice(at + BLOCK.length);
  console.log("  ok: partial flag");
}

fs.writeFileSync(P, t);
console.log("patched extractOwnJsonLd");
