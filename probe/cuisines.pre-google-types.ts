/**
 * The cuisine vocabulary: what Discover offers as a filter, and what search
 * still knows underneath it.
 *
 * Two separate jobs, which is why there are two exports rather than one list.
 *
 * `CUISINES` is the *filter*. It is short and deliberately blunt — a visitor
 * scrolling a facet wants a dozen recognisable buckets, not a taxonomy. The
 * corpus arrived with 162 distinct values across 4,792 restaurants, 79 of them
 * carrying two places or fewer, because `import-osm.mjs` title-cased whatever
 * an OpenStreetMap contributor had typed into `cuisine=`. That produced "Pho"
 * (2) sitting a few rows below "Vietnamese" (61), "Coffee" (2) below "Coffee
 * Shop" (334), and a "Coffe Shop" (1) that was purely a typo. None of those is
 * a category anyone would choose from a list.
 *
 * `tagsFor` is *search*. Collapsing the filter must not cost the corpus its
 * detail: folding Tacos into Mexican is right for a facet and wrong for the
 * search bar, where typing "tacos" has to surface taco shops. So the specific
 * label survives as a search tag on the row, alongside a few synonyms it would
 * otherwise never match ("boba" for bubble tea, "bbq" for barbecue). The
 * filter reads `cuisine`; every search predicate reads `cuisine` *and*
 * `cuisineTags`.
 *
 * The consequence worth stating: a term that used to be promoted out of the
 * search box into a filter — `filtersFromSearch` in lib/discoverFilters.ts —
 * is only promoted if it names something in `CUISINES`. "Tacos" no longer
 * does, so it stays a text query and matches by tag. That is the intended
 * behaviour, not a regression.
 */

/**
 * Every cuisine the filter offers. Nothing outside this list can reach the
 * `cuisine` column — `canonicalCuisine` is the only writer, and it either
 * returns a member of this list or null.
 */
export const CUISINES = [
  "African",
  "American",
  "Asian",
  "BBQ",
  "Bakery & Desserts",
  "Bars",
  "Breakfast & Brunch",
  "Burgers",
  "Chicken",
  "Chinese",
  "Coffee & Tea",
  "Fast Food",
  "French",
  "Hawaiian",
  "Indian",
  "Italian",
  "Japanese",
  "Juice & Smoothies",
  "Korean",
  "Latin American",
  "Mediterranean",
  "Mexican",
  "Pizza",
  "Sandwiches",
  "Seafood",
  "Steakhouse",
  "Thai",
  "Vegetarian",
  "Vietnamese",
] as const;

export type Cuisine = (typeof CUISINES)[number];

const CUISINE_SET: ReadonlySet<string> = new Set(CUISINES);

export function isCuisine(value: string | null | undefined): value is Cuisine {
  return value != null && CUISINE_SET.has(value);
}

/**
 * Raw label (lowercased) to canonical cuisine.
 *
 * Keys come from three vocabularies that were never reconciled: Yelp's
 * title-cased plurals ("Sushi Bars", "Breakfast & Brunch"), OpenStreetMap's
 * lowercase singulars (`sushi`, `coffee_shop`), and `import-osm.mjs`'s
 * title-cased passthrough of the latter ("Coffee Shop", "Coffe Shop"). All
 * three are matched here so a re-import from any source lands in the same
 * bucket. Underscores are normalised before lookup, so `coffee_shop` and
 * "Coffee Shop" share one key.
 *
 * Values not present here fall through to `UNSET`, below, or to null — never
 * to a title-cased guess. Inventing "Middle Eastern" from `middle_eastern` is
 * what created the long tail in the first place.
 */
