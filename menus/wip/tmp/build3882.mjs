import fs from 'fs';

const dishes = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/AppData/Local/Temp/pm/hw_dishes.json', 'utf8'));

const entry = {
  restaurantId: '3882',
  name: 'Hideaway',
  sourceUrl: 'https://www.doordash.com/en-US/store/41049641',
  confidence: 'medium',
  crossCheckedAgainst: '',
  blocked: '',
  notes: 'Own site (hideawaypb.com) returns a genuine Cloudflare 403/challenge on every fetch attempt -- confirmed by curl with a real Chrome UA and by the r.jina.ai reader proxy, both blocked identically ("Just a moment..." challenge), so this is a real bot-mitigation wall rather than a UA problem. A "placejoys.com" listing surfaced in search but is on the project\'s hard-reject directory-farm list and was not used. DoorDash marketplace page for this exact address (4474 Mission Blvd, matches work list) carries the menu as server-side schema.org JSON-LD: 9 sections, 54 unique dishes (Most Ordered, Soup and Share, Artisanal Wood Fired Pizza, Five Essential Salads, Between the Bread, American Regional Classics, On the Side, Dessert, Kids Menu) -- matches the wood-fired-pizza/burger/salad/American-classics description found elsewhere. Entree prices are clean quarter-dollar increments ($21.50, $24.00, $32.50), but the "On the Side" and "Kids Menu" items carry odd repeating cents ($6.93, $10.40, $8.51, $5.67) that do not fit the standard 1.1/1.15/1.2/1.25 markup test (no consistent divisor found) but look like a per-item DoorDash fee absorption rather than restaurant-set prices -- flagging rather than dropping since no second source was reachable to confirm either way (the official site is Cloudflare-blocked and Grubhub rendered a JS shell with no data).',
  dishes
};

const path = 'menus/wip/result-60.json';
const arr = JSON.parse(fs.readFileSync(path, 'utf8'));
arr.push(entry);
fs.writeFileSync(path, JSON.stringify(arr, null, 1));
console.log('total entries now', arr.length, 'dishes', dishes.length);
