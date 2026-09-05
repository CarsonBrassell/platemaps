/**
 * Fills `restaurants.website` from Google results, via Serper, for the rows
 * that arrived without one.
 *
 *   node --env-file=.env.local scripts/find-websites.mjs --dry
 *   node --env-file=.env.local scripts/find-websites.mjs --max-queries 2400
 *
 * ## Why this exists
 *
 * Every cheap extraction tier starts from `restaurants.website`. The router,
 * Firecrawl and Jina all take the site as their input, so a row with no
 * website is not merely slower to extract - it is invisible to all of them and
 * falls through to an agent, which is the most expensive way this project has
 * of learning a restaurant's domain name.
 *
 * The county permit import landed ~2,800 such rows in a day. Under the
 * no-spend rule, Google enrichment fills websites at about a thousand a month,
 * so left alone the router would be starved into the winter while agents burnt
 * their context rediscovering addresses. Serper returns Google's own organic
 * results as an API and gives 2,500 free queries on signup, one-time, no card.
 * One query per restaurant closes the gap in about an hour.
 *
 * ## What this script must never do
 *
 * - **Never buy queries.** The free tier is 2,500 and this script stops at
 *   2,400, counted off a ledger on disk rather than off anything the API says.
 *   `--max-queries` defaults to 0, so a bare run is a no-op: spending has to be
 *   asked for by number, every time.
 * - **Never ask for more than 10 results.** Serper bills one credit per ten.
 *   `num` above 10 silently doubles the cost of the run.
 * - **Never re-query a restaurant that has a cached response.** The raw payload
 *   is written to disk BEFORE anything parses it, so a picker bug costs a
 *   re-parse and not 2,800 credits. Re-runs are free by construction. This is
 *   not hypothetical: the picker below is its second version, rewritten
 *   entirely off the 50 cached responses of the first live sample at zero cost.
 * - **Never overwrite a website.** The UPDATE carries its own emptiness check,
 *   so a row that gained a site between the query and the write keeps it.
 * - **Never add a column, and never touch `scripts/migrate.mjs`.** The
 *   provenance ("this came from Serper, here is what else it saw and why this
 *   one won") lives in `data/serper-found.notes.json`. A `website_source`
 *   column would be a migration for a fact only this script and its report
 *   care about.
 *
 * ## Why the picker is a positive rule, not a blocklist
 *
 * The first version accepted any result that was not on a blocklist and shared
 * a word with the restaurant's name. A 50-row live sample put about a third of
 * its picks wrong, and the wrong ones were not near-misses - they were a CBS 8
 * news article, an Eater venue page, a TikTok discover page, the City of
 * Vista's newsroom, a *realty listing* for a condo near the restaurant, a
 * Giftly gift-card page, and a Waze directions link. Every one of them shares
 * words with the name and sits on a host nobody had thought to ban yet.
 *
 * That is the shape of the problem: the set of things that are not a
 * restaurant's website is open-ended and Google is very good at surfacing
 * fresh members of it, so a blocklist is always one host behind. The set of
 * things that ARE a restaurant's website is small and describable:
 *
 *   (a) a known ordering-platform storefront, or
 *   (b) a domain that is made out of the restaurant's own name, or
 *   (c) failing both, a page carrying the record's street number on a host
 *       that looks like nobody's directory and a path that looks like nobody's
 *       article.
 *
 * A result matching none of those is not a near-miss to be scored - it is
 * rejected, and the row is reported as `no-confident-result` for an agent to
 * pick up. A missing website costs one agent visit. A wrong one silently
 * poisons every extraction tier that starts from it, which is worse, so the
 * picker is built to prefer saying nothing.
 *
 * The blocklists survive as a first pass, because they are cheap and they are
 * right - they just were never sufficient on their own.
 */

import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

/*
 * `verify-coverage.mjs` is owned by another session, but it guards its main
 * body behind an entry-point check precisely so its normalisers can be
 * imported without opening a database connection or rescanning 17,503 permit
 * records. `nameTokens` is the same identifying-word split the permit matcher
 * uses, which is what we want: a result whose title shares no identifying word
 * with the record is about a different restaurant.
 */
import { nameTokens } from "./verify-coverage.mjs";

/* ---------- flags ---------- */

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const num = (name, fallback) => {
  const v = value(name, null);
  return v == null ? fallback : Number(v);
};

