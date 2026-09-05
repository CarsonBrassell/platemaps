const fs = require('fs');
const P = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const results = [];

// ---------- 3. El Nopalito (2330) ----------
{
  const raw = P('nopalito-dd.items.json');
  const dishes = raw.map(i => ({ name: i.name, description: i.description || '', price: i.price, section: i.section }));
  results.push({
    restaurantId: '2330', name: 'El Nopalito',
    sourceUrl: 'https://www.doordash.com/store/el-nopalito-encinitas-70990/',
    confidence: 'medium', dishes,
    notes: 'Own site (el-nopalito.com) is a Shopify merchandise/packaged-goods store with no priced food menu; a same-named "El Nopalito Mexican Restaurant" domain was checked and confirmed to be an unrelated business in Kennesaw, GA (discarded). No first-party ordering platform found. DoorDash listing at the correct address (582 Santa Fe Dr) was used; prices show odd/POS-style cents ($2.78, $4.87, $7.19) and the division test found no clean 1.1/1.15/1.2/1.25 markup pattern (0-10% hit rate vs the ~66%+ that would indicate markup), so it was accepted at medium confidence rather than rejected.',
  });
}

// ---------- 4. Joe's Italian Dinner (4910) — not found ----------
{
  results.push({
    restaurantId: '4910', name: "Joe's Italian Dinner",
    sourceUrl: '', confidence: 'low', dishes: [],
    notes: "Own domain (joes-italian-dinner.com) is hijacked — redirects to a fingerprinting/push-notification scam page (netun-oum.com); left without further interaction. No ordering platform (Toast/Clover/etc.) found. A PDF hosted on menuweb.menu's CDN claiming to be this restaurant's menu contained only keyword-stuffed category names with no prices (SEO junk, discarded). Sirved, RestaurantGuru, and Zmenu only offer a $50-100 per-person price RANGE, not itemized prices. No dated Yelp/Google Maps menu photos were found. Genuine not-found: hijacked domain plus no alternative priced source, consistent with the project's 'hijacked domain took the only menu with it' precedent.",
  });
}

