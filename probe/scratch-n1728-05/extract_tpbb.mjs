import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("C:/Users/Calvin  Lensink/Documents/platemaps/probe/scratch-n1728-05/tpbb.html", "utf8");

const catNames = {
  "meat-buns": "Meat Buns",
  "sweet-buns": "Sweet Buns",
  "veggie-buns": "Veggie Buns",
  "side-dishes": "Side Dishes",
  "drinks": "Drinks",
};

// Split on each item opening tag, keep the category class from that tag.
const parts = html.split(/<li class="item /).slice(1); // drop preamble

const dishes = [];
for (const part of parts) {
  const catM = part.match(/dishes_categories-([a-z0-9-]+)"/);
  const cat = catM ? catM[1] : "unknown";
  const section = catNames[cat] || cat;
  const nameM = part.match(/<h2><span class="title">([^<]+)<\/span><\/h2>/);
  if (!nameM) continue;
  const name = nameM[1].replace(/&#038;/g, "&").trim();

  const varRe = /<span class="label">([^<]+)<\/span>\s*-\s*<span class="var-price"><span class="currency">\$<\/span>([0-9.]+)<\/span>/g;
  let vm;
  const variants = [];
  while ((vm = varRe.exec(part))) {
    variants.push({ label: vm[1].trim(), price: vm[2] });
  }

  const descM = part.match(/<div class="description">([\s\S]*?)<\/div>\s*(?:<\/li>|<div class="thumbnail">|$)/);

  if (variants.length) {
    for (const v of variants) {
      dishes.push({ name: `${name} (${v.label})`, description: "", price: `$${v.price}`, section });
    }
  } else {
    const sm = part.match(/<span class="dm-price">(?:<span class="dm-price">)?<span class="currency">\$<\/span>([0-9.]+)<\/span>/);
    let desc = "";
    if (descM) desc = descM[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (desc === name) desc = "";
    if (sm) dishes.push({ name, description: desc, price: `$${sm[1]}`, section });
  }
}

console.log("Total dishes:", dishes.length);
writeFileSync("C:/Users/Calvin  Lensink/Documents/platemaps/probe/scratch-n1728-05/tpbb_dishes.json", JSON.stringify(dishes, null, 2));
for (const d of dishes) console.log(d.section, "|", d.name, "|", d.price);
