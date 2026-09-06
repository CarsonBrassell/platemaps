/**
 * Infers `cuisine` for restaurants whose raw label says nothing ("Restaurant",
 * "food", null) by reading what they actually serve.
 *
 *   node --env-file=.env.local scripts/infer-cuisine.mjs                 # dry run, all null-cuisine rows
 *   node --env-file=.env.local scripts/infer-cuisine.mjs --listed        # only rows a visitor can see
 *   node --env-file=.env.local scripts/infer-cuisine.mjs --limit 50      # first N (listed first)
 *   node --env-file=.env.local scripts/infer-cuisine.mjs --no-llm        # keyword stage only, free
 *   node --env-file=.env.local scripts/infer-cuisine.mjs --apply         # write the decisions
 *
 * Two stages, cheapest first.
 *
 *   1. Keywords. Each of the 29 cuisines in src/data/cuisines.ts has a list
 *      of dish words. The restaurant's name (weight 6), menu section names
 *      (2 each) and dish names (1 each, 0.4 for generic words like "salad")
 *      are scored against every list. A clear winner (score >= 8 with a menu, >= 3 on a bare name, and at
 *      least twice the runner-up) is decided here for free.
 *
 *   2. Claude. Everything the keywords could not settle - a name with two
 *      cuisines in it, a menu of "Olives; Tin Fish; Empanadas", a place
 *      with no menu whose name is "The Rose" - goes to claude-sonnet-5 with
 *      a structured-output enum of the same 29 buckets plus "Unknown". Only
 *      high/medium confidence answers are applied; "low" and "Unknown" leave
 *      the row null and are listed in the report for a human.
 *
 * Every LLM answer is cached in probe/cuisine-llm-cache.json keyed by
 * restaurant id, so a re-run after a crash or an edit is free. Every decision
 * (applied or not) is written to probe/cuisine-inferred-<timestamp>.json.
 *
 * `--apply` snapshots `id, cuisine, cuisine_raw, cuisine_tags` of every row it
 * is about to touch into probe/snapshots/ first, then UPDATEs each row with
 * `WHERE id = $1 AND (cuisine IS NULL OR cuisine = '')` - it only ever fills a
 * blank. `cuisine_raw` and `cuisine_tags` are not touched; the raw label stays
 * verbatim, and normalize-cuisines.mjs keeps an inferred cuisine when the raw
 * label maps to nothing (see the guard there).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { sql } from "./sql-client.mjs";
import { CUISINES } from "../src/data/cuisines.ts";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const APPLY = flag("--apply");
const LISTED_ONLY = flag("--listed");
const NO_LLM = flag("--no-llm");
const LIMIT = Number(opt("--limit", 0)) || 0;
const CONCURRENCY = Number(opt("--concurrency", 6)) || 6;
const MODEL = opt("--model", "claude-sonnet-5");

const CACHE_PATH = "probe/cuisine-llm-cache.json";
const SNAP_DIR = "probe/snapshots";
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT_PATH = `probe/cuisine-inferred-${STAMP}.json`;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}
if (!NO_LLM && !process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local or pass --no-llm");
  process.exit(1);
}

/* ------------------------------------------------------------------------ */
/* Stage 1: keyword lexicon                                                 */
/* ------------------------------------------------------------------------ */

/*
 * strong = 1.0 per dish hit, weak = 0.4 (words that appear on many menus).
 * generic = venue words that only apply to the NAME and only score 3: "Kitchen",
 * "Grill", "Cafe", "Bar". Alone they decide a no-menu row ("The Grill" ->
 * American); against a real cuisine word they lose ("Pho Kitchen" -> Vietnamese,
 * "Sushi Bar" -> Japanese); two of them tie ("Bar & Grill") and go to Claude.
 */
