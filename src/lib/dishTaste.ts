import { parsePrice } from "@/data/priceBands";
import type { RestaurantView } from "@/data/restaurantTypes";
import {
  FA,
  N_FLAVOR,
  anchorAttr,
  buildFlavorProfile,
  captionSours,
  claimsOf,
  flavorFit,
  gradeOf,
  maybeClaimable,
  mergeMasks,
  pickClaim,
  tagCaption,
  tagDish,
  tagText,
  type FlavorClaim,
  type FlavorSeed,
} from "@/lib/flavor";
import { milesBetween } from "@/lib/geo";
import type { PlateScore } from "@/lib/plateScore";
import {
  budgetOf,
  budgetPoints,
  chainKey,
  distanceFactor,
  priceFit,
  qualityFloor,
  radiusOf,
  shortPlaceName,
  shrunkRating,
  type FullTastePrefs,
  type TastePick,
} from "@/lib/taste";

/**
 * Dish-level picks for Your taste: new places that serve what the viewer's own
 * posts say they eat.
 *
 * Pure: the data comes in as arguments (`lib/db.ts` reads it, `loadDishIndex` in
 * lib/dishIndex.ts caches it), so the tests feed it fixtures and the route owns
 * every read. Personal, like the rest of Your taste: use it only inside a
 * private, uncached response.
 *
 * What counts as the viewer's taste is what they chose to post: the dish they
 * named, the restaurant, its cuisine, the plate's price, and (only to weigh
 * their own dishes against each other) the rating they gave it: their highest-
 * rated dishes lead and their lowest still count, a little. Likes, hearts,
 * upvotes and saves never enter, and a missing input is neutral.
 *
 * How a place scores:
 * - Each posted dish is a seed. Its terms (words and word pairs from the dish
 *   name, and from the menu's own description of it) are weighed by how rare
 *   they are across restaurants, so "hot honey" says something and "chicken"
 *   does not. A newer post weighs more, down to a floor, and a term the viewer
 *   keeps coming back to weighs a little more.
 * - A candidate place matches a seed when one of its menu items shares a
 *   telling name term with it. M is the best such match, plus a quarter of the
 *   next one from a different seed and dish.
 * - Score is g * (100 * (0.45 M D + 0.20 C D + 0.35 Q) + budget):
 *   C the share of the viewer's history in the place's cuisine, Q its
 *   rating, D the distance factor from the middle of where they post, g the
 *   soft floor on a low rating.
 * - Places they posted at, marked been or hid, and every branch of their
 *   chains, are never picked.
 */

export const DISH_TASTE = {
  /** Half-life of a post's weight, in days, and the least it falls to. */
  halfLifeDays: 120,
  weightFloor: 0.4,
  /** A term served by more than this share of restaurants, or fewer than `minDf`, says nothing. */
  maxDfShare: 0.12,
  minDf: 3,
  minIdf: 1.5,
  /** A name term must be at least this rare to make a match; a single shared term must clear `loneIdf`. */
  hitIdf: 3,
  loneIdf: 4,
  /** A match on one word and nothing else counts this much of a full one. */
  loneHit: 0.6,
  /** A seed whose own terms are this weak falls back to its place's styles. */
  weakSeedIdf: 3.5,
  descWeight: 0.5,
  styleWeight: 0.7,
  /** A match through a place's styles (no dish) counts a little less than a dish. */
  styleHit: 0.85,
  drinkHit: 0.7,
  gate: 0.4,
  wM: 0.45,
  wC: 0.2,
  wQ: 0.35,
  /** C is the cuisine's share of history over this, capped at 1. */
  cuisineFull: 0.25,
  unratedQ: 0.3,
  minQ: 0.4,
  minD: 0.5,
  /** Never farther than this many times the viewer's range, nor under `minCapMiles`. */
  capRadii: 2,
  minCapMiles: 12,
  minSeeds: 3,
  limit: 12,
  perCuisine: 4,
  /** A seed fills at most this many of the first `topSix` picks, and `perSeed` of the whole row. */
  perSeed: 2,
  perSeedTop: 1,
  top: 6,
  perDrinks: 2,
  textChars: 84,
  shortChars: 72,
  /** A rating under this (of 100) is a verdict against the dish: that post seeds nothing. */
  dropBelow: 50,
  /** The weight of the viewer's lowest-rated dish; their highest weighs 1. */
  ratingFloor: 0.4,
  /** In the final order a pick weighs `score` x (this + the rest x its seed's rating weight). */
  orderFloor: 0.3,
  /** The rating weight is raised to this in the final order, so a 90+ dish visibly leads. */
  ratingPow: 1.5,
  /** Dish families (pizza, sushi, ...): the profile evidence a place needs, and how a pick is capped. */
  famSpecialist: 0.85,
  famServes: 0.5,
  famUntagged: 0.75,
  /** A meat-free place for a seed whose own place is not. */
  famContra: 0.8,
  /** A second pick from a family counts this much of a first when the row is ordered. */
  famRepeat: 0.55,
  /** Most picks of one dish family kept in the candidate pool. */
  poolPerFam: 7,
  perFamTop: 1,
  perFam: 2,
  perCuisineTop: 2,
  /** Picks the ranking works through before the row is cut to `limit`. */
  poolFactor: 3,
  /** Drink matches and bar-bite matches count less in the order, and wait until after the first `top`. */
  barShade: 0.7,
  drinkShade: 0.45,
  /** A family match shades by this per step a counter sits below the seed's sit-down place, and per other family the place is a specialist in. */
  svcGap: 0.88,
  hybridShade: 0.9,
  sigBonus: 1.05,
  /** A second pick from a seed counts this much of a first, so a third seed comes before it. */
  seedRepeat: 0.65,
  /** A rating on fewer reviews than this is trusted a little less (the score keeps `reviewFloor` of itself at none). */
  reviewFull: 400,
  reviewFloor: 0.88,
  /** Hard floor on every pick: the place's own rating must be strictly above this (4.0 itself fails, 4.1 passes). */
  pickRatingAbove: 4.0,
  /** ...on at least this many reviews. Deliberately low, so small underground places stay findable. */
  pickMinReviews: 5,
  /**
   * Flavor (lib/flavor.ts): what the viewer liked about their rated dishes. A user's lift per flavor is
   * shrunk by `flavorK` pseudo-posts toward the corpus; an anchor needs a lift of `flavorAnchorBeta`, two
   * explicit posts, and rarity. A dish's fit F maps to a match through `flavorF0`/`flavorFSpan`
   * (v = `flavorV` x clamp((F - F0) / Span)), so the 0.4 gate opens at F of about 0.61.
   */
  flavorK: 5,
  flavorAnchorBeta: 0.4,
  flavorAnchorMinPosts: 2,
  flavorF0: 0.45,
  flavorFSpan: 0.35,
  flavorV: 0.85,
  /** A flavor weight's recency never falls below this (the dish ranking itself floors at `weightFloor`). */
  flavorRecencyFloor: 0.6,
  /** A family match moves by up to this share with how well its item fits the flavor profile. */
  flavorMod: 0.2,
  /** At most this many of the first `top` picks may stand on flavor alone. */
  flavorOnlyTop: 3,
  /** A place the viewer names in their own captions ("better than Dave's") counts for this much of its score: it is not news. */
  knownShade: 0.6,
  /** A pick on flavor alone, on a line that neither its name nor its place's cuisine shows to be a meal, counts for this much. */
  oddShade: 0.85,
  /** Ratings that spread less than this are flattened to `flavorFlat`. */
  flavorSpreadMin: 8,
  flavorFlat: 0.7,
  /** A rating about value, service or ambiance is half a rating about the food. */
  flavorVibeFactor: 0.5,
  /** A menu-less place judged on its profile text alone counts this much of a menu match. */
  flavorPlace: 0.7,
  /**
   * Adventurous picks: a few of the row are a flavor the viewer likes, in a cuisine or dish family none of their
   * posts (or been places) is in. Worth `floor(limit / 4)` of the row, at most `advMax`; the first sits no earlier
   * than index `advFirst` (so never in the first three), the rest are spread to the end. A pick needs the quality
   * of the place (`advMinQ`, a shrunk rating of about 4.4 or better) and a fit of at least `advMinV`.
   */
  advMax: 3,
  advFirst: 4,
  advMinQ: 0.5,
  advMinV: 0.5,
  /**
   * Round 2. A posted dish is cited as "like your X" only when its own text states the flavor, its caption does not
   * complain, and it is rated at least min(citeRating, best such dish - citeBelowTop).
   */
  citeRating: 80,
  citeBelowTop: 4,
  /** A flavor other than sweet heat stands on its own only with this many citable dishes that show it (and not sweet heat). */
  aloneSeeds: 2,
  /** Share of a place's food lines of the pick's kind: below `focusFull` a flavor-only score shades toward `focusFloor`. */
  focusFull: 0.3,
  focusFloor: 0.55,
  /** A flavor-only pizza at a place that is not a pizza specialist, and a flavor-only pick set against a family match. */
  flavorLedShade: 0.92,
  /** A family pick whose own line carries their top flavor (sweet heat) is worth a little more than the family alone. */
  heatLed: 1.1,
  /** ...and when its quoted words repeat a phrase from the name of one of their best dishes of that flavor. */
  echoShade: 1.08,
  /** A flavor-only pick whose flavor is theirs only in another kind of dish (and not a new family): shaded. */
  crossShade: 0.8,
  /** Among the adventurous picks, one that keeps the posted dish's form (and changes the cuisine) goes first. */
  advSameForm: 1.15,
  /** Meat-free swaps allowed in the row when the viewer has not posted meat-free food. */
  plantMax: 1,
} as const;

/** The hard quality floor every pick must clear: rated above `pickRatingAbove` on at least `pickMinReviews` reviews. */
export function passesFloor(r: { rating?: number | null; reviewCount?: number | null }): boolean {
  return r.rating != null && r.rating > DISH_TASTE.pickRatingAbove && (r.reviewCount ?? 0) >= DISH_TASTE.pickMinReviews;
}

/** One menu item as the loader reads it. */
export type DishRow = {
  rid: string;
  name: string;
  description: string | null;
  price: string | number | null;
  section: string | null;
};

/** What a place's menu profile says: its service styles and dish types, and its median price. */
export type ProfileRow = {
  rid: string;
  styles: readonly string[];
  dishTypes: readonly string[];
  median: number | null;
  /** The place's signature dishes, its service style and its main cuisine, when the profile has them. */
  signatures?: readonly string[];
  service?: string | null;
  mainCuisine?: string | null;
  /** The profile's one-line summary and spice level ("none" | "some" | "lots"): for a place with no menu lines. */
  summary?: string | null;
  spice?: string | null;
};

/** The main cuisines whose "BBQ" is not smoke (Korean BBQ): the flavor tagger skips its plain-BBQ rule there. */
const ASIAN_MAIN = /^(Chinese|Vietnamese|Korean|Japanese|Hawaiian|Thai|Asian)$/;
export const isAsianMain = (mainCuisine: string | null | undefined): boolean => ASIAN_MAIN.test(mainCuisine ?? "");

/** One of the viewer's posts, with the menu's own line for the dish when the loader found it. */
export type ViewerPost = {
  restaurantId: string;
  dishName: string | null;
  /** The name the post carries, for a place that has left the corpus. */
  restaurantName?: string | null;
  /** Epoch milliseconds. */
  at: number;
  price: string | null;
  dishDescription: string | null;
  dishSection: string | null;
  /** The viewer's own rating of the dish, out of 100; null or missing when they left none. */
  rating?: number | null;
  /** The viewer's own words on the post, and the vibe they rated (Value, Service, Ambiance ... ). */
  caption?: string | null;
  vibe?: string | null;
};

/* ---------- text ---------- */

const STOP = new Set(
  (
    "and with or the a an of in on to for from your our you served choice house made fresh topped over comes come " +
    "two three one side extra add w per each any all can its it is are as at by plus style number combo special " +
    "plate platter classic original signature meal build create"
  ).split(" "),
);

const SYNONYMS: Record<string, string> = {
  parmigiana: "parm",
  parmagiana: "parm",
  parmigiano: "parm",
};

const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[®™©]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Folds for the names a ranking reads over and over (item names, cuisines, the lines a hit cites): the same few
 * thousand strings come back on every request, so a bounded memo turns the repeat into a lookup.
 */
const FOLD_MEMO = new Map<string, string>();
const foldM = (s: string): string => {
  let v = FOLD_MEMO.get(s);
  if (v === undefined) {
    if (FOLD_MEMO.size > 80_000) FOLD_MEMO.clear();
    v = fold(s);
    FOLD_MEMO.set(s, v);
  }
  return v;
};
/** The restaurant's chain key, worked out once per restaurant object (the corpus objects outlive a request). */
const CHAIN_MEMO = new WeakMap<object, string>();
const chainKeyM = (r: Parameters<typeof chainKey>[0]): string => {
  let v = CHAIN_MEMO.get(r);
  if (v === undefined) {
    v = chainKey(r);
    CHAIN_MEMO.set(r, v);
  }
  return v;
};

/** Light stemming: plurals only, so "wings" and "wing" meet and "glass" stays. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/**
 * The words and adjacent word pairs of a dish name or description, folded and
 * stemmed. A pair never spans a comma, bracket or other break, so "ribs, slaw"
 * does not make "rib slaw".
 */
export function termsOf(text: string): string[] {
  const out = new Set<string>();
  for (const segment of text.split(/[,.;:()|+\n]+/)) {
    const kept = fold(segment)
      .split(" ")
      .filter(Boolean)
      .map((w) => {
        const t = SYNONYMS[w] ?? stem(w);
        return t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t) ? t : "";
      });
    for (let i = 0; i < kept.length; i++) {
      if (!kept[i]) continue;
      out.add(kept[i]);
      if (kept[i + 1]) out.add(`${kept[i]} ${kept[i + 1]}`);
    }
  }
  return [...out];
}

/** 30 bits of FNV-1a: terms are kept as numbers, since a menu corpus has millions of them. */
function termId(term: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < term.length; i++) {
    h ^= term.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 2;
}

const SIDE_SECTION = /\b(sides?|extras?|add ?ons?|toppings?|condiments?|kids?|dips?|sauces?)\b/;
const SIDE_NAME = /^(side|extra|add|additional|sub|substitute|no |upgrade)\b|\bside of\b/;
/** A menu section a table shares from rather than orders a meal from; its lines are kept, but never lead a pick. */
const STARTER_SECTION =
  /\b(?:appetizers?|apps|starters?|small plates?|boards?|shar(?:e|es|eables?|ing|ed)(?: plates?)?|snacks?|bar bites?|bar snacks?|tapas|antipasti|mezze|nibbles|for the table|to share|raw bar)\b/;
const DRINK_SECTION =
  /drink|beverage|coffee|tea\b|espresso|smoothie|juice|refresher|latte|beer|wine|cocktail|soda|shake|bar menu/;
const DRINK_NAME =
  /\b(latte|matcha|refresher|coffee|tea|lemonade|smoothie|cold brew|espresso|cappuccino|juice|mocha|americano|soda|agua fresca|horchata|wine|ipa|lager|stout|cabernet|merlot|chardonnay|pinot|syrah|sauvignon|prosecco|champagne)\b/;

const FOOD = 0;
const DRINK = 1;
const kindOf = (name: string, section: string): number =>
  DRINK_SECTION.test(section) || DRINK_NAME.test(name) ? DRINK : FOOD;

const priceOf = (p: string | number | null | undefined): number | null => {
  if (p == null) return null;
  const v = parsePrice(String(p));
  return v != null && v < 400 ? v : null;
};

/* ---------- dish families ---------- */

/**
 * The common dishes (pizza, sushi, wings ...) are on too many menus for a term to
 * be rare, so they are matched by family: a family names what a dish is, how a
 * place's profile shows it is a specialist in it, and which of its styles a
 * seed can pass on ("NY-style", "breakfast", "Japanese fusion").
 */
type Family = {
  id: string;
  noun: string;
  /** Folded dish names that are in the family; `weak` ones need the seed's place to be a specialist too. */
  dish: RegExp;
  weak?: RegExp;
  /** Folded profile text (styles, dish types, main cuisine) that shows the family. */
  profile: RegExp;
  /** Folded item or signature names that are in the family. */
  item: RegExp;
  /** Main cuisines a specialist in the family can be: a burger place with one hot-chicken sandwich is not one. */
  cuisine: RegExp;
  /** How many leading dish types count as "what the place does". */
  top: number;
  tags: readonly string[];
  /** The profile evidence a place needs to be a specialist, when the family is too thin for the default (a salad or a wing is on every menu). */
  min?: number;
  /** Names of the family's classic items: a pick is cited by one of these before a novelty. */
  classic?: RegExp;
  /** Names of its plain items: the place's twist (fusion) is not claimed for them, and a twisted item names the pick instead. */
  plain?: RegExp;
  /** A sub-type of the dish: a seed that names it ("Caesar") is only matched by an item that names it too. */
  sub?: { seed: RegExp; item: RegExp };
};

