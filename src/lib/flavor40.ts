/**
 * The 40-axis flavor map: a richer, hidden picture of a place and of a person, used only to re-weigh the
 * "For me" picks for accounts on `isFlavor40User` (lib/forMeGate.ts). Pure TypeScript, no I/O, no model calls:
 * every grade comes from menu text, the cuisine label, the price band and the weekly hours, with lexicons in the
 * style of lib/flavor.ts (which this reuses for the ten flavors it already grades).
 *
 * PLACES have 40 axes (12 core + 28 finer). PEOPLE have the 12 core axes from their first post; a finer axis
 * unlocks for a person once at least 3 of their rated places grade strongly on it AND its parent core axis has
 * been touched by enough of their posts (`F40.unlockPosts`). Until then a finer axis only repeats its parent.
 *
 * Nothing here is ever sent to a client or stored. The person's profile is built inside the ranking from their
 * own posts (signed evidence from lib/tasteEvidence.ts) and thrown away with the request.
 */
import { FA, gradeOf, BIT_DESSERT } from "@/lib/flavor";

/* ---------- the axes ---------- */

type AxisDef = { id: string; label: string; parent: string | null; bipolar?: boolean };

/** Core first (index 0..11), then the finer 28. `parent` is the core axis a finer axis hangs off. */
export const AXES: readonly AxisDef[] = [
  { id: "indulgent", label: "indulgent vs light", parent: null, bipolar: true },
  { id: "adventurous", label: "adventurous", parent: null },
  { id: "spicy", label: "spicy heat", parent: null },
  { id: "sweet", label: "sweet", parent: null },
  { id: "sour", label: "sour / tangy", parent: null },
  { id: "umami", label: "umami / savory", parent: null },
  { id: "rich", label: "rich / creamy", parent: null },
  { id: "smoky", label: "smoky / charred", parent: null },
  { id: "crispy", label: "crispy / fried", parent: null },
  { id: "meat", label: "meat vs plants", parent: null, bipolar: true },
  { id: "seafood", label: "seafood", parent: null },
  { id: "price", label: "price tier", parent: null },
  // finer
  { id: "sweetheat", label: "sweet-heat", parent: "spicy" },
  { id: "dessert", label: "dessert lover", parent: "sweet" },
  { id: "citrus", label: "citrus", parent: "sour" },
  { id: "funky", label: "fermented / funky", parent: "sour" },
  { id: "earthy", label: "earthy (mushroom, truffle)", parent: "umami" },
  { id: "allium", label: "garlic and onion", parent: "umami" },
  { id: "salty", label: "salty", parent: "umami" },
  { id: "cheese", label: "cheese", parent: "rich" },
  { id: "creamsauce", label: "creamy sauces", parent: "rich" },
  { id: "lowslow", label: "smoky low-and-slow", parent: "smoky" },
  { id: "grilled", label: "charred grill / wood-fire", parent: "smoky" },
  { id: "crunchfresh", label: "crunchy-fresh", parent: "crispy" },
  { id: "redmeat", label: "red meat", parent: "meat" },
  { id: "poultry", label: "poultry", parent: "meat" },
  { id: "offal", label: "adventurous cuts", parent: "meat" },
  { id: "rawfish", label: "raw fish", parent: "seafood" },
  { id: "bitter", label: "bitter", parent: "adventurous" },
  { id: "warmspice", label: "warm spice", parent: "adventurous" },
  { id: "herbs", label: "fresh herbs", parent: "adventurous" },
  { id: "traditional", label: "traditional vs fusion", parent: "adventurous", bipolar: true },
  { id: "brothy", label: "brothy", parent: "indulgent" },
  { id: "chewy", label: "chewy", parent: "umami" },
  { id: "braised", label: "braised / tender", parent: "rich" },
  { id: "carbs", label: "carb-heavy", parent: "indulgent" },
  { id: "plated", label: "casual vs plated", parent: "price", bipolar: true },
  { id: "value", label: "value / portion", parent: "price" },
  { id: "drinks", label: "coffee and drinks", parent: "sweet" },
  { id: "brunch", label: "brunch", parent: "indulgent" },
  { id: "latenight", label: "late-night", parent: "indulgent" },
];
export const N_AXES = AXES.length; // 40
export const N_CORE = 12;
const A = Object.fromEntries(AXES.map((a, i) => [a.id, i])) as Record<string, number>;
/** Parent core index of each axis (a core axis is its own parent). */
export const PARENT: readonly number[] = AXES.map((a, i) => (a.parent === null ? i : A[a.parent]));
const BIPOLAR: readonly boolean[] = AXES.map((a) => a.bipolar === true);

export const F40 = {
  /** How strongly the 40-axis fit moves a pick's score: score x (1 + weight x fit), fit in [-1, 1]. */
  weight: 0.3,
  /** Pseudo-posts that shrink every axis of a person toward neutral. */
  shrinkPosts: 5,
  /** Effective posts on the parent core axis before one of its finer axes may unlock. */
  unlockPosts: 5,
  /** Rated places that must grade strongly on a finer axis to unlock it. */
  unlockPlaces: 3,
  /** A grade this high counts as "strongly". */
  strong: 0.5,
  /** Weight of an unlocked finer axis in the match, against 1 for a core axis. */
  finerWeight: 0.6,
  /** The share of a post's grade that comes from its named dish (the rest from its place). */
  dishShare: 0.4,
  /** Scale of the dot product that maps to fit = tanh(1). */
  fitScale: 0.7,
  /** A place with fewer menu lines than this is left out of the population stats. */
  statMinItems: 8,
};

/* ---------- item lexicon ---------- */

type Rule = { axis: number; re: RegExp; w: number };
const R = (id: string, re: RegExp, w = 1): Rule => ({ axis: A[id], re, w });