// ---------- 5. Tony Pepperoni Pizzeria (4901) ----------
{
  const dishes = [];
  const apps = [
    ['Tony Bread', '', 8.99], ['Garlic Tony Bread', '16 pc', 8.99], ['Cheese Bread', '16 pc', 13.99],
    ['Pepperoni Bread', '16 pc', 14.99], ['Jalapeno Bread', '16 pc', 14.99], ['Zucchini Sticks', '', 9.99],
    ['Fried Mushrooms', '', 9.99], ['Chicken Strips', '', 11.99], ['"The Meatball" (4)', '', 12.99],
    ['Mozzarella Sticks', '', 10.99], ['Fried Ravioli', '', 10.99], ['Jalapeno Poppers', '', 9.99],
    ['TP Sampler Platter', '', 19.99], ['Potato Wedges', '', 9.99], ['Skinny Fries', '', 8.99], ['Tater Tots', '', 9.99],
  ];
  for (const [n, d, p] of apps) dishes.push({ name: n, description: d, price: `$${p.toFixed(2)}`, section: 'Appetizers' });
  dishes.push({ name: 'Wings', description: '', price: '$16.99', section: 'Wings' });
  const salads = [
    ['Garden Fresh', 9.99, 16.99, 24.99], ['Caesar', 9.99, 16.99, 24.99], ['Antipasto', 10.99, 17.99, 26.99],
    ['Chicken Caesar', 10.99, 17.99, 26.99], ['Buffalo Chicken', 10.99, 17.99, 26.99], ['Greek', 10.99, 17.99, 26.99],
  ];
  for (const [n, ind, med, fam] of salads) {
    dishes.push({ name: `${n} Salad - Individual`, description: '', price: `$${ind.toFixed(2)}`, section: 'Salads' });
    dishes.push({ name: `${n} Salad - Medium`, description: '', price: `$${med.toFixed(2)}`, section: 'Salads' });
    dishes.push({ name: `${n} Salad - Family`, description: '', price: `$${fam.toFixed(2)}`, section: 'Salads' });
  }
  const specialtyPizzaSizes = { Calzone: 12.99, 'Bambino 8"': 12.99, 'Medium 12"': 20.99, 'Large 14"': 24.99, 'X-Large 16"': 29.99 };
  const specialtyNames = ['BBQ Chicken','Garlic Chicken Parmesan','The Goose','"Sarah"racha','Veggie Lovers','Deluxe Hawaiian','The Greek Pizza','Meat Eaters','The Teena Pizza','The "Works"','The Pastrami Pizza','Margherita Pizza',"Tony's Ranch House",'Bacon Cheddar Cheeseburger','Chicken Pesto','The Mexican Pizza','The Tony P 3-Cheeser Pepperoni Pleaser','The Captain','"The Show!"','"The Hot Rod"','The Attorney','Red, White & Green','The Godfather'];
  for (const size of Object.keys(specialtyPizzaSizes)) {
    dishes.push({ name: `Specialty Pizza - ${size}`, description: `Choice of: ${specialtyNames.join(', ')}`, price: `$${specialtyPizzaSizes[size].toFixed(2)}`, section: "Tony's Specialty Pizza" });
  }
  const byoSizes = { Calzone: 9.99, 'Bambino 8"': 9.99, 'Medium 12"': 15.99, 'Large 14"': 18.99, 'X-Large 16"': 22.99, 'Detroit Square': 19.99 };
  for (const [size, p] of Object.entries(byoSizes)) dishes.push({ name: `Build Your Own Pizza - ${size}`, description: '', price: `$${p.toFixed(2)}`, section: 'Build Your Own Pizza' });
  const pastas = [
    ['Spaghetti', 10.99], ['Spaghetti with Meatballs', 15.99], ['Mostaccioli', 10.99], ['Mostaccioli with Meatballs', 15.99],
    ['Baked Mostaccioli', 14.99], ['Baked Mostaccioli with Meatballs', 19.99], ['Meat Ravioli', 13.99], ['Cheese Ravioli', 13.99],
    ['Chicken Parmesan', 19.99], ['Pesto Chicken Pasta', 16.99], ['Fettuccine Alfredo', 12.99], ['Fettuccine Alfredo with Chicken', 16.99],
  ];
  for (const [n, p] of pastas) dishes.push({ name: n, description: '', price: `$${p.toFixed(2)}`, section: 'Pastas' });
  const sandwiches = ['Meatball Sub','Chicken Parmesan','Buffalo Chicken Sandwich','Pastrami','Pesto Chicken','Turkey Sub','Hot Italian Sub','Detroit Cheesesteak','Buffalo Chicken Wrap','Chicken Caesar Wrap'];
  for (const n of sandwiches) dishes.push({ name: n, description: '', price: '$12.99', section: 'Hot Sandwiches' });
  dishes.push({ name: 'CinnaPops', description: '', price: '$9.99', section: 'Desserts' });
  dishes.push({ name: 'Chocolate Chip Cookie', description: '', price: '$2.00', section: 'Desserts' });

  results.push({
    restaurantId: '4901', name: 'Tony Pepperoni Pizzeria',
    sourceUrl: 'https://tonypepperonipizzeria.net/',
    confidence: 'medium', dishes,
    notes: "This small local chain (Aliso Viejo, Escondido, Vista, Oceanside) runs one shared site/menu with no per-location pricing pages found; tonypepperonipizzeria.net — the exact domain listed for this Escondido restaurant — defaults to displaying itself under the Aliso Viejo brand name but confirms Escondido as one of its 4 locations at the matching address (249 East Grand Avenue). The Escondido-specific microsite (tony-pepperoni-pizzeria-escondido.res-menu.net) could not be reached: res-menu.net is currently down host-wide (confirmed blank across 4 unrelated res-menu.net stores, not just this one), so this is a host outage rather than a per-store failure. Used the shared own-site menu at medium confidence pending host recovery to confirm Escondido-specific pricing.",
  });
}

// ---------- 6. The Nautilus Tavern (2931) ----------
{
  const raw = P('nautilus-toast.items.json');
  const dishes = raw.map(i => ({ name: i.name, description: i.description || '', price: i.price, section: i.section }));
  results.push({
    restaurantId: '2931', name: 'The Nautilus Tavern',
    sourceUrl: 'https://order.toasttab.com/online/nautilus-tavern-6830-la-jolla-blvd',
    confidence: 'high', dishes,
  });
}