const DRY = args.includes("--dry");
const LIMIT = num("limit", Infinity);
const IDS = String(value("ids", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
/*
 * Default 0 on purpose. A run that spends money (here: a finite, unrenewable
 * free allowance) should never be the thing that happens when someone types
 * the script's name to see what it does.
 */
const MAX_QUERIES = num("max-queries", 0);
/** How many picks to print at the end. Raise it to audit a whole slice. */
const SAMPLE = num("sample", 20);

/**
 * The ledger counts every call ever made, so this cap is cumulative, not
 * per-run: 2,720 spent off the free tier plus the 50,000-credit pack bought
 * 2026-09-04 is 52,720. Raise it only by what has actually been purchased.
 */
const BUDGET = 52720;

/*
 * Which Serper endpoint answers the question. "search" is Google's organic
 * results and needs the picker below to guess which one is the restaurant;
 * "maps" is the business listing, which states its own website and needs only
 * to be confirmed as the right business.
 */
const VIA = String(value("via", "search") || "search");
if (!["search", "maps"].includes(VIA)) {
  console.error(`--via must be "search" or "maps" (got "${VIA}")`);
  process.exit(1);
}

const CACHE_DIR = "data/serper-cache";
const LEDGER = "data/serper-calls.jsonl";
const NOTES = "data/serper-found.notes.json";
const ENDPOINT =
  VIA === "maps"
    ? "https://google.serper.dev/maps"
    : "https://google.serper.dev/search";

/*
 * The two modes must never read each other's cache. A search response and a
 * maps response for the same restaurant are different shapes answering
 * different questions, and a maps run that found a search response sitting in
 * the cache would report the row as free to re-parse and then parse nothing.
 */
const cacheName = (id) => (VIA === "maps" ? `maps_${id}` : String(id));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const KEY = process.env.SERPER_API_KEY || "";
/*
 * The key is required for live calls and only for live calls. `--dry` has to
 * work before Calvin has created the account, because the plan and the query
 * count are exactly what he needs in order to decide whether to create it.
 */
if (!KEY && !DRY) {
  console.error(
    "SERPER_API_KEY is not set. Live runs need it; re-run with --dry to see the plan without it.",
  );
  process.exit(1);
}

/* ---------- host rules: the first pass ---------- */

/*
 * BARRED and UNTRUSTED below are COPIED from `scripts/screen-menus.mjs`
 * (which exports nothing, and which this job must not edit). They are the
 * same lists, kept in the same order, minus that file's long commentary - read
 * it there for why each entry is on the list. If screen-menus.mjs grows an
 * entry, this copy should grow the same one.
 */
const BARRED = [
  /(^|\.)yelp\.com$/i,
  /(^|\.)yelp\.[a-z.]+$/i,
  /(^|\.)locallya\.com$/i,
  /(^|\.)placejoys\.com$/i,
  /(^|\.)bestcafes\.online$/i,
  /(^|\.)weeblyte\.com$/i,
  /(^|\.)gotoeat\.net$/i,
  /(^|\.)foodjoyy\.com$/i,
];

const UNTRUSTED = [
  /(^|\.)menupedia\./i,
  /(^|\.)allmenus\.com$/i,
  /mojosalesandbranding\.com$/i,
  /(^|\.)menuswithprice\./i,
  /(^|\.)pricelisto\./i,
  /(^|\.)menuandprice/i,
  /(^|\.)restaurantguru\.com$/i,
  /(^|\.)beyondmenu\.com$/i,
];

/*
 * Marketplaces, review sites, reservation books - and, added after the first
 * live sample, the specific hosts that produced its wrong picks. None of these
 * is wrong ABOUT the restaurant; they are simply not the restaurant, and one
 * of them in `website` marks the row done for every tier that starts from it.
 *
 * `singleplatform.com` is the one deliberate divergence from screen-menus.mjs,
 * which lists it as an ordering platform. `places.singleplatform.com/<slug>/menu`
 * is not a storefront - it is a directory of scraped menus, and it took two of
 * the fifty rows in the sample.
 */
const MARKETPLACE = [
  /(^|\.)tripadvisor\.[a-z.]+$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)fb\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)google\.[a-z.]+$/i,
  /(^|\.)goo\.gl$/i,
  /(^|\.)mapquest\.com$/i,
  /(^|\.)doordash\.com$/i,
  /(^|\.)ubereats\.com$/i,
  /(^|\.)grubhub\.com$/i,
  /(^|\.)postmates\.com$/i,
  /(^|\.)seamless\.com$/i,
  /(^|\.)foursquare\.com$/i,
  /(^|\.)zomato\.com$/i,
  /(^|\.)opentable\.[a-z.]+$/i,
  /(^|\.)restaurantji\.com$/i,
  /(^|\.)menupix\.com$/i,

  // Wrong picks from the 2026-09-02 sample of 50, host by host.
  /\.gov$/i, //                       1737 Pepper Tree Frosty -> vista.gov newsroom
  /(^|\.)eater\.com$/i, //            4544, 2275 -> sandiego.eater.com venue pages
  /(^|\.)cbs8\.com$/i, //             205 Las Cuatro Milpas -> news article
  /(^|\.)nbcsandiego\.com$/i,
  /(^|\.)kpbs\.org$/i,
  /(^|\.)sandiegouniontribune\.com$/i,
  /(^|\.)sandiegomagazine\.com$/i,
  /(^|\.)sandiegoreader\.com$/i,
  /(^|\.)timeout\.com$/i,
  /(^|\.)obrag\.org$/i, //            4408 Supannee Thai -> a 2013 blog review
  /(^|\.)patch\.com$/i,
  /(^|\.)tiktok\.com$/i, //           2813 Oscar's seafood -> a discover page
  /(^|\.)waze\.com$/i, //             5768 Humberto's -> live-map directions
  /(^|\.)giftly\.com$/i, //           456 Sipz -> a gift-card page
  /(^|\.)singleplatform\.com$/i, //   3573, 4681 -> scraped-menu directory
  /(^|\.)menubank\.app$/i, //         580 Jalapenos
  /(^|\.)orangebook\.com$/i, //       6004 Sushi House
  /(^|\.)theboulevard\.org$/i, //     266 A-Chau -> a BID listing page
  /(^|\.)zmenu\.com$/i, //            226 Armando's
  /(^|\.)top-cafes\.com$/i, //        407 Wa Dining OKAN -> wadiningokan.top-cafes.com
  /(^|\.)top-rated\.online$/i,
  /(^|\.)themenupage\.com$/i,
  /(^|\.)dogtrekker\.com$/i,
  /(^|\.)perfectvenue\.com$/i,
  /(^|\.)sirved\.com$/i,

  /*
   * Second pass over the same fifty, after the positive rules were in. These
   * are what rule (c) reached for when a restaurant genuinely has no website:
   * "place discovery" apps and local directories whose pages carry the name,
   * the address and nothing else. They are the reason rule (c) now insists on
   * a root path - every one of them files its businesses under a collection
   * segment (/place/, /restaurants/, /biz/, /venue/) the way a directory must.
   */
  /(^|\.)corner\.inc$/i, //             205 -> /place/pQzYNfhSDCaH
  /(^|\.)hellomosey\.com$/i, //         4544 -> /restaurants/A8JMjhs6CB3GXn
  /(^|\.)vayapin\.com$/i, //            456 -> /us-sipzclairemont
  /(^|\.)sandiegorestaurants\.com$/i, //407 -> /wa-dining-okan/
  /(^|\.)wanderlog\.com$/i,
  /(^|\.)atly\.com$/i,
  /(^|\.)untappd\.com$/i,
  /(^|\.)iwaspoisoned\.com$/i,
  /(^|\.)wheree\.com$/i,
  /(^|\.)ezcater\.com$/i,
  /(^|\.)theknot\.com$/i,
  /(^|\.)software995\.com$/i,
  /(^|\.)vivinavi\.com$/i,
  /(^|\.)10news\.com$/i, //             4681 -> a margarita-day listicle
  /(^|\.)fox5sandiego\.com$/i,
  /(^|\.)timesofsandiego\.com$/i,
  /(^|\.)theplainjane\.com$/i,
  /chamber(ofcommerce)?\.(com|org)$/i,
];

