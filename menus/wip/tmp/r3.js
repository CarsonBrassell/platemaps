const { upsert } = require('./build_result.js');
const rows = require('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/bam_rows.json');
upsert({
  restaurantId: "3726",
  name: "Bambinos Pizza",
  sourceUrl: "https://www.bambinospizzadeli2.com/?utm_source=gbp",
  confidence: "high",
  notes: "Restaurant's own domain, running the Slice ordering platform; schema.org Restaurant+Menu JSON-LD server-rendered in the page HTML. Address in JSON-LD (1392 E Palomar St, Chula Vista, CA 91913) matches the work-list address exactly. Markup test (1.04/1.1/1.15/1.2/1.25) across all 97 items found no consistent divisor pattern - passes; prices are POS-style .99 endings. Sections reached: House Favorites, Pizza, Gourmet Pizza, Specials, Appetizers, Salads, Sauce On The Side, Wings, Calzones, Sandwiches, Pasta Dinners, Desserts, Beverages, Catering - full range for a pizza & deli, nothing looks missing. Each item shows one listed price (base/single size per JSON-LD, no separate small/medium/large offers exposed) - recorded as the price shown.",
  dishes: rows
});
