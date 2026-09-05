import fs from 'fs';

const dishes = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/AppData/Local/Temp/pm/aas_dishes.json', 'utf8'));

const entry = {
  restaurantId: '4397',
  name: 'Abn Al Sham',
  sourceUrl: 'https://www.doordash.com/store/abn-al-sham-el-cajon-25193468/',
  confidence: 'medium',
  crossCheckedAgainst: '',
  blocked: '',
  notes: 'The work-list website (abnalsham.top) is a fabricated templated listing, not the restaurant\'s own site: AI-written boilerplate ("Founded in 2010 by Abn Al Sham... born out of a passion for Restaurant"), recipe-blog dish names unrelated to the restaurant (Saganaki Halloumi, Ouzo Snapper) and reviews mentioning mac and cheese / fried chicken at a Middle Eastern chicken/shawarma place. Discarded and not used. Its listed address (8575 Los Coches Rd) differs slightly from the work list (8601 East Los Coches Road) but every independent source (DoorDash, Yelp, order.online, Zmenu) agrees on 8575 Los Coches Rd, El Cajon and the exact restaurant name/phone, so treated as the same restaurant with a stale work-list street number. DoorDash marketplace page carries the menu as server-side schema.org JSON-LD: 7 sections, 41 unique dishes (Most Ordered, Shawarma, Broasted/Fried Chicken, Acai Bowls, Fresh Juices, Smoothies, Energy Smoothies, Fruits & Kravings). A restaurant ordering platform (menufyy.com) is linked from search results but returned an empty response and could not be used to cross-check. One internal oddity worth flagging: the "Family Size Shawarma Combo (6 Sandwiches)" is priced higher ($117.99) than the "Super Family Shawarma Combo (8 Sandwiches)" at $76.99 -- recorded as published since it is the source\'s literal listed price, not a scrape artifact, but it may be a restaurant-side listing error.',
  dishes
};

const path = 'menus/wip/result-60.json';
const arr = JSON.parse(fs.readFileSync(path, 'utf8'));
arr.push(entry);
fs.writeFileSync(path, JSON.stringify(arr, null, 1));
console.log('total entries now', arr.length, 'dishes', dishes.length);