const LEXICON = {
  Mexican: {
    strong: ["taco", "tacos", "taqueria", "burrito", "burritos", "quesadilla", "enchilada", "carnitas", "carne asada", "al pastor", "chilaquiles", "menudo", "pozole", "torta", "tortas", "birria", "mariscos", "elote", "tamal", "tamales", "horchata", "agua fresca", "aguas frescas", "guacamole", "cocina", "michoacan", "michoacana", "oaxaca", "oaxacan", "mole", "sope", "sopes", "gordita", "huarache", "tostada", "tostadas", "flautas", "fajita", "fajitas", "mulitas", "barbacoa", "cemita", "aguachile", "molcajete", "chile relleno", "huevos rancheros", "taqueros", "antojitos", "tostilocos", "asada", "rolled tacos", "carne", "queso fundido", "machaca", "chilorio", "enfrijoladas", "divorciados", "chorizo", "pollo asado", "mexican", "mexicana", "mexicano", "baja"],
    weak: ["salsa", "nachos", "queso", "chips and salsa", "churro", "churros", "pollo"],
  },
  "Latin American": {
    strong: ["pupusa", "pupusas", "arepa", "arepas", "empanada", "empanadas", "lomo saltado", "cuban", "cubano", "ropa vieja", "tostones", "yuca", "churrasco", "pollo a la brasa", "baleada", "gallo pinto", "jerk chicken", "caribbean", "colombian", "colombiana", "peruvian", "peruano", "salvadoran", "salvadoreno", "brazilian", "feijoada", "pao de queijo", "inca kola", "chicha", "venezuelan", "argentin", "chimichurri", "puerto rican", "mofongo", "bandeja paisa", "aji", "guatemalan", "honduran", "nicaraguan", "picadillo", "plantain", "plantains", "maduros", "pastelitos", "tres leches", "mojo", "salvadorean", "salvadorian", "pupuseria", "pupusería", "cubana", "cubanos", "peruana", "brazil", "brasil"],
    weak: [],
  },
  Italian: {
    strong: ["pasta", "spaghetti", "lasagna", "lasagne", "ravioli", "gnocchi", "fettuccine", "fettucine", "penne", "linguine", "linguini", "rigatoni", "risotto", "carbonara", "alfredo", "bolognese", "marinara", "parmigiana", "bruschetta", "antipasto", "antipasti", "caprese", "tiramisu", "cannoli", "osso buco", "piccata", "saltimbocca", "cucina", "trattoria", "ristorante", "osteria", "prosciutto", "burrata", "focaccia", "panna cotta", "italian", "italiano", "italiana", "cacio e pepe", "pappardelle", "tagliatelle", "arancini", "scampi", "chicken parm", "eggplant parm", "minestrone", "pesto", "gelato"],
    weak: ["parmesan", "meatball", "meatballs", "garlic bread"],
  },
  Pizza: {
    strong: ["pizza", "pizzas", "pizzeria", "calzone", "calzones", "stromboli", "pepperoni", "margherita", "deep dish", "by the slice", "slice"],
    weak: [],
  },
  Chinese: {
    strong: ["chow mein", "lo mein", "kung pao", "general tso", "orange chicken", "egg roll", "egg rolls", "wonton", "wontons", "dim sum", "dumpling", "dumplings", "bao", "mapo", "sichuan", "szechuan", "hunan", "cantonese", "peking", "mongolian beef", "chow fun", "congee", "xiao long bao", "hot pot", "dan dan", "char siu", "scallion pancake", "egg drop", "hot and sour", "hot & sour", "sweet and sour", "sweet & sour", "mu shu", "moo shu", "chop suey", "potsticker", "potstickers", "pot sticker", "wok", "chinese", "beef broccoli", "broccoli beef", "sesame chicken", "honey walnut", "walnut shrimp", "egg foo young", "chinese noodle", "hand pulled", "cumin lamb", "salt and pepper", "taiwanese"],
    weak: ["fried rice", "spring roll", "spring rolls"],
  },
  Japanese: {
    strong: ["sushi", "sashimi", "ramen", "udon", "tempura", "teriyaki", "nigiri", "maki", "miso", "tonkatsu", "katsu", "donburi", "yakitori", "izakaya", "edamame", "gyoza", "bento", "mochi", "takoyaki", "okonomiyaki", "unagi", "omakase", "sake", "shabu", "yakisoba", "karaage", "onigiri", "chirashi", "hamachi", "teppanyaki", "hibachi", "japanese", "tonkotsu", "shoyu", "spicy tuna", "california roll", "rainbow roll", "dragon roll", "tamago", "robata", "robataya", "kaiseki", "curry rice", "gyudon", "oyakodon", "chashu", "tsukemen", "wagyu", "matcha"],
    weak: ["roll", "rolls", "soy"],
  },
  Korean: {
    strong: ["bibimbap", "bulgogi", "kimchi", "galbi", "kalbi", "japchae", "tteokbokki", "kimbap", "gimbap", "gochujang", "soondubu", "sundubu", "jjigae", "bossam", "banchan", "korean", "k-bbq", "kbbq", "bingsu", "ssam", "samgyeopsal", "dakgalbi", "jjajang", "jajangmyeon", "korean fried chicken", "kalguksu", "naengmyeon", "budae", "seolleongtang", "corn dog"],
    weak: [],
  },
  Thai: {
    strong: ["pad thai", "pad see ew", "tom yum", "tom kha", "panang", "massaman", "larb", "thai", "som tum", "khao soi", "kra pao", "krapow", "drunken noodle", "drunken noodles", "boat noodle", "mango sticky rice", "thai tea", "green curry", "red curry", "yellow curry", "pad kee mao", "satay", "pad woon sen", "khao pad"],
    weak: ["curry"],
  },
  Vietnamese: {
    strong: ["pho", "phở", "banh mi", "bánh mì", "bun bo hue", "vermicelli", "vietnamese", "com tam", "bo luc lac", "goi cuon", "cha gio", "ca phe", "banh xeo", "bo kho", "bun cha", "bun thit", "vietnamese coffee", "egg roll noodle"],
    weak: [],
  },
  Indian: {
    strong: ["tikka", "masala", "naan", "biryani", "paneer", "samosa", "samosas", "dosa", "tandoori", "dal", "daal", "chana", "vindaloo", "korma", "saag", "roti", "chaat", "lassi", "pakora", "uthappam", "idli", "vada", "butter chicken", "chicken 65", "momos", "indian", "punjabi", "pakistani", "nepalese", "nepali", "kulcha", "paratha", "raita", "gulab jamun", "kheer", "thali", "pav bhaji", "halal cart", "keema", "nihari", "seekh"],
    weak: ["curry", "kebab"],
  },
  Asian: {
    strong: ["lumpia", "pancit", "adobo", "sisig", "lechon", "halo-halo", "halo halo", "inasal", "kare-kare", "kare kare", "sinigang", "longganisa", "longsilog", "tocino", "tosilog", "liempo", "bangus", "filipino", "pinoy", "nasi goreng", "rendang", "laksa", "indonesian", "malaysian", "singapore", "cambodian", "khmer", "burmese", "laotian", "lao", "asian fusion", "pan asian", "pan-asian", "asian", "hainan", "roti canai", "mie goreng", "bicol", "silog", "ube", "turon", "leche flan", "pandesal", "ensaymada"],
    weak: ["noodle", "noodles", "fried rice", "spring roll", "spring rolls", "dumpling", "dumplings"],
  },
  Hawaiian: {
    strong: ["loco moco", "kalua", "musubi", "hawaiian", "huli huli", "lau lau", "laulau", "shave ice", "aloha", "poi", "ahi poke", "poke", "poke bowl", "plate lunch", "macaroni salad", "mac salad", "pipikaula", "haupia", "malasada"],
    weak: ["ono", "ohana", "island", "islands", "garlic shrimp", "chicken katsu"],
  },
  Mediterranean: {
    strong: ["hummus", "falafel", "shawarma", "gyro", "gyros", "kebab", "kabob", "kabab", "pita", "tabbouleh", "baba ganoush", "dolma", "tzatziki", "souvlaki", "baklava", "moussaka", "spanakopita", "fattoush", "labneh", "tahini", "halloumi", "kofta", "kufta", "mezze", "meze", "greek", "lebanese", "turkish", "persian", "koobideh", "ghormeh", "tahdig", "paella", "tapas", "manakish", "za'atar", "zaatar", "mediterranean", "middle eastern", "israeli", "moroccan", "afghan", "armenian", "syrian", "iraqi", "egyptian", "shish", "lamb shank", "bureg", "boreg", "dolmas", "chicken shawarma", "beef shawarma", "kebob", "halal", "saffron", "sumac", "kibbeh", "fatayer", "muhammara", "lavash", "lule", "kashke"],
    weak: ["lamb", "feta", "olives", "olive"],
  },
  African: {
    strong: ["ethiopian", "injera", "doro wat", "tibs", "kitfo", "jollof", "suya", "egusi", "fufu", "berbere", "eritrean", "nigerian", "ghanaian", "senegalese", "kenyan", "somali", "sambusa", "misir", "shiro", "kebbe", "african", "afro"],
    weak: [],
  },
  American: {
    strong: ["mac and cheese", "mac & cheese", "meatloaf", "pot roast", "chicken fried steak", "biscuits and gravy", "biscuits & gravy", "diner", "cobb salad", "sliders", "american", "pot pie", "chili", "buffalo", "tater tots", "onion rings", "philly", "reuben", "patty melt", "tuna melt", "grilled cheese", "chicken pot pie", "shepherd's pie", "fish fry", "jambalaya", "gumbo", "cajun", "creole", "po boy", "po' boy", "southern", "soul food", "comfort food", "gastropub", "new american", "californian", "farm to table", "bratwurst", "schnitzel", "pierogi", "shepherds pie", "bangers", "roadhouse", "chophouse"],
    generic: ["eatery", "kitchen", "grill", "grille", "bar & grill", "bar and grill", "bar & grille"],
    weak: ["fries", "wings", "salad", "salads", "sandwich", "burger", "steak", "ranch", "bacon", "mashed potatoes", "coleslaw", "cornbread", "kids", "kid's"],
  },
  Steakhouse: {
    strong: ["steakhouse", "steak house", "ribeye", "rib eye", "rib-eye", "filet mignon", "new york strip", "ny strip", "porterhouse", "prime rib", "t-bone", "tomahawk", "sirloin", "chophouse", "chop house", "churrascaria", "dry aged", "dry-aged", "wagyu", "flat iron", "skirt steak", "steaks", "prime steak"],
    weak: ["steak", "filet", "cowboy"],
  },
  Seafood: {
    strong: ["seafood", "fish and chips", "fish & chips", "fish n chips", "oyster", "oysters", "clam", "clams", "crab", "lobster", "scallop", "scallops", "calamari", "mussels", "ceviche", "chowder", "cioppino", "catch", "fish market", "crawfish", "crab boil", "seafood boil", "fish house", "fish co", "fishery", "fish grill", "oyster bar", "raw bar", "crudo", "swordfish", "halibut", "sea bass", "mahi", "grilled fish", "fried fish", "fish sandwich", "fish plate", "shrimp cocktail", "lobster roll", "crab cake", "crab cakes", "fisherman", "wharf", "mariscos", "pescado", "camarones", "octopus", "pulpo", "tin fish", "tinned fish"],
    weak: ["shrimp", "salmon", "ahi", "tuna", "fish", "fish taco", "fish tacos"],
  },
  BBQ: {
    strong: ["bbq", "barbecue", "barbeque", "brisket", "pulled pork", "ribs", "smokehouse", "smoke house", "burnt ends", "tri-tip", "tri tip", "hot link", "hot links", "sausage plate", "pit", "smoker", "baby back", "spare ribs", "rib tips", "pitmaster", "q", "smokin", "smokey", "smoky"],
    weak: ["sausage", "coleslaw", "cornbread", "mac and cheese", "smoked"],
  },
  Burgers: {
    strong: ["burger", "burgers", "cheeseburger", "cheeseburgers", "hamburger", "hamburgers", "smash burger", "smashburger", "double double", "patty", "patties", "burger joint", "burger shack", "burger bar"],
    weak: ["fries", "shake", "shakes", "milkshake"],
  },
  Sandwiches: {
    strong: ["sandwich", "sandwiches", "sub", "subs", "hoagie", "hoagies", "panini", "paninis", "deli", "delicatessen", "club sandwich", "turkey club", "cheesesteak", "cheesesteaks", "blt", "grinder", "grinders", "sandwich shop", "sammies", "sammy", "sammich", "sub shop", "pastrami", "corned beef", "italian sub", "meatball sub", "tuna salad", "chicken salad sandwich", "egg salad"],
    weak: ["turkey", "ham", "avocado", "wrap", "wraps", "melt", "melts"],
  },
  Chicken: {
    strong: ["fried chicken", "wings", "wing", "chicken tenders", "tenders", "chicken sandwich", "rotisserie", "nashville hot", "chicken shop", "cluck", "hot chicken", "drumstick", "drumsticks", "chicken strips", "chicken wings", "boneless wings", "chicken", "pollo", "chicken fingers", "chicken nuggets", "nuggets", "half chicken", "whole chicken", "chicken plate", "chicken bowl", "chicken and waffles", "chicken & waffles", "peri peri", "wingstop", "buffalo wings"],
    weak: [],
  },
  "Fast Food": {
    strong: ["hot dog", "hot dogs", "hotdog", "hotdogs", "combo meal", "value meal", "drive thru", "drive-thru", "corn dog", "corn dogs", "chili dog", "chili cheese dog", "fast food", "burger combo", "kids meal", "kid's meal", "number one", "#1 combo", "carne asada fries", "chili cheese fries"],
    weak: ["fries", "french fries", "combo", "soda", "fountain drink"],
  },
  "Breakfast & Brunch": {
    strong: ["breakfast", "brunch", "pancake", "pancakes", "omelet", "omelette", "omelets", "omelettes", "benedict", "eggs benedict", "french toast", "hash browns", "hashbrowns", "scramble", "scrambled eggs", "avocado toast", "mimosa", "mimosas", "huevos", "breakfast burrito", "breakfast sandwich", "breakfast bowl", "two eggs", "2 eggs", "eggs any style", "belgian waffle", "buttermilk pancakes", "short stack", "corned beef hash", "breakfast plate", "griddle"],
    weak: ["toast", "yogurt", "parfait", "waffle", "waffles", "bagel", "bagels", "orange juice", "eggs", "egg", "bacon", "biscuits", "oatmeal", "granola", "egg white", "lox", "sausage links", "morning", "sunrise", "crepes", "country fried", "chicken and waffles"],
  },
  "Coffee & Tea": {
    strong: ["coffee", "espresso", "latte", "lattes", "cappuccino", "americano", "mocha", "cold brew", "matcha", "chai", "tea", "teas", "boba", "bubble tea", "milk tea", "macchiato", "cortado", "frappe", "roasters", "roastery", "roasting", "coffee house", "coffeehouse", "coffee bar", "coffee co", "pour over", "nitro", "flat white", "affogato", "oat milk", "tea house", "teahouse", "kung fu tea", "sharetea", "tapioca", "brown sugar boba", "fruit tea", "iced tea", "hot tea", "coffee roasters"],
    generic: ["cafe", "café", "caffe"],
    weak: ["pastries", "croissant", "muffin", "scone", "drip", "taro", "slush", "beans", "brew"],
  },
  "Juice & Smoothies": {
    strong: ["juice", "juices", "juice bar", "smoothie", "smoothies", "acai", "açaí", "acai bowl", "pitaya", "wheatgrass", "cold pressed", "cold-pressed", "cleanse", "protein shake", "protein shakes", "nutrition", "nutrition club", "herbalife", "green juice", "celery juice", "fresh squeezed", "fruit bowl", "fruit cup", "fruit cups", "fresh fruit", "jugos", "licuados", "jugo", "batidos", "smoothie bowl", "energy bowl", "bowls", "raspados", "fruteria", "frutería", "bionico", "bionicos", "mangonada", "fresas con crema"],
    weak: ["bowl", "banana", "mango", "strawberry", "pineapple"],
  },
  "Bakery & Desserts": {
    strong: ["bakery", "bakeshop", "bake shop", "bakehouse", "pastry", "pastries", "croissant", "croissants", "cake", "cakes", "cupcake", "cupcakes", "cookie", "cookies", "donut", "donuts", "doughnut", "doughnuts", "ice cream", "gelato", "frozen yogurt", "froyo", "dessert", "desserts", "pie", "pies", "cheesecake", "macaron", "macarons", "churro", "churros", "chocolate", "chocolates", "chocolatier", "candy", "candies", "sweets", "sweet shop", "brownie", "brownies", "cinnamon roll", "cinnamon rolls", "scone", "scones", "muffin", "muffins", "bagel", "bagels", "bread", "breads", "creamery", "paleteria", "paletería", "paleta", "paletas", "shaved ice", "waffle cone", "sundae", "sundaes", "milkshake", "milkshakes", "pan dulce", "conchas", "tres leches", "flan", "custard", "confection", "confections", "confectionery", "fudge", "taffy", "toffee", "truffles", "bonbons", "boba waffle", "crepe", "crepes", "creperie", "cronut", "danish", "eclair", "tart", "tarts", "pudding", "sorbet", "sherbet", "soft serve", "rolled ice cream", "mochi", "boba ice cream", "popsicle", "popsicles", "snow cone", "bakes", "baked goods", "patisserie", "panaderia", "panadería", "dulceria", "dulcería", "cookie dough", "cheesecakes", "cakery", "cupcakery", "donuttery", "creamery", "scoop", "scoops"],
    weak: ["waffle", "waffles", "chocolate chip", "yogurt"],
  },
  Bars: {
    strong: ["pub", "tavern", "saloon", "lounge", "brewery", "brewing", "brewing co", "brewing company", "taproom", "tap room", "brewpub", "brew pub", "cocktail", "cocktails", "ipa", "lager", "pint", "pints", "draft", "drafts", "draught", "beer", "beers", "wine", "wines", "winery", "tasting room", "distillery", "whiskey", "whisky", "bourbon", "tequila", "mezcal", "spirits", "sports bar", "happy hour", "cantina", "speakeasy", "cider", "cidery", "mead", "meadery", "sake bar", "wine bar", "hookah", "shisha", "night club", "nightclub", "billiards", "pool hall", "dive bar", "tiki", "beer garden", "biergarten", "alehouse", "ale house", "public house", "taphouse", "tap house", "gastropub", "on tap", "old fashioned", "martini", "margaritas", "mojito", "spritz", "negroni", "michelada", "bloody mary", "well drinks", "seltzer", "hard seltzer", "on the rocks", "vineyard", "vineyards", "cellars", "cellar", "brewery & taproom", "beer & wine", "beer and wine"],
    generic: ["bar"],
    weak: ["wine list", "draft beer", "bottled beer", "bottles", "cans", "ale", "ales", "shot", "shots", "domestic", "imports"],
  },
  Vegetarian: {
    strong: ["vegan", "vegetarian", "plant-based", "plant based", "tofu", "tempeh", "quinoa", "kale", "grain bowl", "buddha bowl", "health food", "healthy", "organic", "gluten-free", "gluten free", "impossible", "beyond meat", "jackfruit", "seitan", "raw food", "superfood", "superfoods", "veggie", "salad bar", "meatless", "cauliflower wings", "falafel bowl", "lentil", "lentils", "chickpea", "chickpeas", "meal prep", "clean eating", "nourish"],
    weak: ["avocado", "hummus", "grilled vegetables", "salad", "salads", "veggies", "greens", "sprouts", "wellness", "fresh", "garden", "harvest", "farm"],
  },
};

