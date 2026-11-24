/**
 * Flavor tagger and taste profile for "Your taste".
 *
 * Pure TypeScript with no imports, so a node script can load it too.
 * Ported from the research lexicon (v2.3) with the v2.4 patches:
 *  - choice lists ("your choice of ...", "a, b or c") and side condiments
 *    ("sweet-hot mustard") are capped at grade 1 per match, never in the dish name;
 *  - cuisine adjectives (cajun, szechuan, madras ...) are grade-1 hints that never
 *    derive sweet heat;
 *  - captions go through a praise-slang stoplist and are capped at grade 1.
 *
 * Every dish is packed into one 31-bit mask:
 *   bits 0-19  two bits per attribute (0 none, 1 implied, 2 explicit)
 *   bit 20     dessert (clears sweet and sweetheat)
 *   bits 21-24 explicit evidence sits in the dish NAME (spicy, sweetheat, smoky, crispy)
 *   bit 25     at least one match was demoted by the choice-list / condiment rule
 */

export const FLAVOR_V = "2.4";

export const FLAVOR_ATTRS = [
  "spicy",
  "sweet",
  "sweetheat",
  "smoky",
  "charred",
  "tangy",
  "fruity",
  "crispy",
  "umami",
  "creamy",
] as const;
export type FlavorAttr = (typeof FLAVOR_ATTRS)[number];
export const N_FLAVOR = FLAVOR_ATTRS.length;
export const FA = {
  spicy: 0,
  sweet: 1,
  sweetheat: 2,
  smoky: 3,
  charred: 4,
  tangy: 5,
  fruity: 6,
  crispy: 7,
  umami: 8,
  creamy: 9,
} as const;
const ATTR_INDEX: Record<string, number> = FA;

export const BIT_DESSERT = 1 << 20;
export const BIT_DEMOTED = 1 << 25;
const NAME_BIT: Record<number, number> = {
  [FA.spicy]: 1 << 21,
  [FA.sweetheat]: 1 << 22,
  [FA.smoky]: 1 << 23,
  [FA.crispy]: 1 << 24,
};
const NAME_BITS = (1 << 21) | (1 << 22) | (1 << 23) | (1 << 24);

/** Grade (0, 1 or 2) of attribute `a` in a packed mask. */
export function gradeOf(mask: number, a: number): number {
  return (mask >> (2 * a)) & 3;
}
/** True when explicit evidence for `a` is in the dish name (only spicy, sweetheat, smoky, crispy are recorded). */
export function nameEvidence(mask: number, a: number): boolean {
  const b = NAME_BIT[a];
  return b !== undefined && (mask & b) !== 0;
}
/** Bit that is set exactly when attribute `a` is at grade 2. */
export function hiBit(a: number): number {
  return 1 << (2 * a + 1);
}

