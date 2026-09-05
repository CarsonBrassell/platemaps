import fs from 'fs';

const dishes = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/AppData/Local/Temp/pm/vk_dishes.json', 'utf8'));

const entry = {
  restaurantId: '4555',
  name: 'Village Kitchen',
  sourceUrl: 'https://www.doordash.com/store/village-kitchen-san-diego-724046/',
  confidence: 'medium',
  crossCheckedAgainst: '',
  blocked: '',
  notes: 'Work-list website is the restaurant\'s own Chowbus storefront (pos.chowbus.com/online-ordering/store/13590), which is a fully client-rendered Next.js app-router page with no menu data in the fetched HTML and no discoverable public REST endpoint after several attempts -- genuinely needs a browser. Fell back to the DoorDash marketplace page for the same address (4720 Clairemont Mesa Boulevard, matches exactly), which carries the menu as server-side schema.org JSON-LD: 11 sections, 70 unique dishes after de-duplication (Most Ordered, House Special, Beef & Lamb, Chicken & Duck, Hunan Style Stir Fry, Pork, Seafood, Smoked Pork Stir, Appetizer/Soup, Vegetable, Rice & Soup & Dessert). Ran the markup division test (1.1/1.15/1.2/1.25/1.3) across all 70 non-round prices: at most 10% land on a round or .95/.99 value at any single divisor, well under the threshold for suspected markup, so the odd cent endings ($23.70, $14.82, $23.94) read as genuine restaurant pricing rather than a platform multiplier. Grubhub listing exists for this address but rendered a JS shell with no parseable prices, so no independent cross-check was obtained. This is a large, well-shaped Hunan/Sichuan menu (fish, frog, stinky tofu per description elsewhere) and the section spread looks complete for the cuisine.',
  dishes
};

const path = 'menus/wip/result-60.json';
const arr = JSON.parse(fs.readFileSync(path, 'utf8'));
arr.push(entry);
fs.writeFileSync(path, JSON.stringify(arr, null, 1));
console.log('total entries now', arr.length, 'dishes', dishes.length);