const ESC = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const compiled = {};
for (const [cuisine, { strong, weak, generic = [] }] of Object.entries(LEXICON)) {
  const mk = (words) =>
    words.length
      ? new RegExp("(^|[^a-z0-9])(" + words.map(ESC).join("|") + ")([^a-z0-9]|$)", "i")
      : null;
  compiled[cuisine] = { strong: mk(strong), weak: mk(weak), generic: mk(generic) };
}

function fold(s) {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function scoreRow(row) {
  const scores = {};
  const bump = (c, n) => { scores[c] = (scores[c] ?? 0) + n; };
  const name = fold(row.name);
  const sections = (row.sections ?? []).map(fold);
  const dishes = (row.dishes ?? []).map(fold);

  for (const [c, rx] of Object.entries(compiled)) {
    if (rx.strong?.test(name)) bump(c, 6);
    else if (rx.generic?.test(name)) bump(c, 3);
    else if (rx.weak?.test(name)) bump(c, 2);
    for (const s of sections) {
      if (rx.strong?.test(s)) bump(c, 2);
      else if (rx.weak?.test(s)) bump(c, 0.8);
    }
    for (const d of dishes) {
      if (rx.strong?.test(d)) bump(c, 1);
      else if (rx.weak?.test(d)) bump(c, 0.4);
    }
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  /* A menu has to add up to something; a bare name needs one clear word (or a generic venue word). */
  const floor = dishes.length ? 8 : 3;
  const decided = top && top[1] >= floor && (!second || top[1] >= 2 * second[1]);
  return { ranked: ranked.slice(0, 4), decided: decided ? top[0] : null };
}

/* ------------------------------------------------------------------------ */
/* Stage 2: Claude                                                          */
/* ------------------------------------------------------------------------ */

const BUCKET_NOTES = {
  African: "Ethiopian, Eritrean, Nigerian, West African.",
  American: "Catch-all for Western sit-down, diner, pub food, New American, Californian, Cajun, German, British.",
  Asian: "Pan-Asian, fusion, Filipino, Indonesian, Malaysian, Cambodian, Lao, Burmese - Asian cuisines not in this list.",
  BBQ: "Smoked meats: brisket, ribs, pulled pork.",
  "Bakery & Desserts": "Bakeries, ice cream, candy, chocolate, donuts, crepes, cakes.",
  Bars: "Places where drinks are the point: bars, pubs, breweries, wineries, cocktail lounges, hookah.",
  "Breakfast & Brunch": "Breakfast-first places: eggs, pancakes, benedicts.",
  Burgers: "Burger-first.",
  Chicken: "Fried chicken, wings, rotisserie.",
  Chinese: "Includes Taiwanese, Sichuan, Cantonese, dim sum, hot pot.",
  "Coffee & Tea": "Coffee shops, cafes, boba and tea houses.",
  "Fast Food": "Hot dog stands, drive-thru style combo places (not national chains, those are excluded elsewhere).",
  French: "French, bistro.",
  Hawaiian: "Hawaiian plate lunch, poke, Pacific islander.",
  Indian: "Indian, Pakistani, Nepalese.",
  Italian: "Italian other than pizza-first.",
  Japanese: "Sushi, ramen, izakaya.",
  "Juice & Smoothies": "Juice bars, smoothie and acai shops, nutrition clubs, fruit cups.",
  Korean: "Korean, KBBQ.",
  "Latin American": "Salvadoran, Peruvian, Cuban, Colombian, Brazilian, Caribbean, Argentine.",
  Mediterranean: "Greek, Middle Eastern, Lebanese, Persian, Turkish, Moroccan, Israeli, Spanish tapas, halal grills.",
  Mexican: "Mexican, Tex-Mex, Baja, taquerias, mariscos.",
  Pizza: "Pizza-first.",
  Sandwiches: "Sandwich shops, delis, subs, wraps.",
  Seafood: "Seafood-first, oyster bars, fish and chips.",
  Steakhouse: "Steakhouse, chophouse, Brazilian churrascaria.",
  Thai: "Thai.",
  Vegetarian: "Vegan, vegetarian, health-food, salad-first.",
  Vietnamese: "Pho, banh mi.",
};

const SYSTEM = [
  "You label San Diego restaurants with exactly one cuisine bucket for a Discover filter.",
  "Pick the bucket a local would tap to find this place. Judge from the menu when there is one, otherwise from the name and the source label.",
  "",
  "Buckets:",
  ...CUISINES.map((c) => `- ${c}: ${BUCKET_NOTES[c] ?? ""}`),
  "- Unknown: nothing to go on, or not a restaurant (food hall, cafeteria, cinema, catering-only, hotel, market).",
  "",
  "Rules:",
  "- A bar whose menu is mostly food goes by its food; Bars is for places where drinking is the point.",
  "- A Mexican breakfast place is Mexican; a diner with pancakes and burgers is Breakfast & Brunch if breakfast dominates, else American.",
  "- Asian is only for pan-Asian or a cuisine with no bucket of its own (Filipino etc.), never for a clearly Japanese, Chinese, Thai, Korean or Vietnamese menu.",
  "- Do not guess a cuisine from a personal name alone (\"Jordan\", \"Kim's House\"). If the name and label carry no food signal and there is no menu, answer Unknown.",
  "- confidence: high = the menu or name makes it obvious; medium = a reasonable inference from partial evidence; low = a guess. Use low freely; a wrong label is worse than none.",
  "- reason: at most 12 words.",
].join("\n");

const Answer = z.object({
  cuisine: z.enum([...CUISINES, "Unknown"]),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string(),
});

function describe(row) {
  const lines = [`Name: ${row.name}`];
  if (row.cuisine_raw) lines.push(`Source label: ${row.cuisine_raw}`);
  if (row.cuisine_tags) lines.push(`Tags: ${row.cuisine_tags}`);
  if (row.address) lines.push(`Address: ${row.address}`);
  if (row.sections?.length) lines.push(`Menu sections: ${row.sections.slice(0, 25).join(" | ")}`);
  if (row.dishes?.length) lines.push(`Dishes (${row.dish_count} total): ${row.dishes.slice(0, 45).join("; ")}`);
  else lines.push("Menu: none on file");
  return lines.join("\n");
}

function loadCache() {
  try { return JSON.parse(readFileSync(CACHE_PATH, "utf8")); } catch { return {}; }
}
let cache = loadCache();
let cacheDirty = 0;
function saveCache() {
  if (!cacheDirty) return;
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 1));
  cacheDirty = 0;
}

