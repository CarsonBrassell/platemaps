const fs = require('fs');
const P = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

const results = [];

// ---------- 1. Pizza Port Brewing Company (5588) ----------
{
  const dishes = [];
  const sizes = ['Small','Medium','Large'];
  const pizzaPrices = {
    'Create Your Own': [11.00, 17.00, 20.00],
    'Pizza of the Month (Chicken Portobello)': [15.00, 25.00, 29.00],
    'Bacon Cheeseburger': [14.00, 23.00, 27.00],
    'BBQ Chicken': [14.00, 23.00, 27.00],
    'Bressi Ranch': [14.50, 24.00, 28.00],
    'Carlsbad': [15.00, 25.00, 29.00],
    'Garlic Veggie': [13.50, 22.00, 26.00],
    'Imperial Beach': [15.00, 25.00, 29.00],
    'Laguna': [14.00, 23.00, 27.00],
    'Lahaina': [13.50, 22.00, 26.00],
    'Margherita': [13.50, 22.00, 26.00],
    'Meat Extreme Meat': [15.00, 25.00, 29.00],
    'Monterey': [14.00, 23.00, 27.00],
    'Ocean Beach': [14.50, 24.00, 28.00],
    'Roma': [15.00, 25.00, 29.00],
    'San Clemente': [14.50, 24.00, 28.00],
    'San Francisco': [14.00, 23.00, 27.00],
    'San Marcos': [13.50, 22.00, 26.00],
    'Solana': [14.50, 24.00, 28.00],
    'Vallarta': [13.50, 22.00, 26.00],
  };
  for (const [name, prices] of Object.entries(pizzaPrices)) {
    prices.forEach((p, i) => {
      dishes.push({ name: `${sizes[i]} ${name}`, description: '', price: `$${p.toFixed(2)}`, section: `${sizes[i]} Pizzas` });
    });
  }
  const appDesserts = [
    ['Chicken Wings (6)', 'Basket of wings served with ranch dressing, carrot & celery sticks. Your choice of original, BBQ, teriyaki, or Buffalo.', 8.50],
    ['Chicken Wings (12)', 'Basket of wings served with ranch dressing, carrot & celery sticks. Your choice of original, BBQ, teriyaki, or Buffalo.', 15.00],
    ['Cheese Sticks', 'Battered mozzarella sticks served with marinara sauce.', 9.75],
    ['Mac & Cheese Bites', 'Bite sized pieces of battered cheesy goodness served with marinara sauce.', 9.75],
    ['Portzel', 'Handmade Pizza Port pretzel made from wholegrain beer crust with sundried tomatoes, feta, garlic, basil and oregano.', 3.50],
    ['Beer Buddies', 'Bite sized pieces of crust brushed with olive oil, garlic, parmesan, basil and oregano. Served with ranch or marinara.', 7.25],
    ['Veggie Basket', 'Assorted fresh veggies served in a basket with ranch dressing.', 7.25],
    ['Tater Tots', 'Basket of crispy golden tots served plain, or loaded up with your favorite toppings.', 7.25],
  ];
  for (const [n, d, p] of appDesserts) dishes.push({ name: n, description: d, price: `$${p.toFixed(2)}`, section: 'Appetizers/Desserts' });
  const salads = [
    ['Individual Garden Salad', 'Crisp romaine, tomatoes, cucumbers, mushrooms, bell pepper. Choice of dressing.', 11.75],
    ['Individual Caesar Salad', 'Crisp romaine, gourmet croutons, shredded parmesan, creamy Caesar dressing.', 11.75],
    ['Individual Port Salad', 'Mixed greens, asparagus, portobello, butternut squash, roasted red peppers, gorgonzola, balsamic vinaigrette.', 12.75],
    ['Individual Kale Salad', 'Kale marinated in champagne vinaigrette, hearts of palm, pomegranate seeds, feta, sunflower seeds.', 12.75],
    ['Party Size Garden Salad', 'Crisp romaine, tomatoes, cucumbers, mushrooms, bell pepper. Choice of dressing.', 23.50],
    ['Party Size Caesar Salad', 'Crisp romaine, gourmet croutons, shredded parmesan, creamy Caesar dressing.', 23.50],
    ['Party Size Port Salad', 'Mixed greens, asparagus, portobello, butternut squash, roasted red peppers, gorgonzola, balsamic vinaigrette. (Out of stock)', 25.50],
    ['Party Sized Kale Salad', 'Kale marinated in champagne vinaigrette, hearts of palm, pomegranate seeds, feta, sunflower seeds.', 25.50],
  ];
  for (const [n, d, p] of salads) dishes.push({ name: n, description: d, price: `$${p.toFixed(2)}`, section: 'Salads' });
  const bevs = [['2L Pepsi', 7.00], ['2L Diet Pepsi', 7.00], ['2L Starry', 7.00]];
  for (const [n, p] of bevs) dishes.push({ name: n, description: '', price: `$${p.toFixed(2)}`, section: 'N/A Bevs' });
  const beer = [
    ['Amigo 6pk', 'Crisp and refreshing Mexican-style lager, 5.0% ABV', 13.00, '6 Pack To Go'],
    ['CA Honey 6pk', 'California Honey, pale straw, honey aroma, ABV 4.8%', 13.00, '6 Pack To Go'],
    ['Chronic 6pk', 'Amber Ale, ABV 4.9%', 13.00, '6 Pack To Go'],
    ["Coastin' 6pk", 'Tropical IPA, papaya, grapefruit, passion fruit, ABV 6.2%', 15.00, '6 Pack To Go'],
    ["Cruisin' 6pk", '', 13.00, '6 Pack To Go'],
    ['Mongo 6pk', 'Double IPA, ABV 8.0%', 15.00, '6 Pack To Go'],
    ['Ponto 6pk', 'Session IPA, ABV 4.5%', 13.00, '6 Pack To Go'],
    ['Sharkbite 6pk', '', 13.00, '6 Pack To Go'],
    ['Swamis 6pk', 'IPA, ABV 6.8%', 15.00, '6 Pack To Go'],
    ["Coastin' 12pk", 'Tropical IPA, ABV 6.2%', 22.00, '12 Pack to Go'],
    ['Swamis 12pk', 'IPA, ABV 6.8%', 22.00, '12 Pack to Go'],
    ['Mongo 19.2', 'Double IPA, ABV 8.0%', 4.00, '19.2 and Bottles to Go'],
    ['Swamis 19.2', 'IPA, ABV 6.8%', 4.00, '19.2 and Bottles to Go'],
  ];
  for (const [n, d, p, sec] of beer) dishes.push({ name: n, description: d, price: `$${p.toFixed(2)}`, section: sec });

  results.push({
    restaurantId: '5588', name: 'Pizza Port Brewing Company',
    sourceUrl: 'https://order.toasttab.com/online/pizza-port-imperial-beach-204-palm-ave',
    confidence: 'high', dishes,
  });
}