const ALIASES: Readonly<Record<string, Cuisine>> = {
  /* --- Mexican & Latin ---------------------------------------------- */
  mexican: "Mexican",
  "tex-mex": "Mexican",
  "tex mex": "Mexican",
  taco: "Mexican",
  tacos: "Mexican",
  burrito: "Mexican",
  burritos: "Mexican",
  "latin american": "Latin American",
  salvadoran: "Latin American",
  salvadorian: "Latin American",
  cuban: "Latin American",
  "puerto rican": "Latin American",
  venezuelan: "Latin American",
  peruvian: "Latin American",
  brazilian: "Latin American",
  argentinian: "Latin American",
  argentine: "Latin American",
  colombian: "Latin American",
  caribbean: "Latin American",
  arepas: "Latin American",

  /* --- Italian ------------------------------------------------------ */
  italian: "Italian",
  "italian pizza": "Pizza",
  pasta: "Italian",
  pizza: "Pizza",
  pizzeria: "Pizza",

  /* --- East & South Asian ------------------------------------------- */
  chinese: "Chinese",
  cantonese: "Chinese",
  szechuan: "Chinese",
  sichuan: "Chinese",
  "dim sum": "Chinese",
  dumplings: "Chinese",
  "hot pot": "Chinese",
  hotpot: "Chinese",
  taiwanese: "Chinese",
  "mongolian grill": "Chinese",
  japanese: "Japanese",
  sushi: "Japanese",
  "sushi bars": "Japanese",
  ramen: "Japanese",
  izakaya: "Japanese",
  teppanyaki: "Japanese",
  udon: "Japanese",
  "beef bowl": "Japanese",
  korean: "Korean",
  thai: "Thai",
  curry: "Thai",
  vietnamese: "Vietnamese",
  pho: "Vietnamese",
  "banh mi": "Vietnamese",
  indian: "Indian",
  pakistani: "Indian",
  nepalese: "Indian",
  asian: "Asian",
  "asian fusion": "Asian",
  fusion: "Asian",
  noodle: "Asian",
  noodles: "Asian",
  filipino: "Asian",
  indonesian: "Asian",
  malaysian: "Asian",
  singaporean: "Asian",
  cambodian: "Asian",
  burmese: "Asian",
  laotian: "Asian",
  hawaiian: "Hawaiian",
  poke: "Hawaiian",

  /* --- Mediterranean & Middle East ----------------------------------- */
  /* Spanish and Greek fold in here rather than standing alone. Both are
     small in the corpus (Greek 22, Spanish 2) and both read as Mediterranean
     to someone scanning a filter for somewhere to eat. */
  mediterranean: "Mediterranean",
  greek: "Mediterranean",
  spanish: "Mediterranean",
  portuguese: "Mediterranean",
  tapas: "Mediterranean",
  "tapas bars": "Mediterranean",
  "tapas/small plates": "Mediterranean",
  "middle eastern": "Mediterranean",
  lebanese: "Mediterranean",
  syrian: "Mediterranean",
  arab: "Mediterranean",
  arabic: "Mediterranean",
  israeli: "Mediterranean",
  turkish: "Mediterranean",
  moroccan: "Mediterranean",
  persian: "Mediterranean",
  "persian/iranian": "Mediterranean",
  iranian: "Mediterranean",
  afghan: "Mediterranean",
  kebab: "Mediterranean",
  falafel: "Mediterranean",
  shawarma: "Mediterranean",
  gyro: "Mediterranean",
  pita: "Mediterranean",

  /* --- African -------------------------------------------------------- */
  african: "African",
  ethiopian: "African",
  eritrean: "African",
  somali: "African",
  nigerian: "African",

  /* --- American & the small Western tail ----------------------------- */
  /* German, Russian and the rest are one or two rows each. They are not
     American in any culinary sense; they are here because a filter with a
     one-restaurant "Russian" row is the exact problem this file exists to
     fix, and American is the least-wrong basic bucket for a Western sit-down
     restaurant. The specific label survives as a search tag, so someone
     looking for German food still finds it by typing it. */
  american: "American",
  "new american": "American",
  californian: "American",
  diner: "American",
  diners: "American",
  grill: "American",
  "pot pie": "American",
  southern: "American",
  "soul food": "American",
  "comfort food": "American",
  cajun: "American",
  "cajun/creole": "American",
  creole: "American",
  german: "American",
  russian: "American",
  polish: "American",
  british: "American",
  european: "American",
  steak: "Steakhouse",
  "steak house": "Steakhouse",
  steakhouse: "Steakhouse",
  steakhouses: "Steakhouse",
  churrascaria: "Steakhouse",
  french: "French",
  bistro: "French",

  /* --- Bars ----------------------------------------------------------- */
  /* Everything that is a drinking room first. Irish is here rather than
     under American because both rows in the corpus are pubs. */
  bar: "Bars",
  bars: "Bars",
  pub: "Bars",
  pubs: "Bars",
  gastropub: "Bars",
  gastropubs: "Bars",
  brewpub: "Bars",
  brewpubs: "Bars",
  brewery: "Bars",
  breweries: "Bars",
  distillery: "Bars",
  distilleries: "Bars",
  "sports bar": "Bars",
  "sports bars": "Bars",
  "cocktail bar": "Bars",
  "cocktail bars": "Bars",
  "wine bar": "Bars",
  "wine bars": "Bars",
  "dive bar": "Bars",
  "dive bars": "Bars",
  "tiki bar": "Bars",
  lounge: "Bars",
  lounges: "Bars",
  "beer garden": "Bars",
  irish: "Bars",

  /* --- Coffee, tea and cold drinks ------------------------------------ */
  /* Cafe and coffee shop are one bucket. They were four ("Coffee Shop" 334,
     "Cafe" 162, "Coffee & Tea" 10, "Coffee" 2) plus a typo, describing the
     same room. Bubble tea joins them — a boba shop is a tea shop — while
     juice and açaí get their own bucket, since nobody looking for a smoothie
     wants a list of espresso bars. */
  cafe: "Coffee & Tea",
  cafes: "Coffee & Tea",
  coffee: "Coffee & Tea",
  "coffee shop": "Coffee & Tea",
  "coffe shop": "Coffee & Tea",
  "coffee & tea": "Coffee & Tea",
  "coffee roastery": "Coffee & Tea",
  "coffee roasteries": "Coffee & Tea",
  tea: "Coffee & Tea",
  teahouse: "Coffee & Tea",
  "tea house": "Coffee & Tea",
  "bubble tea": "Coffee & Tea",
  boba: "Coffee & Tea",
  juice: "Juice & Smoothies",
  "juice bar": "Juice & Smoothies",
  smoothie: "Juice & Smoothies",
  smoothies: "Juice & Smoothies",
  "açaí": "Juice & Smoothies",
  acai: "Juice & Smoothies",

  /* --- Baked and sweet ------------------------------------------------ */
  bakery: "Bakery & Desserts",
  bakeries: "Bakery & Desserts",
  pastry: "Bakery & Desserts",
  bagel: "Bakery & Desserts",
  bagels: "Bakery & Desserts",
  donut: "Bakery & Desserts",
  donuts: "Bakery & Desserts",
  doughnut: "Bakery & Desserts",
  pretzel: "Bakery & Desserts",
  pretzels: "Bakery & Desserts",
  cake: "Bakery & Desserts",
  cheesecake: "Bakery & Desserts",
  cookie: "Bakery & Desserts",
  cookies: "Bakery & Desserts",
  churro: "Bakery & Desserts",
  churros: "Bakery & Desserts",
  crepe: "Bakery & Desserts",
  crepes: "Bakery & Desserts",
  waffle: "Bakery & Desserts",
  waffles: "Bakery & Desserts",
  dessert: "Bakery & Desserts",
  desserts: "Bakery & Desserts",
  "ice cream": "Bakery & Desserts",
  gelato: "Bakery & Desserts",
  "frozen yogurt": "Bakery & Desserts",
  yogurt: "Bakery & Desserts",

  /* --- Counter food ---------------------------------------------------- */
  burger: "Burgers",
  burgers: "Burgers",
  hamburger: "Burgers",
  cheeseburger: "Burgers",
  sandwich: "Sandwiches",
  sandwiches: "Sandwiches",
  sub: "Sandwiches",
  subs: "Sandwiches",
  panini: "Sandwiches",
  wrap: "Sandwiches",
  deli: "Sandwiches",
  delis: "Sandwiches",
  cheesesteak: "Sandwiches",
  cheesesteaks: "Sandwiches",
  chicken: "Chicken",
  "chicken shop": "Chicken",
  "fried chicken": "Chicken",
  "chicken wings": "Chicken",
  wings: "Chicken",
  rotisserie: "Chicken",
  barbecue: "BBQ",
  barbeque: "BBQ",
  bbq: "BBQ",
  brisket: "BBQ",
  seafood: "Seafood",
  "seafood markets": "Seafood",
  fish: "Seafood",
  "fish & chips": "Seafood",
  "fish and chips": "Seafood",
  oyster: "Seafood",
  "fast food": "Fast Food",
  "hot dog": "Fast Food",
  "hot dogs": "Fast Food",
  fries: "Fast Food",
  "french fries": "Fast Food",
  "breakfast & brunch": "Breakfast & Brunch",
  breakfast: "Breakfast & Brunch",
  brunch: "Breakfast & Brunch",
  pancake: "Breakfast & Brunch",
  pancakes: "Breakfast & Brunch",
  vegetarian: "Vegetarian",
  vegan: "Vegetarian",
  "plant based": "Vegetarian",
  salad: "Vegetarian",
  salads: "Vegetarian",
};

