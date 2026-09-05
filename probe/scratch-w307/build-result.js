const fs = require('fs');
const OUT = 'C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-w3-07.json';

// ---- 3986 Taste of Hong Kong dish list (transcribed from 5 menu photo pages, own Weebly site) ----
const hkDishes = [];
function sec(name, rows) {
  for (const [n, p] of rows) hkDishes.push({ name: n, description: '', price: p, section: name });
}
sec('Appetizer', [
  ['Szechuan Style Cucumber','$8.95'],
  ['Jelly Fish Salad','$10.95'],
  ['Fried Vegetarian Spring Rolls','$7.95'],
  ['Braised Tofu','$9.95'],
  ['Fried Tofu with Salt And Pepper','$9.95'],
  ['Fried Soft-shell Crab with Salt And Pepper','$9.95'],
  ['Fried Baby Squid with Salt And Pepper','$13.95'],
  ['Fried Chicken Wings with Salt And Pepper (6)','$12.95'],
  ['Fried Chicken Wings with Salted Egg (6)','$13.95'],
]);
sec('Soup', [
  ['Hong Kong Style Soup (For 6-8 Person)','$39.95'],
  ['Daily Special Soup','$17.95'],
  ['Hot and Sour Soup','$17.95'],
  ['Egg Drop Soup','$16.95'],
  ['Wonton Soup','$18.95'],
  ['Corn Soup With Minced Chicken','$17.95'],
  ['Seafood Tofu Soup','$20.95'],
  ['Minced Beef Thick Soup','$17.95'],
  ['Crab Meat with Fish Maw Soup','$27.95'],
  ['Soup with Cilantro, Preserved Egg, Tofu and Fish','$25.95'],
  ['Black Sesame Mochi In Egg Flower Ginger Soup','$17.95'],
]);
sec('Barbecue', [
  ['Fried Squab','$26.95'],
  ['Peking Duck (Half)','$30.00'],
  ['Peking Duck (Whole)','$58.00'],
  ['Add Minced Duck Wrapped in Lettuce','$13.95'],
  ['Minced Duck Wrapped in Lettuce (Half)','$29.95'],
  ['Hong Kong Style Roast Duck (Half)','$22.00'],
  ['Hong Kong Style Roast Duck (Whole)','$39.00'],
  ['House Special Chicken (Half)','$20.00'],
  ['House Special Chicken (Whole)','$35.00'],
  ['Soy Sauce Chicken (Half)','$20.00'],
  ['Soy Sauce Chicken (Whole)','$35.00'],
  ['Crispy Roast Chicken (Half)','$22.00'],
  ['Crispy Roast Chicken (Whole)','$39.00'],
  ['Crispy Roast Pork Belly Macao Style','$19.95'],
  ['Honey BBQ Pork','$19.95'],
  ['Choice of Two Barbecued Dishes','$21.95'],
  ['Choice of Three Barbecued Dishes','$29.95'],
  ['Choice of Four Barbecued Dishes','$39.95'],
  ['Choice of Five Barbecued Dishes','$49.95'],
]);
sec('Wagyu', [
  ['Wagyu with Bitter Melon','$22.95'],
  ['Stir Fried Wagyu with Scallion','$22.95'],
  ['Orange Wagyu','$22.95'],
  ['Broccoli Wagyu','$22.95'],
]);
sec('Lamb', [
  ['Pan Fried Lamb Chop with Black Pepper (6)','$39.95'],
  ['Pan Fried Lamb Chop with Basil (6)','$39.95'],
  ['Fried Lamb with Scallion','$23.95'],
  ['Fried Lamb with Cumin','$23.95'],
  ['Lamb Belly Pot (Seasonal)','$32.95'],
]);
sec('Chicken', [
  ['Kung Pao Chicken','$18.95'],
  ['Orange Chicken','$18.95'],
  ["General Tso's Chicken",'$18.95'],
  ['Sweet & Sour Chicken','$18.95'],
  ['Chicken with Vegetables','$18.95'],
]);
sec('Pork', [
  ['Sweet & Sour Pork','$19.95'],
  ['Braised Pork Belly with Preserved Vegetable','$22.95'],
  ['Sweet & Sure Pork Ribs','$19.95'],
  ['Fried Pork Ribs with Garlic','$19.95'],
  ['Pork Chops (Salt Pepper/BBQ Sauce/Black Pepper)','$21.95'],
  ['Pork Chops with Orange Peel Sauce','$23.95'],
  ['Steamed Minced Pork with Dry Scallops','$21.95'],
  ['Steamed Minced Pork with Preserved Fish','$21.95'],
]);
sec('Clay Pot', [
  ['Tofu Chicken & Salted Fish in Clay Pot','$20.95'],
  ['Chicken Eggplant & Salted Fish in Clay Pot','$20.95'],
  ['Seafood & Tofu in Clay Pot','$21.95'],
  ['Roast Pork Belly Slices & Tofu in Clay Pot','$20.95'],
  ['Roast Pork Belly Slices & Oyster in Clay Pot','$29.95'],
  ['Roast Pork Belly Slices & Oyster in Clay Pot (2)','$33.95'],
  ['Braised Beef Brisket with Daikon','$27.95'],
]);
sec('Tofu', [
  ['Mapo Tofu','$17.95'],
  ['Tofu & Minced Pork with Spicy Sauce','$19.95'],
  ['Deep Fried Crispy Tofu','$19.95'],
  ['Silk Tofu with Mushrooms','$19.95'],
  ['Tofu & Eggplant & Green Pepper in Special Sauce','$26.95'],
]);
sec('Spicy Lover', [
  ['Chengdu Style Roast Duck & Spam in Spicy Broth','$29.95'],
  ['Hunan Style Wagyu','$22.95'],
  ['Boiled Wagyu in Spicy Broth','$22.95'],
  ['Boiled Fish Fillet in Spicy Broth','$21.95'],
  ['Szechuan Style Chicken','$18.95'],
]);
sec('Vegetables', [
  ['Snow Pea Leaves (Garlic/Superior Stock)','$22.95'],
  ['Snow Pea Leaves with Preserved and Salty Eggs','$24.95'],
  ['Tong Choy (Bean Curd Paste/Belacan Sauce)','$20.95'],
  ['String Bean (Ground Pork/Garlic)','$19.95'],
  ['Chinese Broccoli (Garlic/Oyster Sauce)','$19.95'],
  ['Chinese Broccoli with Small Dry Fish','$20.95'],
  ['Choy Sum (Garlic/Superior Stock)','$19.95'],
  ['Eggplant & Minced Meat with Spicy Sauce','$19.95'],
  ['Braised Mustard Green with Garlic In Superior Stock','$19.95'],
  ['Cauliflower with Salted Meat','$18.95'],
  ['Stir Fried Yam with Vegetables','$22.95'],
  ['Stir Fried Bitter Melon with Black Bean Sauce','$18.95'],
]);
sec('Noodles and Rice', [
  ['Fried Rice (BBQ Pork/Beef/Chicken/Shrimp+2)','$17.95'],
  ['House Special Fried Rice','$21.95'],
  ['Fried Rice with Dry Scallop & Egg White','$20.95'],
  ['Fried Rice with Chicken & Salted Fish','$20.95'],
  ['Young Chow Fried Rice','$18.95'],
  ['Mix Vegetables Fried Rice/Noodle','$18.95'],
  ['Beef Chow Fun','$18.95'],
  ['Beef Chow Fun with Black Bean Sauce','$18.95'],
  ['Chow Fun with X.O. Sauce','$18.95'],
  ['Hong Kong Style Crispy Pan Fried Noodle','$18.95'],
  ['Crispy Pan Fried Noodle with Vegetables','$18.95'],
  ['House Special Pan Fried Rice Noodle','$18.95'],
  ['Country Pan Fried Noodle','$21.95'],
  ['Singapore Style Rice Noodle','$18.95'],
  ['Pan Fried Noodle With Soy Sauce','$17.95'],
  ['Braise E-Fu Noodles with Mushroom and Chives','$20.95'],
  ['House Special Chow Mein','$20.95'],
  ['Steamed Rice','$2.50'],
]);
sec('Live Seafood', [
  ['Add E-Fu Noodles/Ho Fun/Rice Noodles','$8.00'],
  ['Sea Cucumber With Fresh Vegetables','$15.95'],
  ['Sea Cucumber & Abalone With Fresh Vegetables','$25.95'],
  ['Braised Fresh Abalone (Medium)','$58.00'],
  ['Braised Fresh Abalone (Large)','$68.00'],
]);
sec('Seafood', [
  ['Fish Fillet in Sauteed/Black Bean Sauce/Spicy Broth','$21.95'],
  ['Salt and Pepper Shrimp in Shell','$22.95'],
  ['HK Style Fried Shrimp in Shell with Garlic & Chilli','$25.95'],
  ['Sauteed Scallops','$27.95'],
  ['Scallops with Chinese Yellow Chives','$29.95'],
  ['Scallops with X.O. Sauce','$27.95'],
  ['Shrimp with Scrambled Egg','$22.95'],
  ['Shrimp with Vegetables','$21.95'],
  ['Fried Shrimp with Garlic & Chilli','$25.95'],
  ['Sauteed Shrimp with Salted Egg Yolk','$23.95'],
  ['Kung Pao Shrimp','$21.95'],
  ['Sauteed Shrimp with X.O. Sauce','$25.95'],
  ['Honey Walnut Shrimp','$26.95'],
  ['Sauteed Shrimp & Scallion','$25.95'],
  ['Fried Oyster','$27.95'],
  ['Fried Oyster with Ginger & Scallion/Salted Egg','$28.95'],
  ['Live Frog in Sauteed/Salt Pepper/Spicy Broth','$29.95'],
]);
sec('Beef', [
  ['House Special Pepper Fillet Steak','$26.95'],
  ['French Style Fillet Steak','$26.95'],
  ['Assorted Mushroom Fillet Steak','$26.95'],
  ['Fillet Steak With Pepper In Sizzling Plate','$26.95'],
  ['Black Pepper Fillet Steak with Scallop','$30.95'],
  ['Fried Prime Ribeye','$48.95'],
]);
sec('Drink', [
  ['Coke/Sprite/Diet Coke','$2.50'],
  ['Bottled Water','$2.00'],
  ['Sparkling Water','$3.50'],
  ['Imported Beer','$5.50'],
  ['Domestic Beer','$5.50'],
  ['Tsingtao Beer (Small)','$5.50'],
  ['Tsingtao Beer (Large)','$10.50'],
  ['Orange Juice','$3.50'],
  ['Herbal Tea (Jia Duo Bao)','$4.00'],
  ['Ice Tea','$3.50'],
]);