const client = NO_LLM ? null : new Anthropic();
let llmCalls = 0, inTok = 0, outTok = 0;

async function askClaude(row) {
  if (cache[row.id]?.model === MODEL) return cache[row.id];
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 400,
    output_config: { effort: "low", format: zodOutputFormat(Answer) },
    system: SYSTEM,
    messages: [{ role: "user", content: describe(row) }],
  });
  llmCalls += 1;
  inTok += response.usage.input_tokens;
  outTok += response.usage.output_tokens;
  const out = response.parsed_output ?? { cuisine: "Unknown", confidence: "low", reason: "unparseable" };
  const rec = { ...out, model: MODEL, at: new Date().toISOString() };
  cache[row.id] = rec;
  cacheDirty += 1;
  if (cacheDirty >= 25) saveCache();
  return rec;
}

async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

/* ------------------------------------------------------------------------ */
/* Main                                                                     */
/* ------------------------------------------------------------------------ */

const rows = await sql`
  SELECT r.id::text AS id, r.name, r.address, r.cuisine_raw, r.cuisine_tags,
         (r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL) AS listed,
         (SELECT array_agg(DISTINCT section) FROM dishes d WHERE d.restaurant_id = r.id AND section <> '') AS sections,
         (SELECT array_agg(name ORDER BY sort_order) FROM (
             SELECT name, sort_order FROM dishes d WHERE d.restaurant_id = r.id ORDER BY sort_order LIMIT 60
          ) x) AS dishes,
         (SELECT count(*)::int FROM dishes d WHERE d.restaurant_id = r.id) AS dish_count
    FROM restaurants r
   WHERE (r.cuisine IS NULL OR r.cuisine = '')
     ${LISTED_ONLY ? sql`AND r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL` : sql``}
   ORDER BY (r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL) DESC, r.id
   ${LIMIT ? sql`LIMIT ${LIMIT}` : sql``}`;