/**
 * Labels that are in the `cuisine` column but do not name a cuisine.
 *
 * These are the fallbacks the importers wrote when a row arrived with no
 * `cuisine=` tag at all — about 450 rows, most of them the literal word
 * "Restaurant". They matter because they do not *look* like absences: a
 * visitor reading the facet sees "Restaurant (382)" and reasonably takes it
 * for a category. Mapping them to null makes the absence honest, and lets the
 * facet leave them out instead of offering a bucket that means "we don't
 * know".
 *
 * Kept separate from a plain lookup miss so that an unrecognised *real*
 * cuisine (a new OSM tag nobody has mapped yet) can be told apart from a
 * known non-answer when auditing coverage.
 */
const UNSET: ReadonlySet<string> = new Set([
  "restaurant",
  "restaurants",
  "food",
  "regional",
  "dining hall",
  "cafeteria",
  "buffet",
  "buffets",
  "cinema",
  "hotels",
  "hotel",
  "snack",
  "snacks",
  "international",
  "food court",
  "australian",
  "new zealand",
]);

/** `coffee_shop`, "Coffee Shop" and "  COFFEE SHOP " are one key. */
function key(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The canonical cuisine for a raw label, or null when the label names no
 * cuisine — either because it is one of the known non-answers above, or
 * because nothing has mapped it yet.
 *
 * Null rather than a fallback string is the whole point. `canonicalCuisine`
 * is the only thing that writes the `cuisine` column, so every value in that
 * column is either a member of `CUISINES` or absent; there is no third state
 * for a facet to have to explain.
 */
export function canonicalCuisine(raw: string | null | undefined): Cuisine | null {
  if (!raw) return null;
  return ALIASES[key(raw)] ?? null;
}

/** Whether a label is a known non-cuisine rather than merely unmapped. */
export function isUnsetCuisine(raw: string | null | undefined): boolean {
  return raw != null && UNSET.has(key(raw));
}

/**
 * Extra words a tag should match that it does not contain.
 *
 * Only for terms a visitor would plausibly type and that substring matching
 * cannot reach on its own. "Sushi" needs nothing here — the tag is the word.
 * "Bubble Tea" does, because nobody types "bubble tea" when they mean boba.
 *
 * The Vietnamese and Mexican entries are the deliberate ones: they make every
 * Vietnamese restaurant answer "pho" and every Mexican one answer "tacos",
 * which is what the search bar is for. Ranking still puts a place actually
 * named "Pho Ca Dao" above a generic match — see lib/restaurantRank.ts — so
 * the breadth costs nothing at the top of the list.
 */
const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  "bubble tea": ["Boba"],
  barbecue: ["BBQ"],
  barbeque: ["BBQ"],
  "açaí": ["Acai"],
  vietnamese: ["Pho"],
  mexican: ["Tacos", "Burritos"],
  "tex-mex": ["Tacos"],
  japanese: ["Sushi"],
  "coffee shop": ["Coffee", "Cafe"],
  cafe: ["Coffee"],
  "hot pot": ["Hotpot"],
  "fish & chips": ["Fish and Chips"],
  "cajun/creole": ["Cajun", "Creole"],
  "persian/iranian": ["Persian", "Iranian"],
  "tapas/small plates": ["Tapas", "Small Plates"],
  poke: ["Poke"],
};

/**
 * The search tags for a row, given the raw label it arrived with.
 *
 * The raw label itself always leads, so nothing the corpus knew is lost when
 * the filter value collapses: a shop tagged `taco` keeps "Tacos" even though
 * its cuisine is now Mexican. A known non-answer contributes nothing — there
 * is no reason for "Restaurant" to be searchable.
 *
 * De-duplicated case-insensitively, because the raw label and a synonym often
 * agree ("Coffee Shop" already carries "coffee").
 */
export function tagsFor(raw: string | null | undefined): string[] {
  if (!raw || isUnsetCuisine(raw)) return [];
  const k = key(raw);
  const out: string[] = [raw.replace(/_/g, " ").replace(/\s+/g, " ").trim()];
  for (const extra of SYNONYMS[k] ?? []) out.push(extra);

  const seen = new Set<string>();
  return out.filter((t) => {
    const lower = t.toLowerCase();
    if (!t || seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}