/** The research text normaliser: fold accents, lowercase, "&" to "and", drop symbols, hyphens to spaces. */
function fold(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function norm(s: string | null | undefined): string {
  return fold(s)
    .replace(/&/g, " and ")
    .replace(/[’`]/g, "'")
    .replace(/[®™*]/g, "")
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SIDE_SECTION = /\b(sides?|extras?|add ?ons?|toppings?|condiments?|kids?|dips?|sauces?)\b/;
const SIDE_NAME = /^(side|extra|add|additional|sub|substitute|no |upgrade)\b|\bside of\b/;
const DRINK_SECTION =
  /drink|beverage|coffee|tea\b|espresso|smoothie|juice|refresher|latte|beer|wine|cocktail|soda|shake|bar menu/;
const DRINK_NAME =
  /\b(latte|matcha|refresher|coffee|tea|lemonade|smoothie|cold brew|espresso|cappuccino|juice|mocha|americano|soda|agua fresca|horchata|wine|ipa|lager|stout|cabernet|merlot|chardonnay|pinot|syrah|sauvignon|prosecco|champagne|slush|slushie|icee|icy|lassi|shake|spritzer|mojito|margarita|martini|sangria|kombucha|boba|bubble tea|milk tea|frappe|hot chocolate|cider|punch|soda|coke|pepsi|sprite|fanta|dr\.? pepper|7 ?up|root beer|ginger ale|jarritos|milk|water)\b/;

/** Menu rows the tagger skips (sides, extras, add-ons). */
export function flavorEligible(name: string, section: string | null | undefined): boolean {
  const sec = fold(section);
  const n = fold(name);
  return !!n && !SIDE_SECTION.test(sec) && !SIDE_NAME.test(n);
}

interface Rule {
  attr: string;
  g: number;
  id: string;
  src: string;
  scope?: string;
  noNeg?: boolean;
  nod?: boolean;
  cuis?: boolean;
  veto?: string;
}

// The lexicon. Boundaries are added by the compiler below: (?<![a-z0-9]) ... (?![a-z0-9]).
// scope: both (default) | name (a dish-name hit only) | drink | food. noNeg skips the negation check.
// nod: counts for the attribute but never feeds derived sweet heat. cuis: skipped for Asian-cuisine places.
const RULES: Rule[] = [
  /* ------------------------------ SPICY ------------------------------ */
  { attr: "spicy", g: 2, id: "spicy-word", src: "spicy|spicier|spiciest|picante|picoso|muy picante" },
  { attr: "spicy", g: 2, id: "hot-compound", src: "hot sauce|hot wings?|hot chicken|hot links?|hot peppers?|hot chil(?:i|e|li)s?|hot oil|hot mustard|hot italian|extra hot|super hot|very hot|really hot|hot and sour|hot sour|hot spicy|hot salsa|hot buffalo|nashville hot|hot cheetos?|flamin|takis|hot honey" },
  { attr: "spicy", g: 2, id: "devil", src: "diablo|diabla|diavola|diavolo|fra diavolo|arrabbiata|arrabiata|peperoncino|devil(?:'?s)? (?:sauce|chicken|shrimp|wings)" },
  { attr: "spicy", g: 2, id: "buffalo", src: "buffalo (?:sauce|chicken|wings?|style|cauliflower|ranch|blue|bleu|shrimp|tenders?|bites?|fries|dip|hot|chick|crunch|bomb|ranch|cheesesteak|cheese steak|mac|pizza|sandwich|wrap|salad|burger|tots|nachos|popcorn)|buffalo(?= (?:with|and|ranch|sauce))|buffalo(?! mozzarella| mozz| bison| milk| steak| jerky| grass| wild wings)" },
  { attr: "spicy", g: 2, id: "nashville", src: "nashville|prince'?s hot" },
  { attr: "spicy", g: 2, id: "hot-peppers", src: "habaneros?|ghost peppers?|ghost chil(?:i|e|li)|scorpion peppers?|carolina reaper|serranos?|chiles? de arbol|arbol|thai chil(?:i|e|li)s?|bird'?s? ?eye|scotch bonnets?|cayenne|piri piri|peri peri|piripiri|periperi" },
  { attr: "spicy", g: 2, id: "asian-heat", src: "sriracha|siracha|gochujang|gochugaru|sambal|harissa|chil(?:i|e|li) crisp|chil(?:i|e|li) oil|chil(?:i|e|li) paste|chil(?:i|e|li) garlic|chil(?:i|e|li) flakes?|chil(?:i|e|li) crunch|mapo|ma po|dan dan|chongqing|nduja|calabrian|firecracker|fire cracker|inferno|fiery|hellfire|aguachile|salsa macha|vindaloo|phall|jerk|pad kra pao|pad kee mao|drunken noodles?|bun bo hue" },
  { attr: "spicy", g: 2, id: "heat-phrase", src: "(?:sweet|spicy|little|some|bit of|touch of|kick of|good|real|medium|mild|with a|nice) (?:heat|kick)|heat level|spice level|with a kick|has a kick" },
  { attr: "spicy", g: 1, id: "jalapeno", src: "jalapenos?|jalapeno poppers?|peppadews?" },
  { attr: "spicy", g: 1, id: "chipotle", src: "chipotles?|tinga" },
  { attr: "spicy", g: 1, id: "flakes", src: "crushed red pepper|red pepper flakes|pepper flakes|aleppo|chile flakes?|chili flakes?|dynamite|tom yum|chil(?:i|e|li) sauce|mala" },
  { attr: "spicy", g: 1, id: "chile-qualified", src: "(?:red|green|hot|dried|fresh|roasted|sliced|crispy|fried|candied|fresno|spicy) chil(?:i|e|li)(?:es|s)?|chil(?:i|e|li) (?:lime|mayo|aioli|pepper|peppers|glaze|jam|honey|vinaigrette|dressing|butter|seasoning|spice|dip)|chil(?:i|e|li)es|chilli|chillies|tajin|chamoy" },
  { attr: "spicy", g: 1, id: "cajun", src: "cajun|creole|blackened|andouille|kung pao|kung po|szechuan|sichuan|szechwan|schezwan|general tso'?s?|tso'?s|tso" },
  { attr: "spicy", g: 1, id: "kimchi", src: "kimchi|kimchee|tteokbokki|topokki|tteok bokki|jalfrezi|chettinad|madras|larb|laab|som tam|khao soi|red curry|green curry|panang|penang curry|jungle curry" },
  { attr: "spicy", g: 1, id: "thai-papaya", src: "tum mak|tum thai|tum lao|papaya salad|berbere|awaze|zilzil|doro wat|doro wot" },
  { attr: "spicy", g: 1, id: "heat-choice", src: "(?:mild|medium|med|hot|extra hot|atomic|suicide) ?(?:,|/|or|and|\\|) ?(?:mild|medium|med|hot|extra hot|spicy|atomic|suicide)", noNeg: true },

  /* ------------------------------ SWEET (savory-sweet and sweet drinks; desserts get the dessert flag instead) ------------------------------ */
  { attr: "sweet", g: 2, id: "honey", src: "honey(?! (?:wheat|oat|grain|bun|buns|bread|nut cheerios|dew|comb tripe|roll|rolls|whole))|miel" },
  { attr: "sweet", g: 2, id: "maple", src: "maple|maple syrup" },
  { attr: "sweet", g: 2, id: "sweet-word", src: "sweet(?:ened|ness)?(?! (?:gem|shrimp|ebi|tooth|spot|potato|potatoes|corn|onion|onions|pea|peas|basil|peppers?|italian|bell|vermouth|bread|breads|breadth|bean|beans|cheese|hawaiian roll|plantain-?chips))" },
  { attr: "sweet", g: 2, id: "sweet-sauces", src: "teriyaki|sweet soy|kecap manis|sweet chil(?:i|e|li)|sweet and sour|sweet sour|bang bang|candied|praline|pralines|brown sugar|piloncillo|orange chicken|honey walnut|sesame chicken|mongolian (?:beef|chicken|lamb)|general tso'?s?|tso'?s|jam|jelly|marmalade|chutney|compote|cranberry sauce" },
  { attr: "sweet", g: 2, id: "eel", nod: true, src: "eel sauce|unagi sauce|kabayaki|sweet sauce" },
  { attr: "sweet", g: 1, id: "glaze", src: "glaze|glazed|glazing|char siu|hoisin|plum sauce|duck sauce|tonkatsu sauce|katsu sauce|balsamic reduction|balsamic glaze|reduction|bbq sauce|barbecue sauce|barbeque sauce|bbq glaze|sweet baby ray'?s?|carolina gold|agave|syrup|powdered sugar|sugar(?! ?cane)|sugared|cranberr(?:y|ies)|raisins?|currants?|dried fruit|sticky (?:wings|ribs|chicken|glaze|sauce|toffee|buns?)|lacquered" },
  { attr: "sweet", g: 1, id: "fruit-sauce", src: "(?:mango|pineapple|peach|apricot|cherry|raspberry|blueberry|strawberry|blackberry|fig|apple|pear|orange|guava|passion fruit|papaya) (?:glaze|sauce|jam|chutney|compote|reduction|vinaigrette|salsa|bbq|habanero|chipotle|dressing|relish|slaw)|fruit salsa|mango salsa|pineapple salsa" },
  { attr: "sweet", g: 1, id: "sweet-breakfast", src: "french toast|pancakes?|waffles?|crepes?|dutch baby|cinnamon toast|hawaiian pizza|hawaiiana|hawaiana|hawaiian bbq|ham and pineapple|pineapple|mango|peach", scope: "food" },
  { attr: "sweet", g: 1, id: "sweet-drink", src: "caramel|vanilla|hazelnut|mocha|toffee|butterscotch|horchata|boba|bubble tea|milk tea|chai|lavender|thai tea|jamaica|limeade|oreo|oreos|cookies and cream|cookies n cream|slush|slushie|icee|creme brulee|bibingka|ube|pandan|jarritos|mexican coke|coke|pepsi|sprite|fanta|dr.? pepper|7 ?up|root beer|ginger ale|mountain dew|squirt|orange soda|cream soda|green apple|watermelon|melon|cantaloupe|passion fruit|lychee|guava|kiwi|lemonade|frappe|frappuccino|marshmallow|whipped cream|nutella|chocolate|cocoa|dulce de leche|dulce|condensed milk|brown sugar|banana|strawberry|mango|peach|raspberry|blueberry|pineapple|coconut|cinnamon|pistachio|taro|honey|smoothie|refresher|refreshers|syrup", scope: "drink" },

  /* ------------------------------ SWEET-HEAT (explicit combos) ------------------------------ */
  { attr: "sweetheat", g: 2, id: "sweetheat-explicit", src: "hot honey|sweet heat|sweet and spicy|sweet spicy|spicy sweet|sweet and hot|hot and sweet|sweet hot|bang bang|honey sriracha|honey siracha|honey habanero|mango habanero|honey chipotle|honey jalapeno|honey buffalo|honey hot|spicy honey|agridulce|pepper jelly|jalapeno jelly|candied jalapenos?|yangnyeom|korean fried chicken|general tso'?s?|tso'?s|mike'?s hot honey|mikes hot honey|habanero (?:honey|mango|peach|pineapple|jam)|pineapple habanero|peach habanero|mango chil(?:i|e|li)|mango chamoy|chamoy|honey gochujang|gochujang (?:honey|caramel)|sriracha honey|sriracha glaze|sweet n spicy|sweet n hot" },

  /* ------------------------------ SMOKY ------------------------------ */
  { attr: "smoky", g: 2, id: "smoke-word", src: "smoked|smoke|smokey|smoky|smokehouse|mesquite|hickory|applewood|apple wood|cherrywood|cherry wood|pit smoked|pit beef|hot smoked|cold smoked|pastrami|burnt ends?|texas style bbq" },
  { attr: "smoky", g: 1, id: "brisket", veto: "pho|noodles?|soup|korean|kbbq|hot ?pot|ramen|stew|corned|kalbi|bulgogi|tendon|tripe|flank|vietnamese|bun bo", src: "brisket" },
  { attr: "smoky", g: 1, id: "smoke-mild", src: "pulled pork|pulled chicken|pulled beef|chipotles?|carolina style|kansas city" },
  { attr: "smoky", g: 1, id: "bbq", cuis: true, src: "(?<!korean )(?<!mongolian )(?<!k )(?<!hawaiian )(?<!japanese )(?<!hoisin )(?<!chinese )(?<!asian )(?<!thai )(?<!vietnamese )(?<!cantonese )(?<!taiwanese )bbq|(?<!korean )(?<!mongolian )(?<!japanese )barbecue|(?<!korean )(?<!mongolian )barbeque|bar b q|baby back|spare ?ribs?|st\\.? louis ribs?|pork ribs|beef ribs|rib tips?|full rack|half rack|rack of ribs|(?<!short )(?<!prime )(?<!kalbi )(?<!galbi )(?<!korean )ribs" },
  { attr: "charred", g: 1, id: "char", src: "charred|char grilled|chargrilled|char broiled|charbroiled|flame grilled|flame broiled|fire roasted|fire grilled|wood grilled|campfire" },
  { attr: "smoky", g: 1, id: "cured-smoke", src: "lox|mezcal|smoked paprika|speck|ham hocks?|andouille" },

  /* ------------------------------ TANGY ------------------------------ */
  { attr: "tangy", g: 2, id: "sour", src: "tangy|tart|sour(?! cream| dough|dough)|sourness|citrusy|citrus|pomelo|grapefruit|yuzu|ponzu|calamansi|tamarind|tamarindo|sumac|ceviche|aguachile|vinegar|vinegary|pickled|escabeche|curtido|sauerkraut|kimchi|hot and sour|sweet and sour|sour mix|key lime|vinaigrette" },
  { attr: "tangy", g: 1, id: "tang-mild", src: "lemon(?!ade)|lemony|lime(?!ade)|tomatillo|salsa verde|pickles?|pickled onions?|cornichons?|capers?|buttermilk|balsamic|limeade|lemonade|refreshers?|kombucha|pepperoncini|banana peppers?|giardiniera|tzatziki|margarita" },

  /* ------------------------------ FRUITY ------------------------------ */
  { attr: "fruity", g: 2, id: "fruit", src: "banana|bananas|strawberr(?:y|ies)|mango|mangos|mangoes|pineapple|peach|peaches|raspberr(?:y|ies)|blueberr(?:y|ies)|blackberr(?:y|ies)|berry|berries|cherry|cherries|passion ?fruit|guava|lychee|watermelon|melon|cantaloupe|honeydew|grapefruit|orange|oranges|tangerine|mandarin|apple|apples|pear|pears|coconut(?! milk| rice| curry| cream)|papaya|pomegranate|kiwi|tropical|fruity|apricot|plum|acai|dragon ?fruit|jackfruit|grape|grapes|cranberr(?:y|ies)|citrus|yuzu|fig|figs" },
  { attr: "fruity", g: 1, id: "fruit-generic", src: "fruit|fruits" },

  /* ------------------------------ CRISPY ------------------------------ */
  { attr: "crispy", g: 2, id: "crisp-word", src: "crispy|crisp|crispier|crunchy|crunch|crunchwrap|tempura|breaded|battered|katsu|tonkatsu|schnitzel|panko|chicharrons?|chicharrones|fritters?|fried chicken|chicken fried|deep fried|double fried|flash fried|golden fried|crisped|fried (?:calamari|fish|shrimp|pickles|oysters|green tomatoes|cauliflower|zucchini|mozzarella|cheese|onion|okra|clams|squid|tofu|catfish|pork|chicken|artichoke|brussels|avocado|ravioli)|pan fried|fish and chips|corn dogs?|onion rings?|taquitos?|flautas?|chimichangas?|tostadas?" },
  { attr: "crispy", g: 1, id: "crisp-implied", src: "wings?|tenders?|nuggets?|fingers?|strips?|popcorn chicken|(?<!stir )(?<!pan )fried(?! rice| egg| eggs| noodles| noodle| bean| beans)|fry|fries|tots|calamari|egg ?rolls?|spring rolls?|lumpia|samosas?|empanadas?|churros?|poppers?|croquettes?|arancini|falafel|nachos", scope: "name" },

  /* ------------------------------ UMAMI ------------------------------ */
  { attr: "umami", g: 2, id: "umami-strong", src: "miso|koji|dashi|bonito|katsuobushi|shoyu|tamari|soy sauce|soy glaze|soy marinated|soy garlic|soy ginger|fish sauce|nam pla|oyster sauce|worcestershire|anchovy|anchovies|umami|truffle|truffled|demi ?glace|tonkotsu|bone broth|doenjang|doubanjiang|xo sauce|black garlic|furikake|yakitori|teriyaki|bulgogi|galbi|kalbi|gochujang|hoisin|char siu" },
  { attr: "umami", g: 1, id: "umami-mild", src: "soy|parmesan|parmigiano|parmigiano reggiano|pecorino|grana padano|mushrooms?|shiitake|porcini|cremini|portobello|seaweed|nori|kimchi|pho|ramen|udon|broth|gravy" },

  /* ------------------------------ CREAMY / RICH ------------------------------ */
  { attr: "creamy", g: 2, id: "creamy", src: "creamy|cream sauce|alfredo|bechamel|cheese sauce|queso|cheddar sauce|burrata|ricotta|mascarpone|vodka sauce|carbonara|bisque|chowder|hollandaise|fondue|mac and cheese|mac n cheese|truffle cream|cream of|cheese curds?" },
  { attr: "creamy", g: 1, id: "creamy-mild", src: "ranch|aioli|mayo|mayonnaise|crema|cream cheese|whipped|hummus|tahini|goat cheese|brie|gouda|gorgonzola|blue cheese dressing|bleu cheese dressing|cheesy|melted cheese" },
];

// Negation: tested on the text window right before a match (cut at . ; ! ?).
const NEG = /(?:^|\b)(?:not|non|no|never|without|w o|hold the|hold|omit|minus|free of|isn'?t|isnt|doesn'?t|zero|less|lacks?|skip)(?:\s+(?:too|very|so|overly|really|that|the|any|extra|added|a))?(?:\s+[a-z']+){0,2}\s*$|\bnon$|-free\s*$|\bfree of\s*$/;
// Followed-by negation: "sugar free", "spice free".
const NEG_AFTER = /^\s*(?:free|less|not|optional|on the side|on side)\b/;
// Option / add-on phrasing: the term is on offer, not part of the dish.
const OPT = /\b(?:add|adds|extra|optional|upgrade|sub|substitute|make it|make em|can be|can add|can make|upon request|on request|ask for|available with|plus|add on|addon|swap|instead of|or make|side of|dipping|for an additional|for additional)\b(?:\s+[a-z']+){0,3}\s*$|\+\s*\$?[0-9.]*\s*(?:[a-z']+\s*){0,3}$/;

// Dessert category.
const DESSERT_SECTION = /dessert|sweets?\b|pastr(?:y|ies)|bakery|bake shop|ice cream|gelato|gelateria|donut|doughnut|cookies?|cakes?|cupcakes?|sundaes?|frozen yogurt|froyo|churros?|treats?|bread pudding|candy|shave ice|bingsu|sweet treats|baked goods|paletas|helado|waffle cones?/;
const DESSERT_NAME = /\b(?:(?<!rice )(?<!crab )(?<!fish )(?<!potato )(?<!salmon )(?<!tuna )(?<!shrimp )(?<!corn )(?<!lobster )cakes?|chocolate chip|oreo|crumb|(?:chocolate|almond|raspberry|apple|berry|cinnamon|strawberry|blueberry) (?:croissant|bun|twist)|cheesecakes?|cupcakes?|cookies?|brownies?|ice cream|gelato|sundaes?|donuts?|doughnuts?|churros?|flan|tiramisu|puddings?|cannoli|baklava|eclairs?|macarons?|macaroons?|mochi|cobbler|crumble|fudge|candy|sorbet|popsicles?|paletas?|banana split|beignets?|danish|cinnamon rolls?|pastry|pastries|muffins?|scones?|tres leches|sticky toffee|creme brulee|panna cotta|affogato|milkshakes?|(?:apple|cherry|pumpkin|pecan|key lime|lemon meringue|blueberry|peach|banana cream|chocolate|coconut cream|berry|strawberry|s'?mores?|mud|cream|sweet potato|cookie dough) pie|sopapillas?|funnel cake|bonbons?|turron|alfajor|conchas?|pan dulce|tarts?)\b/;

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

const B0 = "(?<![a-z0-9])";
const B1 = "(?![a-z0-9])";

interface Group {
  attr: number;
  g: number;
  scope: string;
  cuis: boolean;
  noNeg: boolean;
  nod: boolean;
  veto: RegExp | null;
  re: RegExp;
}
const COMPILED: Group[] = (() => {
  const by = new Map<string, { r: Rule; srcs: string[] }>();
  for (const r of RULES) {
    const key = [r.attr, r.g, r.scope ?? "both", r.noNeg ? 1 : 0, r.nod ? 1 : 0, r.cuis ? 1 : 0, r.veto ?? ""].join("|");
    let e = by.get(key);
    if (!e) by.set(key, (e = { r, srcs: [] }));
    e.srcs.push("(?:" + r.src + ")");
  }
  return [...by.values()].map(({ r, srcs }) => ({
    attr: ATTR_INDEX[r.attr],
    g: r.g,
    scope: r.scope ?? "both",
    cuis: !!r.cuis,
    noNeg: !!r.noNeg,
    nod: !!r.nod,
    veto: r.veto ? new RegExp(r.veto) : null,
    re: new RegExp(B0 + "(?:" + srcs.join("|") + ")" + B1, "g"),
  }));
})();

// A sweet-heat word that sits in a side or dip ("served with", "side of", "dipping"), not on the dish itself.
// A bare "with" or "and" is a topping ("pizza turned up with Mike's Hot Honey"), so it does not demote on its own.
const SERVED =
  /(?:served|comes|come|side of|side|dipping|dip)\s+(?:with\s+|w\s+)?(?:a |an |our |house |homemade |side of |dipping |your choice of )*$|(?:with|w|and)\s+(?:a |an |our |house |homemade )*(?:side of|dipping)\s+$/;
// "a little kick", "touch of heat", "mild heat": the phrase itself says it is slight.
const MILD_HIT = /^(?:little|bit of|touch of|some|mild|medium)\s/;
// Matches that name a sweetener or a cuisine rather than a taste: they never feed derived sweet heat.
const NODW =
  /^(?:teriyaki|jam|jelly|marmalade|chutney|compote|candied|brown sugar|cranberry sauce|sweet soy|kecap manis|sugar|sweetened|sweet|glaze|glazed|glazes|katsu sauce|char siu|bbq sauce|waffle|waffles|orange sauce|spice level|heat level|spice levels|crepe|crepes|cajun|creole|szechuan|sichuan|szechwan|schezwan|madras)$/;
const CHOICE_BETWEEN = /(?:^|\s)(?:or|choice|choose|select|pick)(?:\s|$)/;
const CHOICE_PRE = /(?:^|[\s(,])(?:choice of|choose|select|pick|options?|your choice|or)(?:\s|$)[^.;]{0,40}$/;
const MILD = /(?:mildly|mild|slightly|lightly|a little|a bit|little|touch of|hint of|medium)\s*$/;
// v2.4: a list of options on offer, so a flavor inside it is one choice among several.
const CHOICE =
  /\b(choice of|choose|your favou?rite|pick your|select|options?|your pick|available in|flavors?:|sauces?:)\b|\b(?:or)\s+\w+[\w\s-]{0,18}\)|,\s*(?:or)\s/i;
// v2.4: a heat or sweet word that is only a side condiment ("sweet-hot mustard").
const CONDIMENT = /^\s*(?:(?:hot|spicy|sweet)[\s-]+)?(?:mustard|ketchup|mayo|mayonnaise|relish)\b/;
const CONDIMENT_END = /(?:mustard|ketchup|mayo|mayonnaise|relish)$/;

export interface FlavorEv {
  attr: number;
  g: number;
  /** The matched span, folded (lowercase, accents and symbols gone). */
  text: string;
  inName: boolean;
  demoted: boolean;
  /** True for the sweet-heat evidence `tag` derives from a sweet word next to a heat word (grade 1). */
  derived?: boolean;
}

interface SpanHit {
  pos: number;
  end: number;
  g: number;
}

/** Core tagger. `desc` is cut to 160 characters like the dish index does. */
function tag(
  name: string,
  desc: string | null | undefined,
  section: string | null | undefined,
  asian: boolean,
  ev: FlavorEv[] | null,
  captionMode = false,
): number {
  const n = norm(name);
  const d = norm(desc ? desc.slice(0, 160) : "");
  if (!n && !d) return 0;
  const text = d ? n + " . " + d : n;
  const sec = fold(section);
  const drink = DRINK_SECTION.test(sec) || DRINK_NAME.test(n);
  const choice = d ? CHOICE.test(text) : false;
  const acc = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const nameHit = [false, false, false, false, false, false, false, false, false, false];
  let demotedAny = false;
  let sweetHits: SpanHit[] | null = null;
  let spicyHits: SpanHit[] | null = null;
  for (let gi = 0; gi < COMPILED.length; gi++) {
    const g = COMPILED[gi];
    if (g.scope === "drink" && !drink) continue;
    if (g.scope === "food" && drink) continue;
    if (g.cuis && asian) continue;
    if (g.veto && g.veto.test(text)) continue;
    const re = g.re;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const hit = m[0];
      if (hit.length === 0) {
        re.lastIndex++;
        continue;
      }
      const inName = m.index < n.length;
      if (g.scope === "name" && !inName) continue;
      const pre = text.slice(Math.max(0, m.index - 34), m.index).split(/[.;!?|]/).pop() as string;
      const post = text.slice(m.index + hit.length, m.index + hit.length + 14);
      if (!g.noNeg && (NEG.test(pre) || NEG_AFTER.test(post))) continue;
      if (OPT.test(pre)) continue;
      let gr = g.g;
      let demoted = false;
      if (g.attr === FA.spicy && gr > 1 && (MILD.test(pre) || MILD_HIT.test(hit))) gr = 1;
      if (g.attr === FA.sweetheat && gr > 1 && !inName && SERVED.test(pre)) gr = 1;
      if (gr > 1 && !inName && (g.attr === FA.spicy || g.attr === FA.sweetheat || g.attr === FA.sweet)) {
        if (choice || CONDIMENT.test(post) || CONDIMENT_END.test(hit)) {
          gr = 1;
          demoted = true;
          demotedAny = true;
        }
      }
      if (captionMode && gr > 1) gr = 1;
      if (acc[g.attr] < gr) acc[g.attr] = gr;
      if (gr === 2 && inName) nameHit[g.attr] = true;
      if (!g.nod && !NODW.test(hit)) {
        if (g.attr === FA.sweet) (sweetHits ??= []).push({ pos: m.index, end: m.index + hit.length, g: gr });
        else if (g.attr === FA.spicy) (spicyHits ??= []).push({ pos: m.index, end: m.index + hit.length, g: gr });
      }
      if (ev) ev.push({ attr: g.attr, g: gr, text: hit, inName, demoted });
    }
  }
  let mask = 0;
  const dessert = !drink && (DESSERT_SECTION.test(sec) || DESSERT_NAME.test(n));
  if (dessert) {
    mask |= BIT_DESSERT;
    acc[FA.sweet] = 0;
    acc[FA.sweetheat] = 0;
  } else if (!drink) {
    if (!acc[FA.sweetheat] && sweetHits && spicyHits) {
      outer: for (const a of sweetHits) {
        for (const b of spicyHits) {
          const lo = Math.min(a.end, b.end);
          const hi = Math.max(a.pos, b.pos);
          const between = hi > lo ? text.slice(lo, hi) : "";
          if (
            Math.abs(a.pos - b.pos) <= 36 &&
            a.g + b.g >= 3 &&
            !/[.;,|:()]/.test(between) &&
            !CHOICE_BETWEEN.test(between) &&
            !CHOICE_PRE.test(text.slice(Math.max(0, Math.min(a.pos, b.pos) - 45), Math.min(a.pos, b.pos)))
          ) {
            acc[FA.sweetheat] = 1;
            if (ev) {
              const lo2 = Math.min(a.pos, b.pos);
              const hi2 = Math.max(a.end, b.end);
              ev.push({
                attr: FA.sweetheat,
                g: 1,
                text: text.slice(lo2, hi2),
                inName: hi2 <= n.length,
                demoted: false,
                derived: true,
              });
            }
            break outer;
          }
        }
      }
    }
    if (acc[FA.sweetheat]) {
      if (acc[FA.sweet] < 1) acc[FA.sweet] = 1;
      if (acc[FA.spicy] < 1) acc[FA.spicy] = 1;
    }
  }
  for (let a = 0; a < N_FLAVOR; a++) {
    if (!acc[a]) continue;
    mask |= acc[a] << (2 * a);
    const b = NAME_BIT[a];
    if (b && nameHit[a] && acc[a] === 2) mask |= b;
  }
  if (demotedAny) mask |= BIT_DEMOTED;
  return mask;
}

/**
 * Tag one dish. `asian` is true when the restaurant's main cuisine is Asian (the plain
 * "BBQ" smoky rule is skipped there: Korean BBQ is not smoke).
 */
export function tagDish(
  name: string,
  desc: string | null | undefined,
  section: string | null | undefined,
  asian = false,
): number {
  return tag(name, desc, section, asian, null);
}

/** Same as tagDish but also returns every match that counted, for claim checking and tests. */
export function tagDishEv(
  name: string,
  desc: string | null | undefined,
  section: string | null | undefined,
  asian = false,
): { mask: number; ev: FlavorEv[] } {
  const ev: FlavorEv[] = [];
  const mask = tag(name, desc, section, asian, ev);
  return { mask, ev };
}

/** Tag a place-level text (summary, dish types, styles): no dish name, so nothing counts as name evidence. */
export function tagText(text: string | null | undefined, asian = false): number {
  return tag("", text, "", asian, null);
}

// Praise slang is not a taste ("fire", "gas", "slay"): dropped from captions before tagging.
const SLANG =
  /(?<![a-z])(?:fire|fiyah|fiery|inferno|hellfire|firecracker|flamin\w*|dynamite|gas|slaps?|slay\w*|bomb|killer|banger|insane|crazy|sick)(?![a-z])/gi;

/**
 * Tag a caption the user wrote. Only the stoplist-cleaned text is tagged, every grade is capped
 * at 1 and nothing counts as name evidence: a caption can nudge a profile but never anchor it
 * or back a claim.
 */
export function tagCaption(caption: string | null | undefined, asian = false): number {
  const c = (caption ?? "").trim();
  if (!c) return 0;
  const m = tag("", c.replace(SLANG, " "), "", asian, null, true);
  return m & ~(BIT_DEMOTED | NAME_BITS);
}

// A caption that says the dish let the poster down. Such a post is a weak model of "what they like".
const SOUR =
  /\b(?:nothing (?:special|worth|to (?:write|rave|brag))|not worth|meh|bland|disappoint\w*|underwhelm\w*|mediocre|overpriced|forgettable|tasteless|soggy|stale|too (?:dry|greasy|salty|sweet|bland)|overcooked|undercooked|skip (?:it|this)|pass on|wouldn'?t (?:order|get|recommend|go back)|won'?t (?:order|get|be back|go back)|not (?:great|good|impressed|my (?:thing|favou?rite))|didn'?t (?:love|like|enjoy)|average|ok at best|okay at best|waste of)\b/i;

/** True when the poster's caption is a complaint ("Nothing worth raving over", "bland", "wouldn't order again"). */
export function captionSours(caption: string | null | undefined): boolean {
  const c = (caption ?? "").trim();
  return c.length > 0 && SOUR.test(c.replace(/[‘’]/g, "'"));
}

/** Per-attribute max of two masks' grades; the dessert flag is kept if either has it. */
export function mergeMasks(a: number, b: number): number {
  let out = (a | b) & (BIT_DESSERT | BIT_DEMOTED | NAME_BITS);
  for (let i = 0; i < N_FLAVOR; i++) {
    const g = Math.max(gradeOf(a, i), gradeOf(b, i));
    if (g) out |= g << (2 * i);
  }
  return out;
}

// ---------------------------------------------------------------------------
// User flavor profile
// ---------------------------------------------------------------------------

export interface FlavorSeed {
  /** Caller's id for the seed (returned in seedsByAttr). */
  id: number;
  /** Packed flavor of the dish the user rated (menu text, sibling rows and caption merged). */
  mask: number;
  /** How much this post counts as a like, 0..1 (scaled from its signed evidence, tasteEvidence.ts). */
  pw: number;
  /** 0.5 when the rating is not about the food (vibe Value, Service, Ambiance), else 1. */
  c: number;
  /** Recency weight (120 day half-life, floored). */
  r: number;
  rating: number;
}

export interface FlavorConfig {
  K: number;
  anchorBeta: number;
  anchorMinPosts: number;
  spreadMin: number;
  /** Weight every seed gets when their ratings barely differ. */
  flatWeight: number;
}

export interface FlavorProfile {
  /** ln-lift of the user's mix against the corpus, per attribute, clamped to +-1.2. */
  beta: number[];
  /** |beta| */
  norm: number;
  /** Attributes the user reliably likes that are rare enough to steer picks. */
  anchors: number[];
  /** Seed ids carrying the attribute at grade 2, highest weight first. */
  seedsByAttr: number[][];
  /** Final weight per seed id. */
  weight: Map<number, number>;
  /** Total weight of the seeds that fed the profile. */
  W: number;
  /** The anchors' grade-2 bits: a candidate needs one of these to be a flavor hit. */
  anchorBits: number;
}

export function buildFlavorProfile(
  seeds: FlavorSeed[],
  base: ArrayLike<number>,
  cfg: FlavorConfig,
): FlavorProfile {
  const beta = new Array<number>(N_FLAVOR).fill(0);
  const seedsByAttr: number[][] = Array.from({ length: N_FLAVOR }, () => []);
  const weight = new Map<number, number>();
  const none: FlavorProfile = { beta, norm: 0, anchors: [], seedsByAttr, weight, W: 0, anchorBits: 0 };
  if (!seeds.length) return none;
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of seeds) {
    if (s.rating < lo) lo = s.rating;
    if (s.rating > hi) hi = s.rating;
  }
  const flat = hi - lo < cfg.spreadMin;
  const w = seeds.map((s) => (flat ? cfg.flatWeight : s.pw) * s.c * s.r);
  let W = 0;
  for (let i = 0; i < seeds.length; i++) {
    W += w[i];
    weight.set(seeds[i].id, w[i]);
  }
  if (W <= 0) return none;
  const anchors: number[] = [];
  let anchorBits = 0;
  for (let a = 0; a < N_FLAVOR; a++) {
    const b = Math.max(base[a] ?? 0, 0.002);
    let s = 0;
    const carry: number[] = [];
    for (let i = 0; i < seeds.length; i++) {
      const g = gradeOf(seeds[i].mask, a);
      if (!g) continue;
      s += (w[i] * g) / 2;
      if (g === 2) carry.push(i);
    }
    let be = Math.log((s + cfg.K * b) / (W + cfg.K) / b);
    be = Math.max(-1.2, Math.min(1.2, be));
    if (W * b < 2 && be < -0.25) be = -0.25;
    beta[a] = be;
    carry.sort((x, y) => w[y] - w[x]);
    seedsByAttr[a] = carry.map((i) => seeds[i].id);
    // Plain "sweet" only anchors on posts that are sweet without being sweet heat: a viewer whose sweet dishes are
    // all hot honey and sweet chili likes sweet heat, not eel sauce or teriyaki, and sweet heat already says it.
    const n2 =
      a === FA.sweet ? carry.filter((i) => gradeOf(seeds[i].mask, FA.sweetheat) !== 2).length : carry.length;
    if (be >= cfg.anchorBeta && n2 >= cfg.anchorMinPosts && (b <= 0.1 || (be >= 0.8 && n2 >= 3))) {
      anchors.push(a);
      anchorBits |= hiBit(a);
    }
  }
  let sq = 0;
  for (const v of beta) sq += v * v;
  return { beta, norm: Math.sqrt(sq), anchors, seedsByAttr, weight, W, anchorBits };
}

/** Raw flavor fit of one packed dish against a profile, in [-1, 1]. */
export function flavorFit(p: FlavorProfile, mask: number): number {
  if (p.norm <= 0) return 0;
  let dot = 0;
  let xn = 0;
  for (let a = 0; a < N_FLAVOR; a++) {
    const g = (mask >> (2 * a)) & 3;
    if (!g) continue;
    const x = g / 2;
    dot += p.beta[a] * x;
    xn += x * x;
  }
  return dot / (p.norm * Math.max(Math.sqrt(xn), 1.2));
}

/**
 * The anchor attribute a dish carries at grade 2 (the strongest by beta, sweet heat first on ties),
 * or -1 when it carries none or is a dessert.
 */
export function anchorAttr(p: FlavorProfile, mask: number): number {
  if (!(mask & p.anchorBits) || mask & BIT_DESSERT) return -1;
  let best = -1;
  let bv = -Infinity;
  for (const a of p.anchors) {
    if (!(mask & hiBit(a))) continue;
    const v = p.beta[a] + (a === FA.sweetheat ? 0.001 : 0);
    if (v > bv) {
      bv = v;
      best = a;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Claims: what a reason may say about a candidate, from the candidate's own text
// ---------------------------------------------------------------------------

export interface FlavorClaim {
  attr: number;
  /** Words for the reason ("sweet heat", "spicy", "smoky", "crispy", "sweet"). */
  label: string;
  /** Verbatim span from the description (<= 28 chars), or null when the dish name shows it or the span is just the label. */
  quote: string | null;
  inName: boolean;
}

const LABEL: Record<number, string> = {
  [FA.sweetheat]: "sweet heat",
  [FA.spicy]: "spicy",
  [FA.smoky]: "smoky",
  [FA.crispy]: "crispy",
  [FA.sweet]: "sweet",
};
const ECHO = /^(?:spicy|sweet heat|smoky|smoked|crispy|sweet|sweet and spicy)$/;

/**
 * Re-derive evidence from the candidate's own name, description and section and return the first
 * claimable attribute in `prefer` order, or null. Only sweet heat, spicy, smoky (grade 2), crispy
 * (dish name only) and sweet (food, not dessert, grade 2) are ever claimable. Choice-list and
 * condiment matches, negations and grade 1 inference never claim.
 */
export function claimFor(
  name: string,
  desc: string | null | undefined,
  section: string | null | undefined,
  asian: boolean,
  prefer: number[],
): FlavorClaim | null {
  return pickClaim(claimsOf(name, desc, section, asian), prefer);
}

/** The first of `claims` whose attribute comes earliest in `prefer`, or null. */
export function pickClaim(claims: readonly FlavorClaim[], prefer: readonly number[]): FlavorClaim | null {
  for (const a of prefer) {
    const c = claims.find((x) => x.attr === a);
    if (c) return c;
  }
  return null;
}

const CLAIM_ORDER = [FA.sweetheat, FA.spicy, FA.smoky, FA.crispy, FA.sweet] as const;
const CLAIM_BITS = hiBit(FA.sweetheat) | hiBit(FA.spicy) | hiBit(FA.smoky) | hiBit(FA.sweet) | NAME_BIT[FA.crispy];

/** Cheap pre-check on a packed mask: false means `claimsOf` cannot return anything. */
export function maybeClaimable(mask: number): boolean {
  return (mask & CLAIM_BITS) !== 0 && (mask & BIT_DESSERT) === 0;
}

/** Every attribute a reason may claim for this dish, each with the evidence that backs it. */
export function claimsOf(
  name: string,
  desc: string | null | undefined,
  section: string | null | undefined,
  asian: boolean,
): FlavorClaim[] {
  const { mask, ev } = tagDishEv(name, desc, section, asian);
  if (mask & BIT_DESSERT) return [];
  if (DRINK_SECTION.test(fold(section)) || DRINK_NAME.test(norm(name))) return [];
  const out: FlavorClaim[] = [];
  for (const a of CLAIM_ORDER) {
    const label = LABEL[a];
    if (a === FA.sweetheat && gradeOf(mask, a) === 1) {
      // Derived sweet heat ("habanero maple", "gochujang bbq"): a sweet word and a heat word side by side in the
      // dish's own text. The span is quoted when it is short enough to read as a name.
      const d = ev.find((e) => e.derived && e.attr === a);
      if (d) {
        const shown = d.text.trim();
        out.push({
          attr: a,
          label,
          quote: d.inName || shown.length > 28 || ECHO.test(shown) ? null : shown,
          inName: d.inName,
        });
      }
      continue;
    }
    if (gradeOf(mask, a) !== 2 && !(a === FA.crispy && nameEvidence(mask, a))) continue;
    const good = ev.filter((e) => e.attr === a && e.g === 2 && !e.demoted);
    if (!good.length) continue;
    if (good.some((e) => e.inName)) {
      out.push({ attr: a, label, quote: null, inName: true });
      continue;
    }
    if (a === FA.crispy) continue;
    const e = good.find((x) => x.text.length <= 28);
    if (!e) continue;
    out.push({ attr: a, label, quote: ECHO.test(e.text) ? null : e.text, inName: false });
  }
  return out;
}
