const fs = require('fs');
const raw = fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/scratch-n1358-06/cocina-raw.txt', 'utf8');
const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

const sectionHeaders = new Set([
  "Breakfast","Botanas","Ceviche","Caldos (Soups)","Cocteles","Filete de Pescado (Fish Fillet)",
  "Pescados (Fish)","Camarones (Shrimp)","Antojitos Mexicanos","Enchiladas","Quesadillas","Tacos",
  "Tortas","Burritos","Nachos/French Fries","Kid's Menu","Postres (Desserts)","Bebidas (Drinks)",
  "Caguama","Chile Relleno a la Carta","Ensaladas","Menudo","Sides","Week Day Beer Special","Wings"
]);
const noteLine = "Servido con arroz y frijoles (with rice and beans)";
const priceRe = /^\$\d+(\.\d{2})?$/;

let section = null;
const dishes = [];
let i = 0;
let justSetHeader = false;
while (i < lines.length) {
  const line = lines[i];
  if (!justSetHeader && sectionHeaders.has(line)) {
    section = line;
    i++;
    if (lines[i] === noteLine) i++;
    justSetHeader = true;
    continue;
  }
  justSetHeader = false;
  // line is a dish name
  const name = line;
  i++;
  let desc = "";
  if (i < lines.length && !priceRe.test(lines[i])) {
    desc = lines[i];
    i++;
  }
  if (i < lines.length && priceRe.test(lines[i])) {
    const price = lines[i];
    i++;
    dishes.push({ name, description: desc, price, section });
  } else {
    console.log("WARN: no price found for", name, "next line:", lines[i]);
  }
}

console.log("total dishes parsed:", dishes.length);
const bySection = {};
for (const d of dishes) bySection[d.section] = (bySection[d.section]||0)+1;
console.log(bySection);

fs.writeFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/scratch-n1358-06/cocina-dishes.json', JSON.stringify(dishes, null, 2));
console.log("wrote cocina-dishes.json");