// ---------- 2. Shino Sushi + Kappo (3518) ----------
{
  const dishes = [];
  const ss = [
    ['Albacore (Bincho Maguro)', 8.50, 21.00],
    ['Amber Jack (Kanpachi)', 9.00, 22.00],
    ['Bluefin Tuna (Hon Maguro)', 11.00, 27.00],
    ['Chopped Toro (Negi Toro)', 10.00, null],
    ['Eel Fresh Water (Unagi)', 7.00, 18.00],
    ['Eel Salt Water (Anago)', 7.00, 18.00],
    ['Flying Fish Roe (Tobiko)', 8.00, 18.00],
    ['Golden Eye (Kinme)', 14.00, 35.00],
    ['Halibut (Hirame)', 8.00, 20.00],
    ['Halibut Fin (Engawa)', 10.00, null],
    ['Jack Mackerel (Aji)', 8.00, 24.00],
    ['Mackerel (Saba)', 6.50, 17.00],
    ['Octopus (Tako)', 8.00, 20.00],
    ['Red Snapper (Tai)', 8.00, 20.00],
    ['Salmon (Sake)', 8.00, 20.00],
    ['Salmon Belly (Sake Harami)', 9.00, 22.50],
    ['Salmon Roe (Ikura)', 9.00, null],
    ['Scallop (Hotate)', 8.00, 20.00],
    ['Shrimp (Ebi)', 6.50, 17.00],
    ['Smelt Roe (Masago)', 7.00, 18.00],
    ['Spear Squid (Yari Ika)', 7.00, 17.00],
    ['Striped Jack (Shima Aji)', 9.50, 24.00],
    ['Surf Clam (Hokki Gai)', 6.00, 15.00],
    ['Medium Toro (Chu Toro)', 16.00, 16.00],
    ['Fatty Toro (O Toro)', 17.00, 17.00],
    ['Tuna (Maguro)', 8.50, 21.00],
    ['Yellowtail (Hamachi)', 8.00, 20.00],
    ['Yellowtail Belly (Hamachi Harami)', 9.00, 22.50],
  ];
  for (const [n, sushi, sashimi] of ss) {
    if (sushi != null) dishes.push({ name: `${n} - Sushi (2pc)`, description: '', price: `$${sushi.toFixed(2)}`, section: 'Sashimi & Sushi' });
    if (sashimi != null) dishes.push({ name: `${n} - Sashimi (5pc)`, description: '', price: `$${sashimi.toFixed(2)}`, section: 'Sashimi & Sushi' });
  }
  dishes.push({ name: 'Egg (Tamago) - Sushi (2pc)', description: '', price: '$4.00', section: 'Sashimi & Sushi' });
  dishes.push({ name: 'Monkfish Liver (Ankimo) - Sashimi', description: '', price: '$10.00', section: 'Sashimi & Sushi' });

  const rolls = [
    ['Albacore Roll', 'California (Avocado, Cucumber, Krab) topped with Albacore, garlic ponzu & jalapeno slices', 21],
    ['Caterpillar', 'Eel, Cucumber, Krab, topped with Avocado & Eel Sauce', 18],
    ['Crab California', 'Snow Crab, Avocado, Cucumber', 21],
    ['Crunchy Tempura', 'Shrimp Tempura, Krab, Avocado, Cucumber, topped with Tempura Flakes & Eel Sauce', 18],
    ['Crunchy Salmon', 'Shrimp Tempura, Salmon, topped with Spicy Salmon, Tempura Flakes, Green Onion, Eel Sauce', 22],
    ['Del Mar', 'Crab, Scallop, Asparagus all Panko Fried, topped with Seared Australian Kobe Beef & Jalapeno Slices', 26],
    ['Diego', 'Spicy Tuna, Cilantro, topped with Chopped Serrano Peppers', 19],
    ['Double Double', 'Choice of Spicy Tuna, Yellowtail or Salmon, Green Onion, seared and topped with more', 21],
    ['Heat Wave (Habanero Citrus Spicy)', 'Spicy Yellowtail, Cucumber, topped with Tuna, Avocado, Citrus Chili Sauce', 27],
    ['Kitchen Sink', 'Spicy Scallop, topped with Salmon, Avocado, Mix of Tuna, Octopus, Cucumber, Shitake Mushroom, Shishito Peppers, Red Onion in Miso Sauce', 27],
    ['Philadelphia', 'Fresh Salmon, Cream Cheese, Cucumber', 19],
    ['Rainbow', 'California Roll topped with Salmon, White Fish, Tuna, Albacore, Shrimp, Octopus, Avocado', 21],
    ['Salmon Skin', 'Salmon Skin, Cucumber, Gobo, Green Onion, Bonito Flakes', 13],
    ['Soft Shell Crab', 'Soft Shell Crab, Krab, Cucumber, Avocado, Smelt Egg, Mayo', 18],
    ['Spicy Tuna, Yellowtail or Salmon Roll', 'Chopped and Mixed with Spicy Mayo', 18],
    ['Spicy Scallop Roll', 'Chunks of Scallop Mixed with Spicy Mayo', 19],
    ['Threesome', 'Shrimp Tempura, Spicy Tuna, topped with Eel, Spicy Tuna, Avocado Relish, Eel Sauce', 26],
    ['Toro Toro Roll', 'Shrimp Tempura, Pickled Japanese Radish, Chopped Toro, topped with Chopped Toro, Crispy Onion, Truffle Oil Nikiri Soy Sauce', 29],
    ['Vegetable Roll', 'Cucumber, Gobo, Avocado', 15],
  ];
  for (const [n, d, p] of rolls) dishes.push({ name: n, description: d, price: `$${p.toFixed(2)}`, section: 'Cut Rolls' });

  const apps = [
    ['Chamame', 'Brown Edamame, Lime, Ichimi Sea Salt', 5],
    ['Cucumber Sunomono', 'Cucumber, Seaweed, Vinaigrette', 5.5],
    ['Cucumber Crab Sunomono', 'Cucumber, Crab, Vinaigrette', 23],
    ['Spinach Goma Ae', 'Steamed Spinach, Sesame Paste Dressing', 5.5],
    ['Spinach Ohitashi', 'Steamed Spinach, Served Cold, Soy Sauce Broth, Bonito Flakes', 5.5],
    ['Green Salad', 'Spring Mix Greens with Cucumber, Yuzu Dressing', 6],
    ['Seaweed Salad', 'Mixed Seaweed with Vinaigrette Dressing', 8],
    ['Sashimi Salad', 'Yellowtail, Salmon, Spring Mix, Walnut, Onion Dressing', 24],
    ['Sauteed Mushroom', 'Shitake, Shimeji, Shishito Peppers, Ponzu Sauce', 12],
    ['Shishito Peppers', 'Broiled Shishito Peppers, Sesame Oil, Bonito Flakes, Ponzu Sauce', 10],
    ['Kobe Beef Sashimi', 'Australian Kobe with Garlic Ponzu, Spicy Radish, Green Onion', 20],
    ['Agedashi Tofu', 'Lightly Deep Fried Tofu, Grated Daikon Radish, Soy Sauce Broth', 6.5],
    ['Pork Belly Kakuni', 'Pork Simmered for 8 hours', 13],
    ['Gyoza', 'Pan Fried Pork Dumplings', 6.5],
    ['Duck Roast', 'Roasted Duck Breast, Spicy Mustard', 13],
    ['Yellowtail Kama', 'Broiled Cheeks of Yellowtail served with Ponzu Sauce', 14],
    ['Salmon Kama', 'Broiled Cheeks of Salmon served with Ponzu Sauce', 12],
    ['Miso Soup', '', 2.5],
    ['Asari Miso', 'Manila Clam Miso', 5],
    ['Akadashi Miso', 'Red Miso, Shimeji Mushroom, Seaweed', 4.5],
    ['Tempura Udon', '2 Shrimp Tempura, Green Beans', 16],
  ];
  for (const [n, d, p] of apps) dishes.push({ name: n, description: d, price: `$${p.toFixed(2)}`, section: 'Appetizers & Salads' });

  const specials = [
    ['Crispy Rice with Spicy Tuna', 21], ['Hamachi Jalapeno', 23], ['Wagyu Sushi', 23],
    ['Shishito Tempura Poppers', 16], ['Kanpachi Salt & Sesame Oil', 23], ['Albacore with Crispy Onion', 23],
  ];
  for (const [n, p] of specials) dishes.push({ name: n, description: '', price: `$${p.toFixed(2)}`, section: 'Specials' });

  dishes.push({ name: 'Sashimi Dinner', description: '2 Tuna, 2 Yellowtail, 2 Salmon, 2 Albacore. Served with miso soup & steamed rice', price: '$30.00', section: 'Sushi Bar Combo' });
  dishes.push({ name: 'Tuna Don', description: '10 pieces of Tuna over Sushi Rice, served with miso soup', price: '$38.00', section: 'Sushi Bar Combo' });
  dishes.push({ name: 'Unagi Don', description: 'Eel over steamed rice, served with miso soup', price: '$26.00', section: 'Sushi Bar Combo' });

  dishes.push({ name: 'Verry Belly Belly', description: '2 Chu Toro, 3 Salmon Belly, 3 Yellowtail Belly', price: '$40.00', section: 'Sashimi Combo' });
  dishes.push({ name: 'T.Y', description: '3 Tuna, 3 Yellowtail', price: '$22.00', section: 'Sashimi Combo' });
  dishes.push({ name: 'T.Y.S', description: '2 Tuna, 2 Yellowtail, 2 Salmon', price: '$22.00', section: 'Sashimi Combo' });

  const entrees = [
    ['Chicken Teriyaki', 16, 10], ['Salmon Teriyaki', 30, 15], ['Mix Tempura', 18, 12], ['Vegetable Tempura', 12, 9],
  ];
  for (const [n, ent, app] of entrees) {
    dishes.push({ name: `${n} (Entrée)`, description: 'Served with Miso Soup & Steamed Rice or Fried Rice (+$3.5)', price: `$${ent.toFixed(2)}`, section: 'Entrée' });
    dishes.push({ name: `${n} (Appetizer portion)`, description: '', price: `$${app.toFixed(2)}`, section: 'Entrée' });
  }
  dishes.push({ name: 'Ice Cream (Green Tea, Black Sesame, or Red Bean)', description: '', price: '$3.00', section: 'Desserts' });
  dishes.push({ name: 'Mochi Ice Cream (Green Tea, Strawberry, Mango, or Chocolate)', description: '', price: '$2.50', section: 'Desserts' });

  results.push({
    restaurantId: '3518', name: 'Shino Sushi + Kappo',
    sourceUrl: 'https://www.google.com/maps/place/Shino+Sushi+%2B+Kappo/@32.7200167,-117.1703349',
    confidence: 'medium', dishes,
    notes: 'Sourced from reviewer-posted photographs of the restaurant\'s printed menu on its Google Maps listing (Menu photo tab). Several photos showed slightly different price sets (menu appears to be updated periodically); the most fully legible, internally-consistent version was used. Exact photo date could not be confirmed (lightbox would not open under browser contention), so confidence is medium rather than high despite this being a first-party printed menu.',
  });
}

fs.writeFileSync('result_part1.json', JSON.stringify(results, null, 1));
console.log('part1 done, restaurants:', results.length, 'total dishes:', results.reduce((s,r)=>s+r.dishes.length,0));
