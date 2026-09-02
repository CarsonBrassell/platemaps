/*
 * Clover COLO2 (`<slug>.cloveronline.com`) menu extractor.
 *
 * COLO2 is Clover's own hosted storefront - a Next.js app that renders nothing
 * useful in the DOM, which is why the playbook said to hand these back. It is
 * an RSC app, and the flight payload embedded in the ordinary page carries the
 * complete catalog. No browser, no headers beyond a desktop UA:
 *
 *   curl -s -A "<desktop UA>" "https://<slug>.cloveronline.com/menu/all" -o menu.html
 *   node probe/extract_clover_colo2.js menu.html
 *
 * The payload holds `"menu":{"categories":{...},"items":{...}}`. Categories
 * list their item ids; the items map holds name, description and price.
 *
 * PRICES ARE INTEGER CENTS. `"price":475` is $4.75. Dividing by 100 is reading
 * the field's own unit, not reconstructing a price - unlike a delivery markup,
 * nothing has been applied to it.
 *
 * A `price` of 0 means the item is priced by a size choice, and the storefront
 * itself renders those as "$0.00" in the list - verified in a browser on
 * Kaffee Meister, where 41 of 64 items show $0.00 until you open them. They are
 * dropped by default. `--with-required-modifiers` instead prices such an item
 * at the cheapest option in its REQUIRED single-choice group (minRequired >= 1,
 * maxAllowed == 1) - a 12oz latte's own listed price, read from the data, not
 * derived from anything. Optional add-on groups ("Add Whip Cream") are never
 * consulted. If you use the flag, SAY SO in the result notes: the price is the
 * smallest size, and a reader comparing against the board will see the
 * difference.
 */

const fs = require("node:fs");

const file = process.argv[2];
if (!file) {
  console.error("usage: node probe/extract_clover_colo2.js <page.html>");
  process.exit(1);
}

const src = fs.readFileSync(file, "utf8");

/* The page ships the payload more than once - as the RSC stream and escaped
 * inside script strings - and a file can hold both forms at once, so sniffing
 * "is this file escaped?" picks the wrong one and dies on a bad escape halfway
 * through. Try every occurrence in both forms and keep the first that parses. */

/* Balance braces from the opening `{`. Matching to a closing token instead is
 * how the __OO_STATE__ parser silently returned truncated menus. */
function sliceObject(s, from) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(from, i + 1);
    }
  }
  return null;
}

function findMenu(text) {
  const marker = '"menu":{"categories"';
  for (let at = text.indexOf(marker); at !== -1; at = text.indexOf(marker, at + 1)) {
    const raw = sliceObject(text, text.indexOf("{", at));
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.categories && parsed.items) return parsed;
    } catch {
      /* Wrong copy of the payload - the escaped one read as if it were plain,
       * or vice versa. Keep looking rather than giving up on the file. */
    }
  }
  return null;
}

const menu = findMenu(src) ?? findMenu(src.replace(/\\"/g, '"'));
if (!menu) {
  console.error(
    "No parseable COLO2 menu payload in this file. Check you fetched " +
      "/menu/all with a desktop UA, and that this is Clover's own hosted " +
      "storefront rather than a different product.",
  );
  process.exit(2);
}

/* `items` has been seen as an array of item objects and as an id-keyed map.
 * Normalise to a map so the category item-id lists resolve either way. */
const items = Array.isArray(menu.items)
  ? Object.fromEntries(menu.items.map((item) => [item.id, item]))
  : (menu.items ?? {});
const categories = Object.values(menu.categories ?? {}).sort(
  (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
);

const useModifiers = process.argv.includes("--with-required-modifiers");

/* Modifier prices live in a flat `modifiers` collection keyed by `groupId`;
 * the groups themselves carry only the min/max choice rules. */
const groups = Array.isArray(menu.modifierGroups)
  ? menu.modifierGroups
  : Object.values(menu.modifierGroups ?? {});
const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
const modifiers = Array.isArray(menu.modifiers)
  ? menu.modifiers
  : Object.values(menu.modifiers ?? {});
const modifiersByGroup = {};
for (const modifier of modifiers) {
  (modifiersByGroup[modifier.groupId] ??= []).push(modifier);
}

/* The cheapest configuration a customer can actually order: for EVERY required
 * group, the cheapest option in it, summed. Optional add-on groups are ignored -
 * a $0.75 whip cream is not part of a hot chocolate's price.
 *
 * Summing across required groups rather than taking one group's minimum is the
 * whole correctness of this function. A first cut took the cheapest priced
 * option across all required groups and priced a latte at $1.10 - the cheapest
 * "Half Caf" choice - because it skipped the $0.00 options that make a group
 * free. Include the zero-priced options and add the groups together and the
 * same latte comes out at its real $4.75. */
function startingPrice(item) {
  let total = 0;
  let priced = false;
  const labels = [];
  for (const groupId of item.modifierGroupIds ?? []) {
    const group = groupById[groupId];
    if (!group || (group.minRequired ?? 0) < 1) continue;
    const options = (modifiersByGroup[groupId] ?? []).filter((m) =>
      Number.isInteger(m.price),
    );
    if (!options.length) continue;
    const cheapest = options.reduce((a, b) => (b.price < a.price ? b : a));
    total += cheapest.price;
    if (cheapest.price > 0) {
      priced = true;
      labels.push(cheapest.name);
    }
  }
  return priced ? { cents: total, label: labels.join(", ") } : null;
}

let priced = 0;
let modifierPriced = 0;
let recovered = 0;
const seen = new Set();

for (const category of categories) {
  for (const id of category.items ?? []) {
    const item = items[id];
    if (!item || item.available === false) continue;
    let cents = item.price;
    let sizeNote = "";
    if (!Number.isInteger(cents) || cents <= 0) {
      const fallback = useModifiers ? startingPrice(item) : null;
      if (!fallback) {
        modifierPriced++;
        continue;
      }
      cents = fallback.cents;
      sizeNote = fallback.label ? ` (${fallback.label})` : "";
      recovered++;
    }
    /* An item listed under two categories is one dish, not two. */
    const key = `${category.name} ${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    priced++;
    console.log(
      [
        category.name,
        String(item.name ?? "").trim() + sizeNote,
        `$${(cents / 100).toFixed(2)}`,
        String(item.description ?? "").replace(/\s+/g, " ").trim(),
      ].join("\t"),
    );
  }
}

console.error(
  `\n${priced} priced items across ${categories.length} categories` +
    (recovered
      ? `; ${recovered} of them priced at their smallest REQUIRED size option ` +
        `(--with-required-modifiers) - say so in your notes`
      : "") +
    (modifierPriced
      ? `; ${modifierPriced} carry no list price and were dropped` +
        (useModifiers
          ? " even with --with-required-modifiers (no required single-choice group)"
          : " - re-run with --with-required-modifiers to price them by smallest size")
      : ""),
);