const results = [
  {
    restaurantId: '1219',
    name: 'Greenbrier Inn',
    sourceUrl: 'https://www.liveatgreenbriervillage.com/',
    confidence: 'high',
    notes: 'website is a senior-living apartment community, not a restaurant; no menu or food-service section published anywhere on the site; 0 dollar amounts found on the page',
    dishes: [],
  },
  {
    restaurantId: '5071',
    name: 'Underwater Cantina',
    sourceUrl: 'https://seaworld.com/san-diego/dining/underwater-cantina/',
    confidence: 'high',
    notes: 'SeaWorld park dining venue; page describes cuisine/atmosphere only, publishes no itemized prices anywhere for this venue — standard park-concession non-disclosure case',
    dishes: [],
  },
  {
    restaurantId: '3170',
    name: "Cent'Anni Café",
    sourceUrl: 'https://www.fairmont.com/san-diego/dining/cent-anni/',
    confidence: 'low',
    dishes: [],
    blocked: 'needs-browser: Fairmont Grand Del Mar dining page for Cent\u2019Anni is a marketing page with a reservation widget; no menu content or item prices present in static HTML ($200/$400/$50 present are package/resort pricing, not food items); no ordering platform or PDF menu found',
  },
  {
    restaurantId: '4456',
    name: 'Lagoon Terrace',
    sourceUrl: 'https://sdzwa.org/dining/lagoon-terrace/menu',
    confidence: 'high',
    notes: 'San Diego Zoo concession venue; PDF menu lists dish names only, zero prices published anywhere in the document (verified via pdftotext and extracted page images) — standard park-concession non-disclosure case',
    dishes: [],
  },
  {
    restaurantId: '3527',
    name: 'Nékter Juice Bar',
    sourceUrl: 'https://order.nekterjuicebar.com/',
    confidence: 'low',
    dishes: [],
    blocked: 'needs-browser: Olo storefront (serve-next.olo.com assets, channelSlug present) requires client-side location selection before menu/prices render; no working public API endpoint found after several attempts (all 404/403)',
  },
  {
    restaurantId: '3616',
    name: 'Our Green Affair',
    sourceUrl: 'https://www.doordash.com/store/our-green-affair-san-diego-1146557/',
    confidence: 'low',
    dishes: [],
    blocked: 'needs-more-time: verified correct branch (address 1255b University Avenue matches work list) via DoorDash JSON-LD, but 15 of 20 priced items land on clean conventional endings (.00/.50/.95/.99) only when divided by 1.15 (vs near-zero hit rate at every other tested divisor) — strong evidence of a baked-in ~15% DoorDash markup; prices cannot be filed as printed and must not be divided out; no first-party site or other source found for this branch',
  },
  {
    restaurantId: '4729',
    name: 'SPACE',
    sourceUrl: 'http://www.weareheartspace.com/',
    confidence: 'high',
    notes: 'heARTspace is an arts nonprofit/community space, not a food business; site has no menu, no food service, no prices for any items',
    dishes: [],
  },
  {
    restaurantId: '3986',
    name: 'Taste of Hong Kong',
    sourceUrl: 'https://tasteofhongkongsd.weebly.com',
    confidence: 'high',
    notes: '146 priced dishes transcribed from 5 photographed menu pages hosted on the restaurant\u2019s own Weebly site (first-party, printed-menu .95/.00-cent pricing). Half/whole dishes (Peking Duck, HK Style Roast Duck, House Special Chicken, Soy Sauce Chicken, Crispy Roast Chicken, Braised Fresh Abalone) split into separate Half/Whole entries. Tsingtao Beer Small/Large split into two entries. All Market Price (MP) live-seafood items dropped entirely (Steamed Fresh Live Fish and 8 fried/steamed lobster-or-crab preparations) since no real price is printed. Steamed Rice and all Drink section prices reformatted to two decimals (e.g. printed "2.5" -> "$2.50"). Clay Pot section has two dishes both printed in English as "Roast Pork Belly Slices & Oyster in Clay Pot" (29.95 and 33.95) even though the Chinese characters differ (生蚝=oyster vs 海参=sea cucumber for the second) — transcribed exactly as printed on the menu, second one suffixed "(2)" to keep entries distinct.',
    dishes: hkDishes,
  },
  {
    restaurantId: '4716',
    name: 'Rush Bowls',
    sourceUrl: 'https://rushbowls.com/',
    confidence: 'low',
    dishes: [],
    blocked: 'needs-browser: work list has no address for this location; national marketing homepage only, no menu/prices, no location-specific ordering link found in static HTML; requires a location-finder lookup to identify the correct branch storefront',
  },
];

let existing = [];
if (fs.existsSync(OUT)) {
  existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
}
const byId = new Map(existing.map(r => [r.restaurantId, r]));
for (const r of results) byId.set(r.restaurantId, r);
const merged = [...byId.values()];
fs.writeFileSync(OUT, JSON.stringify(merged, null, 2));
console.log('wrote', merged.length, 'entries to', OUT);