// ---------- 7. Soto's 2 (4573) ----------
{
  const raw = P('sotos-menu.parsed.json').filter(i => i.price !== '$0.00');
  const dishes = raw.map(i => ({ name: i.name, description: i.description || '', price: i.price, section: i.section === 'Unknown' ? 'Other' : i.section }));
  results.push({
    restaurantId: '4573', name: "Soto's 2",
    sourceUrl: 'https://www.clover.com/online-ordering/sotosmexicanfood2',
    confidence: 'high', dishes,
    notes: 'The rendered Clover storefront is a React SPA; the full menu was read from its own oloservice REST API (https://www.clover.com/oloservice/v1/merchants/FTCYMQDDM71A1/menu) rather than the rendered page. 4 items priced at $0.00 (free side add-ons / apparent data-entry placeholders) were dropped.',
  });
}

// ---------- 8. Oi Asian Fusion (956) ----------
{
  const items = [
    ['ADOBO bowl', 'Braised pork belly, adobo sauce, soft boiled egg, scallion and rice', 15.99, 'Bowls'],
    ['Pork Belly Umami Gravy', 'Braised pork belly, umami gravy, eel sauce, seaweed, scallions, pickled radish and rice', 15.99, 'Bowls'],
    ['TAPSILOG bowl', 'Marinated thinly sliced angus beef, garlic rice, fried egg, scallion and pickled red radish', 15.99, 'Bowls'],
    ['Longanisa', 'Sweet cured ground chicken, garlic rice, fried egg, red radish and scallions', 14.99, 'Bowls'],
    ['Chicken and Gravy bowl', 'Battered Chicken, Gravy, Scallion and Rice', 14.99, 'Bowls'],
    ['Ribeye Bistek Bowl', 'USDA Choice Ribeye, Fried Shallots, Fried Egg and ponzu', 17.99, 'Bowls'],
    ['Fried Chicken Adobo bowl', 'Boneless Chicken thigh, adobo sauce, soft boiled egg and rice', 14.99, 'Bowls'],
    ['KARAAGE RICE bowl', 'Japanese Fried Chicken, Umami gravy, eel sauce, seaweed, scallions, sesame seed, pickled red radish and rice', 14.99, 'Bowls'],
    ['Dynamite Crawfish bowl', 'Butter poached crawfish, eel sauce, dynamite sauce, seaweed, scallions, sesame seed and rice', 15.99, 'Bowls'],
    ['Loco Burger Bowl', 'Wagyu beef burger, umami gravy, fried egg, seaweed, scallions and rice', 15.99, 'Bowls'],
    ['MUSHROOM and EGG bowl', 'King Oyster Mushroom, Bunapi, Enoki, Shishito pepper, Cotija Cheese, soft boiled egg and rice', 14.99, 'Bowls'],
    ['Oi Jicama Salad', 'Green Lettuce, Jicama, pickled onion, cilantro, cucumber, eel sauce, sriracha and cilantro sauce', 9.49, 'Bowls'],
    ['Extra White Rice', '', 2.00, 'Bowls'],
    ['Oi "WAGYU" Burger', 'Wagyu beef burger, pickled red onion, truffled balsamic shiitake mushroom, Swiss American cheese, mayo, arugula and pretzel bun', 15.99, 'Burger and Buns'],
    ['Oi burger combo', 'Oi Burger, dynamite sweet fries, coke/sprite/diet coke', 22.99, 'Burger and Buns'],
    ['KARAAGE bun', 'Japanese fried chicken, lemon mayo, cucumber, green leafy lettuce and scallions', 7.99, 'Burger and Buns'],
    ['PORK bun', 'Braised pork belly, hoisin, sriracha, cucumber and scallions', 7.99, 'Burger and Buns'],
    ['WAGYU bun', 'Wagyu beef burger, mayo, Swiss American cheese, sauteed mushroom and onions', 7.99, 'Burger and Buns'],
    ['5 Pcs Karaage Fried Chicken', 'Japanese-style fried chicken, 5 pieces', 13.99, 'Sides'],
    ['8 Pcs. Egg Rolls', 'Lumpia', 7.99, 'Sides'],
    ['Pork Belly Jicama Taco', 'Seared pork belly, jicama taco shell, eel sauce, sriracha, cilantro and pickled red onion', 7.99, 'Sides'],
    ['Dynamite Sweet Fries', 'Sweet potato fries, dynamite sauce, garlic confit and cilantro', 7.99, 'Sides'],
    ['French Fries', '', 3.99, 'Sides'],
    ['Sweet Potato', '', 5.99, 'Sides'],
    ['UBE UPSIDE DOWN creme', '', 7.99, 'Desserts'],
    ['Banana Nutella Cheesecake', 'Banana puree and Nutella swirled into cheesecake', 7.99, 'Desserts'],
    ['ICE CREAM (UBE)', '', 2.99, 'Desserts'],
    ['ICE CREAM (MANGO)', '', 2.99, 'Desserts'],
  ];
  const dishes = items.map(([n, d, p, s]) => ({ name: n, description: d, price: `$${p.toFixed(2)}`, section: s }));
  results.push({
    restaurantId: '956', name: 'Oi Asian Fusion',
    sourceUrl: 'https://www.oiasianfusionsd.com/s/order?location=C3TXRVTRR4KDK',
    confidence: 'high', dishes,
    notes: "Own site's Square/Weebly ordering system; the Carmel Mountain Ranch location was explicitly selected (11835 Carmel Mountain Road, matching the work item address exactly, confirmed via the pickup banner). Sauces, Extras and Drinks category tabs exist on the page but render no items for this store — appear to be genuinely unpublished/empty rather than unread (page confirmed to load other categories' items in full).",
  });
}