/*
 * Rule (a). Ordering-platform storefronts ARE an acceptable answer: they are
 * per-restaurant pages the restaurant itself set up, and they carry prices in
 * markup the router can already read. A restaurant whose only web presence is
 * a Toast storefront is a normal small restaurant, not a gap.
 *
 * This is also the list that rescues the site builders - `business.site`,
 * `canva.site`, `mybistro.online` - where the restaurant's name lives in the
 * SUBDOMAIN and rule (b), which looks at the registrable domain, cannot see it.
 */
const PLATFORM = [
  /(^|\.)toasttab\.com$/i,
  /(^|\.)toast\.site$/i,
  /(^|\.)cloveronline\.com$/i,
  /(^|\.)clover\.com$/i,
  /(^|\.)chownow\.com$/i,
  /(^|\.)popmenu\.com$/i,
  /(^|\.)menufy\.com$/i,
  /(^|\.)netwaiter\.com$/i,
  /(^|\.)slicelife\.com$/i,
  /(^|\.)square\.site$/i,
  /(^|\.)squareup\.com$/i,
  /(^|\.)spoton\.com$/i,
  /(^|\.)owner\.com$/i,
  /(^|\.)olo\.com$/i,
  /(^|\.)order\.online$/i,
  /(^|\.)mybistro\.online$/i,
  /(^|\.)twupro\.com$/i,
  /(^|\.)smartonlineorder\.com$/i,
  /(^|\.)yourmenu\.com$/i,
  /(^|\.)applova\.menu$/i,
  /(^|\.)business\.site$/i,
  /(^|\.)canva\.site$/i,
  /(^|\.)placemap\.site$/i,
  /(^|\.)eatat\.us$/i,
];

/*
 * Rule (c)'s host guard. Unlike the lists above this is a SHAPE, not a roster:
 * it is what stops the next unseen realty site, city newsroom or business
 * directory from being written into `website` the way luxurysocalrealty.com
 * was. Rule (c) is the weakest evidence in the file, so it gets the bluntest
 * filter - a real restaurant site wrongly excluded here costs one agent visit,
 * and a directory wrongly admitted costs every tier downstream of it.
 */
const SOFT_BAD_HOST = [
  /realt(y|or)|zillow|redfin|apartments|homefinder|mls/i,
  // Call letters and mastheads carry digits and city names either side of the
  // recognisable part, so match inside the label: `10news.com`,
  // `fox5sandiego.com`, `timesofsandiego.com` all slipped a boundary-anchored
  // version of this line.
  /(^|\.)[a-z0-9]*(news|fox\d|abc\d|nbc|cbs|kpbs|kusi|patch|axios|timesof|eater)[a-z0-9]*(\.|$)/i,
  /magazine|uniontribune|tribune|gazette|herald|newspaper|journal|thrillist|infatuation/i,
  /tiktok|instagram|facebook|twitter|youtube|pinterest|linkedin|reddit|snapchat|threads\.net/i,
  /waze|mapquest|(^|\.)maps?\.|(^|\.)google\.|foursquare/i,
  /giftly|giftcard|gift-card|groupon|livingsocial/i,
  /directory|listings?|yellowpages|manta\.com|bbb\.org|chamber|cityof|\.gov$/i,
  /(^|\.)(guide|guides)\.|[a-z]guide\.(com|org|net)$|top-cafes|top-rated/i,
  /zmenu|menubank|orangebook|singleplatform|sirved|zomato|opentable|allmenus|menupix|restaurantji|dogtrekker|themenupage|perfectvenue|tripadvisor|menuism|zmenu/i,
  /wikipedia|wikiwand|linktr\.ee|eventbrite|indeed|glassdoor|ziprecruiter|tripline/i,
];

/*
 * Directory farms, the leak that cost 30 of the 33 bad rows in the 300-query
 * run. The shape is always the same: a domain assembled out of generic
 * directory words - `hey-restaurants.com`, `food-menu.net`, `cafes-usa.com`,
 * `res-discover.com`, `nearby-res.com`, `localoria.com` - serving one minted
 * subdomain per business, `the-cliffs-cafe.hey-restaurants.com`.
 *
 * That shape defeated both of the guards that should have caught it. Rule (c)
 * asks for a root path and a farm subdomain IS a root path. Rule (b) asks the
 * registrable domain to contain a name word, and `food-menu.net` genuinely
 * contains FOOD, which is a word in "Estrada's Mexican Food".
 *
 * The generic-word test alone cannot be the whole rule: `marietasrestaurants.com`
 * is Marieta's own site and matches it. What makes it a farm is the
 * CONJUNCTION - generic domain AND the business relegated to a subdomain. A
 * restaurant that owns a domain does not rent a subdomain of it.
 */
const FARM_WORD =
  "(restaurants?|cafes?|menus?|eats?|dining|foods?|places?|nearby|discover|guides?|directory|local|listings?|reviews?|near|best|top)";
const FARM_TLD = "(com|net|org|website|online|info|site|io|top|us|co|biz)";
const FARM_DOMAIN = new RegExp(`^[a-z0-9-]*${FARM_WORD}[a-z0-9-]*\\.${FARM_TLD}$`, "i");

/**
 * Platform paths that index MANY stores instead of naming one. A platform host
 * is trusted because a storefront on it belongs to the restaurant; a category
 * or city index on the same host belongs to nobody.
 */
const PLATFORM_INDEX =
  /(^|\/)(discovery|discover|pizza-delivery|location_state|browse|search|cities|city|categories|category|cuisines?)(\/|$)/i;
const PLATFORM_INDEX_END = /\/(restaurants|locations|stores|menus)\/?$/i;

/*
 * Words that identify a cuisine or a category rather than a business. They are
 * only excluded from rule (b)'s CONTAINMENT test, where a single generic word
 * shared with a farm domain was enough to pass - FOOD matching `food-menu.net`
 * is the exact bug. Composition is unaffected: a domain made entirely of the
 * name's own words is still the name, generic words included.
 *
 * Deliberately absent: CHICKEN, BREAKFAST, PIE, SURF and the like. They read
 * as generic and are not - `chickenpieshops.com` and `breakfastrepublic.com`
 * are both real, and both are matched on exactly those words.
 */