console.log(`${rows.length} rows with no cuisine${LISTED_ONLY ? " (listed only)" : ""}. Stage 1: keywords...`);

const decisions = [];
const undecided = [];
for (const row of rows) {
  const kw = scoreRow(row);
  if (kw.decided) {
    decisions.push({ id: row.id, name: row.name, listed: row.listed, cuisine: kw.decided, method: "keywords", confidence: "high", evidence: kw.ranked, dish_count: row.dish_count });
  } else {
    undecided.push({ row, kw });
  }
}
console.log(`  keywords decided ${decisions.length}, ${undecided.length} go to ${NO_LLM ? "nobody (--no-llm)" : MODEL}.`);

if (!NO_LLM && undecided.length) {
  let done = 0;
  await pool(undecided, CONCURRENCY, async ({ row, kw }) => {
    try {
      const ans = await askClaude(row);
      decisions.push({ id: row.id, name: row.name, listed: row.listed, cuisine: ans.cuisine, method: "llm", confidence: ans.confidence, reason: ans.reason, keyword_guess: kw.ranked[0]?.[0] ?? null, evidence: kw.ranked, dish_count: row.dish_count });
    } catch (e) {
      decisions.push({ id: row.id, name: row.name, listed: row.listed, cuisine: "Unknown", method: "error", confidence: "low", reason: String(e.message ?? e).slice(0, 200), evidence: kw.ranked, dish_count: row.dish_count });
    }
    done += 1;
    if (done % 50 === 0) process.stdout.write(`\r  ${done}/${undecided.length} asked`);
  });
  saveCache();
  process.stdout.write(`\r  ${done}/${undecided.length} asked. ${llmCalls} fresh calls, ${inTok} in / ${outTok} out tokens.\n`);
} else {
  for (const { row, kw } of undecided) {
    decisions.push({ id: row.id, name: row.name, listed: row.listed, cuisine: "Unknown", method: "none", confidence: "low", evidence: kw.ranked, dish_count: row.dish_count });
  }
}