// ---------- 9. Pho Mai Cali (3620) ----------
{
  const raw = P('toast-phomai.items.json');
  const dishes = raw.map(i => ({ name: i.name, description: i.description || '', price: i.price, section: i.section }));
  results.push({
    restaurantId: '3620', name: 'Pho Mai Cali',
    sourceUrl: 'https://www.toasttab.com/local/order/pho-mai-cali2-9888-n-magnolia-ave',
    confidence: 'high', dishes,
  });
}

// ---------- 10. Honey Donuts (5562) ----------
{
  const items = [
    ['Mixed Dozen of Donuts', 'Assortment of our most popular donuts.', 21.25, 'Donuts'],
    ['Half Dozens of Donuts', 'Assortment of our most popular donuts.', 11.25, 'Donuts'],
    ['Fancy Donuts', 'Cinnamon roll and apple fritter donuts, available in large sizes.', 3.80, 'Donuts'],
    ['Breakfast Sandwiches', 'Comes with: ham, egg, bacon, American cheese.', 10.50, 'Sandwiches'],
    ['Sandwiches (8 Inch French Roll)', 'Swiss cheese, mayonnaise, mustard, lettuce, tomatoes, pickles, onions, black olives, jalapeños, Italian dressing.', 11.50, 'Sandwiches'],
    ['Ham & Cheese Croissant', 'Ham and cheese in a flaky, buttery croissant with Jarlsberg cheese and Fra’mani uncured ham.', 7.50, 'Croissants'],
    ['Croissant Sandwiches', 'Swiss cheese, mayonnaise, mustard, lettuce, tomatoes, pickles, onions, black olives, jalapeños, Italian dressing.', 13.65, 'Croissants'],
    ['Ham & Cheese & Jalapeño Croissant', 'Buttery croissant filled with uncured ham, Jarlsberg cheese, and sliced jalapeños.', 7.50, 'Croissants'],
    ['Classic Açaí', 'Organic Açaí, greek yogurt, banana; topped with honey almond granola, bananas, strawberry, blueberry, shaved coconut.', 12.00, 'Açaí'],
    ['Aloha Açaí', 'Organic Açaí, greek yogurt, banana; topped with honey almond granola, strawberry, pineapple, mango, shaved coconut.', 12.00, 'Açaí'],
  ];
  const dishes = items.map(([n, d, p, s]) => ({ name: n, description: d, price: `$${p.toFixed(2)}`, section: s }));
  results.push({
    restaurantId: '5562', name: 'Honey Donuts',
    sourceUrl: 'https://order.online/en-US/store/honey-donuts-woodside-ave-24208490',
    confidence: 'medium', dishes,
    notes: 'No own website (listed as null). order.online is DoorDash\'s white-label storefront (confirmed via its own telemetry referencing doordash.com) — used as the only available ordering channel. Division test on the 10 priced items was inconclusive (sample below the ~12-distinct-price threshold needed for the test to be meaningful: only 3 of 10 divided cleanly at 1.25), so recorded at medium rather than rejected outright.',
  });
}