const GENERIC_TOKEN = new Set([
  "FOOD", "FOODS", "MENU", "MENUS", "EAT", "EATS", "DINING", "PLACE", "PLACES",
  "LOCAL", "NEARBY", "DISCOVER", "GUIDE", "DIRECTORY", "BEST", "TOP", "NEAR",
  "CITY", "ONLINE", "USA", "AMERICAN", "MEXICAN", "CHINESE", "ITALIAN",
  "JAPANESE", "THAI", "ASIAN", "GREEK", "INDIAN", "MEDITERRANEAN", "SEAFOOD",
  "VEGAN", "VEGETARIAN", "EXPRESS", "MARKET", "REVIEWS", "LISTING",
  // Drink and dessert categories, same story as FOOD: "…& Boba" matched
  // `bobateadirectory.com` and "Juice Bar" matched `juiceitup.com`, which is
  // a different chain entirely.
  "BOBA", "JUICE", "JUICES", "SMOOTHIE", "SMOOTHIES", "YOGURT", "BAKERY",
  "CATERING", "DELIVERY",
  /*
   * Towns. A restaurant named for where it is ("Fallbrook Rib Shack") shares
   * that word with every community site and town directory in the county -
   * `friendsoffallbrook.com` is what it matched. The town never identifies the
   * business, and dropping it costs nothing: the restaurant's own domain
   * carries the rest of the name too.
   */
  "FALLBROOK", "ESCONDIDO", "OCEANSIDE", "CARLSBAD", "VISTA", "POWAY",
  "SANTEE", "ENCINITAS", "CORONADO", "JOLLA", "CHULA", "RAMONA", "ALPINE",
  "SOLANA", "BONITA", "TEMECULA", "CALIFORNIA",
]);

/** Path words that mark a page as an article, a listing or a side page. */
const BAD_PATH_WORD =
  /(^|[-/_])(article|articles|news|review|reviews|venue|venues|biz|listing|listings|gift-card|giftcard|live-map|discover|catering|blog|events|event|jobs|careers|press|about|directions|photos|profile)([-/_]|$)/i;

/**
 * Paths that are still the restaurant's site rather than a side page, so rule
 * (b) keeps them instead of falling back to the origin. `/locations` and
 * `/location/<branch>` matter specifically: a chain row wants its own branch
 * page, not the corporate homepage.
 */
const GOOD_PATH_WORD = /(^|[-/_])(menus?|locations?|order|ordering|online-order)([-/]|$)/i;

const hits = (list, host) => list.some((re) => re.test(host));

/* ---------- url canonicalisation ---------- */

/*
 * Exact parameter names, not prefixes. The first version used a prefix match
 * and `^(si)` quietly ate `site=`; `srsltid` - Google's own click id, which
 * appeared on two of the fifty sampled picks - was not on the list at all.
 * Dropping the whole query string would be simpler and would break the
 * storefronts that carry a location id in it.
 */
const TRACKING =
  /^(utm_[a-z_]*|mc_[a-z_]*|fbclid|gclid|gbraid|wbraid|msclkid|dclid|yclid|srsltid|igshid|_ga|_gl|ref|referrer|source|si|mkt_tok)$/i;

/** origin + path, tracking stripped, no fragment. Null if it will not parse. */
function canonical(raw) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.username = "";
  u.password = "";
  for (const k of [...u.searchParams.keys()]) {
    if (TRACKING.test(k)) u.searchParams.delete(k);
  }
  u.hostname = u.hostname.toLowerCase();
  // A bare "/" adds nothing and makes two spellings of the same homepage look
  // like two different websites in the notes file.
  if (u.pathname === "/" && !u.search) return u.origin;
  return u.toString();
}

function hostOf(raw) {
  try {
    return new URL(String(raw)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * eTLD+1, near enough. A real public-suffix list is a dependency and a
 * download; everything Serper returns for a San Diego restaurant is a plain
 * two-label domain under .com/.net/.org/.online/.site/.app/.website, so the
 * only case worth handling is the `something.co.uk` shape.
 */
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "edu", "ac"]);
function registrable(host) {
  const parts = String(host || "")
    .toLowerCase()
    .replace(/^www\./, "")
    .split(".")
    .filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return SECOND_LEVEL.has(parts[parts.length - 2])
    ? parts.slice(-3).join(".")
    : parts.slice(-2).join(".");
}

/**
 * What sits in front of the registrable domain, `www` not counted. Empty for
 * `goodtacos.com` and `www.goodtacos.com`; `the-cliffs-cafe` for
 * `the-cliffs-cafe.hey-restaurants.com`.
 */
function subdomain(host) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  const reg = registrable(h);
  return h.endsWith(reg) ? h.slice(0, Math.max(0, h.length - reg.length - 1)) : "";
}

/* ---------- matching ---------- */

/** Accents off, so `CAMARÓN` matches `el-camaron` in a storefront path. */
const fold = (s) =>
  String(s || "")
    .normalize("NFD")
    // `\p{M}` rather than a literal combining-mark range: the range is four
    // invisible characters in the source and every tool that touches this file
    // is one mangled byte away from silently matching nothing.
    .replace(/\p{M}/gu, "")
    .toUpperCase();

/*
 * `nameTokens` strips filler ("THE", "CAFE", "GRILL", "SAN", "DIEGO") and
 * store numbers, which is right for matching and occasionally leaves nothing
 * at all - "The Coffee Shop" reduces to the empty set. A record with no
 * identifying words cannot be confirmed by name, so fall back to its whole
 * words: worse at ignoring filler, but a real check rather than none.
 */
function identifying(name) {
  const tokens = nameTokens(name);
  if (tokens.size) return tokens;
  return new Set(
    String(name || "")
      .toUpperCase()
      .replace(/[^A-Z0-9ÑÁÉÍÓÚ]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 1),
  );
}

/** How many of the record's identifying words appear in a result's text. */
function overlap(tokens, text) {
  const words = identifying(text);
  let shared = 0;
  for (const w of tokens) if (words.has(w)) shared++;
  return shared;
}

/** Words a domain may glue name parts together with and still be the name. */
const GLUE = ["THE", "A", "AND", "OF", "AT", "MY", "LA", "EL", "LOS", "LAS", "DE", "SD"];