const INDULGENT = /\b(fried|deep fried|bacon|cheese|cheesy|creamy|cream|butter|buttery|loaded|stuffed|smothered|melted|burger|fries|nachos|mac|brisket|ribs?|pork belly|carnitas|chicharron|gravy|alfredo|carbonara|tempura|fritters?|donuts?|doughnuts?|cheesecake|brownie|chocolate|caramel|ice cream|sundae|milkshake|poutine|short rib|foie|truffle|burrata|fondue|bbq|barbecue|queso|cheddar|mozzarella|battered|breaded|parmesan|wings?|pizza|sausage)\b/;
const LIGHT = /\b(salads?|greens|steamed|poached|broth|ceviche|sashimi|poke|crudo|vegetables?|veggies?|veggie|fresh|lettuce wraps?|summer rolls?|cucumber|edamame|tofu|light|lean|zucchini|spinach|kale|avocado|quinoa|tataki|carpaccio|hummus|tabbouleh|gazpacho|yogurt|fruit|acai|detox|miso soup|grilled (?:fish|chicken|shrimp|salmon|vegetables?)|pho|aguachile|herbs?)\b/;

const ADV_STRONG = /\b(offal|tripe|tongue|lengua|tendon|intestines?|liver|kidney|sweetbreads?|bone marrow|oxtail|trotters?|sea urchin|uni|jellyfish|sea cucumber|abalone|natto|stinky|durian|century egg|blood|balut|frog|snails?|escargot|rabbit|goat|gizzards?|injera|kitfo|tibs|jollof|fufu|huitlacoche|chapulines|menudo|laksa|rendang|larb|tom yum|som tam|vindaloo|chaat|momo|mapo|chicken feet|cow foot|sesos|buche|cabeza|tagine|lomo saltado|aji amarillo|rocoto|anticuchos?|kimchi|haggis|moussaka|dolma|labneh|sumac|harissa|berbere|sambal|belacan|bitter melon|tamarind)\b/;
const ADV_MILD = /\b(birria|pozole|mole|tlayuda|sopes?|pupusas?|arepas?|empanadas?|shawarma|falafel|kebab|kofta|bulgogi|bibimbap|banh mi|bun bo|pad kra|green curry|panang|massaman|tikka|biryani|dosa|idli|paneer|samosa|hot pot|xiao long|dim sum|congee|dan dan|szechuan|sichuan|char siu|poi|kalua|loco moco|lomi|ceviche|octopus|squid|eel|unagi|roe|ikura|tobiko|plantains?|chimichurri|gochujang|tonkatsu|okonomiyaki|takoyaki|gyoza|tteokbokki|jjigae)\b/;

