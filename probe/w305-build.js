// Build/update menus/wip/result-w3-05.json from scratch JSONL files.
const fs = require('fs');
const path = require('path');

const SCRATCH = "C:/Users/Calvin  Lensink/AppData/Local/Temp/claude/C--Users-Calvin--Lensink/55a7518e-e6c8-4b37-8070-eca187b845fc/scratchpad";
const OUT = "C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-w3-05.json";

function loadJsonl(file, opts = {}) {
  const p = path.join(SCRATCH, file);
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  const seen = new Set();
  const out = [];
  for (const r of lines) {
    if (opts.dropSections && opts.dropSections.includes(r.section)) continue;
    let price = opts.addDollar && !r.price.startsWith('$') ? '$' + r.price : r.price;
    // normalize to always have 2 decimal places, e.g. $8.5 -> $8.50, $8 -> $8.00
    const pm = price.match(/^\$(\d+)(?:\.(\d+))?$/);
    if (pm) {
      const cents = (pm[2] || '').padEnd(2, '0').slice(0, 2);
      price = '$' + pm[1] + '.' + (cents || '00');
    }
    const key = r.section + '|' + r.name + '|' + price;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: r.name, description: r.desc || '', price, section: r.section });
  }
  return out;
}

const entries = [];

// 1. Mariscos De La Riviera (3179)
entries.push({
  restaurantId: "3179",
  name: "Marisco's De La Riviera",
  sourceUrl: "https://www.doordash.com/store/mariscos-la-riviera-san-diego-689596/",
  confidence: "medium",
  notes: "DoorDash marketplace listing; schema.org Menu JSON-LD appeared twice (identical) in the page, deduped to 59 unique dishes. Address on the DoorDash listing matches worklist name/area (San Diego). Cent distribution near-clean at divisor 1.00 (no delivery-fee markup detected). Capped at medium per source-ladder rule for white-label delivery platforms.",
  dishes: loadJsonl('w305-mariscos-out.txt'),
});

// 2. Soda & Swine (3020) - blocked
entries.push({
  restaurantId: "3020",
  name: "Soda & Swine",
  sourceUrl: "https://sodaandswine.com",
  confidence: "low",
  dishes: [],
  blocked: "needs-browser: site publishes menu only as PDF; pdftotext yielded no text layer (3 bytes) on both PDFs found (Liberty Station and UCSD locations), and probe/extract_pdf_images.js found no embedded JPEGs in either PDF to read visually. No text and no images to extract prices from.",
});

// 3. Poke Poke (3088)
entries.push({
  restaurantId: "3088",
  name: "Poké Poké",
  sourceUrl: "https://www.doordash.com/store/poki-poki-oceanside-408438/",
  confidence: "medium",
  notes: "DoorDash marketplace listing (store name on DoorDash is 'Poki Poki', matches worklist 'Poké Poké'; address 3480 Marron Road matches Oceanside location in worklist). schema.org Menu JSON-LD appeared twice (identical), deduped to 41 unique dishes. Dropped a 'Most Ordered' carousel section (12 items x2 = 24 lines) after confirming every item there was a duplicate (same name AND price) of an item already counted in its real section (e.g. Build Your Own Hawaiian Poke Bowl, Beverages, Milk Tea).",
  dishes: loadJsonl('w305-pokipoki-out.txt', { dropSections: ['Most Ordered'] }),
});

// 4. Purple Mint Vegetarian Bistro (2443)
entries.push({
  restaurantId: "2443",
  name: "Purple Mint Vegetarian Bistro",
  sourceUrl: "https://www.thepurplemint.net/dining-menu-at-mission-gorge/",
  confidence: "high",
  notes: "Restaurant's own site (Popmenu-hosted). Popmenu's schema.org offers.price field has no '$' prefix in source; prepended for all 48 dishes.",
  dishes: loadJsonl('w305-purplemint-out.txt', { addDollar: true }),
});

// 5. Famers Table (3256) [worklist spelling preserved]
entries.push({
  restaurantId: "3256",
  name: "Famers Table",
  sourceUrl: "https://www.doordash.com/store/farmer-s-table-chula-vista--san-diego-1639929/",
  confidence: "medium",
  notes: "Restaurant's own Toast site returned only a metadata shell (hasOnlineOrderingModule:false, no items) on both the item-detail page and /menu's __OO_STATE__ blob, so fell back to the DoorDash white-label listing. Address on DoorDash matches worklist (330 F Street, Chula Vista). schema.org Menu JSON-LD appeared twice (identical), deduped to 91 unique dishes across Dinner and Brunch dayparts; section names prefixed with daypart per source. Cent distribution near-clean at divisor 1.00.",
  dishes: loadJsonl('w305-farmerstable-dd-out.txt'),
});