/**
 * Is this domain made out of the restaurant's own name, and how completely?
 *
 * Returns 0 (no), 1 (the domain CONTAINS a name word) or 2 (the domain is
 * built out of name words and nothing else). The difference decides a real
 * case in the sample: Union Kitchen & Tap matched both `localunion101.com`
 * and `unionkitchenandtap.com`, because "UNION" is inside both. Containment
 * cannot tell those apart and position picked the wrong one. Composition can:
 * `unionkitchenandtap` is UNION + KITCHEN + AND + TAP with nothing left over,
 * while `localunion101` has "local" and "101" that the name never accounts
 * for. A domain that is entirely the restaurant's name is the restaurant's.
 *
 * Containment's floor is four letters - three-letter tokens like BBQ and TAP
 * turn up inside unrelated words often enough to be worthless alone.
 *
 * Composition works off the RAW words, numbers and connectors included,
 * because "356" and "and" are exactly what `nameTokens` is right to throw away
 * for matching and wrong to throw away for reading a domain. `356bbq` needs
 * the number back; `thebrokenyolkcafe` needs the article. `goodtacos` fails it
 * (GOOD is not part of "Los Tacos") and so does `top-cafes`, which is the
 * point of having it.
 */
function domainFromName(host, name) {
  const core = fold(registrable(host).split(".")[0]).replace(/[^A-Z0-9]/g, "");
  if (core.length < 4) return 0;

  const words = fold(name)
    .replace(/&/g, " AND ")
    .split(/[^A-Z0-9]+/)
    .filter((p) => p.length >= 2);

  if (words.length && core.length >= 5) {
    // Possessives: the record says "Marieta's" and the domain says
    // "marietas", which is the same word and not a different one.
    const parts = new Set([...words, ...words.map((w) => `${w}S`), ...GLUE]);
    const seen = new Set();
    const stack = [0];
    while (stack.length) {
      const i = stack.pop();
      if (i === core.length) return 2;
      if (seen.has(i)) continue;
      seen.add(i);
      for (const p of parts) if (core.startsWith(p, i)) stack.push(i + p.length);
    }
  }

  /*
   * Containment, and only on the REGISTRABLE domain - never the hostname. A
   * farm that mints `<restaurant-slug>.hey-restaurants.com` puts the name in
   * the subdomain precisely so it reads as the business's own; testing the
   * whole hostname would hand it the match it is fishing for.
   */
  const tokens = [...identifying(name)]
    .map(fold)
    .filter((t) => !GENERIC_TOKEN.has(t));
  return tokens.some((t) => t.length >= 4 && core.includes(t)) ? 1 : 0;
}

/** The street number, which is the cheapest proof a result is THIS branch. */
function streetNumber(address) {
  const m = String(address || "").match(/\b(\d{1,6})\b/);
  return m ? m[1] : null;
}

/** "1234 Main St, San Diego, CA 92101" -> "1234 Main St" */
function streetOnly(address) {
  return String(address || "").split(",")[0].trim();
}

function buildQuery(row) {
  const street = streetOnly(row.address);
  const city = String(row.city || "").trim();
  const parts = [`"${String(row.name || "").trim()}"`];
  if (street) parts.push(street);
  // The address line usually already ends in the city; adding it twice makes
  // the query longer without making it better.
  if (city && !new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(street)) {
    parts.push(city);
  }
  parts.push("CA");
  return parts.join(" ");
}

/*
 * Maps matches a business, not a document, so the quoting that helps organic
 * search hurts here - a quoted phrase asks Maps for an exact string and a
 * listing spelled even slightly differently drops out of the results.
 */
