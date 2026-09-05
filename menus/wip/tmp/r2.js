const { upsert } = require('./build_result.js');
const rows = require('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/mama_rows.json');
upsert({
  restaurantId: "3080",
  name: "Mama Mia Pizza",
  sourceUrl: "https://www.toasttab.com/mama-mia-pizza-2004-dairy-mart-rd",
  confidence: "high",
  notes: "Toast __OO_STATE__ embedded the full catalog server-side, named 'POS MENU' (not a delivery-labeled menu) - single menu, no 3PO/Delivery duplicate to worry about. Markup test (1.04/1.1/1.15/1.2/1.25) across all 93 items found no consistent divisor pattern - passes; prices are POS-style odd cents ($6.99, $9.99, $25.99 etc). Sections reached: Deals and Specials, Small/Medium/Large/XLarge/Party Pizzas, Spaghetti, Side Dishes, Dessert, Dips, 20oz Soda, 2L Soda - full size range and all categories present for a pizzeria, nothing looks missing.",
  dishes: rows
});