// 6. Nami (2485) - not found, permanently closed
entries.push({
  restaurantId: "2485",
  name: "Nami",
  sourceUrl: "https://www.yelp.com/biz/nami-sushi-san-diego",
  confidence: "high",
  dishes: [],
  notes: "Worklist website (namica.org) is an unrelated mental-health nonprofit. Initially found and extracted a same-named 'Nami' sushi site (namisushibar.com) but its footer address (22245 El Paseo, Rancho Santa Margarita, CA 92688) is a different Orange County business, not this San Diego restaurant -- discarded. The actual San Diego Nami (501 University Ave, Hillcrest) is confirmed permanently closed via Yelp/Foursquare listings. No menu published anywhere for the correct restaurant.",
});

// 7. R&B Tea (2761)
entries.push({
  restaurantId: "2761",
  name: "R&B Tea",
  sourceUrl: "https://www.doordash.com/store/r-b-tea-san-diego-942071/",
  confidence: "medium",
  notes: "DoorDash marketplace listing. schema.org Menu JSON-LD appeared twice (identical), deduped to 67 unique dishes. Cent distribution is scattered (not a clean single divisor), but boba-shop menus commonly price this way; no evidence of a proportional delivery-fee markup found in the divisor sweep, so filed as-is rather than blocked.",
  dishes: loadJsonl('w305-rbtea-out.txt'),
});

// 8. Baba's Pizza (2244) - blocked
entries.push({
  restaurantId: "2244",
  name: "Baba's Pizza",
  sourceUrl: "https://www.babaspizzaco.com/menu",
  confidence: "low",
  dishes: [],
  blocked: "needs-browser: ghost-kitchen brand (Webflow site, shares ownership with The Halal Shack/Jamal's Chicken) whose /menu page renders all items via client-side JS after a location picker; no prices, no ordering-platform links, and no ordering-platform hint (Toast/Clover/ChowNow/DoorDash/etc.) present anywhere in the static HTML.",
});

// 9. Barking Deer Pizza & Beer (5438) - blocked
entries.push({
  restaurantId: "5438",
  name: "Barking Deer Pizza & Beer",
  sourceUrl: "https://sandiegozoowildlifealliance.org/dining/barking-deer/menu",
  confidence: "low",
  dishes: [],
  blocked: "found the vendor's own menu link off the Safari Park dining page (a PDF); pdftotext yielded only a disclaimer sentence (no price text layer), and probe/extract_pdf_images.js pulled 2 embedded page images that show item names/descriptions but NO prices anywhere -- this theme-park vendor's published menu collateral simply does not list prices.",
});

// 10. El Dorado (2430) - blocked
entries.push({
  restaurantId: "2430",
  name: "El Dorado",
  sourceUrl: "http://www.eldoradosd.com",
  confidence: "low",
  dishes: [],
  blocked: "worklist website (eldoradosd.com) is El Dorado Coatings Inc, a sandblasting/powder-coating shop at the same address (2694 Commercial St) -- not a restaurant. Searched for any 'El Dorado' restaurant at this address or nearby; found none. Other same-named San Diego restaurants (El Dorado Cocktail Lounge at 1030 Broadway, Mariscos El Dorado at 5801 University Ave) are at different addresses and both already closed. Cannot confirm this restaurant's identity or that it ever operated at the given address.",
});

// 11. Slip Inn (1017) - not found
entries.push({
  restaurantId: "1017",
  name: "Slip Inn",
  sourceUrl: "https://www.yelp.com/biz/slip-inn-san-diego",
  confidence: "high",
  dishes: [],
  notes: "Confirmed closed on Yelp (4046 30th St, San Diego). The address now hosts a different, unrelated business (Little Sisters Pizza) -- that successor's menu does not belong under this restaurant's id per the closed-restaurant rule. No menu ever findable for Slip Inn itself.",
});

// 12. House Of Draught No 2 (1020) - blocked
entries.push({
  restaurantId: "1020",
  name: "House Of Draught No 2",
  sourceUrl: "",
  confidence: "low",
  dishes: [],
  blocked: "no business matching this exact name (or plausible variants: 'House of Draft', 'House of Draught') found anywhere in San Diego via web search; no address or website given in the worklist to narrow further.",
});

// 13. BNCafe (2759) - blocked
entries.push({
  restaurantId: "2759",
  name: "BNCafe",
  sourceUrl: "https://www.yelp.com/biz/bne-cafe-san-diego",
  confidence: "low",
  dishes: [],
  blocked: "likely match found -- BNE Cafe, 2400 E 4th St, National City/San Diego 91950 (coffee shop inside Paradise Valley Hospital) -- but no priced menu source located: no restaurant-owned website, no delivery-platform (DoorDash/UberEats/Grubhub) listing found. Only Yelp photos and directory blurbs with a few item names, no prices.",
});

