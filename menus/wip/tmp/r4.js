const { upsert } = require('./build_result.js');
upsert({
  restaurantId: "3409",
  name: "The Coffee Bean & Tea Leaf",
  sourceUrl: "https://coffeebean.olo.com/menu/coffee-bean-tea-leaf-carmel-mountain-plaza-san-diego",
  confidence: "low",
  blocked: "Needs a browser. The restaurant's own ordering platform is an Olo storefront (coffeebean.olo.com) that is a fully client-rendered SPA - curl returns a 17KB shell with zero dollar signs and no embedded JSON, matching the playbook's noted history of four prior failed attempts on this exact chain/platform. DoorDash marketplace (https://www.doordash.com/store/the-coffee-bean-%26-tea-leaf-san-diego-329287/, address-verified to 12070 Carmel Mountain Road, San Diego) does serve a real schema.org Menu JSON-LD with 91 priced items, but its 7 sections (Most Ordered, Seasonal Offerings, Food|Baked Goods, Food|Breakfast, Food|Lunch, Coffee|The Perfect Americano, Coffee|Iced Espresso) are a DoorDash-curated subset, not the full catalog: there is no Tea section at all for a brand named 'Coffee Bean & TEA LEAF', and only 4 Ice Blended flavors appear against what is normally a much larger signature Ice Blended lineup. Missing a core category (tea) makes this a partial that would read as the whole menu, per the completeness rule - not filed as dishes.",
  notes: "Chain location confirmed as 12070 Carmel Mountain Rd Ste 296, San Diego (matches work list). Needs a Chrome-equipped agent to load coffeebean.olo.com/menu/coffee-bean-tea-leaf-carmel-mountain-plaza-san-diego and read the client-rendered menu, which should include Tea and the full Ice Blended range that DoorDash omits.",
  dishes: []
});
