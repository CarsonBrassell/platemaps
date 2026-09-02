/*
 * Popmenu menu extractor - no browser needed.
 *
 * Popmenu was on the browser-only list because its `/menu` landing page renders
 * a client-side app and carries only a featured slice: 5 items at one
 * restaurant, 26 at another. That is a real observation and the wrong
 * conclusion. The menus live at their OWN URLs, each fully server-rendered with
 * schema.org JSON-LD including prices:
 *
 *   curl -s -L -A "<desktop UA>" "https://<site>/menu" -o landing.html
 *   grep -o '"/menus/[A-Za-z0-9/_?=&-]*' landing.html | sort -u   # the menu list
 *   curl -s -L -A "<desktop UA>" "https://<site>/menus/<slug>?location=<loc>" -o dinner.html
 *   node probe/extract_popmenu_jsonld.js dinner.html
 *
 * Sogno di Vino's dinner menu came back as 55 items across 6 sections this way,
 * against 34 prices visible anywhere on its landing page.
 *
 * FETCH EVERY MENU IN THE LIST. One page is one daypart - a restaurant with
 * lunch, dinner, specials and catering needs four fetches, and filing only
 * dinner is a partial capture. Catering is an adjunct: skip it unless it is the
 * only food the restaurant serves.
 *
 * The `window.__POPMENU_APOLLO_STATE__` blob in the same page looks promising
 * and is not: its `MenuItem` and `Dish` entries carry names and slugs with no
 * price field at all. Read the JSON-LD.
 */

const fs = require("node:fs");

const file = process.argv[2];
if (!file) {
  console.error("usage: node probe/extract_popmenu_jsonld.js <menu-page.html>");
  process.exit(1);
}

const html = fs.readFileSync(file, "utf8");

/* Every ld+json block on the page; the Menu is not reliably the first, and a
 * Popmenu page also ships Restaurant, WebSite and BreadcrumbList blocks. */
const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((m) => {
    try {
      return JSON.parse(m[1].trim());
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const graph = blocks.flatMap((b) => (Array.isArray(b) ? b : b["@graph"] ? b["@graph"] : [b]));
const menus = graph.filter((n) => n && n["@type"] === "Menu");

if (!menus.length) {
  console.error(
    `No schema.org Menu in ${file}. If this was the /menu landing page, it is ` +
      `a shell - fetch the individual /menus/<slug> pages instead.`,
  );
  process.exit(2);
}

const rows = [];
const walk = (sections, trail) => {
  for (const section of sections ?? []) {
    const name = String(section.name ?? "").trim();
    const path = name ? [...trail, name] : trail;
    for (const item of section.hasMenuItem ?? []) {
      /* `offers` is sometimes an array of size/portion offers. Take the lowest
       * as the starting price and say so; never average or invent one. */
      const offers = [].concat(item.offers ?? []).filter((o) => o && o.price != null);
      const prices = offers
        .map((o) => Number(String(o.price).replace(/[^0-9.]/g, "")))
        .filter((n) => Number.isFinite(n) && n > 0);
      rows.push({
        section: path.join(" / "),
        name: String(item.name ?? "").trim(),
        description: String(item.description ?? "").replace(/\s+/g, " ").trim(),
        price: prices.length ? `$${Math.min(...prices).toFixed(2)}` : null,
        variants: prices.length > 1 ? prices.length : 0,
      });
    }
    walk(section.hasMenuSection, path);
  }
};
for (const menu of menus) walk(menu.hasMenuSection, []);

const priced = rows.filter((r) => r.price);
for (const r of priced) console.log([r.section, r.name, r.price, r.description].join("\t"));

const multi = priced.filter((r) => r.variants).length;
console.error(
  `\n${priced.length} priced items across ${new Set(priced.map((r) => r.section)).size} sections` +
    (rows.length - priced.length ? `; ${rows.length - priced.length} carried no price and were dropped` : "") +
    (multi ? `; ${multi} had several size offers and are recorded at the lowest - say so in your notes` : ""),
);