// 14. V/ Workout Bar (2927) - blocked
entries.push({
  restaurantId: "2927",
  name: "V/ Workout Bar",
  sourceUrl: "",
  confidence: "low",
  dishes: [],
  blocked: "no business matching this name found anywhere in San Diego via web search (tried as a juice/smoothie bar inside a gym, and variant phrasings). No address or website given in the worklist to narrow further.",
});

// 15. Poke Point (2851) - blocked
entries.push({
  restaurantId: "2851",
  name: "Poke Point",
  sourceUrl: "https://www.menupix.com/sandiego/restaurants/30311528/Poke-Point-Poway-CA",
  confidence: "low",
  dishes: [],
  blocked: "only one source found at all -- a menupix (tier-5) listing for a Poway, CA location -- and no worklist address to confirm this is even the same branch as the restaurantId being worked. Tier-5 sources need a second independent-owner corroborating source before they count per the source-ladder rule; none found (no allmenus/DoorDash/UberEats/own-site listing turned up).",
});

// 16. Cafe Virtuoso (2958) - not found
entries.push({
  restaurantId: "2958",
  name: "Cafe Virtuoso",
  sourceUrl: "https://www.yelp.com/biz/cafe-virtuoso-san-diego",
  confidence: "high",
  dishes: [],
  notes: "Yelp lists this business as CLOSED, consistently across repeated snapshots through mid-2026. Its own domain (cafevirtuoso.com) failed to connect on three separate attempts across this session (router + two of my own retries, including a final -m15 timeout on both '/' and '/cafe'), consistent with the site having gone dark rather than a transient network blip. No delivery-platform listing found. Treating as permanently closed.",
});

// 17. Cafe Fresh (2924) - blocked
entries.push({
  restaurantId: "2924",
  name: "Cafe Fresh",
  sourceUrl: "https://freshplatecatering.com",
  confidence: "low",
  dishes: [],
  blocked: "worklist website (freshplatecatering.com) is a catering company in Northern Colorado -- wrong business and wrong state. Several similarly-named San Diego candidates exist (Fresheria/Be Fresh in Barrio Logan, Simply Fresh, Fres.co at the Omni hotel) but none is confidently 'Cafe Fresh' specifically, and the worklist gives no address to disambiguate. Needs a clearer identifying detail.",
});

// 18. Chile Peppers (3056) - not found
entries.push({
  restaurantId: "3056",
  name: "Chile Peppers",
  sourceUrl: "https://www.yelp.com/biz/chile-peppers-mexican-eatery-tierrasanta-san-diego",
  confidence: "high",
  dishes: [],
  notes: "Chile Peppers Mexican Eatery had two San Diego locations (Tierrasanta, 10425 Tierrasanta Blvd; Scripps Ranch, 10299 Scripps Trl) -- both confirmed closed on Yelp. No third location or successor found.",
});

// 19. Double Black Lounge Bar & Kitchen (3371) - not found
entries.push({
  restaurantId: "3371",
  name: "Double Black Lounge Bar & Kitchen",
  sourceUrl: "https://www.yelp.com/biz/double-black-lounge-bar-and-kitchen-san-diego",
  confidence: "high",
  dishes: [],
  notes: "Confirmed closed on Yelp (534 5th Ave, Gaslamp). The address now hosts a different, unrelated business (Kaluu Restaurant & Lounge) -- that successor's menu does not belong under this restaurant's id per the closed-restaurant rule.",
});

// 20. Rough Draft Brewing Company (3262) - not found
entries.push({
  restaurantId: "3262",
  name: "Rough Draft Brewing Company",
  sourceUrl: "https://www.yelp.com/biz/rough-draft-brewing-company-san-diego",
  confidence: "high",
  dishes: [],
  notes: "Worklist address (12925 El Camino Real) was a satellite venue ('Rough Draft Brewing at Sky Deck', Carmel Valley) that has closed. The main Rough Draft Brewing Company is also listed CLOSED on Yelp (updated through August 2026). No open location or published menu found for either.",
});

fs.writeFileSync(OUT, JSON.stringify(entries, null, 2));
console.log('wrote', entries.length, 'entries to', OUT);
for (const e of entries) {
  console.log(e.restaurantId, e.name, '-', e.dishes.length, 'dishes', e.blocked ? '[BLOCKED]' : (e.dishes.length === 0 ? '[NOT-FOUND]' : '[FILED]'));
}