function buildMapsQuery(row) {
  const street = streetOnly(row.address);
  const city = String(row.city || "").trim();
  const parts = [String(row.name || "").trim()];
  if (street) parts.push(street);
  if (city && !new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\function pathDepth(pathname) {")}\\b`, "i").test(street)) {
    parts.push(city);
  }
  parts.push("CA");
  return parts.filter(Boolean).join(" ");
}

/*
 * Confirm the listing is the restaurant, then take it at its word.
 *
 * Two independent facts have to agree before a website is accepted, because
 * Maps answers a query with the businesses NEAR the address as readily as the
 * one AT it: the street number, which is the cheapest proof of the right
 * building, and a shared identifying word, which is the cheapest proof of the
 * right business. A listing that has both is this restaurant. One that has
 * only the name is a different branch of the same chain; one that has only
 * the number is the shop next door.
 *
 * The exception is a listing whose title carries every identifying word the
 * record has. That is a name matched in full rather than in part, and it is
 * how a restaurant that has moved, or whose stored address has a suite number
 * Maps writes differently, still resolves.
 *
 * The host bans still apply. A business is perfectly capable of listing a
 * farm domain or a hijacked host as its website, and the fact that it claimed
 * the URL itself does not make the URL safe to fetch.
 */
function pickFromMaps(row, payload) {
  const places = Array.isArray(payload?.places) ? payload.places : [];
  const candidates = [];
  const tokens = identifying(row.name);
  const wantNumber = streetNumber(row.address);

  for (const place of places.slice(0, 5)) {
    const title = String(place?.title || "");
    const address = String(place?.address || "");
    const shared = overlap(tokens, title);
    const sameNumber = Boolean(wantNumber) && streetNumber(address) === wantNumber;
    const fullName = tokens.size > 0 && shared === tokens.size;
    const raw = String(place?.website || "");

    const entry = { title, address, url: raw, shared, sameNumber, fullName };
    candidates.push(entry);

    if (!raw) continue;
    if (!(fullName || (sameNumber && shared > 0))) continue;

    const url = canonical(raw);
    const host = hostOf(url);
    if (!host) continue;
    if (hits(BARRED, host) || hits(UNTRUSTED, host)) {
      entry.rejected = "barred or untrusted host";
      continue;
    }
    if (FARM_DOMAIN.test(registrable(host))) {
      entry.rejected = "farm domain";
      continue;
    }

    return {
      chosen: url,
      rule: "maps",
      reason: fullName
        ? `Maps listing "${title}" matches the full name and states this website`
        : `Maps listing "${title}" matches the name and the street number, and states this website`,
      candidates,
    };
  }

  return {
    chosen: null,
    rule: null,
    reason: places.length
      ? "no Maps listing both matched this restaurant and carried a website"
      : "Maps returned no listings",
    candidates,
  };
}

function pathDepth(pathname) {
  return String(pathname || "/").split("/").filter(Boolean).length;
}

/**
 * Chooses one result, or none.
 *
 * Position is only a tiebreak. Google's first result for a small restaurant is
 * very often Yelp and its second a delivery app, and in the sampled fifty the
 * restaurant's own site sat as low as fifth. What decides is which of the
 * three positive rules a result satisfies, and rule (c) - street number on a
 * plausible page - never outranks a storefront or a name-matching domain.
 */
function pick(row, payload) {
  const tokens = identifying(row.name);
  const number = streetNumber(row.address);
  const organic = Array.isArray(payload?.organic) ? payload.organic : [];
  const candidates = [];

  for (const [i, r] of organic.entries()) {
    const link = r?.link;
    const url = canonical(link);
    const host = hostOf(link);
    const text = `${r?.title || ""} ${r?.snippet || ""}`;
    const c = { url, host, position: r?.position ?? i + 1, title: r?.title ?? null };

    if (!url || !host) {
      candidates.push({ ...c, rejected: "unparseable url" });
      continue;
    }
    if (hits(BARRED, host)) {
      candidates.push({ ...c, rejected: "barred (screen-menus)" });
      continue;
    }
    if (hits(UNTRUSTED, host)) {
      candidates.push({ ...c, rejected: "untrusted (screen-menus)" });
      continue;
    }
    if (hits(MARKETPLACE, host)) {
      candidates.push({ ...c, rejected: "marketplace/aggregator/news/directory" });
      continue;
    }
    /*
     * The farm shape, checked before any positive rule can be fooled by it and
     * exempting the real platforms, whose storefronts use subdomains for the
     * same reason and are not generic-word domains.
     */
    if (!hits(PLATFORM, host) && subdomain(host) && FARM_DOMAIN.test(registrable(host))) {
      candidates.push({ ...c, rejected: "directory farm (a business on a minted subdomain)" });
      continue;
    }

    /*
     * The name gate from the original spec, kept ahead of the positive rules:
     * a result that mentions the restaurant nowhere - not in its title, not in
     * its snippet, not in its URL - is about something else, whatever else is
     * true of it.
     */
    const parsed = new URL(url);
    const slug = fold(`${host}${parsed.pathname}`).replace(/[^A-Z0-9]/g, "");
    const shared = overlap(tokens, text);
    const inSlug = [...tokens].filter((w) => w.length > 3 && slug.includes(fold(w))).length;
    if (shared === 0 && inSlug === 0) {
      candidates.push({ ...c, rejected: "no identifying word shared with the name" });
      continue;
    }

    const hasNumber = Boolean(number) && new RegExp(`\\b${number}\\b`).test(text);

    /*
     * `order.online/store/-22950/null` was a real pick. A path segment reading
     * `null` or `undefined` is somebody's template rendering a missing id, and
     * the link is dead whatever else is right about it.
     */
    if (/\/(null|undefined)(\/|$)/i.test(parsed.pathname)) {
      candidates.push({ ...c, rejected: "url has a null/undefined path segment" });
      continue;
    }

    // (a) a storefront the restaurant set up on somebody's ordering platform.
    if (hits(PLATFORM, host)) {
      /*
       * A platform host is only worth trusting for a page that names ONE
       * store. `netwaiter.com/discovery/Burgers/Alpine/CA` is a category
       * index, `slicelife.com/pizza-delivery/ca-los_angeles` is a city index
       * for the wrong city, and both were written to rows as if they were the
       * restaurant's storefront.
       */
      if (PLATFORM_INDEX.test(parsed.pathname) || PLATFORM_INDEX_END.test(parsed.pathname)) {
        candidates.push({ ...c, rejected: "platform category/city index, not one store's storefront" });
        continue;
      }
      /*
       * And it has to be the RIGHT store. `rolbertostacoshop.netwaiter.com`
       * and `calientemexicanfood.netwaiter.com` are both real storefronts of
       * real restaurants - just not the ones on the record. Each mentioned our
       * restaurant only in a "Similar Restaurants" sidebar, which is why the
       * agreement has to come from the page's own title or its slug and not
       * from the snippet, where a neighbour's name is ordinary furniture.
       *
       * Kept deliberately loose - the title OR the slug, either will do -
       * because trading names drift from the records legitimately, and a
       * numeric storefront slug like `order.online/store/311997` carries no
       * name at all and must not be punished for it.
       */
      const namedInTitle = overlap(tokens, r?.title || "") > 0;
      if (!namedInTitle && inSlug === 0) {
        candidates.push({ ...c, rejected: "storefront names a different business" });
        continue;
      }
      candidates.push({ ...c, tier: 2, rule: "a", why: "ordering-platform storefront", hasNumber });
      continue;
    }

    // (b) a domain built out of the restaurant's own name.
    const nameMatch = domainFromName(host, row.name);
    if (nameMatch) {
      /*
       * Right domain, possibly wrong page. Google likes to rank the catering
       * or blog page of a small restaurant's site above its homepage, and
       * `landinispizzeria.com/catering/` is not the website - the site is.
       * Menu and location paths are the exception worth keeping: they are what
       * the router wants, and for a chain row the branch page is the answer.
       */
      const deep = parsed.pathname !== "/" && !GOOD_PATH_WORD.test(parsed.pathname);
      /*
       * The origin fallback assumes the deep path is a SIDE PAGE of the
       * restaurant's own site, and for `landinispizzeria.com/catering/` it is.
       * On a directory it is the opposite: `bobateadirectory.com/boba/us/ca/
       * san-diego/<slug>` and `friendsoffallbrook.com/california/fallbrook/
       * food-drinks/<slug>` both matched a word of the name, and the fallback
       * promoted a listing into the directory's own homepage.
       *
       * Depth separates them. A restaurant's side page is one or two segments;
       * a listing is four or five, because it has to encode country, state,
       * city and slug before it reaches the business. Nothing that deep is
       * worth keeping the origin of.
       */
      if (deep && pathDepth(parsed.pathname) > 2) {
        candidates.push({ ...c, rejected: "name matches the domain, but the path is a directory listing" });
        continue;
      }
      candidates.push({
        ...c,
        url: deep ? parsed.origin : url,
        // A domain that is ENTIRELY the restaurant's name outranks one that
        // merely contains a word of it, and outranks a storefront too.
        tier: nameMatch === 2 ? 3 : 2,
        rule: "b",
        why:
          (nameMatch === 2 ? "the domain is the name" : "the domain contains the name") +
          (deep ? " (kept the origin, not the side page)" : ""),
        hasNumber,
      });
      continue;
    }

    // (c) last resort: the record's street number on a page that is plausibly
    // the restaurant's own. Everything about this rule is a guard.
    if (!hasNumber) {
      candidates.push({ ...c, rejected: "not a storefront, not a name-matching domain, no street number" });
      continue;
    }
    if (hits(SOFT_BAD_HOST, host)) {
      candidates.push({ ...c, rejected: "street number, but a media/directory/social/maps/gift/realty host" });
      continue;
    }
    /*
     * Rule (c) wants the ROOT of a site, not a page inside one, and this is
     * the single guard that did the most work. Every directory the sample
     * turned up files its businesses under a collection segment - corner.inc
     * `/place/<id>`, hellomosey `/restaurants/<id>`, vayapin `/us-<slug>`,
     * sandiegorestaurants `/wa-dining-okan/` - because that is what a site
     * holding many businesses has to do. A restaurant's own site answers at
     * `/`. Depth 1 survives only for a menu or locations path, which is the
     * restaurant's own site by another door.
     */
    /*
     * The root of a DOMAIN, not the root of a subdomain somebody minted. The
     * farm guard above catches the generic-word hosts; this catches the rest
     * of the shape, which is how `taco.coca-cola.com` and
     * `my-store-f547a9.creator-spring.com` reached rows. A restaurant's own
     * site answers at its own domain or at `www`.
     */
    if (subdomain(host)) {
      candidates.push({ ...c, rejected: "street number, but the business sits on somebody's subdomain" });
      continue;
    }
    /*
     * A homepage does not need a query string. `endthehate.net/?cat_id=16275`
     * is a directory category that happens to live at the root.
     */
    if (parsed.search) {
      candidates.push({ ...c, rejected: "street number, but the root carries a query string" });
      continue;
    }
    /*
     * `/locations` is a fine website under rule (b), where the domain is
     * already established as the restaurant's - and is not one here, where it
     * is not. `juiceitup.com/locations/` came through this door for a record
     * called "Juice Bar": a store-locator index for a different chain
     * entirely, carrying the street number only because the index lists every
     * branch in the county.
     */
    if (PLATFORM_INDEX_END.test(parsed.pathname) || PLATFORM_INDEX.test(parsed.pathname)) {
      candidates.push({ ...c, rejected: "street number, but the page is an index rather than one business" });
      continue;
    }
    const depth = pathDepth(parsed.pathname);
    if (depth > 1 || (depth === 1 && !GOOD_PATH_WORD.test(parsed.pathname))) {
      candidates.push({
        ...c,
        rejected: "street number, but not the root of a site (reads as a directory entry)",
      });
      continue;
    }
    if (BAD_PATH_WORD.test(parsed.pathname)) {
      candidates.push({ ...c, rejected: "street number, but the path reads as an article or listing" });
      continue;
    }
    candidates.push({ ...c, tier: 1, rule: "c", why: `street number ${number} on a plausible page`, hasNumber });
  }

  const viable = candidates.filter((c) => c.tier);
  if (viable.length === 0) {
    return { chosen: null, rule: null, reason: "no-confident-result", candidates };
  }
  // Rules (a) and (b) over (c); then the street number; then Google's order.
  viable.sort(
    (a, b) =>
      b.tier - a.tier ||
      Number(b.hasNumber) - Number(a.hasNumber) ||
      a.position - b.position,
  );
  const best = viable[0];
  const reason = [
    `rule ${best.rule}`,
    best.why,
    best.hasNumber ? `street number ${number} in snippet` : null,
    `position ${best.position}`,
  ]
    .filter(Boolean)
    .join("; ");
  return { chosen: best.url, rule: best.rule, reason, candidates };
}

/* ---------- cache and ledger ---------- */

await mkdir(CACHE_DIR, { recursive: true });

const cached = new Set(
  (await readdir(CACHE_DIR).catch(() => []))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    /* Only this mode's own responses count as cached. */
    .filter((n) => (VIA === "maps" ? n.startsWith("maps_") : !n.startsWith("maps_")))
    .map((n) => (VIA === "maps" ? n.slice(5) : n)),
);

async function ledgerCount() {
  const raw = await readFile(LEDGER, "utf8").catch(() => "");
  return raw.split("\n").filter((l) => l.trim()).length;
}

let spent = await ledgerCount();

/*
 * Refuse to start, rather than stopping partway, when the ASK cannot fit. A
 * run that dies at 2,400 halfway through leaves the operator guessing how much
 * of the queue it covered; a run that refuses at the door leaves the ledger
 * untouched and the number on the screen.
 */
if (!DRY && MAX_QUERIES > 0 && spent + MAX_QUERIES > BUDGET) {
  console.error(
    `Refusing to start: ledger holds ${spent} calls and --max-queries ${MAX_QUERIES} ` +
      `would reach ${spent + MAX_QUERIES}, over the ${BUDGET} cap. ` +
      `At most --max-queries ${Math.max(0, BUDGET - spent)} is available.`,
  );
  process.exit(1);
}

/* ---------- the queue ---------- */

/*
 * `--ids` deliberately bypasses the "has no website" filter. Re-parsing the
 * cached responses for rows that were already filled - or filled, checked and
 * reverted - is the whole audit loop, and it costs nothing.
 */
const all = await sql`
  SELECT id, name, address, city, review_count
  FROM restaurants
  WHERE hold_reason IS NULL
    AND coalesce(trim(website), '') = ''
  ORDER BY review_count DESC NULLS LAST`;

let rows = all;
if (IDS.length) {
  const want = new Set(IDS.map(String));
  const have = new Set(all.map((r) => String(r.id)));
  const missing = IDS.filter((id) => !have.has(id));
  const extra = missing.length
    ? await sql`
        SELECT id, name, address, city, review_count
        FROM restaurants
        WHERE id = ANY(${missing})`
    : [];
  rows = [...all.filter((r) => want.has(String(r.id))), ...extra];
  rows.sort((a, b) => IDS.indexOf(String(a.id)) - IDS.indexOf(String(b.id)));
}
if (Number.isFinite(LIMIT)) rows = rows.slice(0, LIMIT);

const needQuery = rows.filter((r) => !cached.has(String(r.id))).length;

console.log(
  `[--via ${VIA}] ${all.length} restaurants have no website; this run looks at ${rows.length}` +
    (IDS.length ? ` (--ids ${IDS.length})` : "") +
    (Number.isFinite(LIMIT) ? ` (--limit ${LIMIT})` : "") +
    `.`,
);
console.log(
  `${rows.length - needQuery} already cached (free to re-parse), ${needQuery} would need a live query.`,
);
console.log(
  `ledger ${spent}/${BUDGET} used, ${BUDGET - spent} left; --max-queries ${MAX_QUERIES}` +
    (DRY ? " (--dry: no live calls, no writes)" : "") +
    ".",
);
if (!DRY && MAX_QUERIES === 0 && needQuery > 0) {
  console.log(
    "--max-queries is 0, so nothing will be queried. Pass --max-queries N to spend N credits.",
  );
}

/*
 * The plan, in dry mode: the actual query strings, because the query is the
 * thing worth checking before spending 2,400 of them. A name with a stray
 * "LLC" in it or an address line that already carries the city both show up
 * here and nowhere else.
 */
if (DRY) {
  const plan = rows.filter((r) => !cached.has(String(r.id)));
  console.log(`\nplan - ${plan.length} live queries would be sent, first ${Math.min(20, plan.length)}:`);
  for (const r of plan.slice(0, 20))
    console.log(`  ${r.id}  ${VIA === "maps" ? buildMapsQuery(r) : buildQuery(r)}`);
  const fromCache = rows.filter((r) => cached.has(String(r.id)));
  if (fromCache.length) console.log(`\n${fromCache.length} re-parsed from cache at no cost.`);
}

/* ---------- run ---------- */

async function serper(query) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "X-API-KEY": KEY, "Content-Type": "application/json" },
      /*
       * `num` is never above 10: Serper bills one credit per ten results.
       * The maps endpoint takes no `num` at all and bills one per call.
       */
      body: JSON.stringify(
        VIA === "maps" ? { q: query, gl: "us", hl: "en" } : { q: query, num: 10 },
      ),
    });
    if (res.ok) return await res.json();
    // 429 and 5xx are worth another go; 401/403 mean the key is wrong and
    // retrying just burns the allowance faster.
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`Serper ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    if (attempt === 3) throw new Error(`Serper ${res.status} after 3 attempts`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  return null;
}

const notes = [];
let queried = 0;
let found = 0;
let unconfident = 0;
let skipped = 0;

for (const row of rows) {
  const id = String(row.id);
  const query = VIA === "maps" ? buildMapsQuery(row) : buildQuery(row);
  let payload = null;

  if (cached.has(id)) {
    payload = JSON.parse(
      await readFile(`${CACHE_DIR}/${cacheName(id)}.json`, "utf8").catch(() => "null"),
    );
  } else if (DRY) {
    skipped++;
    continue;
  } else if (MAX_QUERIES === 0 || queried >= MAX_QUERIES) {
    skipped++;
    continue;
  } else if (spent >= BUDGET) {
    // Stop cleanly rather than throwing: everything already parsed still gets
    // written, and the remaining rows are simply "skipped".
    skipped++;
    continue;
  } else {
    try {
      payload = await serper(query);
    } catch (err) {
      console.error(`  ${id} ${row.name}: ${err instanceof Error ? err.message : err}`);
      skipped++;
      continue;
    }
    // Cache BEFORE parsing. A picker bug then costs a re-parse, not a credit.
    await writeFile(
      `${CACHE_DIR}/${cacheName(id)}.json`,
      JSON.stringify(payload, null, 1),
      "utf8",
    );
    await appendFile(
      LEDGER,
      `${JSON.stringify({ id, ts: new Date().toISOString(), via: VIA, query })}\n`,
      "utf8",
    );
    cached.add(id);
    queried++;
    spent++;
    // Gentle on the endpoint; the run is an hour either way.
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!payload) {
    skipped++;
    continue;
  }

  const { chosen, rule, reason, candidates } =
    VIA === "maps" ? pickFromMaps(row, payload) : pick(row, payload);
  notes.push({
    restaurantId: id,
    name: row.name,
    chosen,
    source: VIA === "maps" ? "serper-maps" : "serper",
    website_source: VIA === "maps" ? "serper-maps" : "serper",
    rule,
    reason,
    query,
    candidates,
  });

  if (!chosen) {
    unconfident++;
    continue;
  }
  found++;

  if (!DRY) {
    // The emptiness check rides on the UPDATE itself, so a row that gained a
    // website between the query and this write keeps the one it has.
    await sql`
      UPDATE restaurants
      SET website = ${chosen}
      WHERE id = ${id} AND coalesce(trim(website), '') = ''`;
  }
}

/* ---------- report ---------- */

/*
 * Merge rather than overwrite. The queue is worked in slices - `--limit`, then
 * `--ids` for the ones that came back wrong - and a plain write would leave the
 * notes file holding only the last slice, throwing away the provenance for
 * every restaurant filled before it. Newest entry per restaurant wins.
 */
if (!DRY && notes.length) {
  const prior = await readFile(NOTES, "utf8")
    .then((t) => JSON.parse(t))
    .catch(() => []);
  const byId = new Map(
    (Array.isArray(prior) ? prior : []).map((n) => [String(n?.restaurantId), n]),
  );
  for (const n of notes) byId.set(String(n.restaurantId), n);
  await writeFile(NOTES, JSON.stringify([...byId.values()], null, 1), "utf8");
}

console.log(
  `\nqueried ${queried} (live) / found ${found} / no-confident-result ${unconfident} / skipped ${skipped}`,
);
const byRule = notes.filter((n) => n.chosen).reduce((acc, n) => {
  acc[n.rule] = (acc[n.rule] ?? 0) + 1;
  return acc;
}, {});
if (found) {
  console.log(
    `by rule: ${Object.entries(byRule).sort().map(([r, n]) => `(${r}) ${n}`).join(", ")}`,
  );
}
console.log(`ledger now ${spent}/${BUDGET}.`);
if (!DRY && notes.length) console.log(`merged ${notes.length} entries into ${NOTES}`);
if (DRY) console.log("(--dry: nothing written to the database or to the notes file)");

const sample = notes.filter((n) => n.chosen).slice(0, SAMPLE);
if (sample.length) {
  console.log(`\nsample (${sample.length} of ${found}):`);
  for (const n of sample) console.log(`  ${n.restaurantId}  ${n.name} -> ${n.chosen}  [${n.rule}]`);
}
const misses = notes.filter((n) => !n.chosen).slice(0, SAMPLE);
if (misses.length) {
  console.log(`\nno confident result (${misses.length} of ${unconfident} shown):`);
  for (const n of misses) console.log(`  ${n.restaurantId}  ${n.name}`);
}
