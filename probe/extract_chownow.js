/*
 * ChowNow menu extractor - no browser needed.
 *
 * ChowNow storefronts (`direct.chownow.com/order/<company>/locations/<id>`,
 * `order.chownow.com/order/<id>`) render client-side, and the obvious endpoint
 * lies: `/api/restaurant/<id>/menu` returns `{}` with a 200, which reads like a
 * dead end and is really a missing path segment. The menu lives at a VERSIONED
 * URL, and the version is published by the restaurant endpoint:
 *
 *   curl -s -A "<desktop UA>" "https://api.chownow.com/api/restaurant/<id>" -o r.json
 *   grep -o '"next_available_time": "[0-9]*"' r.json | head -1      # e.g. 202608311045
 *   curl -s -A "<desktop UA>" \
 *     "https://api.chownow.com/api/restaurant/<id>/menu/<that value>" -o menu.json
 *   node probe/extract_chownow.js menu.json
 *
 * `next_available_time` is the next order-ahead slot, a YYYYMMDDHHMM stamp. Only
 * a value the API currently recognises returns data - an invented timestamp
 * comes back as `{}` with a 200, exactly like the unversioned path, so take it
 * from the restaurant payload rather than constructing one.
 *
 * `/api/restaurant/<id>` also carries the store address, which is how you
 * confirm you are on the right branch.
 *
 * Prices are plain dollar numbers. `size` distinguishes variants of one dish
 * ("Regular", "Large"); it is appended to the name so two sizes do not read as
 * a duplicate row.
 */

const fs = require("node:fs");

const file = process.argv[2];
if (!file) {
  console.error("usage: node probe/extract_chownow.js <menu.json>");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const categories = data.menu_categories ?? [];
if (!categories.length) {
  console.error(
    "No menu_categories in this file. An empty `{}` means the version segment " +
      "was wrong - re-read `next_available_time` from /api/restaurant/<id>.",
  );
  process.exit(2);
}

let priced = 0;
let unpriced = 0;

for (const category of categories) {
  /* "Popular Items" repeats dishes that also appear in their real sections -
   * the same carousel this pipeline drops everywhere else. */
  if (/^popular items$/i.test(String(category.name ?? "").trim())) continue;
  for (const item of category.items ?? []) {
    const price = Number(item.price);
    if (!Number.isFinite(price) || price <= 0) {
      unpriced++;
      continue;
    }
    const size = String(item.size ?? "").trim();
    const suffix = size && !/^regular$/i.test(size) ? ` (${size})` : "";
    priced++;
    console.log(
      [
        String(category.name ?? "").trim(),
        String(item.name ?? "").trim() + suffix,
        `$${price.toFixed(2)}`,
        String(item.description ?? "").replace(/\s+/g, " ").trim(),
      ].join("\t"),
    );
  }
}

console.error(
  `\n${priced} priced items across ${categories.length} categories ` +
    `(Popular Items skipped as a carousel)` +
    (unpriced ? `; ${unpriced} had no price and were dropped` : ""),
);
