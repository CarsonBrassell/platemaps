const { upsert } = require('./build_result.js');
const rows = require('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/ph_rows.json');
upsert({
  restaurantId: "4510",
  name: "Pizza Hut Delivery",
  sourceUrl: "https://www.doordash.com/store/23701528/",
  confidence: "medium",
  notes: "Chain location. Own site (locations.pizzahut.com and pizzahut.com/menu/*) never exposes a store-specific price - the static HTML has no store ID or ordering context and pricing is applied client-side after an address/store is chosen, which needs a browser. Used DoorDash marketplace store 23701528 instead; its JSON-LD address (4090 El Cajon Boulevard, San Diego, CA) matches the work-list address exactly. Markup test (1.04/1.1/1.15/1.2/1.25) across 65 raw items found no consistent divisor pattern (at most 1/52 landed round) - passes. Deduplicated 65 raw rows to 52 by dropping repeats of the same dish/price already listed under a real category when they also appeared under the marketing labels 'Most Ordered' and 'Limited Time Offering'. Sections reached: Boxes & Bundles, Pizzas, Wings, Melts, Sides, Pasta, Dipping Sauces, Beverages, Desserts - full range for a Pizza Hut delivery-only location; nothing looks missing. All items show a single price with no visible size/topping variant pricing in this JSON-LD.",
  dishes: rows
});
