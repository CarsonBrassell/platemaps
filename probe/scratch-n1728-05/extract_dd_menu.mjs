import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
const outFile = process.argv[3];
const html = readFileSync(file, "utf8");

const ldRe = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
let m;
const blocks = [];
while ((m = ldRe.exec(html))) {
  try {
    blocks.push(JSON.parse(m[1]));
  } catch (e) {
    // try array wrap
  }
}

console.log("ld+json blocks:", blocks.length);

function flatten(x) {
  if (Array.isArray(x)) return x.flatMap(flatten);
  return [x];
}

let menuBlocks = [];
for (const b of blocks) {
  const items = Array.isArray(b) ? b : [b];
  for (const it of items) {
    if (it && it["@type"] === "Menu") menuBlocks.push(it);
    if (it && it["@type"] === "Restaurant" && it.hasMenu) {
      const hm = Array.isArray(it.hasMenu) ? it.hasMenu : [it.hasMenu];
      menuBlocks.push(...hm);
    }
  }
}

console.log("menu blocks found:", menuBlocks.length);

const dishesByKey = new Map();
for (const menu of menuBlocks) {
  let sections = menu.hasMenuSection || [];
  sections = flatten(sections);
  for (const sec of sections) {
    if (!sec) continue;
    const secName = sec.name || "Menu";
    let items = sec.hasMenuItem || [];
    items = flatten(items);
    for (const it of items) {
      if (!it) continue;
      const name = it.name || "";
      const desc = it.description || "";
      let price = null;
      if (it.offers) {
        const offers = Array.isArray(it.offers) ? it.offers : [it.offers];
        for (const o of offers) {
          if (o && o.price != null) {
            price = String(o.price);
            break;
          }
        }
      }
      if (!name || price == null) continue;
      if (!price.startsWith("$")) price = "$" + price;
      const key = name + "|" + price + "|" + secName;
      if (!dishesByKey.has(key)) {
        dishesByKey.set(key, { name, description: desc, price, section: secName });
      }
    }
  }
}

const dishes = [...dishesByKey.values()];
console.log("deduped dishes:", dishes.length);
writeFileSync(outFile, JSON.stringify(dishes, null, 2));
for (const d of dishes) console.log(d.section, "|", d.name, "|", d.price);
