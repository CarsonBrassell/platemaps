const { upsert } = require('./build_result.js');
const rows = require('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/liv_rows.json');
upsert({
  restaurantId: "3617",
  name: "Liv Juice Bar & Breakfast",
  sourceUrl: "https://www.doordash.com/store/liv-juice-bar-and-smoothies-san-diego-96371/",
  confidence: "medium",
  notes: "Own site (livjuicesandiego.com) is a client-rendered Homestead/GoDaddy Website Builder SPA with no server-rendered content in HTML or JSON-LD (menu page and homepage return identical empty shells) - could not extract without a browser. Business appears on delivery platforms as 'LIV Juice Bar and Smoothies' at the same address (1251 University Avenue) as the work-list entry, confirming same business under a name variant. Used DoorDash marketplace schema.org Menu JSON-LD (server-rendered, tier 3). Markup test (1.04/1.1/1.15/1.2/1.25) run across all 71 items found no consistent divisor pattern - passes. Sections reached: Tortas, Sandwiches, Soups & Salads, Bowls, Extras (add-ons), Boost (supplements), Raw Juices, Fruit Smoothies, Shots - a 'Most Ordered' 10th section was dropped as a duplicate sample of the others, not a distinct menu. All core categories for a juice-bar-and-breakfast concept (juices, smoothies, bowls, sandwiches, salads, soups) are present; nothing looks missing. Uniform $9.57 across all 27 raw-juice/smoothie items is unusual but internally consistent (odd non-round cents, not a farm tell like a clean $X.95); WebSearch summary of the same DoorDash-family listing independently reported matching prices for overlapping items (Breakfast Burrito-type $14 bowls, $9.57 smoothies).",
  dishes: rows
});
