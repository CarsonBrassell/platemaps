// Generic DoorDash JSON-LD extractor. Usage: node n1358-extract-dd.js <file>
import { readFileSync } from "node:fs";

const file = process.argv[2];
let html = readFileSync(file, "utf8");

// find all application/ld+json blocks
const blocks = [];
const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) {
  try {
    blocks.push(JSON.parse(m[1]));
  } catch (e) {
    console.log("PARSE FAIL block", e.message);
  }
}
console.log("blocks found:", blocks.length);

function flatten(x) {
  if (Array.isArray(x)) return x.flatMap(flatten);
  return [x];
}

const seen = new Set();
const rows = [];
let address = null;
let name = null;

for (const b of blocks) {
  const items = flatten(b);
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (item["@type"] === "Restaurant") {
      name = item.name;
      if (item.address) address = JSON.stringify(item.address);
    }
    // Menu -> hasMenuSection -> hasMenuItem -> offers.price
    let sections = item.hasMenuSection || (item.hasMenu && item.hasMenu.hasMenuSection);
    if (!sections) continue;
    sections = flatten(sections);
    for (const sec of sections) {
      if (!sec) continue;
      const secName = sec.name || "";
      let menuItems = sec.hasMenuItem;
      if (!menuItems) continue;
      menuItems = flatten(menuItems);
      for (const mi of menuItems) {
        if (!mi) continue;
        const dishName = mi.name;
        const desc = mi.description || "";
        let offers = mi.offers;
        if (!offers) continue;
        offers = flatten(offers);
        for (const off of offers) {
          if (!off || off.price == null) continue;
          let price = off.price;
          if (typeof price === "string") price = price.replace("$", "");
          price = parseFloat(price);
          if (isNaN(price)) continue;
          const key = dishName + "|" + price.toFixed(2);
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({ name: dishName, description: desc, price: "$" + price.toFixed(2), section: secName });
        }
      }
    }
  }
}

console.log("name:", name);
console.log("address:", address);
console.log("rows:", rows.length);
for (const r of rows) {
  console.log(r.section, "|", r.name, "|", r.price);
}
