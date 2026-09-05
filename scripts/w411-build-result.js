const fs = require('fs');

const resultPath = 'C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-w4-11.json';

// ---- Restaurant 10: Spicy Duck — load extracted items, dedupe, format ----
const duckItems = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/AppData/Local/Temp/claude/w4-11/w411-duck-items.json', 'utf8'));
const seen = new Set();
const duckDishes = [];
for (const it of duckItems) {
  const key = it.name + '|' + it.priceCents;
  if (seen.has(key)) continue;
  seen.add(key);
  duckDishes.push({
    name: it.name,
    description: it.description.replace(/\s*每磅。?\.?\s*$/,'').trim(),
    price: '$' + (it.priceCents / 100).toFixed(2),
    section: 'Spicy Duck Wang La Ya Menu'
  });
}

const results = [
  {
    restaurantId: '2177',
    name: "Dryer's Ice Cream Parlor",
    sourceUrl: 'https://seaworld.com/san-diego/dining/dreyers-ice-cream-parlor/',
    confidence: 'high',
    notes: 'SeaWorld San Diego\'s own dining page (correct spelling "Dreyer\'s") lists flavors and sundaes with no prices anywhere on the page; not on DoorDash or Uber Eats (searched, no match). A theme-park concession publishing no itemized prices, same category as stadium/park concessions in the standing rules.',
    dishes: []
  },
  {
    restaurantId: '2249',
    name: 'University Towers Kitchen',
    sourceUrl: 'https://www.eatatsdsu.com/Venues/UTK',
    confidence: 'high',
    notes: 'UTK is an SDSU residential dining hall: meal-plan swipe access, hours-only page (Rise & Shine / Lunch-Dinner / Brunch), no itemized per-dish pricing anywhere on eatatsdsu.com. All-you-can-eat swipe dining with no itemised menu, matching the standing not_found case.',
    dishes: []
  },
  {
    restaurantId: '2257',
    name: 'TEC Cafe',
    sourceUrl: 'https://joe.coffee/locations/ca/san-diego/tec-cafe-san-diego-7a07d496-cd81-4ed3-8353-9e2f7bc1b44c/',
    confidence: 'low',
    blocked: 'needs-browser: TEC Cafe (UCSD RIMAC Annex) has no first-party menu site (Instagram only); its joe.coffee ordering-app listing renders client-side with no prices in the static HTML (only a "$$" priceRange indicator). No DoorDash/Uber Eats listing found.',
    dishes: []
  },
  {
    restaurantId: '3684',
    name: 'Old Town Coffee and Tea',
    sourceUrl: 'https://www.yelp.com/biz/old-town-coffee-and-teashop-coronado',
    confidence: 'low',
    blocked: 'needs-search: The Old Town Coffee and Tea Shop, 1201 1st St Ste 106, Coronado (confirmed open, "Open until 6" per a live Yelp listing snippet). No own website, no DoorDash/Uber Eats/Grubhub listing found under this address. A same-named "Old Town Coffee Company" Uber Eats listing is a different branch (78100 Main St, not this address) and was discarded, not merged.',
    dishes: []
  },
  {
    restaurantId: '2731',
    name: 'Sweet Labors',
    sourceUrl: 'https://sweetlabors.wixsite.com/home',
    confidence: 'low',
    blocked: 'needs-browser: Sweet Labors Coffee Cart (Sharp Mary Birch Hospital) has only a Wix site that renders entirely client-side (static HTML is all bundler JS, no menu content or prices). No DoorDash/Uber Eats listing found; Yelp\'s own "Full menu" link points at the same Wix site.',
    dishes: []
  },
  {
    restaurantId: '1156',
    name: 'Blue Haven',
    sourceUrl: 'https://thehappyhourfinder.com/us_ca/chula-vista/',
    confidence: 'low',
    blocked: 'needs-search: Blue Haven, 618 E St Ste H, Chula Vista, is a sports bar/nightclub (pool, arcades, darts per Yelp). Only found happy-hour drink pricing on a low-tier aggregator (thehappyhourfinder.com, $2 well/$2 domestic) - not a food menu and not a source this project accepts. No own website, Instagram, or delivery-platform listing found to confirm whether food is served or priced.',
    dishes: []
  },
  {
    restaurantId: '3330',
    name: 'The Local Bite',
    sourceUrl: 'https://thelocalbite.net/menu/',
    confidence: 'high',
    notes: 'First-party site, plain HTML, all prices present. Kids menu section excluded (no prices, "Ask for today\'s selections"). 27 priced dishes across Sandwiches, Wraps, Specialty Salads, Açaí Bowl and Beverages.',
    dishes: [
      { name: 'The Italian Bite', description: 'Mortadella, salami, pepperoni, ham, provolone cheese, tomato, lettuce, onions, oil & vinegar on a 10-inch Italian roll.', price: '$15.99', section: 'Sandwiches' },
      { name: 'The Pizza Bite', description: 'House-made marinara sauce, fresh mozzarella cheese, and pepperoni on an Italian roll.', price: '$9.99', section: 'Sandwiches' },
      { name: 'The Poway Ruben', description: 'Thinly sliced pastrami, Swiss cheese, sauerkraut, and Thousand Island dressing.', price: '$15.99', section: 'Sandwiches' },
      { name: 'The Tuna Bite', description: 'Albacore tuna with red leaf lettuce, red onion, and tomato.', price: '$11.49', section: 'Sandwiches' },
      { name: 'Californian Caprese', description: 'Avocado, buffalo mozzarella, tomato, fresh basil, balsamic dressing, and pesto.', price: '$12.49', section: 'Sandwiches' },
      { name: 'Cubano Panini', description: 'Pulled pork, ham, Swiss cheese, whole grain mustard, and house-made pickles.', price: '$15.99', section: 'Sandwiches' },
      { name: 'Turkey & Brie', description: 'Roasted turkey, brie cheese, baby arugula, and cranberry chutney.', price: '$12.49', section: 'Sandwiches' },
      { name: 'California Club', description: 'Roasted turkey, avocado, sprouts, applewood smoked bacon, tomato, Swiss cheese, and herb-marinated red onion.', price: '$11.49', section: 'Sandwiches' },
      { name: 'Louisiana Pulled Pork', description: 'Pulled pork, chipotle BBQ sauce, and poppy seed coleslaw on a 10-inch roll.', price: '$14.99', section: 'Sandwiches' },
      { name: 'Turkey Pesto', description: 'Roasted turkey, feta, cucumber, pesto, baby arugula, and marinated onion.', price: '$11.99', section: 'Sandwiches' },
      { name: 'Poway Portobello', description: 'Balsamic-glazed grilled portobello, roasted garlic and herbed goat cheese, sun-dried tomato aioli, baby spinach, and tomato.', price: '$11.49', section: 'Sandwiches' },
      { name: 'Roast Beef & White Cheddar', description: 'Roast beef, white cheddar, caramelized onions, baby arugula, horseradish aioli, and tomato.', price: '$14.99', section: 'Sandwiches' },
      { name: 'Meatball Sandwich', description: 'Italian meatballs, fresh mozzarella, and house-made marinara sauce on an Italian roll.', price: '$11.49', section: 'Sandwiches' },
      { name: 'Poway Wrap', description: 'Field greens, diced ham, diced turkey, bacon, egg, tomato, red onion, avocado, grilled corn, and Dijon aioli.', price: '$11.49', section: 'Wraps' },
      { name: 'Southwest Chicken Wrap', description: 'Grilled chicken, romaine lettuce, corn slaw, red onion, tomato, feta, and cilantro aioli.', price: '$11.99', section: 'Wraps' },
      { name: 'Chicken Ranch Wrap', description: 'Grilled chicken, field greens, tomato, red onion, cucumber, and house-made ranch dressing.', price: '$11.49', section: 'Wraps' },
      { name: 'Sun-Dried Tomato & Feta Wrap', description: 'Field greens, sun-dried tomatoes, feta cheese, red onion, and roasted garlic aioli.', price: '$9.99', section: 'Wraps' },
      { name: 'Rainbow Wrap', description: 'Field greens, roasted portobello mushrooms, herbed goat cheese, cucumbers, tomato, carrots, red onion, roasted garlic aioli, and red wine vinaigrette.', price: '$10.49', section: 'Wraps' },
      { name: 'Poway Cobb', description: 'Grilled chicken, egg, bacon, marinated red onion, blue cheese, avocado, and tomato.', price: '$13.99', section: 'Specialty Salads' },
      { name: 'Southwest Salad', description: 'Grilled corn slaw, tortilla strips, marinated red onion, tomato, and cilantro vinaigrette.', price: '$11.99', section: 'Specialty Salads' },
      { name: 'Bacon Blue Cheese Salad', description: 'Romaine lettuce, bacon lardons, house-made croutons, tomato, red onion, and blue cheese dressing.', price: '$11.99', section: 'Specialty Salads' },
      { name: 'Berries & Greens', description: 'Field greens, almonds, feta, blackberries, strawberries, red onion, tomato, and balsamic vinaigrette.', price: '$10.99', section: 'Specialty Salads' },
      { name: 'Poway Caesar', description: 'Romaine lettuce, Parmesan cheese, Caesar dressing, and house-made croutons.', price: '$9.99', section: 'Specialty Salads' },
      { name: 'Apple Harvest', description: 'Field greens, walnuts, blue cheese, Granny Smith apples, Washington apples, and champagne vinaigrette.', price: '$9.99', section: 'Specialty Salads' },
      { name: 'Caprese Salad', description: 'Tomato, fresh mozzarella, basil, balsamic reduction, and champagne vinaigrette.', price: '$10.99', section: 'Specialty Salads' },
      { name: 'Açaí Bowl', description: 'Fresh berries, granola, banana, and honey.', price: '$10.99', section: 'Açaí Bowl' },
      { name: 'Shakes (20 oz)', description: 'Vanilla, Strawberry, Chocolate, or Oreo.', price: '$6.99', section: 'Beverages' }
    ]
  },
  {
    restaurantId: '3852',
    name: 'Trade Restaurant & Lounge',
    sourceUrl: 'https://www.opentable.com/r/trade-san-diego',
    confidence: 'low',
    blocked: 'needs-retry: OpenTable\'s own menu page for Trade (421 W B St, San Diego, Hotel Republic) carries priced dishes per its search-result snippet (Steel Cut Oatmeal $9.00, Chilaquiles $15.00, Farm Eggs $15.00, Spanish Omelette $18.00, Egg White Frittata $18.00) but every direct fetch attempt timed out (curl exit 28, no HTTP response) rather than returning a page to parse. Uber Eats listing is "Closed on Uber Eats as of Jan 30, 2026." Yelp\'s priced listing is the barred user-submitted menu tab. The hotel\'s own Marriott dining page names the restaurant but prices nothing.',
    dishes: []
  },
  {
    restaurantId: '4162',
    name: 'Café de Anza',
    sourceUrl: 'https://biomedrealty.aramarkcafe.com/LocationsAndMenus/CafeDeAnza',
    confidence: 'low',
    blocked: 'needs-browser: corporate Aramark cafe (BioMed Realty office campus) — the LocationsAndMenus/CafeDeAnza page is an Aramark ACP portal that renders its item list and cart client-side via JS; static HTML carries navigation and login/cart chrome only, no dish names or prices.',
    dishes: []
  },
  {
    restaurantId: '4468',
    name: 'Spicy Duck',
    sourceUrl: 'https://www.ubereats.com/store/wang-la-ya-spicy-duck-san-diego/JyL3eTM-UDy8ntUscmDTlg',
    confidence: 'medium',
    notes: 'Wang La Ya Spicy Duck, a braised-meats-by-weight deli counter inside the 99 Ranch Market food court, 5950 Balboa Ave #112 (address confirmed in payload). Both the schema.org JSON-LD hasMenu block and the catalogSectionsMap RSC payload agree on the same two sections ("Most Popular" carousel + "Spicy Duck Wang La Ya Menu"), so nothing appears truncated. The 4-item "Most Popular" carousel duplicates items already in the main section and was dropped; 35 unique dishes filed after dedupe on name+price. All prices are per-lb and end in a conventional 9 (.29/.49/.69/.79/.89/.99) with no divisor pattern found — reads as genuine deli pricing, not a delivery markup. A Grubhub search snippet independently showed matching prices ($14.29 Spicy Duck Neck, Pork Liver, Korean Beef Back Tendon $19.79, Lotus Root $14.29) but grubhub.com itself renders client-side with no prices in static HTML, so it is not used as a formal cross-check.',
    dishes: duckDishes
  }
];

fs.writeFileSync(resultPath, JSON.stringify(results, null, 2), 'utf8');
console.log('wrote', results.length, 'restaurants');
console.log('spicy duck dish count', duckDishes.length);