const applicable = decisions.filter((d) => d.cuisine !== "Unknown" && d.confidence !== "low" && CUISINES.includes(d.cuisine));
const leftover = decisions.filter((d) => !applicable.includes(d));

const byCuisine = new Map();
for (const d of applicable) byCuisine.set(d.cuisine, (byCuisine.get(d.cuisine) ?? 0) + 1);
console.log(`\n${applicable.length} of ${decisions.length} get a cuisine (${applicable.filter((d) => d.listed).length} listed); ${leftover.length} stay null.`);
console.log("  by method: " + ["keywords", "llm"].map((m) => `${m} ${applicable.filter((d) => d.method === m).length}`).join(", "));
console.log("  by cuisine: " + [...byCuisine].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(", "));
console.log(`  leftover: ` + Object.entries(leftover.reduce((acc, d) => { const k = `${d.method}/${d.cuisine === "Unknown" ? "unknown" : "low"}`; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})).map(([k, n]) => `${k} ${n}`).join(", "));

const disagree = applicable.filter((d) => d.method === "llm" && d.keyword_guess && d.keyword_guess !== d.cuisine && (d.evidence?.[0]?.[1] ?? 0) >= 3);
if (disagree.length) console.log(`  ${disagree.length} llm answers overrode a keyword lean of >=3 (see report).`);