const SOUR = /\b(vinegar|pickled|pickles?|lime|lemon|citrus|sour|tart|tamarind|kimchi|yuzu|ponzu|escabeche|chimichurri|vinaigrette|tangy|sauerkraut|tom yum|ceviche|chamoy|calamansi|limon|sumac|kombucha)\b/;
const CITRUS = /\b(lime|lemon|orange|citrus|yuzu|grapefruit|calamansi|limon|ponzu|key lime|zest|citrusy|mandarin|tangerine|lemonade)\b/;
const FUNKY = /\b(kimchi|kimchee|fermented|pickled|sauerkraut|natto|miso|fish sauce|shrimp paste|blue cheese|gorgonzola|stinky|funky|aged|cured|anchov(?:y|ies)|kombucha|sourdough|tempeh|doenjang|gochujang|preserved|salted fish|pickles?|belacan|bagoong|nam pla|sharp)\b/;
const UMAMI = /\b(miso|soy|mushrooms?|parmesan|truffle|dashi|bone broth|tonkotsu|ramen|anchov\w*|fish sauce|oyster sauce|worcestershire|seaweed|nori|bacon|aged|umami|shoyu|teriyaki|bulgogi|gravy|demi|braised|bbq|barbecue|beef|steak|brisket|roasted|savory)\b/;
const EARTHY = /\b(mushrooms?|truffles?|porcini|shiitake|portobello|morels?|chanterelles?|beets?|lentils?|earthy|sage|burdock|barley|farro|polenta|sunchokes?|chestnuts?|wild rice|oyster mushroom|enoki|cremini)\b/;
const ALLIUM = /\b(garlic|garlicky|onions?|scallions?|shallots?|chives?|leeks?|aioli|scampi|ajo|cebolla|green onions?|toum|al ajillo|ramps?)\b/;
const SALTY = /\b(salty|salted|cured|prosciutto|jamon|salami|pancetta|bacon|olives?|capers?|anchov\w*|feta|halloumi|pecorino|parmesan|soy|pickled|brined|jerky|lox|smoked salmon|pretzel|chips|fries|ham|corned beef|pastrami|sausage|chorizo|bottarga|caviar|furikake|roe|cotija)\b/;
const RICH = /\b(cream|creamy|butter|buttery|cheese|alfredo|bechamel|gravy|queso|mascarpone|foie|marrow|aioli|mayo|hollandaise|fondue|carbonara|burrata|ricotta|custard|brioche|coconut milk|bisque|chowder|gratin|rich|decadent|indulgent|velvety|truffle|short rib|pork belly|crema)\b/;
const CHEESE = /\b(cheese|cheesy|mozzarella|cheddar|parmesan|parm|gouda|brie|provolone|queso|feta|gorgonzola|fontina|gruyere|ricotta|burrata|pecorino|manchego|jack|swiss|goat cheese|halloumi|paneer|fondue|quesadillas?|mac and cheese|cream cheese|raclette|asiago|cotija|oaxaca|melted)\b/;
const CREAMSAUCE = /\b(cream|creamy|alfredo|bechamel|bisque|chowder|gravy|aioli|mayo|hollandaise|ranch|carbonara|vodka sauce|butter sauce|beurre|cream sauce|coconut cream|coconut milk|tikka masala|korma|makhani|tzatziki|queso|crema|mornay|veloute|mascarpone|custard|chipotle mayo|garlic sauce|tahini|bearnaise|cheese sauce|white sauce)\b/;
const LOWSLOW = /\b(smoked|smokehouse|brisket|pulled pork|bbq|barbecue|barbeque|pit|burnt ends|hickory|mesquite|applewood|low and slow|ribs|pastrami|smoky|chipotle|jerky|house smoked|pit smoked)\b/;
const GRILLED = /\b(grilled|char grilled|charred|chargrilled|wood fired|wood grilled|flame grilled|fire roasted|seared|blackened|broiled|asada|yakitori|robata|tandoori|tandoor|kebabs?|skewers?|al pastor|spit|rotisserie|hibachi|teppanyaki|binchotan|flame|brick oven|stone fired|wood oven)\b/;
const CRISPY = /\b(crispy|crunchy|fried|battered|tempura|crisp|katsu|panko|breaded|fritters?|chips|tostadas?|fries|crackers?|chicharron|wings?|schnitzel|tonkatsu|karaage|golden|tenders?|nuggets|rings|calamari|pakoras?|samosas?|egg rolls?|spring rolls?|crunch|flautas|taquitos|chimichangas?)\b/;
const CRUNCHFRESH = /\b(crunchy|crunch|slaw|cucumbers?|radish\w*|jicama|apples?|celery|sprouts|fresh vegetables?|raw vegetables?|cabbage|lettuce|romaine|crudit\w*|salads?|nuts?|peanuts?|almonds?|sesame seeds|fennel|snap peas?|water chestnuts?|julienne|shredded|bean sprouts|croutons?|granola|pickled vegetables?|carrots?|bell peppers?|spring rolls?|summer rolls?|vermicelli)\b/;
const MEAT = /\b(beef|steak|pork|chicken|lamb|bacon|sausage|ham|turkey|duck|brisket|ribs?|carne|carnitas|pollo|asada|pastrami|salami|prosciutto|meatballs?|burger|patty|hot dog|veal|goat|chorizo|short rib|wings?|filet|ribeye|sirloin|pepperoni|bulgogi|kalbi|gyro|shawarma|al pastor|barbacoa|oxtail|tripe|tongue|liver|meat|cutlet|katsu|chop|tenderloin)\b/;
const PLANT = /\b(vegan|vegetarian|veggie|plant based|tofu|tempeh|seitan|falafel|hummus|beyond|impossible|jackfruit|mushrooms?|eggplant|cauliflower|chickpeas?|lentils?|quinoa|salads?|vegetables?|beans?|avocado|spinach|kale|paneer|portobello|zucchini|tabbouleh|edamame|veg)\b/;
const SEAFOOD = /\b(fish|salmon|tuna|shrimp|prawns?|crab|lobster|oysters?|clams?|mussels?|scallops?|squid|calamari|octopus|cod|halibut|mahi|snapper|sea bass|ahi|yellowtail|hamachi|eel|uni|seafood|ceviche|sushi|sashimi|poke|fish and chips|lox|anchov\w*|sardines?|swordfish|tilapia|branzino|trout|crawfish|crayfish|langoustine|abalone|roe|caviar|fish tacos?|baja|rockfish|barramundi|unagi|nigiri|maki)\b/;
const RAWFISH = /\b(sushi|sashimi|poke|ceviche|crudo|nigiri|tartare|tataki|carpaccio|raw|hamachi|ahi|toro|maki|hand rolls?|temaki|chirashi|aguachile|oysters?|uni|tiradito|kampachi|spicy tuna|california roll|omakase|raw bar|kinilaw|cut roll|salmon roll|tuna roll)\b/;
const SWEET = /\b(sweet|honey|maple|caramel|glazed|syrup|sugar|chocolate|candied|cinnamon roll|frosting|jam|teriyaki|hoisin|brown sugar|molasses|agave|nutella|fudge|condensed milk|boba|milk tea|donuts?|doughnuts?|cake|pie|pastry|cookies?|mango|pineapple|berries|strawberry|banana|coconut)\b/;
const DESSERT = /\b(dessert|cakes?|cheesecake|ice cream|gelato|sundae|brownie|cookies?|pies?|tart|churros?|flan|tiramisu|pastry|pastries|donuts?|doughnuts?|cupcakes?|macarons?|mochi|pudding|panna cotta|crepes?|cannoli|waffle|baklava|halo halo|affogato|sorbet|shave ice|funnel cake|creme brulee|cobbler|truffles|sweet treat|baked alaska|sticky toffee|beignets?|tres leches|alfajor)\b/;
const POULTRY = /\b(chicken|turkey|duck|pollo|wings?|hen|poultry|rotisserie|quail|cornish|goose|tenders?|nuggets|karaage|yakitori|tandoori chicken|popcorn chicken)\b/;
const REDMEAT = /\b(beef|steak|brisket|ribs?|lamb|burger|patty|carne|asada|ribeye|filet|sirloin|short rib|veal|pastrami|bulgogi|kalbi|barbacoa|meatballs?|prime rib|tri tip|flank|skirt|new york strip|oxtail|venison|bison|goat|gyro|birria|roast beef|pot roast|cheeseburger|hot dog|sausage|chorizo|pepperoni|pork|ham|carnitas|bacon)\b/;
const OFFAL = /\b(offal|tripe|tongue|lengua|tendon|intestines?|liver|kidney|beef heart|chicken hearts?|sweetbreads?|bone marrow|marrow|oxtail|trotters?|pig feet|chicken feet|gizzards?|menudo|cabeza|tripas|chitterlings|blood sausage|haggis|foie|cheeks?|cachetes|pig skin|chicharron|duck tongue|stomach|cow foot|sesos|buche|morcilla|black pudding)\b/;
const BITTER = /\b(bitter|bitter melon|radicchio|arugula|endive|dandelion|chicory|kale|broccoli rabe|rapini|campari|aperol|espresso|coffee|dark chocolate|cacao|grapefruit|escarole|frisee|matcha|hops?|ipa|tonic|amaro|mustard greens|collards?|brussels sprouts?|artichokes?|walnuts?|olives?|burnt|negroni|gai lan|kailan|bok choy|radish)\b/;
const WARMSPICE = /\b(cumin|cardamom|cinnamon|cloves?|coriander|turmeric|curry|masala|garam|nutmeg|allspice|star anise|five spice|saffron|ras el hanout|baharat|berbere|za'?atar|sumac|tikka|korma|biryani|tagine|chai|ginger|paprika|achiote|annatto|jerk|adobo|tandoori|vindaloo|moroccan|harissa|caraway|fenugreek|shawarma|gyro|mole)\b/;
const HERBS = /\b(cilantro|basil|mint|parsley|dill|thai basil|herbs?|tarragon|oregano|rosemary|thyme|chimichurri|pesto|lemongrass|shiso|perilla|culantro|microgreens|salsa verde|gremolata|green goddess|tabbouleh|herbed|fresh herbs|chives)\b/;
const FUSION = /\b(fusion|korean style|asian style|sriracha mayo|spicy mayo|truffle fries|wasabi aioli|sushi burritos?|birria (?:ramen|pizza|egg rolls?)|ramen burger|pho tacos?|bao burger|poke (?:nachos|burrito|tacos?|bowl)|crunch roll|dragon roll|rainbow roll|philly roll|mango habanero|hot cheetos?|takis|flamin|elote fries|kimchi (?:fries|tacos?|quesadilla|burger)|californian?|cali)\b/;
const TRADITIONAL = /\b(traditional|authentic|classic|homemade|house made|handmade|hand pulled|family recipe|old school|nonna|abuela|original|regional|heritage|stone ground|from scratch|slow cooked|ancestral|artisan|artisanal)\b/;
const BROTHY = /\b(pho|ramen|soups?|broth|bone broth|tonkotsu|stew|caldo|menudo|pozole|udon|laksa|tom yum|tom kha|hot pot|congee|jook|chowder|bisque|consomme|bouillabaisse|miso soup|wonton soup|sinigang|bun bo|hu tieu|sopa|gumbo|minestrone|chili|dashi|shabu|sukiyaki|tteokbokki|jjigae)\b/;
const CHEWY = /\b(chewy|noodles?|udon|mochi|dumplings?|gnocchi|tteok\w*|rice cake|pasta|dough|bao|steamed bun|pretzel|bagel|boba|tapioca|squid|octopus|calamari|jerky|tendon|gyoza|potstickers?|wontons?|lo mein|chow mein|pad thai|ramen|biang|hand pulled|focaccia|sourdough|naan|abalone|scallion pancake|dango|neapolitan)\b/;
const BRAISED = /\b(braised|slow cooked|slow roasted|slow braised|stewed|tender|fall off the bone|pot roast|short rib|pulled|carnitas|barbacoa|birria|osso buco|confit|cochinita|tagine|rendang|adobo|oxtail|shank|pork belly|brisket|ropa vieja|simmered|casserole|cassoulet|ragu|bolognese|lamb shank|caldo|chile verde|guisado|pernil|lechon|mole|red braised|dong po|lu rou|melt in)\b/;
const CARBS = /\b(pasta|noodles?|rice|bread|pizza|burritos?|fries|potato|potatoes|sandwich|sub|hoagie|bagel|toast|pancakes?|waffles?|french toast|gnocchi|risotto|lasagna|spaghetti|fettuccine|penne|mac|ramen|udon|pad thai|fried rice|lo mein|chow mein|dumplings?|naan|tortilla|tacos?|quesadilla|empanadas?|arepas?|pupusas?|bun|biscuits?|cornbread|ravioli|pierogi|tamales?|wrap|pie|pastry|croissant|donuts?|churros?)\b/;
const PLATED_UP = /\b(tasting|prix fixe|chef'?s|seasonal|confit|reduction|foie|jus|beurre|crudo|tartare|amuse|pan seared|entree|filet mignon|wagyu|caviar|truffle|rack of|duo|trio|medallion|gastrique|veloute|compote|puree|emulsion|foam|shaved|microgreens|bearnaise|prime)\b/;
const CASUAL_DOWN = /\b(combo|burritos?|tacos?|burgers?|sandwich(?:es)?|slices?|wings?|nachos|fries|hot dogs?|subs?|wraps?|plate lunch|kids|quesadillas?|tortas?|nuggets|tenders|basket|breakfast burrito|by the slice|value meal)\b/;
const VALUE = /\b(family|large|xl|jumbo|giant|feeds|for 2|for two|for 4|for four|for the table|platter|combo|bottomless|all you can|ayce|unlimited|double|triple|half pound|\d+ ?oz|\d+ ?lbs?|party|sharing|huge|mega|monster|sampler|bucket|tray|special|lunch special|deal|two for|dozen|extra large)\b/;
const DRINKS = /\b(coffee|latte|espresso|cappuccino|tea|boba|matcha|smoothies?|juices?|cocktails?|beer|wine|margaritas?|mimosas?|sangria|kombucha|soda|lemonade|horchata|milkshakes?|shakes?|cold brew|mocha|chai|frappe|mojito|whiskey|sake|ipa|spritz|mule|old fashioned|bubble tea|agua fresca|aguas?)\b/;
const BRUNCH = /\b(eggs?|benedict|pancakes?|waffles?|french toast|omelet\w*|omelette|brunch|hash|breakfast|mimosas?|bloody mary|chilaquiles|huevos|avocado toast|granola|biscuits and gravy|bagels?|scrambles?|frittata|quiche|shakshuka|croissants?|oatmeal|crepes?|lox|muffins?|scones?)\b/;

/** One rule per axis the existing ten-flavor mask does not already cover (those are read from the mask below). */
const RULES: readonly Rule[] = [
  R("indulgent", INDULGENT, 1),
  R("indulgent", LIGHT, -1),
  R("adventurous", ADV_STRONG, 1),
  R("adventurous", ADV_MILD, 0.4),
  R("sour", SOUR, 0.8),
  R("citrus", CITRUS),
  R("funky", FUNKY),
  R("umami", UMAMI, 0.6),
  R("earthy", EARTHY),
  R("allium", ALLIUM),
  R("salty", SALTY),
  R("rich", RICH, 0.8),
  R("cheese", CHEESE),
  R("creamsauce", CREAMSAUCE),
  R("lowslow", LOWSLOW),
  R("grilled", GRILLED),
  R("crispy", CRISPY, 0.8),
  R("crunchfresh", CRUNCHFRESH),
  R("meat", MEAT, 1),
  R("meat", PLANT, -1),
  R("seafood", SEAFOOD),
  R("rawfish", RAWFISH),
  R("sweet", SWEET, 0.6),
  R("dessert", DESSERT),
  R("redmeat", REDMEAT),
  R("poultry", POULTRY),
  R("offal", OFFAL),
  R("bitter", BITTER),
  R("warmspice", WARMSPICE),
  R("herbs", HERBS),
  R("traditional", FUSION, -1),
  R("traditional", TRADITIONAL, 1),
  R("brothy", BROTHY),
  R("chewy", CHEWY),
  R("braised", BRAISED),
  R("carbs", CARBS),
  R("plated", PLATED_UP, 1),
  R("plated", CASUAL_DOWN, -1),
  R("value", VALUE),
  R("brunch", BRUNCH),
];
const DRINK_RULE = R("drinks", DRINKS);

/**
 * Adds one menu line's grades to `acc[base .. base + 40)`.
 * `text` is the folded name and description; `mask` the line's packed flavor (lib/flavor.ts); `drink` is the
 * index's own food/drink call. A drink line only feeds the drinks axis.
 */
export function gradeItemInto(
  acc: Float32Array,
  base: number,
  text: string,
  mask: number,
  section: string,
  drink: boolean,
): void {
  if (drink) {
    if (DRINK_RULE.re.test(text)) acc[base + DRINK_RULE.axis] += 1;
    return;
  }
  if (/dessert|sweets|bakery|pastr/.test(section)) acc[base + A.dessert] += 1;
  for (const r of RULES) if (r.re.test(text)) acc[base + r.axis] += r.w;
  // The flavors the existing grader already reads, with its context rules (choice lists, side condiments).
  const sp = gradeOf(mask, FA.spicy);
  if (sp) acc[base + A.spicy] += sp / 2;
  const sh = gradeOf(mask, FA.sweetheat);
  if (sh) acc[base + A.sweetheat] += sh / 2;
  const sw = gradeOf(mask, FA.sweet);
  if (sw) acc[base + A.sweet] += sw / 2;
  if (mask & BIT_DESSERT) acc[base + A.dessert] += 1;
  const sm = gradeOf(mask, FA.smoky);
  if (sm) acc[base + A.lowslow] += sm / 2;
  const ch = gradeOf(mask, FA.charred);
  if (ch) acc[base + A.grilled] += ch / 2;
  const tg = gradeOf(mask, FA.tangy);
  if (tg) acc[base + A.sour] += tg / 2;
  const cr = gradeOf(mask, FA.crispy);
  if (cr) acc[base + A.crispy] += cr / 2;
  const um = gradeOf(mask, FA.umami);
  if (um) acc[base + A.umami] += um / 2;
  const cm = gradeOf(mask, FA.creamy);
  if (cm) acc[base + A.rich] += cm / 2;
}

/** What a full menu share maps to 1.0 (a place where this share of the lines say it is "all the way"). */
const SAT: readonly number[] = (() => {
  const s = new Array<number>(N_AXES).fill(0.25);
  const set = (id: string, v: number) => (s[A[id]] = v);
  set("indulgent", 0.35);
  set("adventurous", 0.12);
  set("spicy", 0.3);
  set("sweet", 0.3);
  set("sour", 0.2);
  set("umami", 0.4);
  set("rich", 0.3);
  set("crispy", 0.3);
  set("meat", 0.5);
  set("seafood", 0.3);
  set("sweetheat", 0.12);
  set("dessert", 0.3);
  set("citrus", 0.15);
  set("funky", 0.1);
  set("earthy", 0.12);
  set("allium", 0.15);
  set("salty", 0.3);
  set("cheese", 0.3);
  set("creamsauce", 0.2);
  set("lowslow", 0.2);
  set("grilled", 0.25);
  set("crunchfresh", 0.25);
  set("redmeat", 0.35);
  set("poultry", 0.3);
  set("offal", 0.05);
  set("rawfish", 0.2);
  set("bitter", 0.12);
  set("warmspice", 0.2);
  set("herbs", 0.2);
  set("traditional", 0.15);
  set("brothy", 0.2);
  set("chewy", 0.3);
  set("braised", 0.2);
  set("carbs", 0.5);
  set("plated", 0.2);
  set("value", 0.15);
  set("drinks", 0.4);
  set("brunch", 0.3);
  return s;
})();

/* ---------- place priors (cuisine, price, hours) ---------- */

/** What a cuisine label alone says about a place, 0..1 per axis (a two-sided axis -1..1). */
const CUISINE: Record<string, Record<string, number>> = {
  Mexican: { spicy: 0.4, sour: 0.3, grilled: 0.3, citrus: 0.4, herbs: 0.3, cheese: 0.3, carbs: 0.5, adventurous: 0.1, redmeat: 0.3, braised: 0.3 },
  "Latin American": { grilled: 0.4, redmeat: 0.35, citrus: 0.3, adventurous: 0.45, braised: 0.3, herbs: 0.3, rawfish: 0.1, carbs: 0.4 },
  Chinese: { umami: 0.4, chewy: 0.4, crispy: 0.2, sweetheat: 0.15, brothy: 0.2, carbs: 0.5, adventurous: 0.25, spicy: 0.2, allium: 0.3, traditional: 0.2 },
  Japanese: { umami: 0.5, rawfish: 0.5, seafood: 0.5, brothy: 0.3, chewy: 0.3, adventurous: 0.3, grilled: 0.2, salty: 0.3, indulgent: -0.2, traditional: 0.3 },
  Korean: { spicy: 0.4, funky: 0.45, grilled: 0.4, umami: 0.45, adventurous: 0.45, sweetheat: 0.3, redmeat: 0.3, allium: 0.4, brothy: 0.2, warmspice: 0.1 },
  Vietnamese: { brothy: 0.6, herbs: 0.6, citrus: 0.3, adventurous: 0.4, indulgent: -0.3, umami: 0.3, chewy: 0.3, sour: 0.2, crunchfresh: 0.3, traditional: 0.3 },
  Thai: { spicy: 0.6, sweet: 0.3, sour: 0.4, herbs: 0.5, citrus: 0.3, adventurous: 0.4, warmspice: 0.3, sweetheat: 0.3, chewy: 0.2, rich: 0.3 },
  Indian: { warmspice: 0.8, spicy: 0.5, adventurous: 0.45, creamsauce: 0.5, rich: 0.4, braised: 0.4, poultry: 0.3, carbs: 0.4, earthy: 0.2, traditional: 0.3, grilled: 0.2 },
  Asian: { umami: 0.35, chewy: 0.3, adventurous: 0.3, carbs: 0.4, brothy: 0.2, spicy: 0.25 },
  Italian: { cheese: 0.5, carbs: 0.7, chewy: 0.3, rich: 0.35, allium: 0.35, herbs: 0.3, plated: 0.15, indulgent: 0.3, traditional: 0.3, salty: 0.3, creamsauce: 0.2 },
  Pizza: { cheese: 0.7, carbs: 0.7, chewy: 0.5, indulgent: 0.5, salty: 0.3, rich: 0.4, plated: -0.4 },
  French: { rich: 0.5, plated: 0.6, creamsauce: 0.4, braised: 0.35, adventurous: 0.3, traditional: 0.4, earthy: 0.2, cheese: 0.3, brunch: 0.1 },
  Mediterranean: { herbs: 0.5, warmspice: 0.3, grilled: 0.4, citrus: 0.3, adventurous: 0.3, indulgent: -0.2, crunchfresh: 0.3, poultry: 0.2, redmeat: 0.2, salty: 0.2 },
  African: { adventurous: 0.8, warmspice: 0.6, spicy: 0.5, braised: 0.5, funky: 0.3, redmeat: 0.3, offal: 0.15, traditional: 0.5, chewy: 0.3 },
  American: { indulgent: 0.35, carbs: 0.4, cheese: 0.3, redmeat: 0.25, crispy: 0.25, plated: -0.1 },
  Burgers: { indulgent: 0.7, redmeat: 0.6, cheese: 0.5, carbs: 0.5, crispy: 0.35, rich: 0.35, plated: -0.5, meat: 0.4 },
  Chicken: { poultry: 0.7, crispy: 0.6, indulgent: 0.5, spicy: 0.25, plated: -0.5, meat: 0.4 },
  "Fast Food": { indulgent: 0.5, carbs: 0.5, crispy: 0.4, plated: -0.8, value: 0.5, redmeat: 0.2 },
  BBQ: { lowslow: 0.85, redmeat: 0.7, braised: 0.5, indulgent: 0.6, sweet: 0.3, salty: 0.3, meat: 0.6, rich: 0.3, plated: -0.2 },
  Steakhouse: { redmeat: 0.8, grilled: 0.6, plated: 0.7, rich: 0.4, indulgent: 0.4, meat: 0.6, salty: 0.3 },
  Seafood: { seafood: 0.85, rawfish: 0.25, citrus: 0.25, meat: -0.3, indulgent: -0.05, grilled: 0.2, salty: 0.2 },
  Sandwiches: { carbs: 0.7, indulgent: 0.35, plated: -0.5, chewy: 0.3, salty: 0.3, cheese: 0.3 },
  Hawaiian: { seafood: 0.35, rawfish: 0.35, sweet: 0.3, rich: 0.2, adventurous: 0.3, salty: 0.3, carbs: 0.5, braised: 0.25, grilled: 0.2, plated: -0.3 },
  "Breakfast & Brunch": { brunch: 0.9, carbs: 0.5, sweet: 0.3, indulgent: 0.3, plated: -0.1 },
  "Bakery & Desserts": { dessert: 0.9, sweet: 0.8, carbs: 0.6, indulgent: 0.4, drinks: 0.2, meat: -0.5 },
  "Coffee & Tea": { drinks: 0.9, bitter: 0.4, sweet: 0.3, brunch: 0.2, meat: -0.5, plated: -0.5 },
  "Juice & Smoothies": { drinks: 0.9, sweet: 0.4, indulgent: -0.6, meat: -0.7, crunchfresh: 0.2, plated: -0.5 },
  Bars: { drinks: 0.7, latenight: 0.6, bitter: 0.2, crispy: 0.3, indulgent: 0.3, salty: 0.3 },
  Vegetarian: { meat: -0.9, indulgent: -0.4, crunchfresh: 0.4, earthy: 0.3, herbs: 0.3 },
};
/** Per band $ .. $$$$: price tier 0..1, and the plated / value nudges. */
const BAND = [
  { price: 0, plated: -0.5, value: 0.45 },
  { price: 0.33, plated: -0.1, value: 0.2 },
  { price: 0.67, plated: 0.4, value: 0 },
  { price: 1, plated: 0.8, value: 0 },
] as const;
const BAND_INDEX: Record<string, number> = { $: 0, $$: 1, $$$: 2, $$$$: 3 };

/** The shape of a restaurant this module reads (RestaurantView has more). */
export type PlaceFacts = {
  cuisine: string | null;
  cuisineSecondary?: readonly string[];
  priceBand: string | null;
  hours: readonly { day: number; start: string; end: string; overnight?: boolean }[] | null;
};

const merge = (a: number, b: number, two: boolean): number =>
  two ? Math.max(-1, Math.min(1, a + b)) : 1 - (1 - a) * (1 - Math.max(0, b));

/** Hours: how late the place stays open and when it opens. Null when none are known. */
function hoursFacts(h: PlaceFacts["hours"]): { late: number; early: number } | null {
  if (!h || h.length === 0) return null;
  let lateDays = 0;
  let veryLate = 0;
  let early = 99;
  for (const s of h) {
    const end = Number(s.end.slice(0, 2)) + Number(s.end.slice(2)) / 60;
    const start = Number(s.start.slice(0, 2)) + Number(s.start.slice(2)) / 60;
    if (s.overnight || end >= 23 || end < 5) veryLate++;
    else if (end >= 22) lateDays++;
    if (start < early) early = start;
  }
  return { late: veryLate >= 2 ? 1 : veryLate === 1 ? 0.5 : lateDays >= 2 ? 0.4 : 0, early };
}

/* ---------- places ---------- */

/** What the dish index keeps per place while it is built: the sum of each menu line's grades. */
export type PlaceAcc = { acc: Float32Array; nFood: Int32Array; nAll: Int32Array };
export const newPlaceAcc = (places: number): PlaceAcc => ({
  acc: new Float32Array(places * N_AXES),
  nFood: new Int32Array(places),
  nAll: new Int32Array(places),
});

export type PlaceVectors = {
  /** Place x 40: the grade, 0..1 (two-sided axes -1..1), and its z-score against the other places. */
  g: Float32Array;
  z: Float32Array;
  mu: Float32Array;
  sd: Float32Array;
  /** Per axis: whether any place had data for it (an axis with no usable data stays neutral). */
  hasData: boolean[];
};

const clip = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/** Folds a raw sum into a grade: a share of the place's lines over the axis' saturation point, then clipped. */
function gradeOfSum(sum: number, n: number, a: number): number {
  return clip(sum / (n + 4) / SAT[a], BIPOLAR[a] ? -1 : 0, 1);
}

const VEC_MEMO = new WeakMap<object, PlaceVectors>();

/** Memoised per `key` (the index object). `rids` is the index's place order; `facts` looks a place up by id. */
export function placeVectors(
  key: object,
  rids: readonly string[],
  place: PlaceAcc,
  facts: (rid: string) => PlaceFacts | undefined,
): PlaceVectors {
  const hit = VEC_MEMO.get(key);
  if (hit) return hit;
  const n = rids.length;
  const g = new Float32Array(n * N_AXES);
  for (let p = 0; p < n; p++) {
    const o = p * N_AXES;
    const nf = place.nFood[p];
    const na = place.nAll[p];
    for (let a = 0; a < N_AXES; a++) {
      if (a === A.smoky || a === A.price) continue;
      g[o + a] = gradeOfSum(place.acc[o + a], a === A.drinks ? na : nf, a);
    }
    const f = facts(rids[p]);
    g[o + A.price] = NaN;
    g[o + A.latenight] = NaN;
    if (f) {
      const prior = (cuisine: string, scale: number) => {
        const t = CUISINE[cuisine];
        if (!t) return;
        for (const id in t) {
          const a = A[id];
          g[o + a] = merge(g[o + a], t[id] * scale, BIPOLAR[a]);
        }
      };
      if (f.cuisine) prior(f.cuisine, 1);
      for (const c of f.cuisineSecondary ?? []) prior(c, 0.5);
      const band = f.priceBand ? BAND_INDEX[f.priceBand] : undefined;
      if (band !== undefined) {
        g[o + A.price] = BAND[band].price;
        g[o + A.plated] = clip(g[o + A.plated] + BAND[band].plated, -1, 1);
        g[o + A.value] = merge(g[o + A.value], BAND[band].value, false);
      }
      const hf = hoursFacts(f.hours);
      if (hf) {
        g[o + A.latenight] = hf.late;
        if (hf.early <= 9) g[o + A.brunch] = merge(g[o + A.brunch], 0.4, false);
      }
    }
    g[o + A.smoky] = Math.max(g[o + A.lowslow], g[o + A.grilled]);
  }
  // Population stats over the places that have a real menu.
  const mu = new Float32Array(N_AXES);
  const sd = new Float32Array(N_AXES);
  const hasData = new Array<boolean>(N_AXES).fill(false);
  for (let a = 0; a < N_AXES; a++) {
    let s = 0;
    let s2 = 0;
    let c = 0;
    for (let p = 0; p < n; p++) {
      if (place.nFood[p] < F40.statMinItems) continue;
      const v = g[p * N_AXES + a];
      if (!Number.isFinite(v)) continue;
      s += v;
      s2 += v * v;
      c++;
    }
    mu[a] = c ? s / c : 0;
    sd[a] = Math.sqrt(Math.max(c ? s2 / c - mu[a] * mu[a] : 0, 1e-6));
    hasData[a] = c > 50 && sd[a] > 0.01;
  }
  const z = new Float32Array(n * N_AXES);
  for (let p = 0; p < n; p++) {
    for (let a = 0; a < N_AXES; a++) {
      const v = g[p * N_AXES + a];
      // Missing data, or an axis nobody grades, is neutral rather than a guess.
      z[p * N_AXES + a] = hasData[a] && Number.isFinite(v) ? clip((v - mu[a]) / sd[a], -2.5, 2.5) : 0;
    }
  }
  const out: PlaceVectors = { g, z, mu, sd, hasData };
  VEC_MEMO.set(key, out);
  return out;
}

/* ---------- people ---------- */

export type Post40 = {
  restaurantId: string;
  dishName: string | null;
  dishDescription: string | null;
  dishSection: string | null;
  rating?: number | null;
};

export type Profile40 = {
  /** Person x 40, in z units: what their liked places run above or below the population, shrunk toward 0. */
  u: Float32Array;
  /** Weight of each axis in a match: 1 core, `finerWeight` unlocked finer, 0 locked finer. */
  w: Float32Array;
  unlocked: boolean[];
  /** Effective posts that touch each axis. */
  nEff: Float32Array;
  /** Rated places that grade strongly on each axis. */
  strong: Int32Array;
  posts: number;
};

const foldText = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-_/]/g, " ");

