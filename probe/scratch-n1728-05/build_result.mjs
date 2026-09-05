import { readFileSync, writeFileSync } from "node:fs";

const SC = "C:/Users/Calvin  Lensink/Documents/platemaps/probe/scratch-n1728-05";
const OUT = "C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-n1728-05.json";

function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

const results = [];

// 5058 - Hua Mei Cafe
results.push({
  restaurantId: "5058",
  name: "Hua Mei Cafe",
  sourceUrl: "https://sandiegozoowildlifealliance.org/sites/default/files/2024-04/04-26-24_hua-mei-cafe_web-menu.pdf",
  confidence: "high",
  notes: "first-party PDF menu from San Diego Zoo Wildlife Alliance site. Gold Peak Iced Tea and Souvenir Sipper Fountain Beverage each print one price per size tier (not per flavor) — 3 flavors available at each size price, not treated as separate dishes.",
  dishes: loadJson(`${SC}/huamei_dishes.json`),
});

// 4472 - T. P. Bánh Bao 3
results.push({
  restaurantId: "4472",
  name: "T. P. Bánh Bao 3",
  sourceUrl: "https://tpbanhbao3.com/our-menu/",
  confidence: "high",
  notes: "first-party site; items with Each/Box-of-N pricing split into one dish per size variant",
  dishes: loadJson(`${SC}/tpbb_dishes.json`),
});

// 3081 - El Mango Manila
results.push({
  restaurantId: "3081",
  name: "El Mango Manila",
  sourceUrl: "https://www.doordash.com/store/el-mango-manila-san-diego-31472402/",
  confidence: "medium",
  notes: "DoorDash JSON-LD Menu block (embedded twice, deduped by name+price+section). 'Most Ordered' carousel dropped except for 5 items with no duplicate in the 11 category sections below (Ensalada de Fruta/Fruit Salad, Fresas con Crema, #2 and #3 combo items, Escamochas) — those are kept under section 'Most Ordered (unique)' since dropping them would silently lose real menu data. Divisor sweep run on DoorDash prices (1.00-1.35): no evidence of fee inflation, prices read as printed.",
  dishes: loadJson(`${SC}/elmango_final.json`),
});

writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log("wrote", results.length, "entries to", OUT);
for (const r of results) {
  console.log(r.restaurantId, r.name, r.dishes ? r.dishes.length : 0, r.blocked ? "BLOCKED: " + r.blocked : "");
}
