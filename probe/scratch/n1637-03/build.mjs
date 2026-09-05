// Build script: assembles result entries from scratch JSON into the result file.
// Run manually with node as data is added. Not one of the forbidden scripts/ scripts.
import { readFileSync, writeFileSync } from "node:fs";

const SCRATCH = "C:/Users/CALVIN~1/AppData/Local/Temp/claude/C--Users-Calvin--Lensink/55a7518e-e6c8-4b37-8070-eca187b845fc/scratchpad";

function money(n) {
  const num = typeof n === "string" ? parseFloat(n.replace("$", "")) : n;
  return "$" + num.toFixed(2);
}

const atelierRows = JSON.parse(readFileSync(`${SCRATCH}/atelier-parsed.json`, "utf8"));
const champagneRows = [];
{
  const lines = readFileSync(`${SCRATCH}/champagne-menu.txt`, "utf8");
  // Manually curated list built from the printed PDF text (see transcript); avoids re-parsing scrambled beverage columns.
}

const kyodongRows = JSON.parse(readFileSync(`${SCRATCH}/kyodong-dd-final.json`, "utf8"));
const ritosRows = JSON.parse(readFileSync(`${SCRATCH}/ritos-dd-final.json`, "utf8"));
const lacorrienteRows = JSON.parse(readFileSync(`${SCRATCH}/lacorriente-rows.json`, "utf8"));
const alohanaRows = JSON.parse(readFileSync(`${SCRATCH}/alohana-final.json`, "utf8"));

const champagnePDF = [
  ["ALL DAY BREAKFAST","Create-Your-Own Omelet",12.99],
  ["FRENCH TOAST","Brioche French Toast",13.29],
  ["FRENCH TOAST","Mixed Berry French Toast",13.49],
  ["BREAKFAST FAVORITES","Two Eggs Any Style",11.59],
  ["BREAKFAST FAVORITES","Croissant Breakfast Sandwich",11.99],
  ["BREAKFAST FAVORITES","Breakfast Panini",11.99],
  ["BREAKFAST FAVORITES","Le Metro Breakfast Sandwich",11.99],
  ["BREAKFAST FAVORITES","Vanilla Yogurt Granola Parfait",9.29],
  ["SPECIALTIES / BENEDICTS","Short Rib Benedict",19.59],
  ["SPECIALTIES / BENEDICTS","Classic Benedict",14.99],
  ["SPECIALTIES / BENEDICTS","California Benedict",16.49],
  ["CRÊPES","Chicken Florentine Crêpes",13.49],
  ["CRÊPES","Breakfast Crêpes",13.49],
  ["CRÊPES","Strawberries & Cream Crêpes",12.99],
  ["QUICHE","Quiche Lorraine",12.79],
  ["QUICHE","Spinach & Goat Cheese Quiche",12.79],
  ["À LA CARTE","Seasoned Red Potatoes",3.79],
  ["À LA CARTE","Chicken Salad",4.89],
  ["À LA CARTE","Avocado",3.49],
  ["À LA CARTE","Tuna Salad",4.89],
  ["À LA CARTE","Applewood Smoked Bacon",3.99],
  ["À LA CARTE","French Fries",3.59],
  ["À LA CARTE","Pesto Pasta Salad",4.39],
  ["À LA CARTE","Bag of Chips",2.29],
  ["À LA CARTE","Fruit Salad",5.49],
  ["COLD SANDWICHES","Prosciutto & Stracciatella Pesto",13.99],
  ["COLD SANDWICHES","Chicken Salad Sandwich",12.29],
  ["COLD SANDWICHES","Turkey & Havarti Sandwich",11.99],
  ["COLD SANDWICHES","Turkey, Swiss Cheese & Bacon",12.89],
  ["COLD SANDWICHES","Albacore Tuna Sandwich",12.29],
  ["MAC & CHEESE","Homestyle Mac & Cheese",12.49],
  ["MAC & CHEESE","Chicken Pesto Mac & Cheese",15.29],
  ["PINSA PIZZA","Prosciutto Bianca",13.99],
  ["COMBOS","Choose Any Two",13.69],
  ["HOT SANDWICHES","Honey Dijon Turkey Melt",14.49],
  ["HOT SANDWICHES","Turkey Artichoke Grilled Cheese",12.29],
  ["HOT SANDWICHES","Croque Monsieur - The Original",13.69],
  ["HOT SANDWICHES","Croque Madame",15.99],
  ["HOT SANDWICHES","Short Rib Melt",15.49],
  ["HOT SANDWICHES","Garlic Chicken Panini",13.69],
  ["HOT SANDWICHES","French Dip",13.99],
  ["HOT SANDWICHES","Chicken Pesto Sandwich",13.69],
  ["HOT SANDWICHES","Veggie Panini",12.29],
  ["HOT SANDWICHES","Grilled Cheese",10.69],
  ["HOT SANDWICHES","Grilled Brie with Fig & Apple",11.69],
  ["PROTEIN BOWLS & SALADS","Roasted Beet & Berry with Goat Cheese",14.99],
  ["PROTEIN BOWLS & SALADS","Green Goddess Chicken with Avocado",14.99],
  ["PROTEIN BOWLS & SALADS","Chicken, Apple, Walnut Salad",14.29],
  ["PROTEIN BOWLS & SALADS","Cobb Salad",14.29],
  ["PROTEIN BOWLS & SALADS","Niçoise Salad",14.79],
  ["PROTEIN BOWLS & SALADS","Parisian Salad",13.29],
  ["PROTEIN BOWLS & SALADS","Goat Cheese Salad",13.29],
  ["PROTEIN BOWLS & SALADS","House Salad",7.99],
  ["SOUPS","Soup - Cup (French Onion, Broccoli Cheddar, or Rustic Tomato)",6.29],
  ["SOUPS","Soup - Bowl (French Onion, Broccoli Cheddar, or Rustic Tomato)",9.29],
  ["KID'S MEALS","Petite French Toast (Kids)",7.69],
  ["KID'S MEALS","Scrambled Eggs (Kids)",7.69],
  ["KID'S MEALS","Grilled Cheese (Kids)",7.69],
  ["KID'S MEALS","Chicken Fingers (Kids)",7.69],
  ["KID'S MEALS","Turkey Swiss Sandwich (Kids)",7.69],
];

