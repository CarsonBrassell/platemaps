// Shared helpers for building n1358-01 result entries.
import { readFileSync } from "node:fs";

export function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function flatten(x) {
  if (Array.isArray(x)) return x.flatMap(flatten);
  return [x];
}

// Extract dishes from a DoorDash / UberEats style page carrying schema.org
// JSON-LD (Restaurant -> hasMenu -> hasMenuSection -> hasMenuItem -> offers.price).
export function extractJsonLdMenu(file) {
  const html = readFileSync(file, "utf8");
  const blocks = [];
  const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      blocks.push(JSON.parse(m[1]));
    } catch (e) {
      // ignore
    }
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
        if (item.address) address = item.address;
      }
      let sections = item.hasMenuSection || (item.hasMenu && item.hasMenu.hasMenuSection);
      if (!sections) continue;
      sections = flatten(sections);
      for (const sec of sections) {
        if (!sec) continue;
        const secName = decodeEntities(sec.name || "");
        let menuItems = sec.hasMenuItem;
        if (!menuItems) continue;
        menuItems = flatten(menuItems);
        for (const mi of menuItems) {
          if (!mi) continue;
          const dishName = decodeEntities(mi.name);
          const desc = decodeEntities(mi.description || "");
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
  return { name, address, rows };
}