/** Menu lines that are a way of ordering, not a dish: never what a pick is named for. */
const BUILDER = /\b(create|build|make|design|customi[sz]e)\b.*\bown\b|\bbyo\b|\bcustom\b|\bcombo\b|\bmeal deal\b/;

const FAMILIES: readonly Family[] = [
  { id: "pizza", noun: "Pizza", dish: /\b(pizzas?|slices?)\b/, weak: /\b(pies?|calzones?)\b/, profile: /pizza|calzone|\bslices?\b|sicilian/, item: /\b(pizzas?|pies?|slices?|calzones?)\b/, cuisine: /pizza|italian/, top: 2, tags: ["slice", "ny", "sicilian"] },
  { id: "burrito", noun: "Burrito", dish: /\bburritos?\b/, profile: /burrito/, item: /\bburritos?\b/, cuisine: /mexican|tex|taco|latin|breakfast|brunch|southwest|burrito|californian/, top: 2, tags: ["breakfast"] },
  { id: "wings", noun: "Wings", dish: /\bwings?\b/, profile: /\bwings?\b/, item: /\bwings?\b/, cuisine: /chicken|wing|american|bar|pub|sport|bbq|barbecue|southern/, top: 2, tags: [], min: 0.9 },
  { id: "hotchicken", noun: "Hot chicken", dish: /hot (honey )?chick|chickz|nashville/, profile: /hot chicken|nashville|fried chicken|spicy chicken/, item: /(hot|nashville|fried|crispy|spicy) chick|\btenders?\b|hot honey/, cuisine: /chicken|southern|soul|american|nashville|fast/, top: 2, tags: ["nashville"] },
  { id: "sushi", noun: "Sushi", dish: /\b(sushi|sashimi|nigiri|maki|poke)\b/, weak: /\brolls?\b/, profile: /sushi|sashimi|nigiri|maki|omakase|\bpoke\b|hand rolls?/, item: /sushi|sashimi|nigiri|maki|\brolls?\b|omakase|\bpoke\b/, cuisine: /japanese|sushi|asian|poke|hawaiian|fusion/, top: 2, tags: ["fusion", "sushibar"], classic: /\b(dragon|rainbow|california|spicy|tuna|salmon|yellowtail|eel|unagi|nigiri|sashimi|chirashi|hand roll|crunch|philadelphia|volcano|poke)\b/, plain: /\b(?:nigiri|sashimi|chirashi|temaki|hand rolls?)\b/ },
  { id: "salad", noun: "Salad", dish: /\b(caesar|salad)\b/, profile: /salad/, item: /caesar|salad/, cuisine: /salad|health|vegetarian|vegan|mediterranean|bistro|french|californian|greek|lebanese/, top: 1, tags: [], min: 0.9, sub: { seed: /caesar/, item: /caesar/ } },
  { id: "pho", noun: "Pho", dish: /\bpho\b/, profile: /\bpho\b/, item: /\bpho\b/, cuisine: /vietnamese|pho|noodle|asian|thai/, top: 2, tags: [] },
  { id: "bbq", noun: "BBQ", dish: /\b(ribs?|bbq|barbecue|brisket)\b/, profile: /bbq|barbecue|\bribs\b|brisket|smokehouse/, item: /\bribs?\b|brisket|bbq|pulled pork/, cuisine: /bbq|barbecue|southern|american|steak|smokehouse|grill|texas/, top: 2, tags: [] },
];

const FAMILY_BY_ID = new Map(FAMILIES.map((f) => [f.id, f]));

const TAGS: Record<string, { re: RegExp; phrase: string }> = {
  slice: { re: /\bslices?\b/, phrase: "by-the-slice" },
  ny: { re: /new york|\bny\b/, phrase: "NY-style" },
  sicilian: { re: /sicilian|square/, phrase: "Sicilian" },
  nashville: { re: /nashville|hot chicken/, phrase: "Nashville-style" },
  breakfast: { re: /breakfast/, phrase: "breakfast" },
  fusion: { re: /fusion/, phrase: "Japanese fusion" },
  sushibar: { re: /sushi bar/, phrase: "sushi-bar" },
  // Says what a place is not (a meat-free pizzeria for a meat-loving seed); never names a pick.
  plant: { re: /plant|vegan|vegetarian|meat.?free/, phrase: "" },
};

/** Not what a place is named for: a stick, a side or a share platter is cited only when the place has nothing else in the family. */
const OFF_MAIN = /\b(sticks?|mozz|mozzarella|slaw|pickles?|dips?|sauces?|curds?|mac|bites?|single|cauli|cauliflower|for (two|2|four|4)|platters?|party|trays?|boats?|feast|family)\b/;

/** A place in a family: how sure its profile is that it specialises, and its best item for the family. */
export type FamPlace = {
  rid: number;
  spec: number;
  item: string;
  price: number | null;
  tags: readonly string[];
  /** The place's items in the family, signatures first, best name first; a pick is named by the one closest to the seed. */
  items: readonly { name: string; price: number | null; sig: boolean }[];
  /** How many other families the place is a specialist in: a pho-and-sushi counter is half a sushi bar. */
  hybrid: number;
  sig: boolean;
};

/** Bar snacks: a match on one of these at a bar is not a meal. */
const BAR_BITE = /\b(bites?|poppers?|tots?|nachos|sliders?|rings?|bao|wontons?|rangoon)\b/;
/** A side, a bread or a condiment is not a dish to be sent somewhere new for. */
const SIDE_LINE = /^side\b|\bside of\b|\b(?:breads?|rolls?|biscuits?|fries|chips|dips?|sauces?|spreads?|slaw|butter|dressing|pickles?)$/;
const BAR_PLACE = /bar|pub|tavern|irish|sports/;
/** A vegetable plate or a nibble: with no main form beside it, a line named for one is a side, not a dish to travel for. */
const VEG_SIDE =
  /\b(?:squash|beets?|beetroot|carrots?|cauliflower|broccoli|broccolini|asparagus|eggplant|aubergine|zucchini|mushrooms?|potatoes?|brussels?|sprouts?|cabbage|kale|spinach|corn|green beans?|beans?|greens|okra|artichokes?|radish(?:es)?|turnips?|parsnips?|fennel|celery|cucumbers?|olives?|nuts?|almonds?|cashews?|hummus|burrata|cheese|toast|crostini|bruschetta|charcuterie|board)\b/;