function entryFiled({id, name, sourceUrl, confidence, crossCheckedAgainst, notes, dishes}) {
  return { restaurantId: id, name, sourceUrl, confidence, ...(crossCheckedAgainst?{crossCheckedAgainst}:{}) , notes, dishes };
}
function entryBlocked({id, name, sourceUrl, confidence, blocked}) {
  return { restaurantId: id, name, sourceUrl: sourceUrl||"", confidence, dishes: [], blocked };
}

const results = [];

results.push(entryBlocked({
  id:"7191", name:"Karihan Filipino Food",
  sourceUrl:"https://www.yelp.com/biz/karihan-filipino-food-national-city",
  confidence:"low",
  blocked:"no-priced-source: worklist 'website' (filipinofoodfinder.com) is an unrelated Filipino-restaurant directory that never mentions Karihan; own domain/social not found; only tier-5 aggregators (allmenus, menupix, restaurantguru, menustic) and Yelp review hearsay carry any prices"
}));

results.push(entryBlocked({
  id:"6533", name:"Sinbad Restaurant And Lounge",
  sourceUrl:"https://www.yelp.com/biz/sinbad-ultra-lounge-san-marcos-9",
  confidence:"low",
  blocked:"conflicting-status: Yelp lists 'Sinbad Ultra Lounge' (same address) as CLOSED (Aug 2025) and sinbadrestaurantandlounge.com no longer resolves (DNS failure), but DoorDash/Postmates listings for the same name/address still appear live - not high-confidence closure, so blocked rather than not_found"
}));

