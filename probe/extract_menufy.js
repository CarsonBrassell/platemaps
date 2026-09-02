/*
 * Menufy menu extractor - no browser needed.
 *
 * A `<slug>.menufy.com` storefront serves a 27KB shell with two prices in it,
 * which is why these were logged as needing a browser. The app then calls a
 * public JSON API with a STATIC api_key that is the same on every storefront:
 *
 *   curl -s -A "<desktop UA>" "https://<slug>.menufy.com/" -o site.html
 *   grep -o 'location_menufy_id":[0-9]*' site.html          # the location id
 *   curl -s -A "<desktop UA>" \
 *     "https://api.menufy.com/v1/locations/<id>/categories/all?api_key=U3BlZWR5RGVzZXJ0VG9ydG9pc2U=" \
 *     -o menu.json
 *   node probe/extract_menufy.js menu.json
 *
 * The key decodes to a product codename, not a credential of ours - it is
 * shipped to every visitor in the page. `itemPrice` is a plain number in
 * dollars (10.99), not cents.
 *
 * `itemPriceHasUpgrades: true` means the listed price is a base that size or
 * option choices add to. That is the item's own starting price and is recorded
 * as such - but say so in your notes when many items carry it.
 */

const fs = require("node:fs");

const file = process.argv[2];
if (!file) {
  console.error("usage: node probe/extract_menufy.js <categories-all.json>");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const categories = data.categories ?? [];
if (!categories.length) {
  console.error("No categories in this response. Check the location id.");
  process.exit(2);
}

let priced = 0;
let unpriced = 0;
let upgrades = 0;

for (const category of categories.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))) {
  if (category.isDeleted || category.isActive === false) continue;
  for (const item of category.items ?? []) {
    if (item.isDeleted || item.isActive === false) continue;
    const price = Number(item.itemPrice);
    if (!Number.isFinite(price) || price <= 0) {
      unpriced++;
      continue;
    }
    if (item.itemPriceHasUpgrades) upgrades++;
    priced++;
    console.log(
      [
        String(category.name ?? "").trim(),
        String(item.name ?? "").trim(),
        `$${price.toFixed(2)}`,
        String(item.description ?? "").replace(/\s+/g, " ").trim(),
      ].join("\t"),
    );
  }
}

console.error(
  `\n${priced} priced items across ${categories.length} categories` +
    (upgrades ? `; ${upgrades} are base prices that size/option choices add to` : "") +
    (unpriced ? `; ${unpriced} had no price and were dropped` : ""),
);