mkdirSync("probe", { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify({ stamp: STAMP, model: MODEL, applied: APPLY, applicable, leftover }, null, 1));
console.log(`report: ${OUT_PATH}`);

if (!APPLY) {
  console.log("\nDry run - nothing written. Add --apply to write.");
  process.exit(0);
}

mkdirSync(SNAP_DIR, { recursive: true });
const ids = applicable.map((d) => d.id);
const snap = await sql`SELECT id::text, cuisine, cuisine_raw, cuisine_tags FROM restaurants WHERE id::text = ANY(${ids})`;
const snapPath = `${SNAP_DIR}/cuisine-null-${STAMP}.json`;
writeFileSync(snapPath, JSON.stringify(snap, null, 1));
console.log(`snapshot: ${snapPath} (${snap.length} rows)`);

let written = 0, n = 0;
for (const d of applicable) {
  const r = await sql`
    UPDATE restaurants SET cuisine = ${d.cuisine}
     WHERE id::text = ${d.id} AND (cuisine IS NULL OR cuisine = '')`;
  n += 1; written += Array.isArray(r) ? 0 : (r?.count ?? 0);
  if (n % 200 === 0) process.stdout.write(`\r  writing ${n}/${applicable.length}`);
}
const [after] = await sql`
  SELECT count(*) FILTER (WHERE cuisine IS NULL OR cuisine = '')::int AS no_cuisine,
         count(*) FILTER (WHERE (cuisine IS NULL OR cuisine = '') AND hold_reason IS NULL AND lat IS NOT NULL AND lng IS NOT NULL)::int AS listed_no_cuisine
    FROM restaurants`;
console.log(`\nDone. ${applicable.length} rows updated. Still null: ${after.no_cuisine} total, ${after.listed_no_cuisine} listed.`);