results.push(entryFiled({
  id:"7208", name:"Atelier Manna",
  sourceUrl:"https://www.atelier-manna.com/menu",
  confidence:"high",
  notes:"first-party Squarespace menu page; prices appear as bare integers with no $ glyph in the source (design choice, not a marketplace fee) - copied verbatim and prefixed with $x.00; one item 'fire cider (v18)' has a parenthetical that looks like a price, real price is the trailing 7 outside the parens",
  dishes: atelierRows.map(r => ({ name: r.name, description: "", price: money(r.price), section: "Menu" }))
}));

results.push(entryFiled({
  id:"7216", name:"Champagne Bakery",
  sourceUrl:"https://champagnebakery.com/wp-content/uploads/sites/2/2026/07/Website_Menu_Champagne-Bakery_July-2026_R1.pdf",
  confidence:"high",
  notes:"first-party PDF menu linked from champagnebakery.com/location/carmel-mountain/ (matches 11925 Carmel Mountain Rd address); conventional printed cents (.99/.49/.29 etc), no divisor test needed for a first-party PDF; Beverages section dropped - pdftotext -layout scrambled the two-column Regular/Large price pairing and it could not be read back reliably; Kids Meals share one flat $7.69 price per the menu, applied to each named kids item; Postmates/Uber Eats listings for this store run ~15-20% higher (e.g. Croissant Breakfast Sandwich $14.15 vs $11.99 here) - delivery markup, correctly excluded",
  dishes: champagnePDF.map(([section,name,price]) => ({ name, description:"", price: money(price), section }))
}));

results.push(entryFiled({
  id:"7491", name:"La Corriente La Jolla",
  sourceUrl:"https://www.ubereats.com/store/la-corriente-pearl-st/7P4k2FKjX0m7dhvQW-4OfQ",
  confidence:"medium",
  notes:"Uber Eats JSON-LD, address confirmed 456 Pearl Street/92037 matches worklist; single schema.org Menu block, no duplication found; divisor sweep 1.00-1.35: best is 1.00 with 15/15 rows on .00/.50 (fully conventional); a gotoeat.net 'own site' look-alike was found but rejected - it shows blank '$' for ~28 of 30 rows and its one priced overlap ('La Corriente Ceviche' $27) matches neither of this menu's two ceviche items ($17 tostada, $33.50 platter), so it was not used as a cross-check",
  dishes: lacorrienteRows.map(r => ({ name: r.name, description:"", price: money(r.price), section: r.section }))
}));

results.push(entryBlocked({
  id:"7600", name:"Mila's Ice cream & snacks",
  sourceUrl:"https://www.yelp.com/biz/mila-s-ice-cream-and-snacks-vista",
  confidence:"low",
  blocked:"no-priced-source: no own website, no DoorDash/Grubhub/Uber Eats listing found under this name within time budget; only Yelp/Atly/social with no prices"
}));

results.push(entryFiled({
  id:"7682", name:"Alohana Acai Bowls and Smoothies - San Marcos (San Elijo Hills)",
  sourceUrl:"https://www.doordash.com/store/aloha-acai-bowls-sd-san-marcos-32353885/",
  confidence:"medium",
  notes:"own domain (alohanaacai.com) Popmenu order page is client-rendered with an empty __POPMENU_SSR_CACHE__ - routed to DoorDash instead; DoorDash JSON-LD address confirmed 1646 San Elijo Rd Ste 107/San Marcos matches worklist; deduped two JSON-LD shapes on name+price (no extra rows); all 20 rows land on .00/.50 endings; '(Online)' suffix stripped from names as a platform artifact",
  dishes: alohanaRows.map(r => ({ name: r.name.replace(/\s*\(Online\)\s*$/,""), description:"", price: money(r.price), section: r.section }))
}));

results.push(entryBlocked({
  id:"7545", name:"Arevalo's Bakery",
  sourceUrl:"https://www.yelp.com/biz/arevalo-s-bakery-vista",
  confidence:"low",
  blocked:"no-priced-source: no own website or delivery platform found; only tier-5 aggregators (menupix, restaurantguru, zmenu demo subdomain) with no reliable prices; two locations exist (950 E Vista Way, 328 Vista Village Dr) - worklist address matches the latter"
}));

