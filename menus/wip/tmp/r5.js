const { upsert } = require('./build_result.js');
const rows = require('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/nd_rows_final.json');
upsert({
  restaurantId: "2705",
  name: "Noodles & Company",
  sourceUrl: "https://www.doordash.com/store/noodles-&-company-carlsbad-2832849/",
  confidence: "medium",
  notes: "Chain location. Own site (noodles.com and the store-specific locations.noodles.com/.../menu page) is a fully client-rendered Angular SPA - curl returns an identical empty shell (runtime/polyfills/scripts/main.js bundle, 0 dollar signs) on every route, no embedded JSON found. The Olo storefront (order.noodles.com) is also client-only. Used DoorDash marketplace instead - two Carlsbad DoorDash listings exist (store IDs 2832849 and 379557); only 2832849's JSON-LD address (2521 Palomar Airport Rd, Carlsbad, CA) matches the work-list address exactly, so 379557 was discarded as a different/stale listing. Markup test (1.04/1.1/1.15/1.2/1.25) across 79 raw items showed no dominant divisor (max was 9/79 on 1.04 and 10/79 '.95' on 1.1, both well short of a real pattern) - passes. Deduplicated 79 raw JSON-LD rows to 68 by dropping repeat listings of the same dish name under marketing labels ('New & Featured', 'Limited-Time Only') that duplicated the same item/price already captured under its real category (e.g. Baked Cheese Tortelloni appeared identically in 3 sections). 15 items showing a '+' (size/protein-variant starting price) were recorded at that base price with the + stripped, per the from-price rule; the underlying item still has upsell options not captured. Sections reached: Culinary Classics, Chef-Curated with Protein, Mac & Cheese, Delicious Duos, Protein Packed (a la carte proteins), Salad & Soup, Sides, Kids Meals, Desserts - full range for the chain's known menu; nothing looks missing.",
  dishes: rows
});