/**
 * The person's profile from their own posts. `ev.e` is lib/tasteEvidence.ts's signed evidence for the same posts
 * (same order). A post with no evidence, or whose place the index does not hold and which names no dish, adds
 * nothing. Returns null for no usable posts.
 */
export function buildProfile40(
  posts: readonly Post40[],
  ev: { e: readonly number[] },
  vecs: PlaceVectors,
  ridIndex: ReadonlyMap<string, number>,
  tagMask: (name: string, desc: string | null, section: string | null) => number,
): Profile40 | null {
  const rows: { z: Float32Array; g: Float32Array; e: number; rated: boolean; rid: string }[] = [];
  const tmp = new Float32Array(N_AXES);
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const e = ev.e[i] ?? 0;
    if (!e) continue;
    const pi = ridIndex.get(p.restaurantId);
    const hasDish = !!p.dishName && foldText(p.dishName).trim().length > 0;
    if (pi === undefined && !hasDish) continue;
    const g = new Float32Array(N_AXES);
    if (pi !== undefined) for (let a = 0; a < N_AXES; a++) g[a] = vecs.g[pi * N_AXES + a];
    else g.fill(NaN);
    if (hasDish) {
      tmp.fill(0);
      const text = `${foldText(p.dishName)} ${foldText(p.dishDescription)}`;
      const mask = tagMask(p.dishName as string, p.dishDescription, p.dishSection);
      gradeItemInto(tmp, 0, text, mask, foldText(p.dishSection), false);
      for (let a = 0; a < N_AXES; a++) {
        if (a === A.smoky || a === A.price || a === A.latenight) continue;
        const dv = clip(tmp[a] / SAT[a], BIPOLAR[a] ? -1 : 0, 1);
        g[a] = Number.isFinite(g[a]) ? (1 - F40.dishShare) * g[a] + F40.dishShare * dv : dv;
      }
      g[A.smoky] = Math.max(g[A.lowslow], g[A.grilled]);
    }
    const z = new Float32Array(N_AXES);
    for (let a = 0; a < N_AXES; a++) z[a] = vecs.hasData[a] && Number.isFinite(g[a]) ? clip((g[a] - vecs.mu[a]) / vecs.sd[a], -2.5, 2.5) : 0;
    rows.push({ z, g, e, rated: typeof p.rating === "number" && Number.isFinite(p.rating), rid: p.restaurantId });
  }
  if (rows.length === 0) return null;

  let sumAbs = 0;
  for (const r of rows) sumAbs += Math.abs(r.e);
  const meanAbs = sumAbs / rows.length;
  const K = F40.shrinkPosts * meanAbs;
  const sorted = rows.map((r) => Math.abs(r.e)).sort((a, b) => a - b);
  const medE = sorted[Math.floor(sorted.length / 2)] || meanAbs || 1;

  const u = new Float32Array(N_AXES);
  const nEff = new Float32Array(N_AXES);
  const strong = new Int32Array(N_AXES);
  for (let a = 0; a < N_AXES; a++) {
    let num = 0;
    const places = new Set<string>();
    for (const r of rows) {
      num += r.e * r.z[a];
      const v = r.g[a];
      if (!Number.isFinite(v)) continue;
      const touched = BIPOLAR[a] ? Math.abs(v) >= 0.25 : v >= 0.25;
      if (touched) nEff[a] += Math.min(1, Math.abs(r.e) / medE);
      const isStrong = BIPOLAR[a] ? Math.abs(v) >= F40.strong : v >= F40.strong;
      if (isStrong && r.rated) places.add(r.rid);
    }
    u[a] = num / (sumAbs + K);
    strong[a] = places.size;
  }
  const w = new Float32Array(N_AXES);
  const unlocked = new Array<boolean>(N_AXES).fill(false);
  for (let a = 0; a < N_AXES; a++) {
    if (a < N_CORE) {
      w[a] = vecs.hasData[a] ? 1 : 0;
      unlocked[a] = true;
    } else if (strong[a] >= F40.unlockPlaces && nEff[PARENT[a]] >= F40.unlockPosts && vecs.hasData[a]) {
      unlocked[a] = true;
      w[a] = F40.finerWeight;
    }
  }
  // A locked finer axis only repeats its parent (it carries no weight of its own, so this is for display).
  for (let a = N_CORE; a < N_AXES; a++) if (!unlocked[a]) u[a] = u[PARENT[a]];
  return { u, w, unlocked, nEff, strong, posts: rows.length };
}

