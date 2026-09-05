import { writeFileSync } from "node:fs";
import { extractJsonLdMenu } from "./n1358-lib.js";

const SCRATCH = "C:/Users/CALVIN~1/AppData/Local/Temp/claude/C--Users-Calvin--Lensink/55a7518e-e6c8-4b37-8070-eca187b845fc/scratchpad";
const OUT = "C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-n1358-01.json";

const results = [];

function fileEntry({ restaurantId, name, file, sourceUrl, confidence, notes }) {
  const { rows } = extractJsonLdMenu(`${SCRATCH}/${file}`);
  results.push({
    restaurantId,
    name,
    sourceUrl,
    confidence,
    notes,
    dishes: rows,
  });
}

function manual(entry) {
  results.push(entry);
}

// --- 6657 Ali Baba Mediterranean Cuisine of Escondido ---
fileEntry({
  restaurantId: "6657",
  name: "Ali Baba Mediterranean Cuisine of Escondido",
  file: "n1358-alibaba.html",
  sourceUrl: "https://www.doordash.com/en/store/ali-baba-mediterranean-cuisine-escondido-1471333/",
  confidence: "medium",
  notes: "DoorDash schema.org JSON-LD, single tier-3 source; address confirmed 201 West Mission Avenue, Escondido. Cents cluster on .95/.98/.99 (printed-menu pattern), no markup indication. 'Most Ordered' carousel kept - several items (Chicken Tikka Plate, #1/#2 combos, Chicken Shawarma Wrap, Greek Salad, Lentil Soup) do not reappear elsewhere in the catalog.",
});

// --- 6165 Isushi - All You Can Eat ---
fileEntry({
  restaurantId: "6165",
  name: "Isushi - All You Can Eat",
  file: "n1358-isushi3.html",
  sourceUrl: "https://page-service.doordash.com/store/isushi-chula-vista-84467/",
  confidence: "medium",
  notes: "Despite the AYCE branding, DoorDash carries a full a-la-carte menu (rolls, sushi, sashimi, appetizers) with per-item prices - not a per-person-only house, so filed rather than not_found. Address confirmed 945 Otay Lakes Road, Chula Vista. Cents on .95/.75/.50/.25/.49 - conventional. Single tier-3 source. 'Most Ordered' carousel kept - no full duplication of core sections found on de-dup.",
});

// --- 6152 Kung Fu Noodle ---
fileEntry({
  restaurantId: "6152",
  name: "Kung Fu Noodle",
  file: "n1358-kungfu.html",
  sourceUrl: "https://www.ubereats.com/store/kung-fu-noodle-1233-east-vista-way/LQ3QrKHwVf6rmIBCL0hKXQ",
  confidence: "medium",
  notes: "Uber Eats schema.org JSON-LD (Restaurant/hasMenu), single tier-3 source. Address confirmed 1233 East Vista Way, Vista. Cents entirely .99/.95/.00/.50 - conventional, no markup indication.",
});

// --- 6127 Burros & Fries Telegraph --- BLOCKED
manual({
  restaurantId: "6127",
  name: "Burros & Fries Telegraph",
  sourceUrl: "https://page-service.doordash.com/store/burros-and-fries-chula-vista-106180/",
  confidence: "low",
  dishes: [],
  blocked: "Only reachable source is DoorDash (Caviar and order.online both 403; no restaurant-owned site found). Prices are scattered cents (.39/.59/.87/.03/.83/.98/.78/.14/.26 etc) with no clean divisor across 1.00-1.35 (best 1.20 hits only 20/82=24%) - cannot confirm these are wall prices rather than a DoorDash markup, and no priced first-party source exists to cross-check.",
});

