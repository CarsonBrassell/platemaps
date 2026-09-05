import fs from 'fs';

const foodRows = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/AppData/Local/Temp/pm/fs_rows2.json', 'utf8'));
const drinkItems = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/AppData/Local/Temp/pm/fs_drinks_items.json', 'utf8'));

// food sections in listed order with known item counts
const sectionCounts = [
  ['SNACKS', 6], ['SHARES', 6], ['SALADS', 3], ['BETWEEN BREAD', 8], ['ENTREES', 4], ['SWEETS', 2]
];
const dishes = [];
let i = 0;
for (const [secName, count] of sectionCounts) {
  for (let n = 0; n < count; n++) {
    const nameRow = foodRows[i]; const descRow = foodRows[i+1]; const priceRow = foodRows[i+2];
    dishes.push({
      name: nameRow.text,
      description: descRow.text.replace(/\s*\n\s*/g, ' ').trim(),
      price: priceRow.text.startsWith('$') ? (priceRow.text.includes('.') ? priceRow.text : priceRow.text + '.00') : '$' + priceRow.text,
      section: secName
    });
    i += 3;
  }
}

for (const d of drinkItems) {
  dishes.push({
    name: d.name,
    description: d.description.replace(/\\n/g, ' ').trim(),
    price: d.price,
    section: d.section
  });
}

const entry = {
  restaurantId: '5275',
  name: 'Fernside',
  sourceUrl: 'https://www.fernsidebar.com/menus',
  confidence: 'high',
  crossCheckedAgainst: '',
  blocked: '',
  notes: "Own site (Wix restaurant-menu widget). The FOOD tab renders server-side with data-hook=\"item.name/description/price\" markup (29 dishes across Snacks, Shares, Salads, Between Bread, Entrees, Sweets). The DRINKS tab (Cocktails, Wine) is not server-rendered at that URL, but its full item data -- names, descriptions, formatted prices -- is embedded as warmup JSON in the same page's initial HTML (found by section ID, not by guesswork), giving 13 cocktails and 6 wines. A BEER section exists in the site's data model but is not one of the two section IDs listed under the DRINKS menu, so it is not currently published there and was left out rather than guessed in. All food and the two published drink sections are covered; this reads as the complete current menu for a gastropub.",
  dishes
};

const path = 'menus/wip/result-60.json';
const arr = JSON.parse(fs.readFileSync(path, 'utf8'));
arr.push(entry);
fs.writeFileSync(path, JSON.stringify(arr, null, 1));
console.log('total entries now', arr.length, 'dishes', dishes.length);