results.push(entryBlocked({
  id:"2554", name:"Beer Company",
  sourceUrl:"https://www.calcoastbeer.com",
  confidence:"low",
  blocked:"identity-mismatch: worklist gives no address; the only website on file (calcoastbeer.com) titles itself 'Brewery Paso Robles | California Coast Beer Company' - Paso Robles does not fit this San Diego-county batch and there is no address to confirm this is the right branch or even the right business"
}));

results.push(entryFiled({
  id:"7234", name:"Kyodong Noodle Balboa",
  sourceUrl:"https://www.doordash.com/store/kyodong-noodles-san-diego-24532244/",
  confidence:"medium",
  notes:"DoorDash JSON-LD, address confirmed 7725 Balboa Avenue matches worklist; two JSON-LD shapes (Restaurant.hasMenu and standalone Menu) carried identical 40 rows - deduped on name+price to 28, dropping the duplicate 'Most Ordered' carousel; cent distribution 5x.00 / 23x.99, divisor sweep 1.00-1.35 best is 1.00 (28/28 conventional)",
  dishes: kyodongRows.map(r => ({ name: r.name, description:"", price: money(r.price), section: r.section }))
}));

results.push(entryFiled({
  id:"6599", name:"Rito's Mexican Food",
  sourceUrl:"https://www.doordash.com/store/rito%E2%80%99s-mexican-food-vista-23027501/",
  confidence:"medium",
  notes:"own domain ritosmexicanfoodca.com carries no prices at all - routed to DoorDash; JSON-LD address confirmed 2506 South Santa Fe Avenue matches worklist; two JSON-LD shapes carried identical 91 rows - deduped on name+price to 79, dropping the duplicate 'Most Ordered' carousel; cent distribution scattered (.25/.49/.50/.75/.99) but divisor sweep 1.00-1.35 finds no better fit than 1.00 (62/79 on .00/.50/.95/.99) and cents don't match the .20/.40/.60/.80 fee-baked signature - read as genuine quarter-dollar taco-shop pricing, not fee-baked",
  dishes: ritosRows.map(r => ({ name: r.name, description:"", price: money(r.price), section: r.section }))
}));

results.push(entryBlocked({
  id:"2998", name:"Stone Oven",
  sourceUrl:"http://www.stoneoven.com/menu",
  confidence:"low",
  blocked:"own site (stoneoven.com/menu) lists dish names and descriptions with zero prices anywhere on the page; it is a 13-location chain (Canoga Park, Culver City, Glendale, National City, Newport Beach, Northridge, Ontario Mills, San Diego, Sherman Oaks, Thousand Oaks, Torrance, Valencia, West Covina) and the worklist gives no address to target a specific branch's delivery listing within budget"
}));

results.push(entryBlocked({
  id:"2617", name:"Frost Me Gourmet Cupcakes",
  sourceUrl:"https://frostme.com/cafe-menu/",
  confidence:"low",
  blocked:"partial-core-unpriced: same business (Food Network 'Frost Me Gourmet Cupcakes' champion, now operating as Frost Me Cafe and Bakery, sole SD location) but its own cafe-menu page prices only wine/beer/happy-hour drinks - the actual product (cupcakes, pastries, coffee, breakfast/lunch) carries no prices anywhere on the site; frostmecafe.com order-online link and frostcupcakefactory.com (unrelated franchise, do not confuse) not yet checked for a priced catalog"
}));

results.push(entryBlocked({
  id:"2305", name:"iDessert",
  sourceUrl:"https://www.yelp.com/biz/idessert-by-jean-philippe-san-diego",
  confidence:"low",
  blocked:"conflicting-status: Yelp lists 'iDessert by Jean-Philippe' (1608 India St) as CLOSED; worklist gives no address to confirm this is the same location, and no delivery-platform listing was found within budget to check if it is still trading elsewhere"
}));

