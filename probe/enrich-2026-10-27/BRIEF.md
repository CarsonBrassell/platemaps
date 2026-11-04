# Restaurant enrichment from menus: agent brief (2026-10-27)

PlateMaps (San Diego restaurant app) wants to learn everything a menu can tell us about each
listed restaurant. The data will feed the cuisine filters (main + secondary cuisines), the
friend taste-match radar, and later a "recommended for you" feature. Accuracy beats volume:
an empty field is better than a guessed one.

## Your input
`batches/batch-NNN.txt` holds ~30-45 MENU blocks. Each block:
- `=== MENU mXXXX ===`
- one or more `restaurant <id> "<name>" | current: <cuisine> | raw: ... | tags: ... | area: ... | price_band: ...`
  lines (several lines = chain branches sharing an identical menu; ONE result covers all of them)
- a stats line, then `## Section (count)` headers and `- Item — price — description` rows.
  Big menus are trimmed (`(+N more not shown)`).
Read the WHOLE file (Read with offset/limit in ~1500-line chunks).

## Your output
Write `results/batch-NNN.json`: a JSON array with exactly ONE object per MENU block, same order.
Example (comments are explanation only; the file must be plain JSON):

```
{
  "menu": "m0001",
  "status": "ok",                       // "ok" | "hold"
  "hold_reason": null,                  // null | "junk_menu" | "retail" | "drinks_only" | "wrong_restaurant" | "too_few_items"
  "main_cuisine": "American",           // exactly one of CUISINES
  "secondary_cuisines": ["Bars"],       // 0-3 of CUISINES, never the main
  "new_cuisine": null,                  // null, or a cuisine the 29 lack (e.g. "Salads & Healthy", "Poke"); use sparingly
  "styles": ["Brewpub"],                // 0-3 regional/sub-styles, Title Case: "Nashville Hot Chicken", "Neapolitan", "Sichuan", "Baja", "Oaxacan", "Detroit-Style", "Izakaya"
  "confidence": "high",                 // "high" | "medium" | "low" (low = near-tie or thin/odd menu)
  "service": "full_service",            // one of SERVICE
  "meals": ["lunch", "dinner"],         // subset of MEALS, from section names/items; [] if unclear
  "dish_types": ["wings", "burgers", "poke", "nachos"],  // 1-8 lowercase plural nouns, most central first
  "signature_dishes": ["Ballast Point Wings"],           // 0-5 EXACT item names copied from this menu
  "proteins": ["chicken", "beef", "fish"],               // subset of PROTEINS that are prominent
  "dietary": { "vegetarian": "few", "vegan": "none", "gluten_free": "none" },  // each "none" | "few" | "many"
  "dietary_flags": [],                  // subset of DIETARY_FLAGS, ONLY if the menu says so
  "spice": "some",                      // "none" | "some" | "lots"
  "drinks": ["beer"],                   // subset of DRINKS
  "desserts": false,
  "kids_menu": false,
  "vibes": ["casual", "shareable", "craft_drinks"],      // 0-5 of VIBES
  "summary": "Brewery taproom pouring Sculpin IPAs alongside wings, poke and birria nachos.",  // <=160 chars: what you'd eat here
  "notes": null                         // null, or a data problem worth a human look
}
```

Vocabularies (exact spelling):
- CUISINES: African, American, Asian, BBQ, Bakery & Desserts, Bars, Breakfast & Brunch, Burgers, Chicken, Chinese, Coffee & Tea, Fast Food, French, Hawaiian, Indian, Italian, Japanese, Juice & Smoothies, Korean, Latin American, Mediterranean, Mexican, Pizza, Sandwiches, Seafood, Steakhouse, Thai, Vegetarian, Vietnamese
- SERVICE: full_service, fast_casual, counter, cafe, bakery, bar, brewery_winery, food_truck, market_deli, fine_dining, buffet, unknown
- MEALS: breakfast, brunch, lunch, dinner, late_night, dessert, drinks
- PROTEINS: chicken, beef, pork, lamb, goat, fish, shellfish, tofu, eggs, plant_based
- DRINKS: coffee, tea, boba, smoothies, juice, soda, beer, wine, cocktails, sake_soju
- DIETARY_FLAGS: halal, kosher, keto, dairy_free, nut_free
- VIBES: comfort_food, healthy, indulgent, street_food, fusion, family_style, shareable, grab_and_go, upscale, casual, hearty, light, regional_authentic, plant_forward, seafood_focused, meat_heavy, sweet_tooth, craft_drinks

## Rules for cuisines (from a verified 30-restaurant trial; follow them)
1. **Count food rows only.** Ignore drinks (incl. beer/wine/cocktail lists), sides, sauces,
   add-ons, kids, merch, catering, "OUT OF STOCK" and non-dish rows when deciding cuisines.
   Never derive a secondary cuisine from drink rows. Coffee & Tea / Juice & Smoothies is main
   only when drinks ARE the business (coffee shop, juice bar) and food is minor.
2. **Main = what the place is**: the largest coherent food group, read by section, with the
   restaurant name as a strong signal. Prefer specific cuisines over buckets: "Asian",
   "Latin American", "American" only when nothing specific fits.
3. **Secondary** needs >=15% of food rows AND >=4 matching rows, or the cuisine is named in the
   restaurant's name ("Hot Chickz & Pizza" -> Chicken). Max 3. A dietary section (vegan, GF) is
   not a cuisine; "Vegetarian" is a cuisine only when the whole menu is meat-free. Count each
   item once (an egg sandwich feeds Breakfast OR Sandwiches, not both).
4. **Venue tags** "Bars" and "Fast Food": only when the current tag or the name supports it.
   If a bar/brewery has a real food menu, the food cuisine is main and Bars is a secondary.
5. **Near-tie** (top two food groups within ~2 rows or ~10%): the name decides; confidence "low".
6. **Hold** (status "hold"; main_cuisine = the current cuisine if it is in CUISINES, else best
   guess; secondary []): fewer than ~10 food rows, mostly one-item/junk sections, a retail or
   merch catalog, a drinks-only list for a place that serves food, or a menu that clearly
   belongs to a different business than the name. Say why in `notes`. Still fill any field the
   menu supports reliably; leave the rest empty/"unknown".
7. Don't invent. Anything the menu doesn't support stays empty, "none", "unknown" or false.
   `signature_dishes` must be copied exactly from the menu's item names (house specials,
   items named after the restaurant, "famous"/"signature" items, the dish it's built around).

## When done
Run `node validate.mjs batch-NNN` (from this folder) and fix every error it prints until it
prints `OK`. Do not touch any other file. Do not query the database.