/** A meat-free swap: tofu, plant-based "chicken" and the like. */
const PLANT_ITEM = /\b(?:tofu|tempeh|seitan|plant[- ]based|vegan|veggie|vegetarian|impossible|beyond|jackfruit|meat[- ]?less|meat[- ]?free)\b/;
/** A dessert word in a savory family's item name ("Monkey ROLL!" with banana): it never names a pick. */
const DESSERT_WORD = /\b(?:banana|chocolate|nutella|oreo|cheesecake|dessert|brownie|cookie|s'?mores?|marshmallow|candy|ice cream|gelato|churro|tiramisu|cannoli)\b/;
/** An item name that is only a family label ("Fried Chicken", "Wings (5 pcs)"): it tells them nothing about the place. */
/** A cuisine named for a kind of dish or of place, not a region: nobody is "new" to it because they posted no sandwich. */
const DISH_CUISINE = /\b(?:pizza|pizzeria|sandwiches?|deli|burgers?|chicken|wings?|seafood|bbq|barbecue|steak(?:house)?|smokehouse|breakfast|brunch|salads?|american|bar|pub|cafe|bakery|coffee|fast food|diner|grill|dessert|ice cream)\b/;
const BARE_LABEL = /^(?:(?:fried|crispy|hot|spicy|classic|signature|house|regular|small|large|special|combo|plate|platter|meal|order|baby back|pork|beef|chicken|wings?|tenders?|pizza|pie|burrito|burritos|tacos?|pho|sushi|rolls?|ribs?|salad|bowl|and|\d+)\s*)+$/;
/** Words in a restaurant's name that say what it serves or how it feels, not which place it is. */
const GENERIC_NAME = new Set(
  "the and restaurant restaurants cafe grill grille kitchen house bar pizza pizzeria taco tacos taqueria sushi thai pho noodle noodles chicken burger burgers deli bbq barbecue coffee eatery cantina bistro tavern pub bakery bowl bowls hot big little old new original best good great better love tasty fresh spicy sweet honey crispy sauce cheese fried golden happy lucky royal grand family south north east west mission beach downtown park city express famous place food foods market shop station company brewing brewery diego".split(" "),
);
/** A shop that is known for its drinks or sweets: its flavor-only matches are a syrup or a glaze, not a meal. */
const DRINK_LED = /\b(coffee|tea|bakery|bakeries|dessert|desserts|juice|smoothies?|boba|bubble|ice cream|gelato|donuts?|doughnuts?|crepes?|cupcakes?)\b/;

/* ---------- what kind of dish a line is ---------- */

/**
 * Broad kinds of dish, as bits. A flavor reason compares a pick to a posted dish of the same kind: "like your Hot
 * Honey Chicken" for a chicken sandwich, never for a mozzarella stick or a cold-cut sub.
 */
/** A place that says it is meat-free in its cuisine label or its name (the profile's styles may not). */
const PLANT_PLACE = /\b(?:vegan|vegetarian|plant.?based)\b/;
const KB = { pizza: 1, chicken: 2, sandwich: 4, taco: 8, noodle: 16, rice: 32, sushi: 64, pasta: 128, seafood: 256, meat: 512, salad: 1024, breakfast: 2048, plant: 4096, starter: 8192 } as const;
const KIND_RE: readonly (readonly [number, RegExp])[] = [
  [KB.pizza, /\b(?:pizzas?|pies?|slices?|calzones?|flatbreads?|stromboli)\b/],
  [KB.chicken, /\b(?:chicken|wings?|tenders?|nuggets?|drumsticks?|chickz|karaage|drumettes?)\b/],
  [KB.sandwich, /\b(?:sandwich(?:es)?|burgers?|subs?|hoagies?|banh mi|panini|melts?|wraps?|tortas?|po boys?|reubens?|hot dogs?|gyros?|cheesesteaks?|bao|croissants?|ciabatta|baguette|sliders?)\b/],
  [KB.taco, /\b(?:tacos?|burritos?|quesadillas?|enchiladas?|tostadas?|fajitas?|carnitas|al pastor)\b/],
  [KB.noodle, /\b(?:pho|ramen|udon|soba|noodles?|lo mein|chow mein|pad thai|pad see ew|laksa|vermicelli)\b/],
  [KB.rice, /\b(?:rice|bowls?|biryani|risotto|congee|donburi|bibimbap|poke|curry|curries)\b/],
  [KB.sushi, /\b(?:sushi|sashimi|nigiri|maki|temaki|rolls?)\b/],
  [KB.pasta, /\b(?:pasta|spaghetti|bucatini|fettuccine|linguine|penne|rigatoni|lasagna|gnocchi|ravioli|mac|carbonara|alfredo)\b/],
  [KB.seafood, /\b(?:shrimp|salmon|tuna|fish|crab|lobster|calamari|scallops?|oysters?|clams?|mussels?|prawns?|cod|halibut|octopus)\b/],
  [KB.meat, /\b(?:steaks?|ribs?|brisket|pork|beef|lamb|sausage|bacon|ham|short rib|meatballs?|bbq|barbecue)\b/],
  [KB.salad, /\b(?:salads?|caesar)\b/],
  [KB.breakfast, /\b(?:breakfast|eggs?|omelet(?:te)?s?|pancakes?|waffles?|french toast|benedict|grits|hash|scrambles?)\b/],
];
/** A side or a starter, whatever it is made of. */
const STARTER_HARD = /\b(?:sticks?|mozz|mozzarella|curds?|fries|tots?|onion rings?|poppers?|dips?|slaw|pickles?|bites?|dumplings?|gyoza|potstickers?|wontons?|rangoon|egg rolls?|spring rolls?|samosas?|hummus|guacamole|salsa|edamame|breadsticks?|garlic knots?|appetizers?|starters?|sides?)\b/;
/** A starter unless the line is also a plain main (a calamari tempura is one, a chicken tempura bowl is not). */
const STARTER_SOFT = /\b(?:calamari|tempura|soup|bread|fritters?|croquettes?|skewers?|satay|brussels? sprouts?|nachos?|charcuterie|cheese (?:board|plate)|olives)\b/;
const MAIN_BITS = KB.pizza | KB.chicken | KB.sandwich | KB.taco | KB.noodle | KB.rice | KB.sushi | KB.pasta | KB.salad | KB.breakfast;
/** Every kind of dish a name can show on its own: a main form, a seafood or a meat plate (not a plant swap, not a starter). */
const FORM_BITS = MAIN_BITS | KB.seafood | KB.meat;
/** Per place: how many of its food lines are of each kind (slot 14 is the classified total). Built once per index. */
const FOCUS = new WeakMap<object, Map<number, Int32Array>>();
/** The dish family a posted or specialised family is, as a kind. */
const FAM_KIND: Readonly<Record<string, number>> = { pizza: KB.pizza, burrito: KB.taco, wings: KB.chicken, hotchicken: KB.chicken, sushi: KB.sushi, salad: KB.salad, pho: KB.noodle, bbq: KB.meat };
/** What a cuisine label says its dishes are, for a line whose own name says nothing. */
const CUISINE_KIND: readonly (readonly [RegExp, number])[] = [
  [/pizza/, KB.pizza],
  [/italian/, KB.pizza | KB.pasta],
  [/sandwich|deli|burger/, KB.sandwich],
  [/mexican|taco|tex|latin|burrito/, KB.taco],
  [/japanese|sushi/, KB.sushi | KB.noodle],
  [/vietnamese|ramen|noodle|pho/, KB.noodle],
  [/chicken|wing/, KB.chicken],
  [/seafood/, KB.seafood],
  [/bbq|barbecue|steak|smokehouse/, KB.meat],
  [/breakfast|brunch/, KB.breakfast],
  [/salad/, KB.salad],
];

/** The kinds a line's own name shows (folded); 0 when it says nothing. Not a starter-aware read: see `lineKindsOf`. */
const kindBits = (nm: string): number => {
  let k = 0;
  const t = nm.replace(/\b(?:egg|spring|cinnamon|dinner|summer|bread|crescent|sausage|pizza|fruit) rolls?\b/g, " ");
  for (const [bit, re] of KIND_RE) if (re.test(t)) k |= bit;
  return k;
};
/** `kindBits`, with a side or a starter marked as one (it is then never a main). */
const kindsOfName = (nm: string): number => {
  const k = kindBits(nm);
  if (STARTER_HARD.test(nm)) return k | KB.starter;
  return STARTER_SOFT.test(nm) && (k & MAIN_BITS) === 0 ? k | KB.starter : k;
};
/** Kinds that sit near each other on a menu: a flavor carried from one to the other is a short step. */
const NEAR_KIND: Readonly<Record<number, number>> = {
  [KB.pizza]: KB.pasta | KB.sandwich,
  [KB.chicken]: KB.sandwich | KB.taco | KB.meat | KB.rice,
  [KB.sandwich]: KB.chicken | KB.taco | KB.meat | KB.breakfast,
  [KB.taco]: KB.chicken | KB.sandwich | KB.meat | KB.rice,
  [KB.noodle]: KB.rice | KB.pasta,
  [KB.rice]: KB.noodle | KB.sushi | KB.chicken | KB.seafood | KB.meat,
  [KB.sushi]: KB.rice | KB.seafood,
  [KB.pasta]: KB.pizza | KB.noodle,
  [KB.seafood]: KB.sushi | KB.rice,
  [KB.meat]: KB.sandwich | KB.chicken | KB.taco,
  [KB.salad]: KB.rice | KB.chicken,
  [KB.breakfast]: KB.sandwich,
};
const nearKinds = (k: number): number => {
  let out = 0;
  for (const [bit, near] of Object.entries(NEAR_KIND)) if (k & Number(bit)) out |= near;
  return out;
};
/** Two kinds fit when they share one; a line or a seed whose kind is unknown fits anything. */
const kindsFit = (a: number, b: number): boolean => {
  const x = a & ~KB.starter;
  const y = b & ~KB.starter;
  return x === 0 || y === 0 || (x & y) !== 0;
};

/* ---------- the index ---------- */

/**
 * What every listed place's menu says, boiled down to what matching needs and
 * shared by every viewer: which items carry which rare terms. The same for
 * everyone, so it is cached by the loader and nothing in it is personal.
 */
export type DishIndex = {
  rids: readonly string[];
  ridIndex: ReadonlyMap<string, number>;
  /** idf of every term that passed the df filters; any other term is absent. */
  idf: ReadonlyMap<number, number>;
  itemRid: Int32Array;
  itemKind: Uint8Array;
  /** 1 when the item sits in a starter or sharing section, or its own name is a side or a starter. */
  itemStarter: Uint8Array;
  itemPrice: Float32Array;
  itemName: readonly string[];
  /** term -> [start, end) in `postings`; each posting is `(item << 1) | inName`. */
  spans: ReadonlyMap<number, readonly [number, number]>;
  postings: Int32Array;
  /** The styles and dish types of each place, as term ids, and term -> places that have it. */
  styleSets: ReadonlyMap<number, ReadonlySet<number>>;
  styleSpans: ReadonlyMap<number, readonly number[]>;
  styles: ReadonlyMap<number, readonly string[]>;
  /** The dish types of each place as its profile words them ("ribs", "bbq chicken"). */
  types: ReadonlyMap<number, readonly string[]>;
  median: ReadonlyMap<number, number>;
  /** Family id -> the places that specialise in it (or serve it a lot). */
  fam: ReadonlyMap<string, readonly FamPlace[]>;
  /** Place -> family id -> how sure its profile is that it specialises; the place's style tags and service. */
  famSpec: ReadonlyMap<number, ReadonlyMap<string, number>>;
  tags: ReadonlyMap<number, ReadonlySet<string>>;
  service: ReadonlyMap<number, string>;
  /** Items of place r are `order[first[r] .. first[r + 1])`. */
  first: Int32Array;
  order: Int32Array;
  /** Each item's packed flavor (lib/flavor.ts), and the claims a reason may make about it (only items that have any). */
  itemFlavor: Int32Array;
  itemClaims: ReadonlyMap<number, readonly FlavorClaim[]>;
  /** The corpus rate of each flavor attribute (mean grade / 2 over food items), the profile's baseline. */
  flavorBase: readonly number[];
  /** Places whose main cuisine is Asian (the flavor tagger reads "BBQ" differently there). */
  asian: ReadonlySet<number>;
  /** Places with a profile and no menu lines: what the profile says about their flavor. */
  menuless: ReadonlyMap<number, MenulessPlace>;
};

/** A place with no menu lines: its signature dishes tagged by name alone, and its profile text as one flavor mask. */
export type MenulessPlace = {
  mask: number;
  sigs: readonly { name: string; mask: number; claims: readonly FlavorClaim[] }[];
};

export type DishIndexBuilder = {
  add(rows: readonly DishRow[]): void;
  finish(profiles: readonly ProfileRow[]): DishIndex;
};

/**
 * Builds the index from menu rows fed in pages (so no one query has to carry
 * the whole menu). Sides and add-ons are left out. A term is kept when 3 or
 * more places serve it and under `maxDfShare` of places do.
 */
export function createDishIndexBuilder(
  restaurantIds: readonly string[],
  /** Ids of the places whose main cuisine is Asian: the flavor tagger needs it per item, before the profiles arrive. */
  asianIds?: ReadonlySet<string>,
): DishIndexBuilder {
  const c = DISH_TASTE;
  const ridIndex = new Map<string, number>();
  restaurantIds.forEach((id, i) => ridIndex.set(id, i));

  const itemRid: number[] = [];
  const itemKind: number[] = [];
  const itemStarter: number[] = [];
  const itemPrice: number[] = [];
  const itemName: string[] = [];
  const itemFlavor: number[] = [];
  const itemClaims = new Map<number, FlavorClaim[]>();
  // Per item: (term << 1) | inName. Dropped once the postings are built.
  let itemTerms: Int32Array[] = [];

  return {
    add(rows) {
      for (const d of rows) {
        const rid = ridIndex.get(d.rid);
        const name = fold(d.name ?? "");
        const section = fold(d.section ?? "");
        if (rid === undefined || !name || SIDE_SECTION.test(section) || SIDE_NAME.test(name)) continue;
        // Flavor: tagged here, in the same pass, so the per-item cost is paid once per index build and never per request.
        const asian = asianIds?.has(d.rid) ?? false;
        const mask = tagDish(d.name, d.description, d.section, asian);
        if (maybeClaimable(mask)) {
          const claims = claimsOf(d.name, d.description, d.section, asian);
          if (claims.length > 0) itemClaims.set(itemRid.length, claims);
        }
        itemFlavor.push(mask);
        const t = new Map<number, number>();
        for (const x of termsOf(d.description ?? "")) t.set(termId(x), 0);
        for (const x of termsOf(d.name)) t.set(termId(x), 1);
        const packed = new Int32Array(t.size);
        let i = 0;
        for (const [id, inName] of t) packed[i++] = (id << 1) | inName;
        itemRid.push(rid);
        itemKind.push(kindOf(name, section));
        itemStarter.push(STARTER_SECTION.test(section) || (kindsOfName(name) & KB.starter) !== 0 ? 1 : 0);
        const price = priceOf(d.price);
        itemPrice.push(price ?? 0);
        itemName.push(d.name);
        itemTerms.push(packed);
      }
    },

    finish(profiles) {
      const n = itemRid.length;
      /** Families: what each place's profile and menu say about being a specialist. */
      const familyIndex = (rows: readonly ProfileRow[]) => {
        type Own = { name: string; price: number | null; count: number; rank: number; all: { name: string; price: number | null; rank: number }[] };
        const items = new Map<number, Map<string, Own>>();
        for (let i = 0; i < n; i++) {
          if (itemKind[i] !== FOOD) continue;
          const nm = fold(itemName[i]);
          for (const f of FAMILIES) {
            if (!f.item.test(nm)) continue;
            const per = items.get(itemRid[i]) ?? new Map<string, Own>();
            const own = per.get(f.id);
            const builder = BUILDER.test(nm);
            const rank = (f.dish.test(nm) ? 2 : 0) + (nm.length >= 6 && nm.length <= 30 ? 1 : 0) - (builder ? 5 : 0);
            const price = itemPrice[i] > 0 ? itemPrice[i] : null;
            const entry = { name: itemName[i], price, rank };
            if (!own) per.set(f.id, { name: itemName[i], price, count: 1, rank, all: builder ? [] : [entry] });
            else {
              own.count++;
              if (rank > own.rank) Object.assign(own, { name: itemName[i], price, rank });
              if (!builder && own.all.length < 40) own.all.push(entry);
            }
            items.set(itemRid[i], per);
          }
        }
        const fam = new Map<string, FamPlace[]>();
        const famSpec = new Map<number, Map<string, number>>();
        const tags = new Map<number, Set<string>>();
        const service = new Map<number, string>();
        for (const p of rows) {
          const rid = ridIndex.get(p.rid);
          if (rid === undefined) continue;
          const sig = (p.signatures ?? []).map((x) => ({ raw: x, f: fold(x) }));
          const styleText = [...p.styles, p.mainCuisine ?? ""].map(fold);
          const typeText = p.dishTypes.map(fold);
          const all = [...styleText, ...typeText].join(" ");
          const t = new Set<string>();
          for (const [id, tag] of Object.entries(TAGS)) if (tag.re.test(all)) t.add(id);
          tags.set(rid, t);
          if (p.service) service.set(rid, p.service);
          const spec = new Map<string, number>();
          for (const f of FAMILIES) {
            const styleHit = styleText.some((x) => f.profile.test(x));
            // A thin family (a salad, a wing) is a specialty only on a short list of dish types, not first of six.
            const topType = typeText.slice(0, f.top).some((x) => f.profile.test(x)) && (!f.min || typeText.length <= 4);
            const anyType = typeText.some((x) => f.profile.test(x));
            const sigHit = sig.find((x) => f.item.test(x.f) && !BUILDER.test(x.f));
            const own = items.get(rid)?.get(f.id);
            let v = styleHit ? 1 : topType ? 0.9 : sigHit && anyType ? c.famSpecialist : anyType && (own?.count ?? 0) >= 2 ? c.famServes : 0;
            // Not a specialist when the place is plainly another kind of place (a coffee shop with one breakfast burrito).
            if (v > c.famServes && p.mainCuisine && !f.cuisine.test(fold(p.mainCuisine))) v = c.famServes;
            if (v <= 0) continue;
            spec.set(f.id, v);
            const list = fam.get(f.id) ?? [];
            const mine: { name: string; price: number | null; sig: boolean }[] = [];
            for (const x of sig) if (f.item.test(x.f) && !BUILDER.test(x.f)) mine.push({ name: x.raw, price: null, sig: true });
            for (const x of (own?.all ?? []).slice().sort((a, b) => b.rank - a.rank)) {
              if (!mine.some((m) => fold(m.name) === fold(x.name))) mine.push({ name: x.name, price: x.price, sig: false });
            }
            const first = mine[0];
            list.push({
              rid,
              spec: v,
              item: first?.name ?? "",
              price: first?.price ?? own?.price ?? null,
              tags: [...t],
              items: mine,
              hybrid: 0,
              sig: sig.some((x) => f.item.test(x.f)),
            });
            fam.set(f.id, list);
          }
          famSpec.set(rid, spec);
        }
        // A place that specialises in several families is a hybrid in each of them.
        for (const list of fam.values()) {
          for (const fp of list) {
            let n = 0;
            for (const v of famSpec.get(fp.rid)?.values() ?? []) if (v >= c.famSpecialist) n++;
            (fp as { hybrid: number }).hybrid = Math.max(0, n - 1);
          }
        }
        return { fam, famSpec, tags, service };
      };
      const styleSets = new Map<number, Set<number>>();
      const styles = new Map<number, string[]>();
      const types = new Map<number, string[]>();
      const median = new Map<number, number>();
      for (const p of profiles) {
        const rid = ridIndex.get(p.rid);
        if (rid === undefined) continue;
        const set = new Set<number>();
        for (const x of [...p.styles, ...p.dishTypes]) for (const y of termsOf(x)) set.add(termId(y));
        styleSets.set(rid, set);
        styles.set(rid, [...p.styles]);
        types.set(rid, [...p.dishTypes]);
        if (p.median != null && Number.isFinite(p.median) && p.median > 0) median.set(rid, p.median);
      }

      // Document frequency over restaurants: an item's terms and the place's styles, each once per place.
      const first = new Int32Array(restaurantIds.length + 1);
      for (let i = 0; i < n; i++) first[itemRid[i] + 1]++;
      for (let r = 0; r < restaurantIds.length; r++) first[r + 1] += first[r];
      const order = new Int32Array(n);
      const cursor = first.slice(0, restaurantIds.length);
      for (let i = 0; i < n; i++) order[cursor[itemRid[i]]++] = i;

      // Flavor: the corpus rate of each attribute (the baseline a user's lift is measured against), the
      // Asian places, and for a place with a profile but no menu lines what its profile says.
      const flavorBase = new Array<number>(N_FLAVOR).fill(0);
      let foodItems = 0;
      for (let i = 0; i < n; i++) {
        if (itemKind[i] !== FOOD) continue;
        foodItems++;
        const m = itemFlavor[i];
        for (let a = 0; a < N_FLAVOR; a++) flavorBase[a] += gradeOf(m, a) / 2;
      }
      for (let a = 0; a < N_FLAVOR; a++) flavorBase[a] = Math.max(foodItems > 0 ? flavorBase[a] / foodItems : 0, 0.002);
      const asian = new Set<number>();
      const menuless = new Map<number, MenulessPlace>();
      for (const p of profiles) {
        const rid = ridIndex.get(p.rid);
        if (rid === undefined) continue;
        const isAsian = isAsianMain(p.mainCuisine);
        if (isAsian) asian.add(rid);
        if (first[rid + 1] > first[rid]) continue;
        const text = [p.summary ?? "", ...p.dishTypes, ...p.styles].join(". ");
        let mask = tagText(text, isAsian);
        // The profile's spice level is a hint at most: "lots" reads as grade 1 spicy, never more, and never a claim.
        if (p.spice === "lots" && gradeOf(mask, FA.spicy) < 1) mask |= 1 << (2 * FA.spicy);
        const sigs = (p.signatures ?? []).map((name) => ({
          name,
          // A signature dish is only a name: whatever it shows, it shows in the name.
          mask: tagDish(name, null, null, isAsian),
          claims: claimsOf(name, null, null, isAsian),
        }));
        if (mask !== 0 || sigs.some((s) => s.mask !== 0)) menuless.set(rid, { mask, sigs });
      }

      const df = new Map<number, number>();
      let places = 0;
      for (let r = 0; r < restaurantIds.length; r++) {
        const seen = new Set<number>(styleSets.get(r));
        for (let k = first[r]; k < first[r + 1]; k++) for (const p of itemTerms[order[k]]) seen.add(p >>> 1);
        if (seen.size === 0) continue;
        places++;
        for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
      }

      const idf = new Map<number, number>();
      for (const [t, d] of df) {
        if (d < c.minDf || d / places > c.maxDfShare) continue;
        const v = Math.log(places / d);
        if (v >= c.minIdf) idf.set(t, v);
      }

      // Postings for the terms that count, packed into one array.
      const count = new Map<number, number>();
      for (let i = 0; i < n; i++) for (const p of itemTerms[i]) if (idf.has(p >>> 1)) count.set(p >>> 1, (count.get(p >>> 1) ?? 0) + 1);
      const spans = new Map<number, readonly [number, number]>();
      let total = 0;
      const fill = new Map<number, number>();
      for (const [t, k] of count) {
        spans.set(t, [total, total + k]);
        fill.set(t, total);
        total += k;
      }
      const postings = new Int32Array(total);
      for (let i = 0; i < n; i++) {
        for (const p of itemTerms[i]) {
          const t = p >>> 1;
          const at = fill.get(t);
          if (at === undefined) continue;
          postings[at] = (i << 1) | (p & 1);
          fill.set(t, at + 1);
        }
      }
      itemTerms = [];

      const styleSpans = new Map<number, number[]>();
      for (const [rid, set] of styleSets) {
        for (const t of set) {
          if (!idf.has(t)) continue;
          const list = styleSpans.get(t);
          if (list) list.push(rid);
          else styleSpans.set(t, [rid]);
        }
      }

      return {
        rids: restaurantIds,
        ridIndex,
        idf,
        itemRid: Int32Array.from(itemRid),
        itemKind: Uint8Array.from(itemKind),
        itemStarter: Uint8Array.from(itemStarter),
        itemPrice: Float32Array.from(itemPrice),
        itemName,
        spans,
        postings,
        styleSets,
        styleSpans,
        styles,
        types,
        median,
        first,
        order,
        itemFlavor: Int32Array.from(itemFlavor),
        itemClaims,
        flavorBase,
        asian,
        menuless,
        ...familyIndex(profiles),
      };
    },
  };
}

/** The index built in one go, for tests and small corpora. */
export function buildDishIndex(
  restaurantIds: readonly string[],
  dishes: readonly DishRow[],
  profiles: readonly ProfileRow[],
): DishIndex {
  const b = createDishIndexBuilder(restaurantIds);
  b.add(dishes);
  return b.finish(profiles);
}

/* ---------- seeds ---------- */

type Seed = {
  dish: string;
  place: string;
  rid: number | undefined;
  kind: number;
  /** Recency weight, `weightFloor` to 1. */
  w: number;
  /** The viewer's own rating weight, `ratingFloor` (their lowest) to 1 (their highest). */
  rw: number;
  /** term -> weight (1 for the dish name, descWeight for its description, styleWeight for a style). */
  terms: Map<string, number>;
  /** Terms from the dish's own name (or the place's styles): the ones a match must share. */
  core: Set<string>;
  placeLevel: boolean;
  /** The dish's head noun (and its kin): an item must name one to count as the same dish. Empty: no demand (also for a head rare enough to be a brand's own word, which the term match already pins). */
  head: readonly string[];
  /** The stemmed words of the dish's name, to prefer a style that is in it. */
  words: ReadonlySet<string>;
  /** The seed place's chain: its own other branches say nothing new, and are never picks anyway. */
  chain: string;
  /** The dish families the seed is in (from its dish, or for a dishless post its place's specialty), and the style it passes on. */
  fams: readonly SeedFam[];
  /** A post with no dish: it seeds by family alone. */
  famOnly: boolean;
};

type SeedFam = { id: string; tag: string | null };

const DAY_MS = 86_400_000;

function recency(at: number, now: number): number {
  const days = Math.max(0, (now - at) / DAY_MS);
  return Math.max(DISH_TASTE.weightFloor, 0.5 ** (days / DISH_TASTE.halfLifeDays));
}

/**
 * How much each of the viewer's posts counts, by their own rating relative to
 * their own other ratings: `ratingFloor` for their lowest-rated dish up to 1
 * for their highest, a blend of rank and distance so it is smooth and
 * monotone. Unrated posts get the median of the rated ones; with no rating
 * spread at all everything is 1. A rating under `dropBelow` is a verdict
 * against the dish and weighs 0 (the post seeds nothing). Aligned with `posts`.
 */
export function postWeights(posts: readonly { rating?: number | null }[]): number[] {
  const c = DISH_TASTE;
  const rated: number[] = [];
  for (const p of posts) {
    const r = p.rating;
    if (typeof r === "number" && Number.isFinite(r) && r >= c.dropBelow) rated.push(r);
  }
  const lo = Math.min(...rated);
  const hi = Math.max(...rated);
  const n = rated.length;
  const weigh = (r: number): number => {
    if (n === 0 || hi === lo) return 1;
    const below = rated.filter((x) => x < r).length;
    const same = rated.filter((x) => x === r).length;
    const rank = n > 1 ? (below + (same - 1) / 2) / (n - 1) : 0.5;
    const lin = (r - lo) / (hi - lo);
    return c.ratingFloor + (1 - c.ratingFloor) * (0.5 * rank + 0.5 * lin);
  };
  const all = rated.map(weigh).sort((a, b) => a - b);
  const median = all.length === 0 ? 1 : (all[(all.length - 1) >> 1] + all[all.length >> 1]) / 2;
  return posts.map((p) => {
    const r = p.rating;
    if (typeof r !== "number" || !Number.isFinite(r)) return median;
    return r < c.dropBelow ? 0 : weigh(r);
  });
}

/* ---------- the head noun ---------- */

/** Spellings a menu or a brand uses for a dish type. */
const HEAD_SYN: Record<string, string> = { chickz: "chicken", chikn: "chicken", chickn: "chicken" };

/** Words that only say how a dish is served: "Chicken Parm Dip" is a chicken parm as much as a dip. */
const FORM = new Set(["dip", "bowl", "plate", "platter", "box", "basket", "tray"]);

/** Dish types that stand in for one another. */
const KIN: readonly (readonly string[])[] = [
  ["chicken", "wing", "tender", "thigh", "drumstick", "nugget"],
  ["pizza", "pie", "slice"],
  ["ramen", "pho", "noodle"],
];

const wordOf = (w: string): string => HEAD_SYN[w] ?? SYNONYMS[w] ?? stem(w);

/**
 * What a dish is, as against what is on it or how it is flavoured: the last
 * telling word of its name ("Koji-Marinated Chicken Wings" is a wing, "Hot
 * Honey Chicken" a chicken, "Syrah Caesar" a caesar), its kin ("wing" and
 * "chicken" are the same family) and, for a serving word, the word before it.
 * Empty when the name has no such word ("Number 1").
 */
export function headOf(dishName: string): string[] {
  const first = dishName.split(/[,.;:()|+\n]|\bwith\b|\bw\//i)[0] ?? "";
  const toks = fold(first)
    .split(" ")
    .filter(Boolean)
    .map(wordOf)
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
  if (toks.length === 0) return [];
  const last = toks[toks.length - 1];
  const out = new Set([last]);
  if (FORM.has(last) && toks.length > 1) out.add(toks[toks.length - 2]);
  for (const group of KIN) if ([...out].some((x) => group.includes(x))) for (const x of group) out.add(x);
  return [...out];
}

const namesHead = (itemName: string, head: readonly string[]): boolean =>
  fold(itemName)
    .split(" ")
    .some((w) => head.includes(wordOf(w)));

/** A hit: how well one place's item (or, with no item, its styles) matches one seed. */
type Hit = {
  seed: number;
  /** The match on its own, the part the gate reads. */
  v: number;
  /** `v` carried by the weight of the viewer's own rating, the part the score reads. */
  vw: number;
  item: string;
  price: number | null;
  term: string;
  style: boolean;
  /** Set on a family match: the family, and the style it shares with the seed's place. */
  fam?: string;
  tag?: string | null;
  /** Set when the line is a starter or a sharing plate: a place is not sent for it, unless it is a specialist's. */
  starter?: boolean;
  /**
   * Set when the item also fits the viewer's flavor profile. `claim` is what the item's own text lets a reason
   * say (null: it fits, but nothing it says can be quoted); `seed` is the posted dish the reason compares it to;
   * `only` marks a pick that stands on flavor alone, with no dish or family match behind it. `kinds` is what kind
   * of dish the line is, and `cross` that none of the viewer's dishes with this flavor is of that kind (the
   * flavor travels to a new kind of dish: such a pick is only ever an adventurous one).
   */
  flav?: { attr: number; claim: FlavorClaim | null; seed: number; only: boolean; kinds: number; cross: boolean; plant: boolean; focus: number };
};

const DRINKY = /coffee|tea|bakery|dessert|juice|smoothie|boba/i;

/** "Pasta (GF)", "12. Bucatini" read as "Pasta", "Bucatini". */
function cleanItem(name: string): string {
  return name
    .replace(/\([^)]*\)/g, "")
    .replace(/^[A-Za-z]{0,2}\d+[.)]\s*/, "")
    .replace(/\b(GF|DF|VG|V)\b/g, "")
    .replace(/\b\d+\s*(pcs?|pieces?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[-,&+]$/, "")
    .trim();
}

function clip(text: string, max: number): string {
  const t = text.normalize("NFC");
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

const PLANT_TAIL = " (plant-based)";

/** Shortens at a word, never inside one. */
export function clipWords(text: string, max: number): string {
  const t = text.normalize("NFC");
  if (t.length <= max) return t;
  // A meat-free house's disclosure is the last thing to go: the dish name gives way to it.
  if (t.endsWith(PLANT_TAIL) && max > PLANT_TAIL.length + 8) return `${clipWords(t.slice(0, -PLANT_TAIL.length), max - PLANT_TAIL.length)}${PLANT_TAIL}`;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  const body = (at >= 8 ? cut.slice(0, at) : cut).replace(/[\s&,\-–—]+$/, "").replace(/\s+(and|with|or|in|on|of|the|a)$/i, "");
  return `${body.trimEnd()}…`;
}

/** The viewer's dish as a label: no ®/™, and an all-caps post title is title-cased. */
export function displayDish(dish: string): string {
  const d = dish.replace(/[®™©]/g, "").replace(/\s+/g, " ").trim();
  if (d !== d.toUpperCase()) return d;
  return d.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
}

/** A name typed all in lower case ("general tsos chicken") is capitalised; one with any capital is left as it was written. */
function tidy(t: string): string {
  return t !== "" && t === t.toLowerCase() ? t.replace(/(^|[\s(-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase()) : t;
}

/** Clips the pick's item at a word, or null when what is left would no longer hold the matched term. */
function clipItem(item: string, max: number, term: string): string | null {
  const out = clipWords(item, max);
  if (out === item.normalize("NFC") || out.toLowerCase().includes(term.toLowerCase())) return out;
  return null;
}

/**
 * "Hot Honey Chicken Sandwich — like your Hot Honey Chicken at sweetgreen".
 * When it is too long the pick's own item gives way, at a word; the viewer's
 * dish and its place are what make the line true, so they are not cut.
 */
function dishLine(item: string, rawDish: string, place: string, max: number, term: string): string {
  const dish = displayDish(rawDish);
  const tail = `like your ${dish} at ${place}`;
  const full = `${item} — ${tail}`;
  if (full.length <= max) return full;
  const room = max - tail.length - 3;
  const clipped = room >= 12 ? clipItem(item, room, term) : null;
  if (clipped) return `${clipped} — ${tail}`;
  const fixed = `Like your  at ${place}`.length;
  return `Like your ${clipWords(dish, Math.max(10, max - fixed))} at ${place}`;
}

/** "Spicy Vodka Pie — NY-style like your Naughty Pie at Prince Street". */
function famLine(item: string, phrase: string | null, dish: string | null, place: string, max: number): string {
  const tail = (p: string | null, d: string | null) => `${p ? `${p} ` : ""}like ${d ? `your ${d} at ${place}` : place}`;
  // The pick's own item is the point of the line, so the style gives way first, then the viewer's dish is clipped at a
  // word, and only then the item. A dish is never cut to a fragment ("Hot Honey…"): the item gives way before that.
  const dishes = dish ? [dish, clipWords(dish, 26)].filter((d, i, a) => a.indexOf(d) === i) : [null];
  for (const atPlace of dish ? [true, false] : [true]) {
    for (const d of dishes) {
      for (const p of phrase ? [phrase, null] : [null]) {
        const full = `${item} — ${p ? `${p} ` : ""}like ${d ? `your ${d}${atPlace ? ` at ${place}` : ""}` : place}`;
        if (full.length <= max) return full;
      }
    }
  }
  const t = tail(null, dish);
  const room = max - t.length - 3;
  if (room >= 10) return `${clipWords(item, room)} — ${t}`;
  return clip(`Like ${dish ? `your ${dish} at ${place}` : place}`, max);
}

/**
 * "Mike's Hot Honey Hot Mozz — sweet heat, like your Hot Honey Chicken". What it says of the pick is what the
 * pick's own menu text shows (`claim`); the posted dish is one whose own text shows the same.
 */
function flavLine(item: string, claim: FlavorClaim, dish: string | null, place: string, max: number): string {
  const quoted = claim.quote && !claim.inName ? `${claim.label}: "${claim.quote}"` : claim.label;
  for (const q of quoted === claim.label ? [quoted] : [quoted, claim.label]) {
    for (const t of dish ? [`, like your ${dish} at ${place}`, `, like your ${dish}`] : [""]) {
      const full = `${item} — ${q}${t}`;
      if (full.length <= max) return full;
    }
  }
  const tail = ` — ${claim.label}${dish ? `, like your ${dish}` : ""}`;
  const room = max - tail.length;
  return room >= 12 ? `${clipWords(item, room)}${tail}` : clip(`${item}${tail}`, max);
}

/** What a claim label is called after "same" ("same heat as your ..."): the label itself reads wrong for some. */
const FLAVOR_NOUN: Readonly<Record<string, string>> = {
  "sweet heat": "sweet heat",
  spicy: "heat",
  smoky: "smoke",
  crispy: "crunch",
  sweet: "sweetness",
};

/**
 * "New for you — Kimchi Chicken Sandwich, same sweet heat as your Hot Honey Chicken". An adventurous pick says it
 * is new, and what it shares with a posted dish; like `flavLine`, only what the pick's own text shows.
 */
function newLine(item: string, claim: FlavorClaim, dish: string | null, max: number): string {
  const noun = FLAVOR_NOUN[claim.label] ?? claim.label;
  const tail = (d: string | null) => `same ${noun}${d ? ` as your ${d}` : ""}`;
  const head = "New for you — ";
  for (const d of dish ? [dish, clipWords(dish, 26)].filter((x, i, a) => a.indexOf(x) === i) : [null]) {
    const full = `${head}${item}, ${tail(d)}`;
    if (full.length <= max) return full;
  }
  // The posted dish gives way before the pick's own name does (a clipped name tells them less than a missing comparison).
  const bare = `${head}${item}, ${tail(null)}`;
  if (dish && bare.length <= max) return bare;
  // The dish's name gives way before the flavor does.
  const t = tail(dish ? clipWords(dish, 26) : null);
  const room = max - head.length - 2 - t.length;
  return room >= 12 ? `${head}${clipWords(item, room)}, ${t}` : clip(`${head}${t}`, max);
}

function reasonOf(
  hit: Hit | null,
  seeds: readonly Seed[],
  cuisine: string | null,
  candidate: string,
  fresh = false,
  plant = false,
  /** What the place is known for ("Buffalo Wings & ribs"), named when the pick's own line is only a family label. */
  known: string | null = null,
): TastePick["reason"] {
  const c = DISH_TASTE;
  /** A meat-free house says so when the dish it is compared to is not: "Chicken Sandwich (plant-based)". */
  const said = (item: string): string => (plant && item && !/plant|vegan|vegetarian|meat.?less|meat.?free/i.test(item) ? `${item}${PLANT_TAIL}` : item);
  if (!hit) {
    const text = `${cuisine}, a cuisine you eat`;
    return { kind: "cuisine", text: clip(text, c.textChars), short: clip(text, c.shortChars) };
  }
  const s = seeds[hit.seed];
  const place = shortPlaceName(s.place);
  if (hit.flav?.claim) {
    // The flavor is the reason, and only what the candidate's own text shows may be said about it.
    const fs = seeds[hit.flav.seed];
    const whole = tidy(displayDish(cleanItem(hit.item).replace(/^\d{3,}\s+/, "").replace(/^[^:]{1,24}#\d+:\s*/, "")));
    const item = said(whole && !fold(candidate).includes(fold(whole)) ? whole : (hit.fam ? (FAMILY_BY_ID.get(hit.fam)?.noun ?? "") : "") || whole);
    if (item && fs) {
      // "like your The Naughty Pie" reads wrong: a leading article goes.
      const dish = fs.dish ? displayDish(fs.dish).replace(/^(?:the|a|an)\s+(?=\S)/i, "") : null;
      const at = shortPlaceName(fs.place);
      if (fresh) {
        return {
          kind: "dish",
          text: newLine(item, hit.flav.claim, dish, c.textChars),
          short: newLine(item, hit.flav.claim, dish, c.shortChars),
        };
      }
      return {
        kind: "dish",
        text: flavLine(item, hit.flav.claim, dish, at, c.textChars),
        short: flavLine(item, hit.flav.claim, dish, at, c.shortChars),
      };
    }
  }
  if (hit.fam) {
    // The place's twist is claimed for a dish that carries it, not for its plain items (a nigiri is no fusion).
    const phrase = hit.tag && !FAMILY_BY_ID.get(hit.fam)?.plain?.test(fold(hit.item)) ? TAGS[hit.tag].phrase : null;
    const whole = hit.item ? tidy(displayDish(cleanItem(hit.item).replace(/^\d{3,}\s+/, "").replace(/^[^:]{1,24}#\d+:\s*/, "").replace(/^\d\s+(?=\w+s\b)/, "").replace(/\s+w\/\s*\w+$/i, ""))) : "";
    // "Garlic Parmesan Wings with fries and a drink": the dish ends where the extras start.
    const named = fold(whole);
    // A bowl that is the place's own name ("Pho Nom" at Pho Nom) tells nothing: name the dish family.
    const item = said(
      whole && !fold(candidate).includes(named)
        ? whole.length > 22
          ? whole.split(/\s+(?:with|w\/|and|plus)\s+|,|\s[-–]\s|\s&\s|\s\+\s/i)[0] || whole
          : whole
        : (FAMILY_BY_ID.get(hit.fam)?.noun ?? ""),
    );
    const dish = s.dish ? displayDish(s.dish) : null;
    // A line that is only a family label ("Wings (5 pcs)"): the place's known-for items say more than the label.
    const label = known && BARE_LABEL.test(fold(item.replace(PLANT_TAIL, ""))) ? said(known) : item;
    return { kind: "dish", text: famLine(label, phrase, dish, place, c.textChars), short: famLine(label, phrase, dish, place, c.shortChars) };
  }
  if (hit.style) {
    const text = `Known for ${hit.term} — like ${place}`;
    return { kind: "style", text: clip(text, c.textChars), short: clip(text, c.shortChars) };
  }
  const item = said(cleanItem(hit.item));
  if (s.placeLevel) {
    return {
      kind: "dish",
      text: `${clipItem(item, c.textChars - place.length - 8, hit.term) ?? clipWords(item, c.textChars - place.length - 8)} — like ${place}`,
      short: `${clipItem(item, c.shortChars - place.length - 8, hit.term) ?? clipWords(item, c.shortChars - place.length - 8)} — like ${place}`,
    };
  }
  return {
    kind: "dish",
    text: dishLine(item, s.dish, place, c.textChars, hit.term),
    short: dishLine(item, s.dish, place, c.shortChars, hit.term),
  };
}

/* ---------- ranking ---------- */

export type DishRankInput = {
  index: DishIndex;
  restaurants: readonly RestaurantView[];
  plates: Readonly<Record<string, PlateScore>>;
  /** C for the shrunk rating (`Corpus.ratingMean`). */
  ratingMean: number | null;
  posts: readonly ViewerPost[];
  prefs: FullTastePrefs;
  /** Epoch milliseconds; a parameter so a run is repeatable. */
  now: number;
  limit?: number;
};

type Cand = {
  r: RestaurantView;
  hit: Hit | null;
  score: number;
  /** 0 a real meal match; 1 a bar bite at a bar; 2 a drink. Later tiers wait until after the first `top`. */
  tier: number;
  /** Stands on flavor alone in a cuisine or dish family the viewer has not posted. Waits behind the familiar picks. */
  novel?: boolean;
  /** Its flavor is one of theirs, but in a kind of dish none of theirs is: only ever an adventurous pick. */
  cross?: boolean;
  /** `novel`, and good enough to be one of the row's adventurous picks. */
  advOk?: boolean;
  /** Placed as one of the adventurous picks: its reason says it is new. */
  adv?: boolean;
  /** The rating of the best-rated posted dish its named line matches (the order stands on it, not on the dish that names it). */
  rw?: number;
  /** What a flavor line on a family pick added to its score (it is weighed without it once another pick shows that flavor). */
  lead?: number;
};

type FamItem = FamPlace["items"][number];
/** The folded words of a family item's name, worked out once per item (the index outlives a request). */
const ITEM_WORDS = new WeakMap<FamItem, readonly string[]>();
const wordsOfItem = (x: FamItem): readonly string[] => {
  let v = ITEM_WORDS.get(x);
  if (v === undefined) {
    v = foldM(x.name).split(" ").map(wordOf);
    ITEM_WORDS.set(x, v);
  }
  return v;
};
/** A specialist's items that can name a pick for a seed (of a sub-type, if the seed has one): its mains, unless the family is all it has. */
const POOL_MEMO = new WeakMap<FamPlace, Map<RegExp | null, readonly FamItem[]>>();
const famPool = (fp: FamPlace, sub: RegExp | null): readonly FamItem[] => {
  let byRe = POOL_MEMO.get(fp);
  if (!byRe) POOL_MEMO.set(fp, (byRe = new Map()));
  let pool = byRe.get(sub);
  if (!pool) {
    const typed = sub ? fp.items.filter((x) => sub.test(foldM(x.name))) : fp.items;
    const mains = typed.filter((x) => !OFF_MAIN.test(foldM(x.name)));
    pool = mains.length > 0 ? mains : typed;
    byRe.set(sub, pool);
  }
  return pool;
};

/**
 * The viewer's picks, best first, or null when there is not enough to go on
 * (under `minSeeds` posted dishes the caller keeps its ordinary picks).
 */
export function rankDishes(input: DishRankInput): TastePick[] | null {
  const c = DISH_TASTE;
  const { index, restaurants, posts, prefs, now } = input;
  const byId = new Map(restaurants.map((r) => [r.id, r]));
  const idfOf = (term: string): number => index.idf.get(termId(term)) ?? 0;
  const pw = postWeights(posts);

  /** Lends a seed its place's styles and dish types ("ribs", "bbq") for what its own words cannot say. */
  const borrowStyles = (s: Seed, minIdf: number, clear: boolean): boolean => {
    if (s.rid === undefined) return false;
    // What the place is known for: the head word of its first styles and dish types ("Baby Back Ribs" is
    // ribs, "pizzas" is pizza). A "New York-Style" says how, not what, and a head that is too common says nothing.
    const headsOf = (x: string) => termsOf(x.split(/[^A-Za-z0-9]+/).filter(Boolean).pop() ?? "");
    const heads = new Set<string>();
    for (const x of (index.styles.get(s.rid) ?? []).slice(0, 2)) if (!/style$/i.test(x.trim())) for (const y of headsOf(x)) heads.add(y);
    // A dish type only counts when the dish itself names it: "egg bites" says nothing of a Bacon Ciabatta.
    for (const x of (index.types.get(s.rid) ?? []).slice(0, 2)) {
      if (/style$/i.test(x.trim())) continue;
      const hs = headsOf(x);
      if (hs.some((y) => s.words.has(y))) for (const y of hs) heads.add(y);
    }
    const inName = (x: string) => s.words.has(x);
    let pool = [...heads].filter((x) => idfOf(x) >= minIdf && !x.includes(" "));
    // A head the dish itself names is the one that says what it is; the rest would only widen the net.
    if (pool.some(inName)) pool = pool.filter(inName);
    const top = pool.sort((a, b) => idfOf(b) - idfOf(a)).slice(0, 2);
    if (top.length === 0) return false;
    if (clear) {
      s.terms.clear();
      s.core.clear();
    }
    for (const x of top) {
      s.terms.set(x, c.styleWeight);
      s.core.add(x);
    }
    s.placeLevel = true;
    return true;
  };

  const chainCache = new Map<number, string>();
  const chainOf = (rid: number): string => {
    let k = chainCache.get(rid);
    if (k === undefined) {
      const r = byId.get(index.rids[rid]);
      k = r ? chainKeyM(r) : "";
      chainCache.set(rid, k);
    }
    return k;
  };

  /** The families a post is in: its dish's, or (no dish, or a name that says nothing) the one its place specialises in. */
  const famsOf = (dishName: string | null, rid: number | undefined): SeedFam[] => {
    const spec = rid === undefined ? undefined : index.famSpec.get(rid);
    const placeTags = rid === undefined ? undefined : index.tags.get(rid);
    const dish = dishName ? foldM(dishName) : "";
    const out: SeedFam[] = [];
    const add = (f: Family) => {
      // "Slice" is the dish's to say; the place's own tags pass on how it makes it.
      let tag: string | null = dish && f.tags.includes("slice") && /\bslices?\b/.test(dish) ? "slice" : null;
      if (!tag) tag = f.tags.find((t) => t !== "slice" && placeTags?.has(t)) ?? null;
      out.push({ id: f.id, tag });
    };
    for (const f of FAMILIES) {
      if (dish && f.dish.test(dish)) add(f);
      else if (dish && f.weak?.test(dish) && (spec?.get(f.id) ?? 0) >= c.famServes) add(f);
    }
    if (out.length === 0 && spec && (!dishName || headOf(dishName).length === 0)) {
      let best: Family | null = null;
      let bv = 0.89;
      for (const f of FAMILIES) {
        const v = spec.get(f.id) ?? 0;
        if (v > bv) {
          best = f;
          bv = v;
        }
      }
      if (best) add(best);
    }
    return out;
  };

  // ---- flavor (lib/flavor.ts): what the viewer liked about the dishes they rated ----
  const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
  const chainRidsMap = new Map<string, number[]>();
  const ridsOfChain = (key: string): readonly number[] => {
    if (chainRidsMap.size === 0) {
      for (let i = 0; i < index.rids.length; i++) {
        const k = chainOf(i);
        if (!k) continue;
        const list = chainRidsMap.get(k);
        if (list) list.push(i);
        else chainRidsMap.set(k, [i]);
      }
    }
    return chainRidsMap.get(key) ?? [];
  };
  /** The packed flavor of the line called `name` in place `rid` (merged over duplicate lines); null when the place has none. */
  const itemMaskIn = (rid: number, name: string): number | null => {
    const want = foldM(name);
    let m: number | null = null;
    for (let k = index.first[rid]; k < index.first[rid + 1]; k++) {
      const it = index.order[k];
      if (foldM(index.itemName[it]) !== want) continue;
      m = m === null ? index.itemFlavor[it] : mergeMasks(m, index.itemFlavor[it]);
    }
    return m;
  };
  /** The same dish at the viewer's place, or failing that at another branch of its chain. */
  const siblingMask = (rid: number, name: string): number | null => {
    const own = itemMaskIn(rid, name);
    if (own !== null) return own;
    const ck = chainOf(rid);
    if (!ck) return null;
    for (const other of ridsOfChain(ck)) {
      if (other === rid) continue;
      const m = itemMaskIn(other, name);
      if (m !== null) return m;
    }
    return null;
  };
  /** The claims the line called `name` in place `rid` makes in its own text; null when the place has no such line. */
  const claimsIn = (rid: number, name: string): FlavorClaim[] | null => {
    const want = foldM(name);
    let found = false;
    const out: FlavorClaim[] = [];
    for (let k = index.first[rid]; k < index.first[rid + 1]; k++) {
      const it = index.order[k];
      if (foldM(index.itemName[it]) !== want) continue;
      found = true;
      for (const cl of index.itemClaims.get(it) ?? []) if (!out.some((o) => o.attr === cl.attr)) out.push(cl);
    }
    return found ? out : null;
  };
  const siblingClaims = (rid: number, name: string): FlavorClaim[] => {
    const own = claimsIn(rid, name);
    if (own !== null) return own;
    const ck = chainOf(rid);
    if (!ck) return [];
    for (const other of ridsOfChain(ck)) {
      if (other === rid) continue;
      const m = claimsIn(other, name);
      if (m !== null) return m;
    }
    return [];
  };
  /** The dish family a menu line is in, if any. */
  const famIdOf = (name: string): string | undefined => {
    const nm = foldM(name);
    if (BUILDER.test(nm)) return undefined;
    return (FAMILIES.find((f) => f.dish.test(nm)) ?? FAMILIES.find((f) => f.item.test(nm)))?.id;
  };
  const fSeeds: FlavorSeed[] = [];
  /** Per flavor seed: the flavors its OWN stated text backs (description, or the same line at a sibling), none if its caption complains. */
  const citeBits = new Map<number, number>();
  /**
   * One rated food dish as a flavor seed, or null when nothing was said about it (no menu text, no sibling
   * line, no flavor in its name, no caption that tags): absence of text is never read as dislike.
   */
  const flavorSeedOf = (p: ViewerPost, pi: number, id: number, seed: Seed): FlavorSeed | null => {
    const rating = p.rating;
    if (!p.dishName || typeof rating !== "number" || !Number.isFinite(rating) || rating < c.dropBelow || seed.kind === DRINK) return null;
    const asian = seed.rid !== undefined && index.asian.has(seed.rid);
    let mask = tagDish(p.dishName, p.dishDescription, p.dishSection, asian);
    let said = !!p.dishDescription?.trim();
    if (!said && seed.rid !== undefined) {
      const sib = siblingMask(seed.rid, p.dishName);
      if (sib !== null) {
        mask = mergeMasks(mask, sib);
        said = true;
      }
    }
    // The viewer's own words nudge the profile (grade 1 at most, praise slang removed) and never back a claim.
    const cap = tagCaption(p.caption, asian);
    if (cap !== 0) {
      mask = mergeMasks(mask, cap);
      said = true;
    }
    if (!said && mask === 0) return null;
    // What a reason may cite this dish for: only what its own text states (the viewer's caption never backs it).
    if (!captionSours(p.caption)) {
      const stated = claimsOf(p.dishName, p.dishDescription, p.dishSection, asian);
      const claims = stated.length > 0 || p.dishDescription?.trim() || seed.rid === undefined ? stated : siblingClaims(seed.rid, p.dishName);
      let bits = 0;
      for (const cl of claims) bits |= 1 << cl.attr;
      if (bits !== 0) citeBits.set(id, bits);
    }
    return {
      id,
      mask,
      pw: pw[pi],
      // A rating about value, service or ambiance is not a rating of the food.
      c: /^(value|service|ambian)/i.test(p.vibe ?? "") ? c.flavorVibeFactor : 1,
      r: Math.max(c.flavorRecencyFloor, recency(p.at, now)),
      rating,
    };
  };

  const seeds: Seed[] = [];
  posts.forEach((p, pi) => {
    // Rated under `dropBelow`: nothing to seed from (the place still counts below).
    if (pw[pi] === 0) return;
    const place = byId.get(p.restaurantId);
    const rid = index.ridIndex.get(p.restaurantId);
    const fams = famsOf(p.dishName, rid);
    if (!p.dishName) {
      // No dish named: a place that specialises in a family still says what they like.
      if (fams.length > 0) {
        seeds.push({
          dish: "",
          place: place?.name ?? p.restaurantName ?? "",
          rid,
          kind: FOOD,
          w: recency(p.at, now),
          rw: pw[pi],
          terms: new Map(),
          core: new Set(),
          placeLevel: false,
          head: [],
          words: new Set(),
          chain: place ? chainKeyM(place) : "",
          fams,
          famOnly: true,
        });
      }
      return;
    }
    const name = foldM(p.dishName);
    const own = new Set(foldM(place?.name ?? "").split(" ").map(stem));
    // A term that is only the place's own name ("Pho Hoa" for a pho dish at Pho Hoa) says nothing about the dish.
    const usable = (x: string) => idfOf(x) > 0 && !x.split(" ").every((w) => own.has(w));
    const terms = new Map<string, number>();
    const desc = termsOf(p.dishDescription ?? "")
      .filter(usable)
      .sort((a, b) => idfOf(b) - idfOf(a))
      .slice(0, 4);
    for (const x of desc) terms.set(x, c.descWeight);
    const core = new Set<string>();
    for (const x of termsOf(p.dishName)) {
      if (!usable(x)) continue;
      terms.set(x, 1);
      core.add(x);
    }
    let strength = 0;
    for (const [x, w] of terms) strength += idfOf(x) * w;
    const seed: Seed = {
      dish: p.dishName,
      place: place?.name ?? p.restaurantName ?? "",
      rid,
      kind: kindOf(name, foldM(p.dishSection ?? "")),
      w: recency(p.at, now),
      rw: pw[pi],
      terms,
      core,
      placeLevel: false,
      head: ((h) => (h.length > 0 && idfOf(h[0]) >= c.loneIdf ? [] : h))(headOf(p.dishName)),
      words: new Set(name.split(" ").filter(Boolean).map(wordOf)),
      chain: place ? chainKeyM(place) : "",
      fams,
      famOnly: false,
    };
    // The dish says little (a house special, a plain "burger"): borrow what the place is known for.
    if (strength < c.weakSeedIdf) borrowStyles(seed, c.weakSeedIdf, false);
    seeds.push(seed);
    const fs = flavorSeedOf(p, pi, seeds.length - 1, seed);
    if (fs) fSeeds.push(fs);
  });
  if (seeds.filter((s) => !s.famOnly).length < c.minSeeds) return null;

  // The flavor profile. Quiet (no effect at all) unless something they like is both evidenced and rare.
  const prof = buildFlavorProfile(fSeeds, index.flavorBase, {
    K: c.flavorK,
    anchorBeta: c.flavorAnchorBeta,
    anchorMinPosts: c.flavorAnchorMinPosts,
    spreadMin: c.flavorSpreadMin,
    flatWeight: c.flavorFlat,
  });
  const layer = prof.anchors.length > 0;
  // Sweet heat is the flavor to name first when they like it; the rest go by how much more they like it than most.
  const anchorOrder = prof.anchors
    .slice()
    .sort((a, b) => (b === FA.sweetheat ? 1 : 0) - (a === FA.sweetheat ? 1 : 0) || prof.beta[b] - prof.beta[a]);

  // What kind of dish each posted dish and each menu line is: a flavor reason compares like with like.
  const placeKindsMemo = new Map<number, number>();
  /** What a place is known for, as kinds: the families it specialises in, else what its cuisine label says. */
  const placeKinds = (rid: number | undefined): number => {
    if (rid === undefined) return 0;
    const memo = placeKindsMemo.get(rid);
    if (memo !== undefined) return memo;
    let k = 0;
    for (const [id, v] of index.famSpec.get(rid) ?? []) if (v >= (FAMILY_BY_ID.get(id)?.min ?? c.famSpecialist)) k |= FAM_KIND[id] ?? 0;
    if (k === 0) {
      const cu = foldM(byId.get(index.rids[rid])?.cuisine ?? "");
      for (const [re, bit] of CUISINE_KIND) if (re.test(cu)) k |= bit;
    }
    placeKindsMemo.set(rid, k);
    return k;
  };
  /** A meat-free house: its profile says so, or its cuisine label or its own name does. */
  const plantMemo = new Map<number, boolean>();
  const isPlant = (rid: number | undefined): boolean => {
    if (rid === undefined) return false;
    let v = plantMemo.get(rid);
    if (v === undefined) {
      const r = byId.get(index.rids[rid]);
      v = index.tags.get(rid)?.has("plant") === true || (r !== undefined && PLANT_PLACE.test(`${foldM(r.cuisine ?? "")} ${foldM(r.name)}`));
      plantMemo.set(rid, v);
    }
    return v;
  };
  /** The kinds a menu line is: its own name's, or (a name that says nothing) the place's. A meat-free house serves no meat. */
  const lineKinds = (rid: number, name: string): number => {
    const own = kindsOfName(foldM(name));
    let k = (own & ~KB.starter) !== 0 ? own : own | placeKinds(rid);
    if (isPlant(rid)) k = (k & ~(KB.chicken | KB.meat | KB.seafood)) | KB.plant;
    return k;
  };
  const seedKinds = seeds.map((s) => {
    let k = s.dish ? kindBits(foldM(s.dish)) : 0;
    for (const f of s.fams) k |= FAM_KIND[f.id] ?? 0;
    return k || placeKinds(s.rid);
  });
  // The kinds of food they post (a drink is no dish family), and whether they post meat-free food at all.
  let postedKinds = 0;
  let userPlant = false;
  seeds.forEach((s, i) => {
    if (s.kind === DRINK) return;
    postedKinds |= seedKinds[i] & FORM_BITS;
    if (isPlant(s.rid) || (s.dish && PLANT_ITEM.test(foldM(s.dish)))) userPlant = true;
  });
  // The posted dishes a reason may cite for a flavor: the dish carries it in its own stated text, its caption does not
  // complain, and it is rated near the best of those (a 79 with "nothing worth raving over" is no one's model).
  const fRating = new Map<number, number>();
  const fMask = new Map<number, number>();
  for (const s of fSeeds) {
    fRating.set(s.id, s.rating);
    fMask.set(s.id, s.mask);
  }
  const citeSeeds: number[][] = prof.seedsByAttr.map((list, attr) => {
    const stated = list.filter((id) => ((citeBits.get(id) ?? 0) >> attr) & 1);
    if (stated.length === 0) return stated;
    const best = Math.max(...stated.map((id) => fRating.get(id) ?? 0));
    const floor = Math.min(c.citeRating, best - c.citeBelowTop);
    return stated.filter((id) => (fRating.get(id) ?? 0) >= floor);
  });
  // A flavor stands on its own (a pick with no dish or family match behind it) when it is sweet heat, or when enough
  // of what they posted shows it by itself: a spicy dish that is also sweet is sweet heat, and "spicy" alone
  // is not proven by one hot dish.
  const standsAlone = (attr: number): boolean => {
    const list = citeSeeds[attr];
    if (list.length === 0) return false;
    if (attr === FA.sweetheat) return true;
    return list.filter((id) => gradeOf(fMask.get(id) ?? 0, FA.sweetheat) === 0).length >= c.aloneSeeds;
  };
  const aloneOrder = anchorOrder.filter(standsAlone);
  const seedsForMemo = new Map<number, number[]>();
  /** The viewer's dishes with this flavor that are of the same kind as a pick's line, highest rated first. */
  const seedsFor = (attr: number, kinds: number): number[] => {
    const key = attr * 16384 + kinds;
    let list = seedsForMemo.get(key);
    if (!list) {
      const all = citeSeeds[attr];
      // A dish whose kind is known and shared comes first; one whose kind is not known only stands in for want of one.
      const same = (s: number) => (seedKinds[s] & kinds & ~KB.starter) !== 0;
      list = kinds === 0 ? all.slice() : [...all.filter(same), ...all.filter((s) => !same(s) && kindsFit(seedKinds[s], kinds))];
      seedsForMemo.set(key, list);
    }
    return list;
  };

  // A term the viewer keeps ordering counts for more, up to +80%.
  const shared = new Map<string, number>();
  for (const s of seeds) for (const x of s.terms.keys()) shared.set(x, (shared.get(x) ?? 0) + s.w);
  const strengthOf = (s: Seed, x: string): number =>
    idfOf(x) * (s.terms.get(x) ?? 0) * (1 + 0.4 * Math.min(2, (shared.get(x) ?? 0) - s.w));

  // Where the viewer posts: places, weights, cuisines, range and budget.
  type Visit = { last: number; days: Set<string>; rw: number };
  const visits = new Map<string, Visit>();
  posts.forEach((p, pi) => {
    const v = visits.get(p.restaurantId) ?? { last: 0, days: new Set<string>(), rw: 0 };
    v.last = Math.max(v.last, p.at);
    v.days.add(new Date(p.at).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }));
    // The place counts for cuisine by how highly they rated what they had there.
    v.rw = Math.max(v.rw, pw[pi]);
    visits.set(p.restaurantId, v);
  });
  const cuisineWeight = new Map<string, number>();
  // Cuisines of places he actually posted at; secondary tags only tint the score.
  const eaten = new Set<string>();
  let cuisineTotal = 0;
  const bump = (cuisine: string, w: number) => {
    cuisineWeight.set(cuisine, (cuisineWeight.get(cuisine) ?? 0) + w);
    cuisineTotal += w;
  };
  for (const [id, v] of visits) {
    const r = byId.get(id);
    if (!r?.cuisine || v.rw === 0) continue;
    const w = recency(v.last, now) * Math.min(2, 1 + 0.5 * (v.days.size - 1)) * v.rw;
    bump(r.cuisine, w);
    eaten.add(r.cuisine);
    for (const s of r.cuisineSecondary ?? []) bump(s, w * 0.4);
  }
  const cuisineAffinity = (cuisine: string | null): number =>
    cuisine && cuisineTotal > 0 ? Math.min(1, (cuisineWeight.get(cuisine) ?? 0) / cuisineTotal / c.cuisineFull) : 0;

  const plates = posts.map((p) => priceOf(p.price)).filter((v): v is number => v != null);
  const placeMedians: number[] = [];
  const history = [];
  for (const id of visits.keys()) {
    const rid = index.ridIndex.get(id);
    const m = rid === undefined ? undefined : index.median.get(rid);
    if (m !== undefined) placeMedians.push(m);
    const r = byId.get(id);
    if (r) history.push({ id: r.id, lat: r.lat, lng: r.lng });
  }
  const budget = budgetOf(plates, placeMedians);
  const radius = radiusOf(history);
  const capMiles = Math.max(c.minCapMiles, c.capRadii * radius.miles);

  // Never recommend what they have been to, or a branch of it (whatever they thought of it).
  const seen = new Set<string>([...visits.keys(), ...prefs.been, ...prefs.hidden]);
  const skipped = new Set(prefs.skips);
  const seenChains = new Set<string>();
  for (const id of seen) {
    const r = byId.get(id);
    if (r) seenChains.add(chainKeyM(r));
  }

  // What is new to them: a cuisine none of their posts (or been places) is in, or a dish family none of their posts
  // is in. Every post counts here, whatever it was rated.
  const postedCuisines = new Set<string>();
  for (const id of new Set([...visits.keys(), ...prefs.been])) {
    const r = byId.get(id);
    if (r?.cuisine) postedCuisines.add(r.cuisine);
    for (const s of r?.cuisineSecondary ?? []) postedCuisines.add(s);
  }
  const postedFams = new Set<string>();
  for (const p of posts) {
    for (const f of famsOf(p.dishName, index.ridIndex.get(p.restaurantId))) postedFams.add(f.id);
    const own = p.dishName ? famIdOf(p.dishName) : undefined;
    if (own) postedFams.add(own);
  }

  // Match every seed against every item that shares one of its terms.
  const best = new Map<number, Hit[]>();
  const keep = (rid: number, hit: Hit) => {
    const list = best.get(rid) ?? [];
    const own = list.find((h) => h.seed === hit.seed);
    if (!own) list.push(hit);
    else if (hit.v > own.v && (!own.item || hit.item)) Object.assign(own, hit);
    best.set(rid, list);
  };
  /** Matches one seed; returns how many dishes (not styles) it found. */
  const runSeed = (si: number): number => {
    const s = seeds[si];
    if (s.famOnly) return 0;
    // A word only the viewer's own place uses (a brand's "Rib Tickler") cannot be matched elsewhere: it is not asked for.
    const elsewhere = (x: string): boolean => {
      const span = index.spans.get(termId(x));
      if (!span || !s.chain) return true;
      for (let k = span[0]; k < span[1]; k++) if (chainOf(index.itemRid[index.postings[k] >> 1]) !== s.chain) return true;
      return false;
    };
    let total = 0;
    for (const x of s.core) if (elsewhere(x)) total += strengthOf(s, x);
    if (total <= 0) for (const x of s.terms.keys()) total += strengthOf(s, x);
    if (total <= 0) return 0;
    const acc = new Map<number, { v: number; shared: number; names: number; top: number; term: string; tv: number }>();
    const stylesAcc = new Map<number, { v: number; term: string; tv: number }>();
    for (const x of s.terms.keys()) {
      const tid = termId(x);
      const sw = strengthOf(s, x);
      const span = index.spans.get(tid);
      if (span) {
        for (let k = span[0]; k < span[1]; k++) {
          const posting = index.postings[k];
          const item = posting >> 1;
          const inName = (posting & 1) === 1;
          if (index.itemKind[item] !== s.kind) continue;
          if (s.chain && chainOf(index.itemRid[item]) === s.chain) continue;
          if (s.placeLevel && !index.styleSets.get(index.itemRid[item])?.has(tid)) continue;
          const e = acc.get(item) ?? { v: 0, shared: 0, names: 0, top: 0, term: "", tv: 0 };
          e.v += sw * (inName ? 1 : c.descWeight);
          e.shared++;
          if (inName && s.core.has(x) && idfOf(x) >= c.hitIdf) {
            e.names++;
            e.top = Math.max(e.top, idfOf(x));
            if (sw > e.tv) {
              e.tv = sw;
              e.term = x;
            }
          }
          acc.set(item, e);
        }
      }
      for (const rid of index.styleSpans.get(tid) ?? []) {
        const e = stylesAcc.get(rid) ?? { v: 0, term: x, tv: 0 };
        e.v += sw * c.styleWeight;
        if (sw > e.tv) {
          e.tv = sw;
          e.term = x;
        }
        stylesAcc.set(rid, e);
      }
    }
    let dishes = 0;
    for (const [item, e] of acc) {
      // A lone shared word needs company: "naughty" alone is a brand's adjective, not a taste.
      if (e.names === 0 || (e.names === 1 && e.top < c.loneIdf)) continue;
      // "Bucatini or Rigatoni" is a choice line, not a dish he would recognise.
      if (e.names === 1 && /\bor\b/i.test(index.itemName[item])) continue;
      // The same dish, not the same flavour: "Koji Harami" is not a "Koji-Marinated Chicken Wing".
      if (!s.placeLevel && s.head.length > 0 && !namesHead(index.itemName[item], s.head)) continue;
      const price = index.itemPrice[item] > 0 ? index.itemPrice[item] : null;
      const lone = e.names === 1 && e.shared < 2 ? c.loneHit : 1;
      const v = Math.min(1, e.v / total) * s.w * lone * (s.kind === DRINK ? c.drinkHit : 1);
      keep(index.itemRid[item], { seed: si, v, vw: v * s.rw, item: index.itemName[item], price, term: e.term, style: false, starter: index.itemStarter[item] === 1 });
      dishes++;
    }
    for (const [rid, e] of stylesAcc) {
      const v = Math.min(1, e.v / total) * s.w * c.styleHit * (s.kind === DRINK ? c.drinkHit : 1);
      keep(rid, { seed: si, v, vw: v * s.rw, item: "", price: null, term: e.term, style: true });
    }
    return dishes;
  };
  seeds.forEach((s, si) => {
    if (s.famOnly) return;
    // A dish nobody else serves by that name ("Baby Back Rib Tickler"): fall back to what its place is known for.
    if (runSeed(si) === 0 && !s.placeLevel) {
      for (const list of best.values()) {
        const at = list.findIndex((h) => h.seed === si);
        if (at >= 0) list.splice(at, 1);
      }
      if (borrowStyles(s, c.minIdf, true)) runSeed(si);
    }
  });

  /** How much of a sit-down place it is: 2 seats you and serves, 0 is a counter. */
  const svcTier = (rid: number | undefined): number => {
    const v = rid === undefined ? undefined : index.service.get(rid);
    if (!v) return 1;
    if (/full_service|fine_dining|bar|brewery/.test(v)) return 2;
    if (/counter|fast|truck|market|bakery/.test(v)) return 0;
    return 1;
  };

  // Family matches: a place that specialises in the seed's family, with the style it shares (NY-style, breakfast ...).
  seeds.forEach((s, si) => {
    for (const sf of s.fams) {
      const fam = FAMILY_BY_ID.get(sf.id);
      const dishText = foldM(s.dish);
      const sub = fam?.sub && fam.sub.seed.test(dishText) ? fam.sub : null;
      const seedTier = svcTier(s.rid);
      const seedTags = s.rid === undefined ? undefined : index.tags.get(s.rid);
      for (const fp of index.fam.get(sf.id) ?? []) {
        if (s.chain && chainOf(fp.rid) === s.chain) continue;
        // Only a place whose profile says it is a specialist; one that merely lists the dish is not a match.
        if (fp.spec < (fam?.min ?? c.famSpecialist)) continue;
        const tagged = sf.tag != null && fp.tags.includes(sf.tag);
        // A meat-free house is a stretch for a seed whose own place is not.
        const contra = fp.tags.includes("plant") && !seedTags?.has("plant");
        // The item that names the pick: the sub-type the seed is (a Caesar needs a Caesar), then the one closest to the seed's dish and style.
        // Its mains, not a stick or a share platter, unless that is all the place has in the family.
        const pool = famPool(fp, sub ? sub.item : null);
        let pick: (typeof fp.items)[number] | undefined;
        let pickScore = -1;
        pool.forEach((x, i) => {
          const nm = foldM(x.name);
          let sc = wordsOfItem(x).filter((w) => s.words.has(w) && w.length >= 4).length * 2 + (x.sig ? 1 : 0) - i * 0.01;
          if (tagged && sf.tag && TAGS[sf.tag].re.test(nm)) sc += 2;
          // A classic roll is what a fusion seed is not: it does not name a fusion pick.
          if (fam?.classic?.test(nm)) sc += sf.tag === "fusion" ? -1 : 1.5;
          if (tagged && fam?.plain?.test(nm)) sc -= 3;
          // A dessert or a sweet is not what a place is sent for, whatever family its name sits in.
          if (DESSERT_WORD.test(nm)) sc -= 2;
          // A shorter name is a plainer dish: it only breaks a tie.
          sc -= nm.length * 0.005;
          if (sc > pickScore) {
            pickScore = sc;
            pick = x;
          }
        });
        // A specialist with no menu lines at all stays eligible on its profile alone (named by the family, a little less sure).
        if (!pick && index.first[fp.rid + 1] > index.first[fp.rid]) continue;
        // A counter is a weaker match for a seat-down seed, and a place that does several things for a specialist.
        const gap = Math.max(0, seedTier - svcTier(fp.rid));
        const v = Math.min(
          1,
          fp.spec * (0.55 + 0.45 * s.w) * (sf.tag != null && !tagged ? c.famUntagged : 1) * (contra ? c.famContra : 1) * c.svcGap ** gap * c.hybridShade ** fp.hybrid * (fp.sig ? c.sigBonus : 1) * (pick ? 1 : c.flavorPlace),
        );
        const list = best.get(fp.rid) ?? [];
        const at = list.findIndex((h) => h.seed === si);
        const hit: Hit = { seed: si, v, vw: v * s.rw, item: pick ? pick.name : "", price: pick ? pick.price : null, term: `fam:${sf.id}`, style: false, fam: sf.id, tag: tagged ? sf.tag : null };
        if (at < 0) list.push(hit);
        else if (v > list[at].v || !list[at].fam) list[at] = hit;
        best.set(fp.rid, list);
      }
    }
  });

  const seedFams = new Set(seeds.flatMap((s) => s.fams.map((f) => f.id)));

  // What the flavor profile adds at one place. A place's lines are its food items, or (no menu at all) its signature dishes.
  type FLine = { name: string; mask: number; claims: readonly FlavorClaim[]; price: number | null; starter: boolean };
  const linesOf = (rid: number, onFlavor = false): FLine[] => {
    const out: FLine[] = [];
    for (let k = index.first[rid]; k < index.first[rid + 1]; k++) {
      const it = index.order[k];
      if (index.itemKind[it] !== FOOD) continue;
      // `onFlavor`: only the lines on a flavor the viewer likes (the rest are never read; this is the hot path).
      if (onFlavor && anchorAttr(prof, index.itemFlavor[it]) < 0) continue;
      out.push({ name: index.itemName[it], mask: index.itemFlavor[it], claims: index.itemClaims.get(it) ?? [], price: index.itemPrice[it] > 0 ? index.itemPrice[it] : null, starter: index.itemStarter[it] === 1 });
    }
    if (index.first[rid + 1] === index.first[rid]) {
      for (const sg of index.menuless.get(rid)?.sigs ?? []) {
        if (onFlavor && anchorAttr(prof, sg.mask) < 0) continue;
        if (kindOf(foldM(sg.name), "") === FOOD) out.push({ name: sg.name, mask: sg.mask, claims: sg.claims, price: null, starter: (kindsOfName(foldM(sg.name)) & KB.starter) !== 0 });
      }
    }
    return out;
  };
  const fitV = (F: number): number => c.flavorV * clamp((F - c.flavorF0) / c.flavorFSpan, 0, 1);
  /** A meat-free house, or a meat-free swap on the menu. */
  const plantLine = (rid: number, name: string): boolean => isPlant(rid) || PLANT_ITEM.test(foldM(name));
  /** A line that is a dish in its own right: its name shows a main form, or says nothing and the place's kind does. */
  const mainForm = (rid: number, want: string): boolean => {
    const own = kindsOfName(want);
    if ((own & FORM_BITS) !== 0) return true;
    if (VEG_SIDE.test(want) || (BAR_BITE.test(want) && !/bao/.test(want))) return false;
    return true;
  };
  /** The share of a place's food lines that are of the pick's kind: a one-line wonder on a 90-item menu is not what it is known for. */
  const focusOf = (rid: number, kinds: number): number => {
    let by = FOCUS.get(index)?.get(rid);
    if (!by) {
      by = new Int32Array(15);
      for (let k = index.first[rid]; k < index.first[rid + 1]; k++) {
        const it = index.order[k];
        if (index.itemKind[it] !== FOOD || index.itemStarter[it] === 1) continue;
        const lk = lineKinds(rid, index.itemName[it]) & FORM_BITS;
        if (lk === 0) continue;
        by[14]++;
        for (let b = 0; b < 12; b++) if (lk & (1 << b)) by[b]++;
      }
      let m = FOCUS.get(index);
      if (!m) FOCUS.set(index, (m = new Map()));
      m.set(rid, by);
    }
    const total = by[14];
    if (total === 0) return 1;
    const want = kinds & FORM_BITS;
    let n = 0;
    for (let b = 0; b < 12; b++) if (want & (1 << b)) n = Math.max(n, by[b]);
    return c.focusFloor + (1 - c.focusFloor) * clamp(n / total / c.focusFull, 0, 1);
  };
  /** Gives a hit the claim its line's own text supports, if the line is on a flavor the viewer likes. */
  const attach = (h: Hit, l: FLine, rid: number): void => {
    if (anchorAttr(prof, l.mask) < 0) return;
    const claim = pickClaim(l.claims, aloneOrder);
    if (!claim) return;
    // Only a posted dish of the line's own kind can be named: with none, the line keeps its ordinary reason.
    const kinds = lineKinds(rid, l.name);
    const seed = seedsFor(claim.attr, kinds)[0];
    if (seed !== undefined) h.flav = { attr: claim.attr, claim, seed, only: false, kinds, cross: false, plant: plantLine(rid, l.name), focus: 1 };
  };
  const flavorHits = (rid: number, hits: readonly Hit[]): Hit[] => {
    const lines = linesOf(rid, true);
    const bare = index.menuless.get(rid)?.mask ?? 0;
    const out = hits.map((h) => ({ ...h }));
    // A family match's own line may be on any flavor, so all the lines are read, but only if there is one to find.
    let every: FLine[] | undefined;
    const lo = index.first[rid];
    const hi = index.first[rid + 1];
    const lineOf = (item: string): FLine | undefined => {
      const want = foldM(item);
      // A menu: read the item itself, without building the place's whole list of lines.
      for (let k = lo; k < hi; k++) {
        const it = index.order[k];
        if (index.itemKind[it] !== FOOD || foldM(index.itemName[it]) !== want) continue;
        return { name: index.itemName[it], mask: index.itemFlavor[it], claims: index.itemClaims.get(it) ?? [], price: index.itemPrice[it] > 0 ? index.itemPrice[it] : null, starter: index.itemStarter[it] === 1 };
      }
      return lo === hi ? (every ??= linesOf(rid)).find((l) => foldM(l.name) === want) : undefined;
    };
    const evidenceMemo = new Map<string, FLine | undefined>();
    // A family match whose line is only the family's label ("Fried Chicken") is named by the place's strongest line in
    // the family: one whose own text shows a flavor they like (never a dessert, a side or a platter).
    const evidenceOf = (l: FLine): number => {
      const cl = pickClaim(l.claims, anchorOrder);
      if (!cl || anchorAttr(prof, l.mask) < 0) return 0;
      const attrs = new Set(l.claims.map((x) => x.attr));
      // Sweet heat outweighs the rest; a line that shows two tastes (a spicy roll in a sweet sauce) beats one that shows one.
      const pair = attrs.has(FA.sweetheat) ? 3 : attrs.has(FA.sweet) && attrs.has(FA.spicy) ? 2 : attrs.size;
      return pair + (cl.inName ? 0.5 : 0);
    };
    const evidenceLine = (famId: string, twist = false): FLine | undefined => {
      const memo = `${famId}|${twist}`;
      if (evidenceMemo.has(memo)) return evidenceMemo.get(memo);
      const found = evidenceScan(famId, twist);
      evidenceMemo.set(memo, found);
      return found;
    };
    const evidenceScan = (famId: string, twist: boolean): FLine | undefined => {
      const fam = FAMILY_BY_ID.get(famId);
      if (!fam) return undefined;
      let best: FLine | undefined;
      let bs = 0;
      // Only the lines on a flavor they like can show evidence of one: those are the lines already read.
      for (const l of lines) {
        const nm = foldM(l.name);
        if (l.starter || SIDE_LINE.test(nm) || OFF_MAIN.test(nm) || DESSERT_WORD.test(nm) || BUILDER.test(nm)) continue;
        if (!fam.dish.test(nm) && !fam.item.test(nm)) continue;
        if (twist && fam.plain?.test(nm)) continue;
        const ev = evidenceOf(l);
        if (ev === 0) continue;
        const sc = ev - nm.length * 0.002;
        if (sc > bs) {
          bs = sc;
          best = l;
        }
      }
      return best;
    };
    // A family match is nudged by how its line fits (a bare specialist, by what its profile says).
    for (const h of out) {
      if (!h.fam) continue;
      // Named by a line that is only a family label, or by one with nothing to show for the flavor they like that
      // shares no word with their dish either: the place's strongest line in the family names it instead.
      const mine = h.item ? lineOf(h.item) : undefined;
      // A word of its own that the dish shares (a rare one: "spicy" is anyone's) keeps it as the pick.
      const shares = (h.item ? foldM(h.item).split(" ").map(wordOf) : []).some((w) => w.length >= 4 && seeds[h.seed].words.has(w) && idfOf(w) >= c.loneIdf);
      const plainNow = h.tag != null && !!h.item && !!FAMILY_BY_ID.get(h.fam)?.plain?.test(foldM(h.item));
      if (h.item && (BARE_LABEL.test(foldM(cleanItem(h.item))) || !shares || plainNow)) {
        const better = evidenceLine(h.fam, h.tag != null);
        if (better && (BARE_LABEL.test(foldM(cleanItem(h.item))) || plainNow || !mine || evidenceOf(better) >= evidenceOf(mine) + 0.5)) {
          h.item = better.name;
          h.price = better.price ?? h.price;
        }
      }
      const l = h.item ? lineOf(h.item) : undefined;
      const mask = l ? l.mask : h.item ? 0 : bare;
      if (mask === 0) continue;
      h.v = clamp(h.v * (1 + c.flavorMod * clamp(flavorFit(prof, mask), -0.5, 0.8)), 0, 1);
      h.vw = h.v * seeds[h.seed].rw;
      if (l) attach(h, l, rid);
    }
    let only: Hit | null = null;
    let onlyKey = -1;
    for (const l of lines) {
      if (anchorAttr(prof, l.mask) < 0) continue;
      const v = fitV(flavorFit(prof, l.mask));
      if (v <= 0) continue;
      const want = foldM(l.name);
      const same = out.filter((h) => !h.style && h.item !== "" && foldM(h.item) === want);
      if (same.length > 0) {
        // The same line already matched a posted dish: the two kinds of evidence add.
        for (const h of same) {
          if (!h.fam) {
            h.v = 1 - (1 - h.v) * (1 - v);
            h.vw = h.v * seeds[h.seed].rw;
          }
          if (!h.flav) attach(h, l, rid);
        }
        continue;
      }
      // Standing on flavor alone takes a claim the line's own text supports (of a flavor that stands alone: "spicy"
      // is not proven by one hot dish), and a fit that clears the gate.
      const claim = pickClaim(l.claims, aloneOrder);
      if (!claim || v < c.gate) continue;
      // A side, a bread or a starter is not what a place is sent for, nor is a vegetable plate or a wine-bar bite.
      const kinds = lineKinds(rid, l.name);
      if (l.starter || (kinds & KB.starter) !== 0 || SIDE_LINE.test(want) || !mainForm(rid, want)) continue;
      // The line a posted dish of its own kind backs beats a better-fitting one only another kind backs.
      const own = seedsFor(claim.attr, kinds)[0];
      const seed = own ?? citeSeeds[claim.attr][0];
      if (seed === undefined) continue;
      const key = v + (claim.inName ? 0.02 : 0) + (own !== undefined ? 0.25 : 0) - ((kinds & ~KB.starter) === 0 ? 0.2 : 0);
      if (key <= onlyKey) continue;
      onlyKey = key;
      only = {
        seed,
        v,
        vw: v * seeds[seed].rw,
        item: l.name,
        price: l.price,
        term: "flav:only",
        style: false,
        fam: famIdOf(l.name),
        tag: null,
        flav: { attr: claim.attr, claim, seed, only: true, kinds, cross: own === undefined, plant: plantLine(rid, l.name), focus: 1 },
      };
    }
    if (only?.flav) {
      only.flav.focus = focusOf(rid, only.flav.kinds);
      out.push(only);
    }
    return out;
  };

  const byV = (a: Hit, b: Hit) => b.v - a.v;
  const byVw = (a: Hit, b: Hit) => b.vw - a.vw;
  // A place the viewer names in their own captions ("better than Dave's") is one they already have an opinion of:
  // it is not news, so it counts for less.
  const captionWords = new Set<string>();
  for (const p of posts) for (const w of foldM(p.caption ?? "").split(" ")) if (w.length >= 4) captionWords.add(w);
  const nameWords = (name: string): string[] => foldM(name).split(" ").filter((w) => w.length >= 4 && !GENERIC_NAME.has(w));
  const namedInCaption = (name: string): boolean => {
    const w = nameWords(name)[0];
    return w !== undefined && captionWords.has(w);
  };
  const cands: { cand: Cand; M: number; Q: number; D: number; Cc: number; raw: number }[] = [];
  for (const r of restaurants) {
    if (seen.has(r.id) || (r.cuisine && skipped.has(r.cuisine))) continue;
    // The hard quality floor, for every kind of pick: no rating or too few reviews never qualifies, and nothing
    // below it is backfilled to fill the row. (Before the chain check, which is the dearer of the two.)
    if (!passesFloor(r) || seenChains.has(chainKeyM(r))) continue;
    const rid = index.ridIndex.get(r.id);
    let hits = rid === undefined ? [] : (best.get(rid) ?? []);
    if (layer && rid !== undefined) hits = flavorHits(rid, hits);
    // A shop known for its drinks or sweets is not sent to for a glaze: its flavor-only matches are dropped.
    if (hits.some((h) => h.flav?.only) && DRINK_LED.test(foldM(r.cuisine ?? ""))) hits = hits.filter((h) => !h.flav?.only);
    // A place whose profile says it specialises in one of their families is judged on that family alone
    // (a pizzeria is not picked for its bucatini), and a style with no shared dish family says nothing.
    const spec = rid === undefined ? undefined : index.famSpec.get(rid);
    let special = false;
    const specOf = (id: string) => (spec?.get(id) ?? 0) >= (FAMILY_BY_ID.get(id)?.min ?? c.famSpecialist);
    for (const id of seedFams) if (specOf(id)) special = true;
    hits = hits.filter((h) => !h.style && (!special || (h.fam !== undefined && specOf(h.fam))));
    // How good the match is, as itself (the gate), and as the viewer's ratings weigh it (the score).
    const rawHits = hits.slice().sort(byV);
    const r1 = rawHits[0] ?? null;
    const r2 = r1 ? rawHits.find((h) => h.seed !== r1.seed && h.item !== r1.item) : undefined;
    const raw = Math.min(1, (r1?.v ?? 0) + 0.25 * (r2?.v ?? 0));
    const wHits = hits.slice().sort(byVw);
    const h1 = wHits[0] ?? null;
    const h2 = h1 ? wHits.find((h) => h.seed !== h1.seed && h.item !== h1.item) : undefined;
    const M = Math.min(1, (h1?.vw ?? 0) + 0.25 * (h2?.vw ?? 0));
    // The reason names the highest-rated of the dishes that really match.
    const svc = rid === undefined ? "" : (index.service.get(rid) ?? "");
    const barish = svc === "bar" || BAR_PLACE.test(foldM(r.cuisine ?? ""));
    // A bar or a brewpub is not where a dish family is looked for: those matches wait after the first picks, like bar bites.
    const tierOf = (h: Hit): number =>
      seeds[h.seed].kind === DRINK && !h.fam
        ? 2
        : (h.starter && !h.fam) || ((h.fam || h.flav?.only) && (svc === "bar" || svc === "brewery_winery")) || (h.item && barish && BAR_BITE.test(foldM(h.item)))
          ? 1
          : 0;
    // A family match that shares the seed place's style names it best; then the dish they rated highest. A flavor
    // that only travels to another kind of dish names the pick last.
    const nameRank = (h: Hit) => seeds[h.seed].rw + (h.tag ? 0.15 : 0) + (h.flav?.claim ? 0.1 : 0) - (h.flav?.cross ? 1 : 0);
    const real = hits.filter((h) => h.v >= c.gate);
    const named = real.sort((a, b) => tierOf(a) - tierOf(b) || nameRank(b) - nameRank(a) || b.vw - a.vw)[0] ?? h1;
    const shrunk = shrunkRating(r.rating, r.reviewCount, input.ratingMean);
    const Q = shrunk == null ? c.unratedQ : Math.max(0, Math.min(1, (shrunk - 3.8) / 1.2));
    const g = qualityFloor(shrunk, r.rating, r.reviewCount);
    const miles = radius.anchor ? milesBetween(radius.anchor, { lat: r.lat, lng: r.lng }) : null;
    if (miles != null && miles > capMiles) continue;
    const D = miles == null ? 1 : distanceFactor(miles, radius.miles, radius.floor);
    const price = h1?.price ?? (rid === undefined ? null : (index.median.get(rid) ?? null));
    const bonus = budget && price ? budgetPoints(priceFit(price, budget), budget.conf) : 0;
    const Cc = cuisineAffinity(r.cuisine);
    const trust = c.reviewFloor + (1 - c.reviewFloor) * Math.min(1, (r.reviewCount ?? 0) / c.reviewFull);
    let score = g * trust * (100 * (c.wM * M * D + c.wC * Cc * D + c.wQ * Q) + bonus) * (namedInCaption(r.name) ? c.knownShade : 1) * (named?.flav?.only && (named.flav.kinds & ~KB.starter) === 0 ? c.oddShade : 1);
    // A pick that stands on flavor alone is new to them when its cuisine or its dish family is one they have not
    // posted. It is one of the adventurous picks when it is also a sit-down meal of real quality, at a place that
    // does not specialise in something else (a sushi bar is not picked for its burger).
    const cand: Cand = { r, hit: named, score, tier: named ? tierOf(named) : 0 };
    // The same line matched by several of their dishes stands on the one they rated highest.
    if (named && named.item !== "") {
      const line = foldM(named.item);
      let top = seeds[named.seed].rw;
      for (const h of hits) if (!h.style && h.item !== "" && foldM(h.item) === line && seeds[h.seed].rw > top) top = seeds[h.seed].rw;
      cand.rw = top;
    }
    const fl = named?.flav;
    // A family pick whose own line shows their top flavor stands on more than the family alone.
    if (named && fl && !fl.only && fl.claim?.attr === FA.sweetheat) {
      score *= c.heatLed;
      cand.lead = c.heatLed;
      // ... and a little more when the line says it in the words they used for it ("hot honey" on a pie, for a hot honey dish).
      const words = fl.claim.quote ? foldM(fl.claim.quote).split(" ") : [];
      const echoes = (sd: number) => {
        const dish = ` ${foldM(seeds[sd].dish)} `;
        return words.some((w, i) => i > 0 && w.length >= 3 && words[i - 1].length >= 3 && dish.includes(` ${words[i - 1]} ${w} `));
      };
      if (words.length > 1 && (citeSeeds[fl.attr] ?? []).slice(0, c.aloneSeeds + 1).some(echoes)) {
        score *= c.echoShade;
        cand.lead = c.heatLed * c.echoShade;
      }
      cand.score = score;
    }
    if (named && fl?.only) {
      cand.cross = fl.cross;
      // New to them: a cuisine none of their posts is in, or (a flavor that only travels to another kind of dish) a
      // dish family none of their posts is in. A sandwich is no surprise to someone who posts sandwiches.
      const famNew = (fl.kinds & FORM_BITS & postedKinds) === 0;
      const cuisineNew = r.cuisine != null && !DISH_CUISINE.test(foldM(r.cuisine)) && !postedCuisines.has(r.cuisine);
      cand.novel = fl.cross ? famNew : cuisineNew || (named.fam !== undefined && !postedFams.has(named.fam));
      // A flavor in a kind of dish none of theirs is, and not a new family, is an ordinary flavor pick, a little less sure.
      if (fl.cross && !cand.novel) score *= c.crossShade;
      // A one-line wonder on a long menu is not what the place is known for.
      score *= fl.focus;
      cand.score = score;
      const ownForm = (kindsOfName(foldM(named.item)) & fl.kinds & FORM_BITS) !== 0;
      if (cand.novel && !fl.cross && ownForm && cand.tier === 0 && Q >= c.advMinQ && named.v >= c.advMinV && !SIDE_LINE.test(foldM(named.item)) && (!fl.plant || userPlant)) {
        const specs = spec ? [...spec.keys()].filter(specOf) : [];
        cand.advOk = specs.length === 0 || (named.fam !== undefined && specs.includes(named.fam));
      }
    }
    cands.push({ cand, M, Q, D, Cc, raw });
  }

  // A pick that stands on flavor alone belongs to no one posted dish: the per-dish caps do not apply to it.
  const seedOf = (x: Cand) => (x.hit && !x.hit.flav?.only ? x.hit.seed : -1);
  const famOf = (x: Cand): string =>
    x.hit ? (x.hit.fam ?? (x.hit.flav?.only ? "" : (seeds[x.hit.seed].fams[0]?.id ?? ""))) : "";
  // The viewer's own ratings lead the order: a pick from a dish they rated highly outranks a slightly better
  // match from one they rated low, and a bar bite or a drink counts for less than a meal.
  const shade = [1, c.barShade, c.drinkShade];
  // How the viewer rated the dish a pick is weighed by: a flavor reason is shown against their best dish of that
  // flavor and kind, so that is the rating it stands on when it is higher than the dish the match started from.
  const rwOf = (h: Hit): number => {
    const fl = h.flav;
    const top = fl?.claim && !fl.cross ? seedsFor(fl.attr, fl.kinds)[0] : undefined;
    return top === undefined ? seeds[h.seed].rw : Math.max(seeds[h.seed].rw, seeds[top].rw);
  };
  const keyOf = (x: Cand) =>
    x.score *
    (x.hit ? c.orderFloor + (1 - c.orderFloor) * Math.max(x.rw ?? 0, rwOf(x.hit)) ** c.ratingPow : c.orderFloor) *
    shade[x.tier] *
    // A pick that stands on flavor alone comes after the dishes and families they posted; an adventurous one that
    // keeps the form of a dish they posted (and changes the cuisine) comes before one that changes the form too.
    (x.hit?.flav?.only ? c.flavorLedShade : 1) *
    (x.adv && x.hit?.flav && !x.hit.flav.cross ? c.advSameForm : 1);

  const drinkOk = (cand: Cand) =>
    !(cand.hit && !cand.hit.fam && seeds[cand.hit.seed].kind === DRINK && !DRINKY.test(cand.r.cuisine ?? ""));
  const matched = cands
    .filter((x) => x.raw >= c.gate && x.D >= c.minD && x.Q >= c.minQ && drinkOk(x.cand))
    .map((x) => x.cand)
    .sort((a, b) => keyOf(b) - keyOf(a));
  // Below the gate a match says nothing true, so these picks stand on cuisine alone.
  const fallback = cands
    .filter((x) => x.raw < c.gate && x.Cc > 0 && x.cand.r.cuisine && eaten.has(x.cand.r.cuisine))
    .map((x): Cand => ({ ...x.cand, hit: null }))
    .sort((a, b) => b.score - a.score);

  const limit = input.limit ?? c.limit;
  const poolSize = limit * c.poolFactor;
  const out: Cand[] = [];
  const chains = new Set<string>();
  const perCuisine = new Map<string, number>();
  const count = (pred: (x: Cand) => boolean) => out.filter(pred).length;
  const take = (pool: readonly Cand[]) => {
    for (const pass of [1, 2]) {
      for (const cand of pool) {
        if (out.length >= poolSize) return;
        if (out.includes(cand)) continue;
        const ck = chainKeyM(cand.r);
        const cuisine = cand.r.cuisine ?? "";
        if (chains.has(ck) || (perCuisine.get(cuisine) ?? 0) >= c.perCuisine) continue;
        const hit = cand.hit;
        if (hit?.fam) {
          if (count((o) => o.hit?.fam === hit.fam) >= c.poolPerFam) continue;
        } else if (hit && !hit.flav?.only) {
          if (count((o) => o.hit?.seed === hit.seed) >= (pass === 1 ? 1 : c.perSeed)) continue;
          const words = hit.term.split(" ");
          if (count((o) => o.hit != null && o.hit.term.split(" ").some((w) => words.includes(w))) >= c.perSeed) continue;
          if (seeds[hit.seed].kind === DRINK && count((o) => o.hit != null && seeds[o.hit.seed].kind === DRINK) >= c.perDrinks) continue;
        }
        chains.add(ck);
        perCuisine.set(cuisine, (perCuisine.get(cuisine) ?? 0) + 1);
        out.push(cand);
      }
    }
  };
  // A flavor pick in a cuisine or family they have not posted is for the adventurous slots; it waits behind the
  // familiar picks, and only fills the row where there are too few of those.
  // A starter or a sharing plate is not what a place is sent for: such a pick only fills a row nothing else fills.
  const starterLed = (x: Cand) => x.hit?.starter === true && !x.hit.fam;
  const familiar = matched.filter((x) => !x.novel && !starterLed(x));
  const novel = matched.filter((x) => x.novel && !starterLed(x));
  take(familiar);
  take(fallback);
  const taken = out.length;
  // A flavor that only travels to another kind of dish is for the adventurous slots alone.
  take(novel.filter((x) => !x.cross));
  const late = out.splice(taken);
  // Only when nothing else is left may such a pick fill a short row; it then says it is new for them.
  take(novel.filter((x) => x.cross));
  const lateCross = out.splice(taken);
  take(matched.filter(starterLed));
  const lateStarter = out.splice(taken);

  // Best first, but spread out. In the first `top`: only real meal matches, one pick per dish family, no more
  // than `perCuisineTop` of a cuisine, none from a dish twice, none twice in a row. After them the caps relax
  // (two per family) and the bar bites and drinks may come in. A cap yields before it leaves a slot empty.
  const kin = (a: Cand, b: Cand) =>
    a.hit != null && b.hit != null && a.hit.term.split(" ").some((w) => b.hit!.term.split(" ").includes(w));
  const rest = out.slice().sort((a, b) => keyOf(b) - keyOf(a));
  // The adventurous picks: the best of the novel ones, put where `advSlot` says (never in the first three).
  const advN = limit > c.advFirst ? Math.min(c.advMax, Math.floor(limit / 4)) : 0;
  const advGap = Math.max(2, Math.round((limit - c.advFirst) / Math.max(1, advN)));
  // A slot the flavor cap held back is taken late, and the next one then waits a pick: never two in a row.
  let advLast = -2;
  const advSlot = (k: number) => Math.max(c.advFirst + k * advGap, advLast + 2);
  const advs = novel.filter((x) => x.advOk).map((x): Cand => ({ ...x, adv: true }));
  let advPlaced = 0;
  const drop = (list: Cand[], id: string) => {
    const at = list.findIndex((o) => o.r.id === id);
    if (at >= 0) list.splice(at, 1);
  };
  // One flavor-led pick per kind of dish (a hot honey pizza twice is one idea): the lowest main kind of its line.
  const flavorKey = (x: Cand): number => {
    const f = x.hit?.flav;
    if (!f?.claim) return 0;
    const m = f.kinds & FORM_BITS;
    return m & -m;
  };
  const ordered: Cand[] = [];
  while (ordered.length < limit) {
    const pos = ordered.length;
    const top = pos < c.top;
    const prev = ordered[pos - 1];
    const used = (x: Cand) => ordered.filter((o) => seedOf(o) === seedOf(x)).length;
    const meal = (x: Cand) => !top || x.tier === 0;
    const oneFamily = (x: Cand) => {
      const f = famOf(x);
      return f === "" || ordered.filter((o) => famOf(o) === f).length < (top ? c.perFamTop : c.perFam);
    };
    const free = (x: Cand) => seedOf(x) === -1 || used(x) < (top ? c.perSeedTop : c.perSeed);
    const cuisineOk = (x: Cand) => {
      const q = x.r.cuisine ?? "";
      return q === "" || ordered.filter((o) => o.r.cuisine === q).length < (top ? c.perCuisineTop : c.perCuisine);
    };
    const notPrev = (x: Cand) => !prev || seedOf(x) === -1 || seedOf(x) !== seedOf(prev);
    const apart = (x: Cand) => !top || seedOf(x) === -1 || !ordered.some((o) => kin(o, x));
    // Flavor alone does not fill the first row: the rest stand on a dish or a family they posted.
    const flavorCap = (x: Cand) => !top || !x.hit?.flav?.only || ordered.filter((o) => o.hit?.flav?.only).length < c.flavorOnlyTop;
    // A pick that stands on flavor alone is the one kept to a single flavor-led pick per kind of dish; a family pick
    // is let in, and says what it is known for instead when another pick already gives its flavor reason.
    const flavorFam = (x: Cand) => {
      const k = flavorKey(x);
      return k === 0 || !x.hit?.flav?.only || !ordered.some((o) => flavorKey(o) === k);
    };
    // Meat-free swaps do not fill the row for someone who does not post meat-free food.
    const plantCap = (x: Cand) => userPlant || !x.hit?.flav?.plant || ordered.filter((o) => o.hit?.flav?.plant).length < c.plantMax;
    // A family already in the row counts for less, so the next dish family comes before its second pick.
    // The lead a flavor line gave a family pick is for the pick that shows it: a second pick of the kind is weighed without it.
    const worth = (x: Cand) =>
      keyOf(x) /
      (x.lead !== undefined && flavorKey(x) !== 0 && ordered.some((o) => flavorKey(o) === flavorKey(x)) ? x.lead : 1) *
      (famOf(x) !== "" && ordered.some((o) => famOf(o) === famOf(x)) ? c.famRepeat : 1) *
      (seedOf(x) !== -1 && ordered.some((o) => seedOf(o) === seedOf(x)) ? c.seedRepeat : 1);
    /** The index in `list` of the best pick that passes the first `n` rules, or -1. */
    const best1 = (list: readonly Cand[], rules: readonly ((x: Cand) => boolean)[], n: number, also: (x: Cand) => boolean): number => {
      let top1 = -1;
      let at = -1;
      list.forEach((x, i) => {
        if (!also(x) || !rules.slice(0, n).every((rule) => rule(x))) return;
        const v = worth(x);
        if (v > top1) {
          top1 = v;
          at = i;
        }
      });
      return at;
    };
    // An adventurous slot is due once the row reaches it: the best novel pick that fits goes here. The flavor cap
    // never yields (a later slot takes it instead); the family and cuisine spread do, a little, before it waits.
    if (advPlaced < advN && pos >= advSlot(advPlaced) && advs.length > 0) {
      // Never a cuisine another adventurous pick took (three General Tso's are one idea).
      const room = (x: Cand) =>
        !ordered.some((o) => o.r.id === x.r.id || chainKeyM(o.r) === chainKeyM(x.r) || (o.adv === true && o.r.cuisine === x.r.cuisine)) &&
        ordered.filter((o) => o.r.cuisine === x.r.cuisine).length < c.perCuisine;
      // The same kind of flavor-led dish twice is fine only in another cuisine ("change the cuisine, keep the protein").
      const advKind = (x: Cand) => {
        const k = flavorKey(x);
        return k === 0 || !ordered.some((o) => flavorKey(o) === k && o.r.cuisine === x.r.cuisine);
      };
      const advRules = [flavorCap, advKind, oneFamily, cuisineOk];
      let a = -1;
      for (let n = advRules.length; n >= 1 && a < 0; n--) a = best1(advs, advRules, n, room);
      if (a >= 0) {
        const [pick] = advs.splice(a, 1);
        ordered.push(pick);
        advPlaced++;
        advLast = pos;
        drop(rest, pick.r.id);
        drop(late, pick.r.id);
        drop(lateCross, pick.r.id);
        drop(lateStarter, pick.r.id);
        continue;
      }
    }
    // Too few familiar picks left: the novel ones fill the row as the ordinary flavor picks they are.
    if (rest.length === 0 && late.length > 0) rest.push(...late.splice(0));
    if (rest.length === 0 && lateCross.length > 0) rest.push(...lateCross.splice(0));
    if (rest.length === 0 && lateStarter.length > 0) rest.push(...lateStarter.splice(0));
    if (rest.length === 0) break;
    // Most to least worth keeping: drop the last rule first.
    const rules = [meal, plantCap, flavorCap, flavorFam, oneFamily, free, cuisineOk, notPrev, apart];
    let k = -1;
    for (let n = rules.length; n >= 0 && k < 0; n--) k = best1(rest, rules, n, () => true);
    const [pick] = rest.splice(k < 0 ? 0 : k, 1);
    ordered.push(pick);
    drop(advs, pick.r.id);
  }

  // A flavor reason compares the pick to a posted dish that shows the same flavor; spread across the best few
  // of them rather than repeating the one the viewer rated highest.
  const compared = new Map<number, number>();
  /** What a place is known for, in its own words ("Buffalo Wings & Baby Back Ribs"): its first styles and dish types. */
  const knownFor = (rid: number | undefined, famId?: string): string | null => {
    if (rid === undefined) return null;
    const fam = famId ? FAMILY_BY_ID.get(famId) : undefined;
    const head = (t: string) => fold(t).split(" ").pop() ?? "";
    const names: string[] = [];
    for (const x of [...(index.styles.get(rid) ?? []), ...(index.types.get(rid) ?? [])]) {
      const t = x.trim();
      if (!t || /style$/i.test(t) || names.some((n) => fold(n) === fold(t) || head(n) === head(t))) continue;
      names.push(t);
    }
    // The names that are a dish of the place's family come first ("Nashville Hot Chicken" before "Southern").
    const dishy = (t: string) => (fam ? fam.dish.test(fold(t)) || fam.item.test(fold(t)) || fam.profile.test(fold(t)) : false);
    names.sort((a, b) => Number(dishy(b)) - Number(dishy(a)));
    const two = names.slice(0, 2).map(displayDish).join(" & ");
    // A label that would not fit whole gives way to its first name rather than being cut to a fragment.
    const label = two.length > 30 ? displayDish(names[0] ?? "") : two;
    return label || null;
  };
  // The first pick of a kind keeps its flavor reason; a later family pick of the kind gives its family reason instead.
  const flavorSeen = new Set<number>();
  const shownHits = ordered.slice(0, limit).map((x): Hit | null => {
    const k = flavorKey(x);
    if (k === 0 || !x.hit) return x.hit;
    if (!x.hit.flav?.only && flavorSeen.has(k)) return { ...x.hit, flav: undefined };
    flavorSeen.add(k);
    return x.hit;
  });
  return ordered.slice(0, limit).map((x, at) => {
    let hit = shownHits[at];
    const rid = index.ridIndex.get(x.r.id);
    if (hit?.flav?.claim) {
      // Only dishes of the pick's own kind are compared to it (a cross-kind pick may name any of their best).
      const fit = hit.flav.cross ? [] : seedsFor(hit.flav.attr, hit.flav.kinds).slice(0, 4);
      const nearBits = nearKinds(hit.flav.kinds);
      const near = hit.flav.cross ? citeSeeds[hit.flav.attr].filter((sd) => (seedKinds[sd] & nearBits) !== 0).slice(0, 4) : [];
      const pool = fit.length > 0 ? fit : near.length > 0 ? near : citeSeeds[hit.flav.attr].slice(0, hit.flav.cross ? 4 : 1);
      let seed = pool[0] ?? hit.flav.seed;
      for (const s of pool) if ((compared.get(s) ?? 0) < (compared.get(seed) ?? 0)) seed = s;
      compared.set(seed, (compared.get(seed) ?? 0) + 1);
      hit = { ...hit, flav: { ...hit.flav, seed } };
    }
    // A meat-free house says so when the dish it is compared to is not one.
    const shown = hit?.flav?.claim ? hit.flav.seed : hit?.seed;
    const plant = isPlant(rid) && shown !== undefined && !isPlant(seeds[shown]?.rid);
    return {
      restaurant: x.r,
      plateScore: input.plates[x.r.id] ?? null,
      reason: reasonOf(hit, seeds, x.r.cuisine, x.r.name, x.adv === true || x.novel === true, plant, hit?.fam ? knownFor(rid, hit.fam) : null),
    };
  });
}
