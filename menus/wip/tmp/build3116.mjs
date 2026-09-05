import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/AppData/Local/Temp/pm/st_dishes.json', 'utf8'));
const dishes = raw.map(d => ({
  name: d.name.replace(/^[A-Za-z0-9]{1,3}\.\s*/, ''),
  description: d.description || '',
  price: d.price,
  section: d.section
}));

const entry = {
  restaurantId: '3116',
  name: 'Sharetea',
  sourceUrl: 'https://www.doordash.com/store/35194521',
  confidence: 'medium',
  crossCheckedAgainst: '',
  blocked: '',
  notes: 'Restaurant\'s own site (1992sharetea.com, national franchise site) publishes only category descriptions with no drink names or prices -- a dish list without prices is not a menu. The location\'s own ordering platform (orderspoon.com/us.orderspoon.com) is a fully client-rendered SPA with nothing in the initial HTML. DoorDash marketplace page for this exact address (9827 Mira Mesa Blvd, San Diego, confirmed in the page text) carries the menu as server-side schema.org JSON-LD: 7 sections, 40 unique drinks after stripping the restaurant\'s own numeric item codes from the names. Prices step in $0.25 increments ($7.85, $8.10, $8.35, $8.60, $8.85) rather than landing on a clean 1.1/1.15/1.2/1.25 multiplier or .95/.99 endings, which reads as genuine tiered POS pricing rather than delivery markup, but Grubhub/Seamless (an independent owner) rendered a JS shell with no parseable prices, so no independent priced cross-check was obtained. Categories reached: Most Ordered, Milky Beverage, Fresh Brew, Fruity Beverage, Non-Caffeinated, New Matcha Series, Blueberry & Grapefruit (a limited-time series) -- Toppings are not separately priced on this page.',
  dishes
};

const path = 'menus/wip/result-60.json';
const arr = JSON.parse(fs.readFileSync(path, 'utf8'));
arr.push(entry);
fs.writeFileSync(path, JSON.stringify(arr, null, 1));
console.log('total entries now', arr.length, 'dishes', dishes.length);