// --- 6724 Hanu Korean BBQ --- filed (drinks/dessert only; AYCE food unpriced)
manual({
  restaurantId: "6724",
  name: "Hanu Korean BBQ",
  sourceUrl: "https://www.hanukbbqsd.com/",
  confidence: "high",
  notes: "Own-site photographed menu (first-party domain). Core AYCE Korean BBQ food menu is per-person flat-rate only (Regular $35.99pp, Premium $45.99pp) with NO itemized food prices, so no food dishes are recorded here (per not_found/AYCE rule this alone would be not_found, but the site also carries a fully itemized drinks & dessert menu, which is filed below). Items with no printed price (mixer-only cocktails: Screw Driver, Whiskey Soul, Henny & Coke, Vodka & Tonic, Gin & Tonic, Whiskey & Coke, Rum & Coke; Seasonal Draft 'Ask Our Server') were dropped per the no-price-no-row rule.",
  dishes: [
    { name: "Korean Highball", description: "", price: "$15.00", section: "Signature Cocktail" },
    { name: "Seoul Daiquiri", description: "", price: "$16.00", section: "Signature Cocktail" },
    { name: "Eastlake Mood", description: "", price: "$17.00", section: "Signature Cocktail" },
    { name: "Hanu Bomb", description: "", price: "$17.00", section: "Signature Cocktail" },
    { name: "Margarita", description: "", price: "$14.00", section: "Traditional Cocktails" },
    { name: "Martini Classic", description: "", price: "$15.00", section: "Traditional Cocktails" },
    { name: "Long Island Iced Tea", description: "", price: "$17.00", section: "Traditional Cocktails" },
    { name: "Moscow Mule", description: "", price: "$14.00", section: "Traditional Cocktails" },
    { name: "Highball Classic", description: "", price: "$13.00", section: "Traditional Cocktails" },
    { name: "Cucumber Cooler", description: "", price: "$16.00", section: "Traditional Cocktails" },
    { name: "Mojito", description: "", price: "$14.00", section: "Traditional Cocktails" },
    { name: "Negroni", description: "", price: "$15.00", section: "Traditional Cocktails" },
    { name: "Tequila Sunrise", description: "", price: "$16.00", section: "Traditional Cocktails" },
    { name: "Bottled Soju", description: "", price: "$13.50", section: "Soju" },
    { name: "Soju Cocktail (Glass)", description: "", price: "$18.95", section: "Soju" },
    { name: "Soju Cocktail (Pitcher)", description: "", price: "$29.00", section: "Soju" },
    { name: "Chardonnay (Glass)", description: "", price: "$7.95", section: "Wine" },
    { name: "Chardonnay (Bottle)", description: "", price: "$31.00", section: "Wine" },
    { name: "Cabernet Sauvignon (Glass)", description: "", price: "$7.95", section: "Wine" },
    { name: "Cabernet Sauvignon (Bottle)", description: "", price: "$31.00", section: "Wine" },
    { name: "Plum Wine", description: "", price: "$7.00", section: "Wine" },
    { name: "House Sake (Hot/Cold)", description: "", price: "$8.95", section: "Sake" },
    { name: "Bottled Sake Nigori Lychee", description: "", price: "$18.95", section: "Sake" },
    { name: "Junmai Ginjo Kikusui", description: "", price: "$17.00", section: "Sake" },
    { name: "Soda Can", description: "", price: "$3.00", section: "Drink" },
    { name: "Iced Tea (Unsweetened)", description: "", price: "$3.50", section: "Drink" },
    { name: "Lemon Flavored Tea (Sweetened)", description: "", price: "$3.75", section: "Drink" },
    { name: "Lemonade (Original)", description: "", price: "$3.95", section: "Drink" },
    { name: "Flavored Lemonade", description: "", price: "$4.50", section: "Drink" },
    { name: "Calpico", description: "", price: "$3.95", section: "Drink" },
    { name: "Iced Green Tea", description: "", price: "$3.50", section: "Drink" },
    { name: "Hot Green Tea", description: "", price: "$3.50", section: "Drink" },
    { name: "Bottled Water", description: "", price: "$2.50", section: "Drink" },
    { name: "Green Tea/Strawberry Ice Cream", description: "", price: "$4.75", section: "Desserts" },
    { name: "Mochi Ice Cream (2pcs)", description: "", price: "$5.25", section: "Desserts" },
    { name: "Assorted Mochi (4pcs)", description: "", price: "$8.25", section: "Desserts" },
    { name: "Sake Bomb", description: "", price: "$4.25", section: "Hanu Drink Special" },
    { name: "Soju Bomb", description: "", price: "$4.25", section: "Hanu Drink Special" },
    { name: "Beer Pitcher Special (64oz)", description: "", price: "$22.00", section: "Hanu Drink Special" },
    { name: "Beer Tower (84oz)", description: "", price: "$31.00", section: "Hanu Drink Special" },
    { name: "Sapporo", description: "", price: "$6.50", section: "Draft Beer" },
    { name: "Sculpin", description: "", price: "$8.95", section: "Draft Beer" },
    { name: "Blue Moon Belgian White", description: "", price: "$8.95", section: "Draft Beer" },
    { name: "Grapefruit Hibiscus Kombucha", description: "", price: "$9.50", section: "Draft Beer" },
    { name: "Modelo Especial", description: "", price: "$6.95", section: "Draft Beer" },
    { name: "Orderville", description: "", price: "$7.95", section: "Draft Beer" },
    { name: "The Mango", description: "", price: "$8.95", section: "Draft Beer" },
    { name: "Stone Delicious IPA", description: "", price: "$7.50", section: "Draft Beer" },
    { name: "394 San Diego Pale Ale", description: "", price: "$7.50", section: "Draft Beer" },
  ],
});