/** How well place `p` (an index into the place order) fits the person, in -1..1. */
export function fit40(profile: Profile40, vecs: PlaceVectors, p: number): number {
  const o = p * N_AXES;
  let dot = 0;
  let wsum = 0;
  for (let a = 0; a < N_AXES; a++) {
    const w = profile.w[a];
    if (w === 0) continue;
    dot += w * profile.u[a] * vecs.z[o + a];
    wsum += w;
  }
  if (wsum === 0) return 0;
  return Math.tanh(dot / (F40.fitScale * Math.sqrt(wsum)));
}

/** The place's axes sorted by how far above the population they run, for the sanity table. */
export function topAxes(vecs: PlaceVectors, p: number, n = 5): { id: string; z: number; g: number }[] {
  const o = p * N_AXES;
  return AXES.map((d, a) => ({ id: d.id, z: vecs.z[o + a], g: vecs.g[o + a] }))
    .sort((x, y) => y.z - x.z)
    .slice(0, n);
}

/** One menu line's own grade on each axis, 0..1 (two-sided axes -1..1): what the named dish itself carries. Read-only helper for reason text. */
export function dishAxes(name: string, mask: number, section: string | null = null): Float32Array {
  const tmp = new Float32Array(N_AXES);
  gradeItemInto(tmp, 0, foldText(name), mask, foldText(section), false);
  const out = new Float32Array(N_AXES);
  for (let a = 0; a < N_AXES; a++) {
    if (a === A.smoky || a === A.price || a === A.latenight) continue;
    out[a] = clip(tmp[a] / SAT[a], BIPOLAR[a] ? -1 : 0, 1);
  }
  out[A.smoky] = Math.max(out[A.lowslow], out[A.grilled]);
  return out;
}