// ---------- 11. Grab & Go Subs (737) ----------
{
  const raw = P('grabgo_items.json');
  const dishes = raw.map(i => ({ name: i.name, description: i.description || '', price: i.price.startsWith('$') ? i.price : `$${i.price}`, section: i.section }));
  results.push({
    restaurantId: '737', name: 'Grab & Go Subs',
    sourceUrl: 'https://www.grabngosubs.com/1st-and-c-san-diego-menu',
    confidence: 'high', dishes,
    notes: 'Own site\'s Popmenu ordering page for the 1st & C (Cortez Hill) location, read from the JSON-LD Menu schema embedded in the page. No drinks or desserts section published on the ordering page (a deli with likely self-serve/cooler drinks not itemized online).',
  });
}

// ---------- 12. Main Tap Tavern (3326) ----------
{
  const items = [
    ['Chips & Salsa', 'Freshly fried tortilla chips with spicy red salsa. Add Guacamole +$1.50', 4.25, 'Appetizers'],
    ['Garlic Bread Sticks', 'Melted butter, minced garlic, parmesan cheese and Italian parsley, on toasted Sadie Rose bread with marinara sauce', 5.75, 'Appetizers'],
    ['Hand-Cut French Fries', 'Our hand-cut French fries.', 6.50, 'Appetizers'],
    ['Garlic Fries', 'Hand-cut fries topped with minced garlic, Parmesan cheese, and Italian parsley.', 7.00, 'Appetizers'],
    ['Chili Fries', 'Hand-cut fries topped with chili, cheddar cheese, diced onions, and sour cream.', 7.25, 'Appetizers'],
    ['Jalapeño Poppers', 'Jalapeno peppers stuffed with cream cheese and fried golden brown. Served with ranch.', 6.75, 'Appetizers'],
    ['Buffalo Wings', 'Freshly-fried chicken wings, choice of spicy buffalo, honey barbecue, teriyaki or naked. Served with blue cheese or ranch.', 7.50, 'Appetizers'],
    ['Carne Asada or Grilled Chicken Street Tacos', 'Three tacos topped with cilantro, guacamole, and red onions. Add cheese +$1.50.', 7.25, 'Appetizers'],
    ['Shrimp Street Tacos', 'Marinated carne asada, guacamole and pico de gallo. Served with spicy red salsa. Add cheese +$1.50.', 8.00, 'Appetizers'],
    ['Beer Battered Onion Rings', 'Thick cut golden onion rings served with ranch, BBQ sauce, or tavern sauce.', 6.75, 'Appetizers'],
    ['Chicken Tenders', 'Crispy chicken tenders served with honey mustard, ranch, BBQ sauce, or buffalo ranch.', 7.25, 'Appetizers'],
    ['Carne Asada Burrito', 'Marinated carne asada, homemade guacamole and pico de gallo. Add cheese +$1.50', 8.50, 'Pub Grub'],
    ['California Burrito', 'Marinated carne asada, hand-cut french fries, cheddar and jack cheeses, guacamole, sour cream, pico de gallo.', 9.25, 'Pub Grub'],
    ['Surf & Turf Burrito', 'Marinated carne asada mixed with grilled shrimp, hand-cut fries, guacamole, tangy white sauce, pico de gallo.', 9.75, 'Pub Grub'],
    ['Carne Asada Fries', 'Hand-cut fries topped with marinated carne asada, cheddar and jack cheeses, sour cream, pico de gallo. Add guacamole +$1.50.', 9.75, 'Pub Grub'],
    ['Chicken Tender Basket', 'Four crispy chicken tenders with honey mustard, ranch, BBQ sauce, or buffalo ranch, over hand-cut fries.', 9.25, 'Pub Grub'],
    ['Fish Tacos', 'Two soft flour tortillas filled with grilled or crispy fish, avocado, pico de gallo, tangy white sauce, cilantro.', 8.00, 'Pub Grub'],
    ['Carne Asada or Grilled Chicken Quesadilla', 'Cheddar and Jack cheeses, sour cream, pico de gallo. Add guacamole +$1.50.', 8.75, 'Pub Grub'],
    ['Shrimp Quesadilla', 'Shrimp, cheddar and jack cheeses, sour cream, pico de gallo. Add guacamole +$1.50.', 10.75, 'Pub Grub'],
    ['Carne Asada Nachos or Fries', 'Corn tortilla chips or hand-cut fries, topped with marinated carne asada, cheddar and jack cheeses, sour cream, pico de gallo. Add guacamole +$1.50.', 9.75, 'Pub Grub'],
    ['Buffalo Wings Sampler', 'A large portion of buffalo, barbecue, and teriyaki wings served with ranch and blue cheese.', 13.50, 'Pub Grub'],
    ["Fish N' Chips", 'Traditional English-style fish and chips, beer battered in house. Served with hand-cut fries.', 11.50, 'Pub Grub'],
    ['Tavern Salad', 'Lettuce, tomato, cheddar cheese, bacon, homemade croutons. Choice of dressing. Add chicken +$2.50, feta/blue cheese +$1.50.', 8.50, 'Salads'],
    ['Caesar Salad', 'Classic caesar salad topped with parmesan cheese and homemade croutons. Add chicken +$2.50, shrimp +$3.00.', 7.50, 'Salads'],
    ['Garden Goddess', 'Avocado, cucumber, roasted peppers, tomato, red onions, feta or blue cheese, hummus in a sun-dried tomato wrap. Add chicken +$2.50.', 9.50, 'Sandwiches & Burgers'],
    ['Grilled Chicken Sandwich', 'Seasoned grilled chicken on a french roll with lettuce, tomato, choice of cheese.', 10.00, 'Sandwiches & Burgers'],
    ['Grilled Cheese & Bacon Sandwich', 'Melted American & Jack cheeses on toasted thick-cut sourdough bread.', 10.50, 'Sandwiches & Burgers'],
    ['Reuben', 'Sliced corned beef on marbled rye, thousand island dressing, sauerkraut, melted swiss cheese.', 10.50, 'Sandwiches & Burgers'],
    ['Buffalo Tender Wrap', 'Chicken tenders dipped in buffalo sauce, wrapped with blue cheese crumbles, lettuce, tomato, red onion, ranch.', 9.50, 'Sandwiches & Burgers'],
    ['Chicken Parm Sandwich', 'Grilled chicken smothered with marinara and parmesan cheese, on a Sadie Rose bun.', 10.50, 'Sandwiches & Burgers'],
    ['BLT', 'Bacon, lettuce & tomato on toasted thick-cut sourdough bread.', 10.50, 'Sandwiches & Burgers'],
    ['The "Randal" Burger', 'Crisp bacon, cheddar cheese, avocado, over-easy egg, on a 100% Angus beef patty.', 11.25, 'Burgers'],
    ['Tavern Burger', 'Handmade 100% Angus beef patty, choice of cheese. Lettuce, tomato & onion on the side.', 10.50, 'Burgers'],
    ['Jalapeño Bacon Burger', 'Angus beef patty with smoked bacon, cream cheese, sliced jalapenos. Lettuce, tomato & onion on the side.', 11.50, 'Burgers'],
    ['Mushroom Swiss Avocado Burger', 'Sauteed mushrooms, melted swiss, fresh avocado. Lettuce, tomato and onion on the side.', 11.50, 'Burgers'],
    ['Black & Blue Burger', 'Blackened hamburger patty with melted blue cheese crumbles and bacon. Lettuce, tomato, onion on the side.', 11.50, 'Burgers'],
    ['Peanut Butter Burger', 'Angus beef patty with smoked bacon, grilled onions, cheddar cheese, peanut butter.', 11.50, 'Burgers'],
    ['Chili Cheese Burger', 'Angus beef patty topped with chili, shredded jack & cheddar cheese, diced onion.', 11.50, 'Burgers'],
    ['Western BBQ Bacon Burger', 'Sweet BBQ sauce, smoked bacon, two crispy onion rings and cheddar cheese.', 11.50, 'Burgers'],
  ];
  const dishes = items.map(([n, d, p, s]) => ({ name: n, description: d, price: `$${p.toFixed(2)}`, section: s }));
  results.push({
    restaurantId: '3326', name: 'Main Tap Tavern',
    sourceUrl: 'http://maintaptavern.com/menu/',
    confidence: 'high', dishes,
  });
}

fs.writeFileSync('result_part2.json', JSON.stringify(results, null, 1));
console.log('part2 done, restaurants:', results.length, 'total dishes:', results.reduce((s,r)=>s+r.dishes.length,0));