// --- 6585 Handel's Homemade Ice Cream (Carlsbad) --- BLOCKED
manual({
  restaurantId: "6585",
  name: "Handel’s Homemade Ice Cream",
  sourceUrl: "https://handelsicecream.com",
  confidence: "low",
  dishes: [],
  blocked: "needs-browser: this franchisee's order.online storefront (found via the brand's own /stores/ page, branch-specific store id) is behind a genuine Cloudflare 'Just a moment...' challenge, confirmed via r.jina.ai proxy as well as direct fetch. ChowNow API cross-check confirms the router's wrong-branch hit (company_id serving Long Beach/Downey) does not include this Carlsbad location, closing off that path. No other own-site or first-party ordering source found.",
});

// --- 6818 Handel's Homemade Ice Cream (Santee) --- BLOCKED
manual({
  restaurantId: "6818",
  name: "Handel's Homemade Ice Cream",
  sourceUrl: "https://handelsicecream.com",
  confidence: "low",
  dishes: [],
  blocked: "needs-browser: same as the Carlsbad branch (6585) - this franchisee's order.online storefront is behind a Cloudflare challenge, and the ChowNow company serving the router's Long Beach/Downey wrong-branch hit does not include this Santee location.",
});

// --- 6468 Anita's Mexican Restaurant & Cantina --- BLOCKED
manual({
  restaurantId: "6468",
  name: "Anita's Mexican Restaurant & Cantina",
  sourceUrl: "https://anitasmexicanfoodrestaurant.com/menu",
  confidence: "low",
  dishes: [],
  blocked: "Own-site (Squarespace) menu page lists full dish names and descriptions for every core dinner section (Ranch Dinners, Seafood Specialties, Enchilada Dinners, Tortas & Hamburgers, Taco Dinners, Salads, Soups, A La Carte) with NO prices anywhere in the markup (checked raw HTML, not just rendered text - no hidden price field). Only adjunct sections carry real prices (Appetizers, Fajitas, take-out party trays/catering 'Mains', Sides, Kids) - the core entree menu itself is unpriced, so per the dish-names-no-prices rule this is blocked rather than filed as a partial or marked not_found.",
});

// --- 6337 Otay Mandarin Chinese Restaurant --- BLOCKED
manual({
  restaurantId: "6337",
  name: "Otay Mandarin Chinese Restaurant",
  sourceUrl: "https://otaymandarin.com",
  confidence: "low",
  dishes: [],
  blocked: "Only source found is otaymandarin.com, which self-discloses on its own page: 'This website aggregates publicly available information about the restaurant and is not affiliated with the restaurant in any way.' A non-affiliated single-source aggregator does not satisfy the tier-5 sourcing rule regardless of exact address match. No restaurant-owned site, delivery platform (DoorDash/Uber Eats/Grubhub), or other independent source found via search.",
});

// --- 6526 Muay Thai Kitchen --- BLOCKED (needs-browser)
manual({
  restaurantId: "6526",
  name: "Muay Thai Kitchen",
  sourceUrl: "https://www.muaythaikitchensd.com/",
  confidence: "low",
  dishes: [],
  blocked: "needs-browser: own site runs on a Wix Restaurants ordering widget (Wix Thunderbolt bundle with menuIdsByOperation/menuOrder JS config keys) - no server-rendered item or price data in the fetched HTML, and the single ld+json block present is only a BreadcrumbList. Matches the documented Wix-widget needs-browser backlog case; not resolvable via plain HTTP fetch.",
});

// --- 6278 Connie's --- BLOCKED
manual({
  restaurantId: "6278",
  name: "Connie's",
  sourceUrl: "https://connies.netwaiter.com/vista/menu",
  confidence: "low",
  dishes: [],
  blocked: "Only reachable source is the restaurant's NetWaiter profile/ordering page (connies.netwaiter.com), which is a directory listing (hours, address, reviews) with no menu items or prices rendered in the raw HTML, and a separate direct fetch of the NetWaiter GetMenu API endpoint for this location also returned zero priced items. No restaurant-owned site or delivery-platform (DoorDash/Uber Eats) listing found via search.",
});

