import fs from 'fs';

const drift = JSON.parse(fs.readFileSync('drift_dishes.json','utf8'));
const tuthanh = JSON.parse(fs.readFileSync('tuthanh_items.json','utf8')).map(i => ({
  section: i.section, name: i.name, description: i.description||'', price: i.price
}));
const latakizaRaw = JSON.parse(fs.readFileSync('latakiza_dd.deduped.fixed.json','utf8'));
const latakiza = latakizaRaw.filter(i => i.price && i.price !== '').map(i => ({
  section: i.section, name: i.name, description: i.description||'', price: i.price
}));
const hammers = JSON.parse(fs.readFileSync('hammers_dd.deduped.json','utf8')).map(i => ({
  section: i.section, name: i.name, description: i.description||'', price: i.price
}));

const driftDishes = drift.map(d => ({ name: d.name, description: '', price: d.price, section: d.section }));

const result = [
  {
    restaurantId: "5051", name: "Super Donuts #2",
    sourceUrl: "https://www.yelp.com/biz/super-donut-2-encinitas",
    confidence: "low", dishes: [],
    blocked: "no-platform: no own site, no marketplace/ordering page found; only Yelp/directory listings with no itemized prices"
  },
  {
    restaurantId: "5962", name: "Oceanside Donut",
    sourceUrl: "https://www.yelp.com/biz/oceanside-donut-oceanside",
    confidence: "low", dishes: [],
    blocked: "no-platform: no own site, no marketplace/ordering page found; only Yelp/directory listings with no itemized prices"
  },
  {
    restaurantId: "6317", name: "Donut star",
    sourceUrl: "https://www.allmenus.com/ca/escondido/781050-donut-star/menu/",
    confidence: "low", dishes: [],
    blocked: "tier-5 aggregator only (allmenus.com); no first-party site or marketplace page found, single tier-5 source is not usable alone"
  },
  {
    restaurantId: "4571", name: "China Fun",
    sourceUrl: "http://www.chinafunranchobernardo.com/",
    confidence: "low", dishes: [],
    blocked: "own site's /menu page is a client-side redirect stub (SPA hash router) with no static prices; no marketplace page found"
  },
  {
    restaurantId: "6275", name: "Tu Thanh",
    sourceUrl: "https://themenustar4.com/webspace/functions/restaurant.php?function=get_items&restaurant_id=&code=ordertuthanh.com",
    confidence: "high",
    notes: "MenuStar platform; fetched 6 category pages directly via POST get_items and parsed priced HTML per category",
    dishes: tuthanh
  },
  {
    restaurantId: "6049", name: "La Takiza - Escondido",
    sourceUrl: "https://www.doordash.com/store/la-takiza-escondido-escondido/",
    confidence: "medium",
    notes: "DoorDash JSON-LD Menu; dropped Most Ordered carousel section before deduping (fixed an initial dedupe-before-filter bug that silently dropped Mulitas/Carne Asada Fries/Nachos); dropped 5 build-your-own taco items with blank prices",
    dishes: latakiza
  },
  {
    restaurantId: "6368", name: "Colima's Mexican Foods",
    sourceUrl: "https://www.doordash.com/store/colimas-mexican-food-bonita/",
    confidence: "low", dishes: [],
    blocked: "DoorDash JSON-LD Menu present (74 deduped items) but pricing shows a mixed/scattered cent-ending pattern with no divisor (1.00-1.35 sweep) fitting cleanly and no conventional printed-menu cent pattern either; cannot confirm real vs. inflated marketplace pricing"
  },
  {
    restaurantId: "5774", name: "Fresh Donuts",
    sourceUrl: "https://www.ubereats.com/store/fresh-donuts/",
    confidence: "low", dishes: [],
    blocked: "Uber Eats page fetched but the react-query payload contained no catalogSectionsMap/catalogItems after unescaping; no priced menu recoverable"
  },
  {
    restaurantId: "5683", name: "DJ's Pizza Express",
    sourceUrl: null,
    confidence: "low", dishes: [],
    blocked: "only source found was goto-where.com, a barred farm domain; no first-party site or marketplace page found"
  },
  {
    restaurantId: "6788", name: "La michoacana Plus San Diego #2",
    sourceUrl: "https://michoacanaplussd.com/menu",
    confidence: "low", dishes: [],
    blocked: "site's menu page carries CSS classes ai-menu/aigenblock with implausible scattered pricing, consistent with AI-generated placeholder content rather than a real restaurant menu; order.online router also flagged this as the wrong branch address"
  },
  {
    restaurantId: "5886", name: "K & K Orient Valley Food Center",
    sourceUrl: "https://kkorientvalley.netwaiter.com/escondido/menu/GetMenu",
    confidence: "low", dishes: [],
    blocked: "NetWaiter platform returns 0 priced items from both the API and the rendered /menu page; genuinely empty listing, not a fetch failure"
  },
  {
    restaurantId: "6020", name: "Kim's Bar-B-Que",
    sourceUrl: "https://kimsbarbque.netwaiter.com/san-diego/menu/GetMenu",
    confidence: "low", dishes: [],
    blocked: "NetWaiter platform returns 0 priced items from both the API and the rendered /menu page; genuinely empty listing, not a fetch failure"
  },
  {
    restaurantId: "4196", name: "Hammer's New York Pizza",
    sourceUrl: "https://www.doordash.com/store/hammer's-ny-pizza-encinitas-21895/",
    confidence: "medium",
    notes: "own site (hammersnypizza.com) times out; used DoorDash JSON-LD Menu instead. Dropped Most Ordered carousel section before deduping. Cent endings (.00/.25/.50/.70/.75/.95/.99) are varied/conventional, not a single-divisor markup signature",
    dishes: hammers
  },
  {
    restaurantId: "6043", name: "La Nueva Mexican Bakery",
    sourceUrl: "https://www.ubereats.com/store/la-nueva-mexican-bakery/",
    confidence: "low", dishes: [],
    blocked: "Uber Eats catalog successfully parsed but contains only 4 priced items (Mexican cookies, puff pastries, fruit-filled turnovers, Tres Leches) across 2 sections; below the 5-item minimum for a usable menu"
  },
  {
    restaurantId: "3814", name: "DRIFT La Jolla",
    sourceUrl: "https://www.driftlajolla.com/s/LUNCHMenu-July26-Allergensdocx.pdf",
    crossCheckedAgainst: "https://www.driftlajolla.com/s/DINNERMenu-July26-Allergens.pdf",
    confidence: "high",
    notes: "own site's /menu page has no machine-readable prices; read directly from two linked PDF menus (Lunch and Dinner) via PDF text extraction. 21 lunch + 26 dinner raw items, deduped on name+price down to 35 unique dishes (11 items appear on both menus at the same price)",
    dishes: driftDishes
  },
  {
    restaurantId: "6633", name: "PB Oriental",
    sourceUrl: "https://pborientaltogo.com/order/",
    confidence: "low", dishes: [],
    blocked: "needs-browser: own site's schema.org Restaurant record points menu to /order/, a FoodTec Solutions client-side ordering widget with no static prices in the served HTML"
  },
  {
    restaurantId: "5567", name: "Landshark Bar & Grill",
    sourceUrl: "https://www.margaritavilleresorts.com/margaritaville-hotel-san-diego/eat-drink/landshark-bar-grill",
    confidence: "low", dishes: [],
    blocked: "own site has no priced menu (no Menu JSON-LD, essentially no dollar prices in the HTML); DoorDash fetch returned no Menu JSON-LD either"
  },
  {
    restaurantId: "4647", name: "PKI Sushi",
    sourceUrl: "https://pkisushi.com/menu",
    confidence: "low", dishes: [],
    blocked: "needs-browser: old domain (genkisushisd.com) is parked (GoDaddy LANDER_SYSTEM), but found the real current site pkisushi.com; its /menu redirects to a SkyTab Online client-side ordering widget with no static prices in the served HTML"
  },
  {
    restaurantId: "6269", name: "La Cocina De Anita",
    sourceUrl: "https://www.allmenus.com/ca/escondido/713762-la-cocina-de-anita/menu/",
    confidence: "low", dishes: [],
    blocked: "tier-5 aggregator only (allmenus.com); no first-party site or marketplace page found, single tier-5 source is not usable alone"
  },
  {
    restaurantId: "4612", name: "Leucadia Pizza",
    sourceUrl: "https://scrippsranch.leucadiapizza.com/ordering/",
    confidence: "low", dishes: [],
    blocked: "needs-browser: own site's ordering link is a FoodTec Solutions client-side ordering widget (fts-root web component) with no static prices in the served HTML"
  }
];

fs.writeFileSync('../../menus/wip/result-n1728-02.json', JSON.stringify(result, null, 2));
console.log('wrote', result.length, 'entries');