results.push(entryBlocked({
  id:"2788", name:"Eppig Brewing North Park",
  sourceUrl:"https://www.yelp.com/biz/eppig-brewing-san-diego-2",
  confidence:"low",
  blocked:"conflicting-status: the North Park taproom (3052 El Cajon Blvd) moved out at the end of 2019 per Beer Maverick/Untappd; Yelp listing for that address shows CLOSED; the Eppig Brewing brand still operates a Vista tasting room and a Waterfront Biergarten but neither is the North Park location the worklist names, so no current priced source for THIS location was found"
}));

results.push(entryBlocked({
  id:"6134", name:"La Flor Bakery",
  sourceUrl:"https://www.yellowpages.com/vista-ca/la-flor-bakery",
  confidence:"low",
  blocked:"no-priced-source: address (1839 W Vista Way) confirmed but no own website, social page, or delivery-platform listing carrying prices was found - only directory listings (Yellow Pages, Atly, Orange Book, Restaurantji) with hours/reviews and no menu"
}));

results.push(entryBlocked({
  id:"3004", name:"DQ Orange Julius",
  sourceUrl:"",
  confidence:"low",
  blocked:"identity-ambiguous: worklist gives no address; DQ/Orange Julius combo locations are a common franchise format with multiple San Diego-county branches on DoorDash, and without an address the correct branch's listing cannot be confirmed against the worklist row"
}));

results.push(entryBlocked({
  id:"2960", name:"Herb & Eatery",
  sourceUrl:"https://www.yelp.com/biz/herb-and-eatery-san-diego-3",
  confidence:"low",
  blocked:"conflicting-status: address (2210 Kettner Blvd) confirmed but Yelp listing shows CLOSED as of June 2026; herbandeatery.com and the shared Uber Eats 'Herb & Wood and Herb & Eatery' listing not yet confirmed to still be serving this concept at this address"
}));

results.push(entryBlocked({
  id:"3118", name:"Cafe Zzo Coffee Shop and Mini Mart",
  sourceUrl:"https://www.yelp.com/biz/cafe-zzo-san-diego",
  confidence:"low",
  blocked:"conflicting-status: Yelp listing for 'Cafe ZZO' (9800 Mira Lee Way) shows CLOSED (updated May 2024); worklist gives no address to double-check the branch, no delivery-platform listing found within budget"
}));

results.push(entryFiled({
  id:"6758", name:"Andreas D Best Pizza",
  sourceUrl:"https://andreasdbestpizza.getbento.com/menu/menu/",
  confidence:"high",
  notes:"first-party BentoBox menu; address 1591 E Vista Way confirmed via Yelp listing at the same address; single 'Menu' section, 8 pizzas each with Medium and Large price, no other categories exist on the site (no wings/subs/sides despite Yelp's 'Chicken Wings' category tag) so nothing was dropped as unpriced",
  dishes: [
    ["Pepperoni Pizza","Medium",8.99],["Pepperoni Pizza","Large",14.99],
    ["Hawaiana Pizza","Medium",12.99],["Hawaiana Pizza","Large",16.99],
    ["Margarita Pizza","Medium",16.99],["Margarita Pizza","Large",22.99],
    ["Veggie Pizza","Medium",16.99],["Veggie Pizza","Large",22.99],
    ["BBQ Pizza","Medium",16.99],["BBQ Pizza","Large",22.99],
    ["Pizza Supreme","Medium",16.99],["Pizza Supreme","Large",22.99],
    ["Hawaiana Special","Medium",22.99],["Hawaiana Special","Large",27.99],
    ["Andrea's Pizza","Medium",26.99],["Andrea's Pizza","Large",32.99],
  ].map(([name,size,price]) => ({ name: `${name} (${size})`, description:"", price: money(price), section:"Menu" }))
}));

writeFileSync("C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-n1637-03.json", JSON.stringify(results, null, 2));
console.log("wrote", results.length, "entries");