// --- 6069 Better Buzz Coffee San Marcos --- BLOCKED
manual({
  restaurantId: "6069",
  name: "Better Buzz Coffee San Marcos",
  sourceUrl: "https://www.betterbuzzcoffee.com/pages/san-marcos-menu",
  confidence: "low",
  dishes: [],
  blocked: "Own-site menu page (betterbuzzcoffee.com/pages/san-marcos-menu) lists full drink and food item names with NO prices anywhere in the raw HTML. Page has 'Order Ahead' buttons pointing to DoorDash/Uber Eats, but their target URLs are populated by client-side JS and not present in the static HTML, so no delivery-platform store page was reachable by direct fetch. Targeted Bing searches (plain, quoted-name, and address-anchored with doordash/ubereats terms) returned no restaurant-specific or platform-specific results; DuckDuckGo is CAPTCHA-walled this session and was not used per the no-CAPTCHA-solving rule. Dish-names-no-prices rule applies: blocked, not filed or not_found.",
});

// --- 6535 CARiN de RiA --- BLOCKED
manual({
  restaurantId: "6535",
  name: "CARiN de RiA",
  sourceUrl: null,
  confidence: "low",
  dishes: [],
  blocked: "No restaurant website, delivery-platform listing, or itemized menu source discoverable via available search tools. Bing searches (plain name, quoted name + city, and address-anchored with doordash/ubereats/toasttab terms) returned only irrelevant results (dominated by the unrelated CARIN eyewear brand) or zero organic hits; Yelp business search is blocked to unauthenticated fetches (403) and is off-limits per the no-Yelp-scripts rule; DuckDuckGo is CAPTCHA-walled this session and was not used per the no-CAPTCHA-solving rule.",
});

// --- 6291 TNL Boba Tea --- BLOCKED
manual({
  restaurantId: "6291",
  name: "TNL Boba Tea",
  sourceUrl: null,
  confidence: "low",
  dishes: [],
  blocked: "No restaurant website, delivery-platform listing, or itemized menu source discoverable via available search tools. Bing searches (plain, quoted, and address-anchored with doordash/ubereats terms) returned only generic/irrelevant results with no restaurant-specific hits; DuckDuckGo is CAPTCHA-walled this session and was not used per the no-CAPTCHA-solving rule.",
});

// --- 6363 Crispy's Donuts --- BLOCKED
manual({
  restaurantId: "6363",
  name: "Crispy's Donuts",
  sourceUrl: null,
  confidence: "low",
  dishes: [],
  blocked: "No restaurant website, delivery-platform listing, or itemized menu source discoverable via available search tools. Bing searches (plain, quoted, and address-anchored with doordash/ubereats/menu terms) returned only results dominated by the unrelated Krispy Kreme brand and generic 'crispy' dictionary/recipe pages, no restaurant-specific hits; DuckDuckGo is CAPTCHA-walled this session and was not used per the no-CAPTCHA-solving rule.",
});

// --- 6370 Lisa's Filipino Cuisine --- BLOCKED
manual({
  restaurantId: "6370",
  name: "Lisa's Filipino Cuisine",
  sourceUrl: null,
  confidence: "low",
  dishes: [],
  blocked: "No restaurant website, delivery-platform listing, or itemized menu source discoverable via available search tools. Bing searches (plain, quoted, and address-anchored with doordash/menu terms) returned only irrelevant results (singer Lisa, Charles Schwab login pages), no restaurant-specific hits; DuckDuckGo is CAPTCHA-walled this session and was not used per the no-CAPTCHA-solving rule.",
});

// --- 6112 Panda Chef --- BLOCKED
manual({
  restaurantId: "6112",
  name: "Panda Chef",
  sourceUrl: null,
  confidence: "low",
  dishes: [],
  blocked: "No restaurant website, delivery-platform listing, or itemized menu source discoverable via available search tools. Bing searches (plain, quoted, and address-anchored with doordash/menu terms) returned only results dominated by the unrelated Panda Express brand and generic giant-panda Wikipedia articles, no restaurant-specific hits; DuckDuckGo is CAPTCHA-walled this session and was not used per the no-CAPTCHA-solving rule.",
});

// --- 6376 El Parque --- BLOCKED
manual({
  restaurantId: "6376",
  name: "El Parque",
  sourceUrl: null,
  confidence: "low",
  dishes: [],
  blocked: "No restaurant website, delivery-platform listing, or itemized menu source discoverable via available search tools. Bing searches (plain, quoted, and address-anchored with doordash/menu terms) returned only generic Spanish-grammar ('el' vs 'el') and unrelated results, no restaurant-specific hits; DuckDuckGo is CAPTCHA-walled this session and was not used per the no-CAPTCHA-solving rule.",
});

