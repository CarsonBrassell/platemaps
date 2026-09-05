import fs from 'fs';

const dishes = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/AppData/Local/Temp/pm/erm_dishes.json', 'utf8'));

const entry = {
  restaurantId: '1776',
  name: 'El Rey Moro Taco Shop',
  sourceUrl: 'https://www.doordash.com/store/el-rey-moro-taco-shop-san-diego-63714/',
  confidence: 'medium',
  crossCheckedAgainst: '',
  blocked: '',
  notes: 'No official website on file (a "elreymoro.top" domain surfaced in search but was not used -- same fabricated-listing-farm pattern as other .top sites flagged this batch, not investigated further since a real priced source was already in hand). DoorDash marketplace page for this exact address (4471 Clairemont Mesa Boulevard, matches work list) carries the menu as server-side schema.org JSON-LD: 14 sections, 75 unique dishes (Most Ordered, Tortas, Soft Tacos, Hard Tacos, Tostadas, French Fries/Chips, Quesadillas, Extras, Seafood, Soups, Side Orders, Drinks, Drinks - Aguas Frescas, and a small catch-all "Menu" section). Ran the markup division test across all non-round prices: at most 11% land on a round/.95/.99 value at any divisor (1.1-1.3), well under the threshold, so no evidence of delivery markup. Note on structure: this menu has no dedicated "Burritos" header -- burrito items (California, HashBrown, Quesabirrias, Carne Asada) are listed by variant name inside Most Ordered and other sections rather than under their own category, which is how the source itself organizes them, not an omission on capture.',
  dishes
};

const path = 'menus/wip/result-60.json';
const arr = JSON.parse(fs.readFileSync(path, 'utf8'));
arr.push(entry);
fs.writeFileSync(path, JSON.stringify(arr, null, 1));
console.log('total entries now', arr.length, 'dishes', dishes.length);
