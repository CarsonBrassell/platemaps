const fs = require('fs');
const OUT = 'C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-w3-07.json';

const rawDishes = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/scratch-w307/3729-dishes.json', 'utf8'));
// dedupe exact (name+price) duplicates that appear across "Most Ordered" / "Chef's Special" highlight sections
const seen = new Set();
const dedupedDishes = [];
for (const d of rawDishes) {
  const key = d.name.trim() + '|' + d.price;
  if (seen.has(key)) continue;
  seen.add(key);
  dedupedDishes.push({ name: d.name.trim(), description: '', price: d.price, section: d.section.trim() });
}

const results = [
  {
    restaurantId: '3404',
    name: 'International Market & Grill',
    sourceUrl: 'https://www.sandiegoville.com/2024/11/international-market-grill-in-la-jolla.html',
    confidence: 'high',
    notes: 'confirmed permanently closed — headline: "International Market & Grill In La Jolla Announces Closure After Three Decades Serving San Diego"',
    dishes: [],
  },
  {
    restaurantId: '4366',
    name: 'The Neighborhood Cafe',
    sourceUrl: 'https://www.yelp.com/biz/the-neighborhood-cafe-san-diego',
    confidence: 'low',
    dishes: [],
    blocked: 'needs-more-time: work list has no address or website to verify identity; one same-named candidate found (5296 University Ave, City Heights, run by nonprofit UPAC) with an active-looking DoorDash/UberEats menu, but Yelp lists it "CLOSED - Updated September 2026" — cannot confirm this is the correct business or its current status without an address in the work list',
  },
  {
    restaurantId: '4374',
    name: 'Voqozo',
    sourceUrl: 'https://www.yelp.com/biz/voqozo-san-diego',
    confidence: 'high',
    notes: 'confirmed permanently closed per Yelp ("CLOSED - Updated June 2026"); former La Jolla Village Square space has been taken over by a new restaurant (Tigawok)',
    dishes: [],
  },
  {
    restaurantId: '3608',
    name: 'Kalahari Cupboard Food and Drink',
    sourceUrl: 'https://sdzsafaripark.org/dining',
    confidence: 'high',
    notes: 'San Diego Zoo Safari Park concession stand in Nairobi Village (ice cream/snack kiosk); item names (Arctic Blast, ICEE, funnel cake, snow cones) found but no prices published anywhere — standard park-concession non-disclosure case',
    dishes: [],
  },
  {
    restaurantId: '7674',
    name: 'The Modern Churro mexican food',
    sourceUrl: 'https://www.doordash.com/en-CA/store/the-modern-churro-cafe-vista-24950558/',
    confidence: 'low',
    dishes: [],
    blocked: 'needs-more-time: address confirmed match (376 Vista Village Drive, Vista CA) via DoorDash JSON-LD, but the 91 priced items show scattered, non-conventional cent endings (e.g. .20/.23/.46/.72/.83/.86) with no single divisor (tested 1.00-1.30) recovering a clean printed-style ending for more than ~24% of items — inconsistent with either real printed pricing or a uniform markup, so prices cannot be trusted as-is; some listings also flag this DoorDash store as temporarily closed; no first-party site or other source found',
  },
  {
    restaurantId: '3729',
    name: 'San Wo HK BBQ',
    sourceUrl: 'https://www.doordash.com/store/san-wo-bbq%E4%B8%89%E7%A6%BE%E7%83%A7%E8%85%8A%EF%BC%88%E5%8E%9F%E4%B8%89%E5%92%8C%EF%BC%89-san-diego-68602/',
    confidence: 'medium',
    notes: `${dedupedDishes.length} dishes read from DoorDash JSON-LD (address confirmed match: 7330 Clairemont Mesa Boulevard). All 91 raw prices end in .50 or .99 (classic printed-menu style) with a 91/91 hit rate at no markup applied, so prices filed as-is, not divided. Deduplicated ${rawDishes.length - dedupedDishes.length} exact name+price repeats that appeared in the platform's "Most Ordered" and "Chef's Special" highlight sections in addition to their real category section.`,
    dishes: dedupedDishes,
  },
  {
    restaurantId: '3837',
    name: 'Lemonlade',
    sourceUrl: 'https://www.doordash.com/store/lemonade-san-diego-67118/',
    confidence: 'low',
    dishes: [],
    blocked: 'needs-more-time: work list has no address; likely refers to the "Lemonade" fast-casual chain (multiple San Diego locations found, at least one already closed) but cannot confirm which branch without an address in the work list',
  },
  {
    restaurantId: '4100',
    name: 'Mimosa',
    sourceUrl: 'https://order.toasttab.com/online/mimoza-mediterranean-restaurant-409-f-street',
    confidence: 'low',
    dishes: [],
    blocked: 'needs-browser: address confirmed match (409 F Street, San Diego, CA 92101) via Toast\u2019s embedded Apollo state, but that state contains only RestaurantLocation/Restaurant records, no MenuItem/price data \u2014 Toast renders this storefront\u2019s menu via a client-side GraphQL call not present in static HTML',
  },
  {
    restaurantId: '4716',
    name: 'Rush Bowls',
    sourceUrl: 'https://rushbowls.com/',
    confidence: 'low',
    dishes: [],
    blocked: 'needs-browser: work list has no address for this location; national marketing homepage only, no menu/prices, no location-specific ordering link found in static HTML; requires a location-finder lookup to identify the correct branch storefront',
  },
  {
    restaurantId: '4942',
    name: "Marieta's Mexican Grill & Seafood",
    sourceUrl: 'https://www.yelp.com/biz/marietas-grill-escondido',
    confidence: 'high',
    notes: 'confirmed permanently closed \u2014 Yelp lists exact address match (805 E Valley Pkwy, Escondido, CA 92025) as "CLOSED - Updated April 2026"',
    dishes: [],
  },
  {
    restaurantId: '4128',
    name: "Diego's Baja Grill",
    sourceUrl: 'https://www.toasttab.com/local/diegosbajagrill/r-e819bc6a-890c-4e5a-b137-4a326fd52809',
    confidence: 'low',
    dishes: [],
    blocked: 'needs-more-time: confirmed active restaurant at exact work-list address (2547 San Diego Ave, Old Town) but the Toast ordering link 404s and no DoorDash/UberEats/Grubhub listing found; web search independently confirms "online ordering is currently unavailable" for this location',
  },
  {
    restaurantId: '5067',
    name: 'Kcs Good Guys Tavern',
    sourceUrl: 'https://www.yelp.com/biz/good-guys-tavern-lemon-grove',
    confidence: 'high',
    notes: 'confirmed permanently closed \u2014 Yelp lists exact address match (7340 Broadway, Lemon Grove, CA 91945) as "CLOSED - Updated February 2026"; name lineage confirmed (Garth\u2019s Good Guys -> KC\u2019s Good Guys -> Good Guys Tavern, same venue)',
    dishes: [],
  },
];

let existing = [];
if (fs.existsSync(OUT)) {
  existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
}
const byId = new Map(existing.map(r => [r.restaurantId, r]));
for (const r of results) byId.set(r.restaurantId, r);
const merged = [...byId.values()];
fs.writeFileSync(OUT, JSON.stringify(merged, null, 2));
console.log('wrote', merged.length, 'entries to', OUT);