// --- 6731 Kokage Ramen and Sushi --- FILED
fileEntry({
  restaurantId: "6731",
  name: "Kokage Ramen and Sushi",
  file: "n1358-kokage-dd.html",
  sourceUrl: "https://page-service.doordash.com/store/kokage-vista-891097/",
  confidence: "medium",
  notes: "DoorDash schema.org JSON-LD, single tier-3 source; address confirmed 1711 University Drive, Vista, CA 92083. Restaurant's own site menu is a corrupted/damaged PDF (pdftotext failed with xref/trailer errors; embedded-image extraction recovered only food photography, no menu text), so DoorDash is the only usable source. Cents cluster on .90/.00/.50/.70/.40/.60/.80/.20/.30/.10 - conventional printed-menu-style pricing, no markup indication. 'Most Ordered' carousel kept - items overlap with other sections by name (dedup handled via name+price key in extractor).",
});

// --- 6794 Broad Street Dough Co --- FILED
manual({
  restaurantId: "6794",
  name: "Broad Street Dough Co",
  sourceUrl: "https://www.broadstreetdoughco.com/west-coast-menu/",
  confidence: "high",
  notes: "Own-site (first-party domain), region-specific 'West Coast Menu' page - confirmed the correct menu for the Encinitas (West Coast) location, distinct from a separate East Coast menu on the same site. Per-tier flavor pricing (each flavor within a named tier sold at one uniform price) is real, printed pricing, not an invented/derived price - each flavor is filed at its tier's price. Box-deal pricing included as separate 'Box' section items.",
  dishes: [
    { name: "Cinnamon Sugar", description: "", price: "$2.45", section: "Old School" },
    { name: "Powdered Sugar", description: "", price: "$2.45", section: "Old School" },
    { name: "Glazed", description: "", price: "$2.45", section: "Old School" },
    { name: "Chocolate Glazed", description: "", price: "$2.45", section: "Old School" },
    { name: "Vanilla Glazed", description: "", price: "$2.45", section: "Old School" },
    { name: "Maple Glazed", description: "", price: "$2.45", section: "Old School" },
    { name: "Plain", description: "", price: "$2.45", section: "Old School" },
    { name: "Cookies & Cream", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Birthday Cake", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Nutella", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Strawberry Shortcake", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Blueberry Cake", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Lemon Poppyseed", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Apple Fritter", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Maple Bacon", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "S'mores", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Salted Caramel", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Boston Cream", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Red Velvet", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Key Lime Pie", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Peanut Butter Cup", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Churro", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Cereal Milk", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Pistachio", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Coconut Cream", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Fruity Cereal", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Toasted Coconut", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Cannoli", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Tiramisu", description: "", price: "$2.65", section: "BSDC Specialties" },
    { name: "Bavarian Cream", description: "", price: "$3.65", section: "A Little Extra" },
    { name: "Bear Claw", description: "", price: "$3.65", section: "A Little Extra" },
    { name: "Maple Bacon Long John", description: "", price: "$3.65", section: "A Little Extra" },
    { name: "Chocolate Long John", description: "", price: "$3.65", section: "A Little Extra" },
    { name: "Cronut", description: "", price: "$3.65", section: "A Little Extra" },
    { name: "Fritter Deluxe", description: "", price: "$3.65", section: "A Little Extra" },
    { name: "Cinnamon Roll", description: "", price: "$3.65", section: "A Little Extra" },
    { name: "Filled Bismark", description: "", price: "$3.65", section: "A Little Extra" },
    { name: "Old Fashioned Buttermilk", description: "", price: "$3.65", section: "A Little Extra" },
    { name: "Vlugen", description: "", price: "$3.25", section: "Vlugen" },
    { name: "Old School / Specialties 6-Count Box", description: "", price: "$13.99", section: "Box" },
    { name: "Old School / Specialties 9-Count Box", description: "", price: "$19.99", section: "Box" },
    { name: "Old School / Specialties 12-Count Box", description: "", price: "$24.99", section: "Box" },
    { name: "Old School / Specialties 28-Count Box", description: "", price: "$79.99", section: "Box" },
    { name: "Vlugen 6-Count Box", description: "", price: "$18.99", section: "Box" },
    { name: "Vlugen 9-Count Box", description: "", price: "$26.99", section: "Box" },
    { name: "Vlugen 12-Count Box", description: "", price: "$34.99", section: "Box" },
    { name: "Vlugen 24-Count Box", description: "", price: "$72.99", section: "Box" },
  ],
});

writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log("wrote", results.length, "entries to", OUT);
for (const r of results) {
  console.log(r.restaurantId, r.name, "-", r.dishes.length, "dishes", r.blocked ? "[BLOCKED]" : "");
}
