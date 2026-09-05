const fs = require('fs');

// Incremental result builder for n1358-06. Rewrite whole file every 3-4 restaurants.
// Each entry: filed (dishes[]), blocked (blocked reason, dishes:[]), or not_found (dishes:[]).

const entries = [];

// ---------- 7145 Antique Row Cafe (FILED) ----------
entries.push({
  restaurantId: "7145",
  name: "Antique Row Cafe",
  outcome: "filed",
  sourceUrl: "https://antiquerowcafesd.com/menu",
  confidence: "high",
  notes: "First-party restaurant website (Zyro site builder). Full breakfast/lunch menu with per-item prices. Kids' Menu items are all a flat $10.99 per the section header (no per-item price shown) and are recorded at that flat price.",
  dishes: [
    // Salads (header: THE LIGHTER SIDE)
    { name: "Cobb Salad", description: "Diced turkey, bacon, avocado, hard-boiled egg, tomatoes, Jack and cheddar cheese", price: "$17.25", section: "Salads" },
    { name: "Crispy Chicken Salad", description: "Lettuce, tomatoes, Jack and cheddar cheese topped with chopped bacon and chicken strips", price: "$17.25", section: "Salads" },
    { name: "Chicken Caesar Salad", description: "Romaine lettuce tossed with caesar dressing, topped with grilled chicken breast, tomatoes, parmesan cheese and topped with croutons", price: "$17.25", section: "Salads" },
    // Mexican Plates (served with beans & rice)
    { name: "Chilaquiles", description: "Tortilla chips tossed in green or red sauce, topped with two fresh eggs, shredded chicken tinga, queso fresco, and sour cream.", price: "$16.95", section: "Mexican Plates" },
    { name: "Huevos Rancheros", description: "Two corn tortillas topped with two eggs your way, ranchero sauce and queso fresco", price: "$15.95", section: "Mexican Plates" },
    { name: "Nopalitos Con Huevo", description: "Cactus scrambled with eggs, tomatoes and onions, topped with queso fresco and a choice of tortilla", price: "$16.25", section: "Mexican Plates" },
    { name: "Chorizo Plate", description: "Pork chorizo scrambled with eggs and jalapeños, topped with queso fresco, sour cream and a choice of tortilla", price: "$16.95", section: "Mexican Plates" },
    // Benedicts
    { name: "Cali Benedict", description: "Bacon, spinach, tomato slices & avocado", price: "$17.95", section: "Benedicts" },
    { name: "Garden Benedict", description: "Spinach, tomatoes, onions, bell peppers, mushrooms & avocado", price: "$17.95", section: "Benedicts" },
    { name: "Traditional Benedict", description: "Ham", price: "$17.95", section: "Benedicts" },
    { name: "Hash Benedict", description: "Corned beef hash", price: "$17.95", section: "Benedicts" },
    // Kids' Menu (flat $10.99 per header)
    { name: "Two Buttermilk Pancakes", description: "Kids' menu item", price: "$10.99", section: "Kids' Menu" },
    { name: "Big Breakfast", description: "Bacon or sausage, two eggs, potatoes, and a slice of toast", price: "$10.99", section: "Kids' Menu" },
    { name: "1/2 Belgian Waffle", description: "Kids' menu item", price: "$10.99", section: "Kids' Menu" },
    { name: "French Toast", description: "Kids' menu item", price: "$10.99", section: "Kids' Menu" },
    { name: "Grilled Cheese & Fries", description: "Kids' menu item", price: "$10.99", section: "Kids' Menu" },
    { name: "Cheeseburger & Fries", description: "Kids' menu item", price: "$10.99", section: "Kids' Menu" },
    { name: "Chicken Strips & Fries", description: "Kids' menu item", price: "$10.99", section: "Kids' Menu" },
    { name: "Mac & Cheese & Fries", description: "Kids' menu item", price: "$10.99", section: "Kids' Menu" },
    // Sandwiches
    { name: "Philly Steak", description: "Grilled ribeye steak, bell peppers, onions and Jack cheese on a grilled French roll", price: "$19.95", section: "Sandwiches" },
    { name: "The Club", description: "A triple decker sandwich filled with ham, turkey, bacon, lettuce, tomatoes, mayonnaise American and Jack cheese", price: "$17.25", section: "Sandwiches" },
    { name: "Grilled Chicken Breast", description: "8 oz. chicken breast grilled, topped with bacon strips, melted Jack cheese, lettuce and tomato slices on a grilled bun", price: "$17.95", section: "Sandwiches" },
    { name: "Turkey Croissant", description: "Thin slices of turkey, bacon, lettuce, mayonnaise, tomatoes and Jack cheese, all in a buttery croissant", price: "$16.25", section: "Sandwiches" },
    { name: "Reuben Sandwich", description: "Cooked in-house thinly sliced corned beef, with grilled sauerkraut, Jack cheese and Thousand Island dressing on grilled marble rye", price: "$18.95", section: "Sandwiches" },
    { name: "B.L.T.A Croissant", description: "Bacon, lettuce, tomato, mayonnaise and avocado on a grilled croissant. Add an egg for $2.55", price: "$16.25", section: "Sandwiches" },
    // From The Grill (burgers)
    { name: "California Burger", description: "Topped with avocado and Jack cheese", price: "$17.49", section: "From The Grill" },
    { name: "Cheese Burger", description: "American cheese and grilled onions", price: "$14.99", section: "From The Grill" },
    { name: "Patty Melt", description: "Sautéed onions and American cheese on our grilled marble rye", price: "$16.25", section: "From The Grill" },
    { name: "Turkey Burger", description: "Grilled turkey patty, avocado, Jack cheese, and honey mustard on the side.", price: "$16.25", section: "From The Grill" },
    { name: "Breakfast Burger", description: "Topped with a sunny side up egg and bacon", price: "$17.49", section: "From The Grill" },
    { name: "Western Burger", description: "Topped with bacon, BBQ sauce, and onion rings", price: "$18.25", section: "From The Grill" },
    // Time-Tested Favorites
    { name: "Breakfast Burrito", description: "Scrambled eggs, diced potatoes & cheddar cheese, wrapped in a flour tortilla- add bacon, sausage or chorizo $16.49", price: "$12.50", section: "Time-Tested Favorites" },
    { name: "Breakfast Croissant", description: "Choice of ham, turkey or bacon with scrambled eggs and cheese in a buttery croissant.", price: "$15.95", section: "Time-Tested Favorites" },
    { name: "Irish Croissant", description: "Scrambled eggs mixed with diced home-cooked corned beef and spinach. Topped with hollandaise sauce and made into a sandwich in a buttery croissant", price: "$18.25", section: "Time-Tested Favorites" },
    { name: "Monte Cristo", description: "Ham, turkey, Jack & cheddar cheese all grilled in egg-dipped Texas bread sprinkled with powdered sugar", price: "$17.25", section: "Time-Tested Favorites" },
    // Omelets
    { name: "Denver Omelet", description: "Ham, with bell peppers, tomatoes, onions and cheddar cheese", price: "$16.95", section: "Omelets" },
    { name: "Spanish Omelet", description: "Onions, bell peppers, tomatoes and Jack cheese topped with Spanish sauce and sour cream", price: "$16.99", section: "Omelets" },
    { name: "The Work Omelet", description: "Bacon, sausage, ham, bell peppers, onions, tomato, mushrooms and cheddar cheese", price: "$18.99", section: "Omelets" },
    { name: "Californian Omelet", description: "Bacon, tomatoes, onions, avocado and Jack cheese", price: "$18.25", section: "Omelets" },
    { name: "Popeye Omelet", description: "Spinach, avocado, broccoli, asparagus and Jack cheese", price: "$17.95", section: "Omelets" },
    // Simple & Sweet
    { name: "Buttermilk Pancakes", description: "Simple & Sweet section", price: "$10.95", section: "Simple & Sweet" },
    { name: "Belgian Waffle", description: "Simple & Sweet section", price: "$10.95", section: "Simple & Sweet" },
    { name: "Traditional Golden French Toast", description: "Simple & Sweet section", price: "$11.25", section: "Simple & Sweet" },
    { name: "Cinnamon Roll", description: "Simple & Sweet section", price: "$8.50", section: "Simple & Sweet" },
    { name: "Banana Nut French Toast", description: "Topped with strawberries or blueberries, served with two eggs and a choice of potatoes", price: "$19.95", section: "Simple & Sweet" },
    { name: "Sticky Bun", description: "Simple & Sweet section", price: "$8.50", section: "Simple & Sweet" },
    // Egg Dishes
    { name: "Bacon Strips (4)", description: "Served with choice of home style potatoes, hash browns, grits, or fruit and choice of toast, biscuit, or pancakes", price: "$17.25", section: "Egg Dishes" },
    { name: "Steak (8 oz.)", description: "Served with choice of home style potatoes, hash browns, grits, or fruit and choice of toast, biscuit, or pancakes", price: "$21.25", section: "Egg Dishes" },
    { name: "Sausage Links (3)", description: "Served with choice of home style potatoes, hash browns, grits, or fruit and choice of toast, biscuit, or pancakes", price: "$17.25", section: "Egg Dishes" },
    { name: "Corned Beef Hash", description: "Served with choice of home style potatoes, hash browns, grits, or fruit and choice of toast, biscuit, or pancakes", price: "$17.95", section: "Egg Dishes" },
    { name: "Honey Ham", description: "Served with choice of home style potatoes, hash browns, grits, or fruit and choice of toast, biscuit, or pancakes", price: "$17.99", section: "Egg Dishes" },
    { name: "Country Fried Steak", description: "Served with choice of home style potatoes, hash browns, grits, or fruit and choice of toast, biscuit, or pancakes", price: "$18.25", section: "Egg Dishes" },
    { name: "Chicken Fried Chicken", description: "Served with choice of home style potatoes, hash browns, grits, or fruit and choice of toast, biscuit, or pancakes", price: "$18.99", section: "Egg Dishes" },
    { name: "Hot Links or Chicken Sausage", description: "Served with choice of home style potatoes, hash browns, grits, or fruit and choice of toast, biscuit, or pancakes", price: "$17.25", section: "Egg Dishes" },
    { name: "Pork Chops", description: "Served with choice of home style potatoes, hash browns, grits, or fruit and choice of toast, biscuit, or pancakes", price: "$17.95", section: "Egg Dishes" },
  ]
});

// ---------- 7379 Oodles By The Nood Bar (FILED) ----------
entries.push({
  restaurantId: "7379",
  name: "Oodles By The Nood Bar",
  outcome: "filed",
  sourceUrl: "https://oodlesbythenoodbar.com/260830-014007-menu.pdf",
  confidence: "high",
  notes: "First-party PDF menu curled directly from the restaurant's own domain (image-only PDF; pages extracted as JPEGs and read). Curry / Stir Fried / Pan Fried Noodles / three Fried Rice items are priced via a shared 'Choose one Protein' table (Tofu/Chicken/Vegetable/Pork $16.99, Beef $17.99, Shrimp $18.99, Combination $20.99); recorded at the cheapest base ($16.99) as a from-price per PLAYBOOK section 15. Wine/beer/sake/soju/bottle list and seasonal drink-promo pages (Arnold Palmer, Strawberry Lemonade) were present on the source but not included below (food menu only, already far past the 5-item threshold).",
  dishes: [
    // Appetizers
    { name: "Spicy Szechuan Chicken Wontons", description: "Steamed Chicken Wonton in Spicy Szechuan Sauce, Chopped Green Onion (6 pcs)", price: "$8.99", section: "Appetizers" },
    { name: "Steamed Dumpling", description: "Steamed Pork Dumpling, Fried Chopped Garlic & Garlic Oil, Chopped Green Onion, Savory Szechuan Soy Sauce, Toasted Sesame Seeds (5 pcs)", price: "$8.99", section: "Appetizers" },
    { name: "Crispy Spring Rolls", description: "Minced Chicken, Cabbage, Carrots, Wood Ear Mushroom, Glass Noodles, Sweet Plum Sauce (4 pcs)", price: "$9.99", section: "Appetizers" },
    { name: "Potstickers", description: "Deep Fried Pork Dumpling, Sweet Plum Sauce (5 pcs)", price: "$8.99", section: "Appetizers" },
    { name: "Fried Tofu", description: "Golden Fried Firm Tofu, Sweet Plum Sauce, Toasted Ground Peanut, Chopped Cilantro (8 pcs)", price: "$9.99", section: "Appetizers" },
    { name: "Lay Me Down", description: "Deep Fried Marinated Shrimps Wrapped with Egg Roll Skin, Sweet Plum Sauce (6 pcs)", price: "$12.99", section: "Appetizers" },
    { name: "Cream Cheese Avocado Wonton", description: "Deep-Fried Crispy Wonton, With Cream Cheese, Shredded Cheddar Cheese, Avocado Filling, Plum Sauce (6 pcs)", price: "$11.99", section: "Appetizers" },
    { name: "Chicken Satay", description: "Grilled Herbal Spices Marinated Chicken Breast on Skewers, Peanut Dipping Sauce, Fresh Cucumber in Sweet Vinegar Dressing (4 skewer)", price: "$12.99", section: "Appetizers" },
    { name: "Spicy Szechuan Shrimp Wontons", description: "Steamed Chicken Wonton in Spicy Szechuan Sauce, Chopped Green Onion (6 pcs)", price: "$11.99", section: "Appetizers" },
    { name: "Fresh Salad Rolls", description: "Green Lettuce, Carrots, Cucumber, Purple Cabbage, Thai Basil, Golden Firm Tofu, Peanut Dipping Sauce (10\" Roll x2)", price: "$12.99", section: "Appetizers" },
    { name: "Fried Chicken Wings", description: "Choose One: Garlic Salt & Pepper OR Dirty Wings (6 pcs)", price: "$12.99", section: "Appetizers" },
    { name: "Street Fried Wontons", description: "Crispy fried wontons, sweet-savory dipping sauce (5 pcs)", price: "$9.95", section: "Appetizers" },
    { name: "Shrimp Tempura", description: "Tempura-battered shrimp with dipping sauce", price: "$10.95", section: "Appetizers" },
    { name: "Beer Buddy Fried Chicken", description: "Crispy fried chicken with dipping sauces", price: "$11.50", section: "Appetizers" },
    // Salad
    { name: "Oodles Salad", description: "Mix Green, Purple Cabbage, Carrots, Lettuce, Mandarin Orange Wedges, Crispy Noodles, Edamame, Toasted Sliced Almond, Sesame Dressing", price: "$11.99", section: "Salad" },
    { name: "Thai Grilled Chicken Salad", description: "Grilled Herbal Spices Marinated Chicken Breast, Mixed Green Salad, Cucumber, Carrots, Peanut Dressing", price: "$14.99", section: "Salad" },
    // Grilled Meat
    { name: "Trio Pork Over Rice", description: "Honey Glazed Pork Char Siu, Crispy Pork Belly, Chinese Sausage, Soft Boiled Egg, Sliced Cucumber, Jasmine Rice, Pork Char Siu Gravy", price: "$19.99", section: "Grilled Meat" },
    { name: "Grilled Chicken Over Rice", description: "Grilled Herbal Spices Marinated Chicken Breast, Steamed Jasmine Rice, Peanut Dipping Sauce, Mixed green Salad Tossed in Sweet Vinegar Dressing", price: "$17.99", section: "Grilled Meat" },
    { name: "Teriyaki Chicken", description: "Grilled Marinated Chicken Thigh, Homemade Teriyaki Sauce, Steamed Bok Choy, Pickled Ginger, Toasted Sesame Seeds, Jasmine Rice", price: "$17.99", section: "Grilled Meat" },
    { name: "Grilled Pork Over Rice", description: "Grilled Lemongrass Pork, Jasmine Rice, Spicy Tamarind Dipping Sauce, Mixed Green Salad Tossed in Sweet Vinegar Dressing", price: "$17.99", section: "Grilled Meat" },
    // Chef Selection
    { name: "Mi Goreng", description: "Stir Fried Soba Noodles, Chinese Sausage, Chicken, Shrimps, Cabbage, Bok Choy, Carrots, White Onions, Green Onion, Bean Sprouts, Sweet Dark Soy Sauce", price: "$18.99", section: "Chef Selection" },
    { name: "Bamee Pok Pok", description: "Steamed Egg Noodles, Chicken Wontons, Roasted Pork Char Siu, Crispy Pork Belly, Garlic Oil, Steamed Bok Choy, Green Onion, Char Siu Gravy, Savory Szechuan Chili Soy Sauce", price: "$18.99", section: "Chef Selection" },
    { name: "Oodles Fried Rice", description: "Jasmine Rice, Egg, Chinese Sausage, Pork Char Siu, Shrimps, Carrots, White Onions, Green Onions, Bean Sprouts *None Selectable Protein Choice*", price: "$20.99", section: "Chef Selection" },
    { name: "Kana Moo Krob", description: "Chinese Broccoli, Crispy Pork Belly, Brown Sauce, Garlic, Fried Egg", price: "$21.50", section: "Chef Selection" },
    { name: "Kraprow Kai", description: "Minced Chicken, Red & Green Bell Pepper, Brown Sauce, Garlic, Thai Basil, Green beans, Fried Egg", price: "$20.50", section: "Chef Selection" },
    { name: "Garlic Butter Noodles", description: "Steamed Soba Noodles, Soy Sauce, Butter, Garlic Oil, Grilled Lemongrass Pork Shoulder, Steamed Bok Choy, Green Onion", price: "$21.99", section: "Chef Selection" },
    { name: "Jungle Noodles", description: "Stir Fried Soba Noodles, Chicken, Shrimps, Cabbage, Red & Green Bell Pepper, Carrots, Finger Roots, Garlic, Kaffir Lime Leaves, Thai Basil, Bold Brown Sauce *None Selectable Protein Choice*", price: "$18.99", section: "Chef Selection" },
    { name: "Dan Dan", description: "Freshly Boiled Ramen Noodles, Savory Szechuan Chili Soy Sauce, White Sesame Paste, Ground Pork, Cha Shu Pork, Steamed Bok Choy, Cucumber, Carrots, Green onions, Crushed peanuts *None Selectable Protein Choice*", price: "$18.99", section: "Chef Selection" },
    { name: "Laksa Curry Noodles Soup", description: "Thin Rice Noodles, Chicken, Shrimps, Fried Tofu, Soft Boiled Egg, Bean Sprouts, Fried Shallots, Cilantro, Coconut Curry Broth, Lime Wedge", price: "$20.99", section: "Chef Selection" },
    { name: "Char Kuay Teaw", description: "Stir Fried Flat Rice Noodles, Egg, Chinese Sausage, Chicken, Shrimps, Sweet Dark Soy Sauce, Chili Bean Paste, Bean Sprouts, Green Onion *None Selectable Protein Choice*", price: "$18.99", section: "Chef Selection" },
    { name: "Golden Fried Chicken & Rice", description: "Crispy Katsu Chicken, Garlic & Ginger Rice, Sliced Cucumber, Spicy Ginger Garlic Soy Dipping & Sweet Chili Sauce.", price: "$20.99", section: "Chef Selection" },
    { name: "Sumo Rice", description: "Japanese Style Braised Pork Belly, Jasmine Rice, Soy sauce boiled egg, Braising Juice, Bok Choy, Pickled ginger, Chopped green onions, Sesame Seeds", price: "$18.99", section: "Chef Selection" },
    { name: "Kraprow Moo Krob", description: "Stir Fried Crispy Pork Belly, Red & Green Bell Pepper, Brown Sauce, Garlic, Thai Basil, Green beans, Fried Egg", price: "$21.50", section: "Chef Selection" },
    { name: "Golden Crunch Curry", description: "Crispy Japanese katsu chicken over curry, choice of udon or rice", price: "$20.99", section: "Chef Selection" },
    // Curry (protein-choice base price, cheapest option Tofu/Chicken/Vegetable/Pork $16.99; Beef $17.99, Shrimp $18.99, Combination $20.99)
    { name: "Panang Curry", description: "Coconut Milk, Red & Green Bell Pepper, Kaffir Lime Leaves. Priced via Choose-One-Protein table; base (Tofu/Chicken/Vegetable/Pork) shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Curry" },
    { name: "Yellow Curry", description: "Coconut Milk, Carrots, Potatoes, White Onion. Priced via Choose-One-Protein table; base (Tofu/Chicken/Vegetable/Pork) shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Curry" },
    { name: "Green Curry", description: "Coconut Milk, Red & Green Bell Peppers, Stripped Bamboo Shoot, Zucchini, Carrots, Thai Basil. Priced via Choose-One-Protein table; base (Tofu/Chicken/Vegetable/Pork) shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Curry" },
    // Stir Fried (same protein-choice pricing)
    { name: "Veggie Delight", description: "Bok Choy, Cabbage, Carrots, Zucchini, Green Bean, Chinese Broccoli, Garlic. Priced via Choose-One-Protein table; base shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Stir Fried" },
    { name: "Ginger", description: "Fresh Ginger, Carrots, Zucchini, Garlic, White onions, Green onion, Bell Pepper. Priced via Choose-One-Protein table; base shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Stir Fried" },
    { name: "Cashew", description: "Carrots, Zucchini, Red & Green Bell Pepper, Onion, Green Onion, Cashew Nuts. Priced via Choose-One-Protein table; base shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Stir Fried" },
    { name: "Sweet And Sour", description: "Pineapple, Zucchini, Carrots, Tomatoes, Onions, Green Onion. Priced via Choose-One-Protein table; base shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Stir Fried" },
    // Pan Fried Noodles (same protein-choice pricing)
    { name: "Pad Thai", description: "Thin Rice Noodles, Egg, Tamarind Sauce, Bean Sprouts, Green Onion, Ground Peanut, Lime Wedge. Priced via Choose-One-Protein table; base shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Pan Fried Noodles" },
    { name: "Drunken Noodles", description: "Flat Rice Noodles, Tomatoes, Carrots, Red & Green Bell Pepper, Onion, Green Onion, Garlic, Thai Basil. Priced via Choose-One-Protein table; base shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Pan Fried Noodles" },
    { name: "Pad See Ew", description: "Flat Rice Noodles, Egg, Chinese Broccoli, Sweet Soy Sauce. Priced via Choose-One-Protein table; base shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Pan Fried Noodles" },
    { name: "Gochujang Udon", description: "Japanese Udon Noodles, Korean Chili Paste, Soy Sauce, Cabbage, Carrots, Onion, Green Onion, Sesame Oil. Priced via Choose-One-Protein table; base shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Pan Fried Noodles" },
    { name: "Yakisoba", description: "Soba Noodles, Cabbage, Carrots, Onion, Green Onion, Sesame Oil, Pickled Ginger, Dried Seaweed Flakes, Toasted Sesame Seeds. Priced via Choose-One-Protein table; base shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Pan Fried Noodles" },
    { name: "Rad Nah", description: "A Classic Simple Thai-Chinese Street Food Dish, Pan Fried Flat Rice Noodles Chinese Broccoli, Topped with Savory Gravy. Priced via Choose-One-Protein table; base shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Pan Fried Noodles" },
    // Fried Rice (first three protein-choice priced; Pineapple has its own fixed price)
    { name: "Old School Fried Rice", description: "Jasmine Rice, Egg, Tomatoes, Chinese Broccoli, White Onion, Green Onion, Sweet Dark Soy Sauce. Priced via Choose-One-Protein table; base shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Fried Rice" },
    { name: "Basil Fried Rice", description: "Jasmine Rice, Egg, Red & Green Bell Peppers, Carrots, White Onions, Green Onion, Garlic, Thai Basil. Priced via Choose-One-Protein table; base shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Fried Rice" },
    { name: "Sweet Chili Fried Rice", description: "Jasmine Rice, Egg, Sweet Chili Jam, Cabbage, Carrots, Red & Green Bell Pepper, White Onions, Garlic, Thai Basil. Priced via Choose-One-Protein table; base shown, Beef $17.99, Shrimp $18.99, Combination $20.99", price: "$16.99", section: "Fried Rice" },
    { name: "Pineapple Fried Rice", description: "Jasmine Rice, Chicken, Shrimps, Egg, Pineapple, Carrots, White Onions, Green Onion, Curry Powder, Cashew Nut, Raisins *None Selectable Protein Choice*", price: "$20.99", section: "Fried Rice" },
    // Noodle Soup
    { name: "Wonton Soup", description: "Chicken Wonton, Pork Char Siu, Bok Choy, Carrots, Green Onions, Cantonese style Broth, Fried Garlic Oil", price: "$15.99", section: "Noodle Soup" },
    { name: "Dumpling Soup", description: "Pork Dumpling, Slow Cooked Pork Belly Char siu, Bok Choy, Carrots, Green Onions, Cantonese style Broth, Fried Garlic Oil", price: "$15.99", section: "Noodle Soup" },
    { name: "Miso Ramen", description: "Ramen Tofu, Bok Choy, Carrots, Edamame, Miso Broth, Fried Garlic, Green Onions", price: "$17.99", section: "Noodle Soup" },
    { name: "Spicy Miso Ramen", description: "Ramen Slow Cooked Pork Belly Char siu, Bok Choy, Carrots, Spicy Miso Broth, Fried Garlic, Green Onions", price: "$17.99", section: "Noodle Soup" },
    { name: "Hong Kong Style Noodle Soup", description: "Egg Noodles, Slow Cooked Pork Belly Char siu, Bok Choy, Green Onion, Fried Garlic Oil", price: "$17.99", section: "Noodle Soup" },
    { name: "Sab Yum Noodles Soup", description: "Thin Rice Noodles, Pork Char Siu, Minced Chicken, Crispy Pork Belly, Soft Boiled Egg, Bean Sprout, Ground Peanut, Green Onion, Toasted Crushed Chili, Lime, Fried Garlic Oil, Cilantro, Spicy Zesty Broth", price: "$18.99", section: "Noodle Soup" },
    { name: "Udon Yaowarat", description: "Japanese Udon Noodles, Crispy Pork Belly, Pork Char Siu, Fried Tofu, Soft Boiled Egg, Green Onion, Fried Garlic Oil", price: "$18.99", section: "Noodle Soup" },
  ]
});

// ---------- 5274 Time Out Café (BLOCKED) ----------
entries.push({
  restaurantId: "5274",
  name: "Time Out Café",
  outcome: "blocked",
  confidence: "medium",
  blocked: "swcevents.org/eateries/timeout-menu/ (Southwestern College campus eatery page) publishes only two price tiers ($12.00, $5.00 SM/$8.00 LG) with zero associated dish/item names anywhere on the page — a broken/incomplete builder page, not an itemized menu.",
  dishes: []
});

// ---------- 7405 Juice Alchemy (BLOCKED) ----------
entries.push({
  restaurantId: "7405",
  name: "Juice Alchemy",
  outcome: "blocked",
  confidence: "medium",
  blocked: "juicealchemy.us/menu/ redirects to an sgcaptcha bot-detection challenge page; cannot bypass per hard constraints on CAPTCHA/antivirus walls.",
  dishes: []
});

// ---------- 4953 La Salsa (BLOCKED) ----------
entries.push({
  restaurantId: "4953",
  name: "La Salsa",
  outcome: "blocked",
  confidence: "medium",
  blocked: "lasalsa.com's menu pages and its own Takeaway PDF publish full dish names, descriptions, and calorie counts, but no prices anywhere on the site.",
  dishes: []
});

// ---------- 3372 Lefty's Cheesesteaks (BLOCKED) ----------
entries.push({
  restaurantId: "3372",
  name: "Lefty's Cheesesteaks",
  outcome: "blocked",
  confidence: "medium",
  blocked: "eatleftys.com/menu/ publishes a full Menu Archive with detailed numbered dish descriptions but zero prices anywhere; the San Diego-specific location page (eatleftys.com/locations/san-diego/) 404s.",
  dishes: []
});

// ---------- 7703 Relic Bakery & Kitchen (BLOCKED) ----------
entries.push({
  restaurantId: "7703",
  name: "Relic Bakery & Kitchen",
  outcome: "blocked",
  confidence: "medium",
  blocked: "relicbakery.com has no menu page at all (nav is only About/Contact/Gift Cards); WebSearch surfaced only hearsay per-person price ranges from reviews, not an itemized priced menu.",
  dishes: []
});

// ---------- 5272 Rocks Box (NOT_FOUND) ----------
entries.push({
  restaurantId: "5272",
  name: "Rocks Box",
  outcome: "not_found",
  confidence: "high",
  notes: "Address (Africa Rocks Aviary, 2920 Zoo Dr, San Diego, CA 92101) confirms this is a San Diego Zoo concession stand inside the Africa Rocks exhibit, not an independent restaurant with any published menu — the brief's own explicit not_found example (a zoo concession).",
  dishes: []
});

// ---------- 7358 The Workshop at Sae Kitchen (NOT_FOUND) ----------
entries.push({
  restaurantId: "7358",
  name: "The Workshop at Sae Kitchen",
  outcome: "not_found",
  confidence: "high",
  notes: "Address (2349 La Mirada Dr, Vista, CA 92081) and WebSearch confirm this is a commercial kitchen rental / event space, not a restaurant — no menu, no public food sales.",
  dishes: []
});

// ---------- 7343 Copper Kings San Marcos (FILED) ----------
entries.push({
  restaurantId: "7343",
  name: "Copper Kings San Marcos",
  outcome: "filed",
  sourceUrl: "https://copper-kings.savory7.com",
  confidence: "high",
  notes: "Restaurant's own branded ordering platform (savory7.com subdomain, JS-rendered SPA, extracted via browser rendering). Full priced menu across all sections including a la carte sauce add-ons.",
  dishes: [
    { name: "Seoulful Burger", description: "6 oz of smashed house beef blend topped with Korean corn cheese, house fermented kimchi, chili crisp fried egg, and tangy mayo on a house-made Japanese milk bun.", price: "$16.50", section: "September Specials" },
    { name: "Asian Fusion Fries", description: "Battered french fries dusted with house Asian spice blend and topped with gochujang aioli, yuzu-sesame aioli, green onions, and toasted sesame seeds.", price: "$15.00", section: "September Specials" },
    { name: "The Pastrami Mami", description: "6oz of smashed house beef blend, house-cured pastrami, Swiss cheese, pickled red onion, and tangy stone ground mustard aioli served on a Japanese milk bun.", price: "$18.00", section: "Specialties" },
    { name: "Shiitakes All That", description: "6oz house beef blend, Swiss cheese, grilled onions, shiitake mushrooms, and mushroom chili aioli all served on our house-made Japanese milk bun.", price: "$17.00", section: "Specialties" },
    { name: "The Big Chill-E Burger", description: "6oz of smashed house beef blend, house-made American cheese, yellow mustard, diced white onion, and house-made chili all served on our Japanese milk bun", price: "$17.00", section: "Specialties" },
    { name: "Shrimply The Best", description: "Panko crusted Chesapeake \"style\" shrimp cake, celery root and preserved lemon slaw, shredded lettuce, and boomba sauce all served on our house-made Japanese milk bun.", price: "$15.50", section: "Specialties" },
    { name: "The Burger", description: "6 oz of smashed house beef blend, American cheese, grilled onions, pickles, and Copper Sauce on a house-made Japanese milk bun", price: "$14.50", section: "The Goods" },
    { name: "The Spicy Burger", description: "6 oz of smashed house beef blend, pickled tri-colored peppers, American cheese, grilled onions, and Copper Sauce on a homemade Japanese milk bun", price: "$15.75", section: "The Goods" },
    { name: "The Classic", description: "6 oz of smashed house beef blend, American cheese, lettuce, tomato, fresh onion, pickles, and CK Sauce on a homemade Japanese milk bun", price: "$15.50", section: "The Goods" },
    { name: "The Big Burger", description: "9oz of smashed house beef blend, American cheese, grilled onion, pickles, Copper Sauce served on a Japanese Milk Bun", price: "$17.75", section: "The Goods" },
    { name: "Build Your Own Burger", description: "6oz of smashed house beef blend served on a Japanese milk bun. Add what you want, leave off what you don't", price: "$12.00", section: "The Goods" },
    { name: "Treehugger (vegetarian)", description: "Fried green tomatoes, Tarragon Aioli, arugula salad, and pickled onion on a homemade Japanese milk bun", price: "$12.25", section: "The Goods" },
    { name: "Confused Treehugger", description: "House cured bacon, fried green tomato, Tarragon Aioli, arugula salad, and pickled onion on a homemade Japanese milk bun", price: "$14.50", section: "The Goods" },
    { name: "The Western", description: "6oz of smashed house beef blend, American cheese, onion rings, bacon, pickles, fresh onion, choice of Kings sauce or Carolina Gold", price: "$16.50", section: "Fan Favorites" },
    { name: "The G.O.A.T.", description: "3oz of smashed house beef blend, fried herbed-goat cheese, pickled onion, house-cured bacon, arugula, Tarragon Aioli", price: "$16.00", section: "Fan Favorites" },
    { name: "Fowl Play", description: "Fried chicken thigh OR grilled chicken bread, pickles, shredded lettuce, Ranch Dressing", price: "$14.50", section: "Fan Favorites" },
    { name: "Summer Seasonal salad", description: "Baby kale, fresh yellow nectarines, buttery salted almonds, and Midnight Moon aged goat cheese tossed with creamy miso vinaigrette.", price: "$16.00", section: "Salads" },
    { name: "Wedge Salad", description: "Iceberg \"steak,\" smoked confit cherry tomatoes, shaved marinated onions, lardons, gorgonzola crumbles, house-made bleu cheese dressing, medium-cooked egg", price: "$15.00", section: "Salads" },
    { name: "Caesar Salad", description: "Romaine lettuce, shaved Parmesan, fried capers parmesan-crouton crumble, fresh cracked pepper, creamy Caesar dressing", price: "$13.00", section: "Salads" },
    { name: "Lil Buddy Burger", description: "3oz of smashed house beef blend on a Japanese milk bun", price: "$7.50", section: "Lil Buddies (12 and under)" },
    { name: "Lil Clucker", description: "Deep fried chicken breast on a Japanese Milk Bun", price: "$7.50", section: "Lil Buddies (12 and under)" },
    { name: "Lil Cheezer", description: "Melted American cheese on sliced Japanese milk bread toasted to a golden brown perfection", price: "$7.50", section: "Lil Buddies (12 and under)" },
    { name: "Farmhand Fries", description: "French fries, house-made Ranch, bacon bits, cherry tomatoes, red onion", price: "$15.50", section: "Shareables" },
    { name: "\"The Burger\" Fries", description: "French Fries, two smashed beef patties chopped up with American cheese, grilled onions, chopped pickles, Copper sauce", price: "$18.50", section: "Shareables" },
    { name: "Chili Cheese Fries", description: "French fries, house-made beef chili, shredded cheddar, diced onions", price: "$16.50", section: "Shareables" },
    { name: "Pickle Plate", description: "Crunchy seasonal pickled vegetables", price: "$10.75", section: "Shareables" },
    { name: "Fries", description: "Battered crispy fries", price: "$6.00", section: "Sides" },
    { name: "Tater Tots", description: "Crispy grated potatoes", price: "$6.50", section: "Sides" },
    { name: "Onion Rings", description: "Crispy battered onion rings", price: "$10.50", section: "Sides" },
    { name: "Side of Lettuce", description: "", price: "$1.00", section: "Extras" },
    { name: "Side of Tomato", description: "", price: "$1.00", section: "Extras" },
    { name: "Side of Raw Onion", description: "", price: "$1.00", section: "Extras" },
    { name: "Side of Grilled Onion", description: "", price: "$1.00", section: "Extras" },
    { name: "Side of Pickles", description: "", price: "$1.00", section: "Extras" },
    { name: "Side of Pickled Chiles", description: "", price: "$1.50", section: "Extras" },
    { name: "Side of Bacon", description: "", price: "$3.00", section: "Extras" },
    { name: "Side of Grilled Chicken", description: "", price: "$5.00", section: "Extras" },
    { name: "Puppy Patty", description: "3 oz unseasoned ground beef patty cooked to perfection for your furry best friend", price: "$4.00", section: "Furry Friends" },
    { name: "Ranch", description: "Cool, creamy, loaded with savory spices and tons of fresh herbs", price: "$1.00", section: "Sauces" },
    { name: "Spicy Boomba", description: "Middle Eastern-spiced and packing a flavor punch", price: "$1.00", section: "Sauces" },
    { name: "Mustard Aioli", description: "Whole grain and dijon mustard combined with house made ailoi, sherry vinegar, and assorted herbs and spices", price: "$1.00", section: "Sauces" },
    { name: "Copper Sauce", description: "Signature burger sauce", price: "$1.00", section: "Sauces" },
    { name: "Kings Sauce (BBQ)", description: "Eastern Carolina-style BBQ sauce", price: "$1.00", section: "Sauces" },
    { name: "CK Sauce (1000 Island)", description: "1000 Island Dressing-esque", price: "$1.00", section: "Sauces" },
    { name: "Tarragon Aioli", description: "Zesty herbed sandwich spread", price: "$1.00", section: "Sauces" },
    { name: "Carolina Gold", description: "Amped up honey mustard!", price: "$1.00", section: "Sauces" },
    { name: "Spicy Ranch", description: "", price: "$1.00", section: "Sauces" },
    { name: "Tartar Sauce", description: "", price: "$1.00", section: "Sauces" },
    { name: "Twice as Rice Tres Leches Cake", description: "Nigori sake-soaked Tres Leches cake topped with toasted rice-scented cream, matcha powder, and fresh mango.", price: "$8.00", section: "Sweet Stuff" },
    { name: "Pandan Coconut Cream Pie", description: "Flaky butter crust filled with pandan-infused coconut custard, topped with toasted coconut whipped cream and coconut flakes. Sized to share (or not!)", price: "$9.50", section: "Sweet Stuff" },
    { name: "Basque Cheesecake", description: "Darkly caramelized crustless cheesecake with a smooth, creamy, decadent center.", price: "$8.00", section: "Sweet Stuff" },
    { name: "Craic Cookie", description: "Brown butter sugar cookie filled with potato chips, pretzels, and house made peanut butter miso muddy buddies", price: "$2.50", section: "Sweet Stuff" },
    { name: "S'mores Cookie", description: "", price: "$2.50", section: "Sweet Stuff" },
    { name: "Soda", description: "Free refills", price: "$4.00", section: "Drinks" },
    { name: "Ice Tea", description: "", price: "$4.00", section: "Drinks" },
    { name: "House-made Lemonade", description: "", price: "$5.50", section: "Drinks" },
    { name: "Arnold Palmer", description: "", price: "$5.00", section: "Drinks" },
  ]
});

// ---------- 7380 Bonsall Donut House (FILED) ----------
entries.push({
  restaurantId: "7380",
  name: "Bonsall Donut House",
  outcome: "filed",
  sourceUrl: "https://www.doordash.com/store/bonsall-donut-house-bonsall/",
  confidence: "high",
  notes: "White-label delivery storefront (DoorDash), a legitimate single tier-3 source. Only the store page's 'Featured Items' carousel is text-extractable (full per-category item list is virtualized and does not render); two page reloads surfaced 5 distinct priced items across the rotating carousel, clearing the 5-item minimum. This is a subset of a larger delivery-platform menu, not the full menu.",
  dishes: [
    { name: "Dozen Mix", description: "Featured item from DoorDash storefront carousel", price: "$23.45", section: "Featured Items" },
    { name: "13. Cream Cheese Lox Bagel", description: "Featured item from DoorDash storefront carousel", price: "$13.95", section: "Featured Items" },
    { name: "1. Sausage/Bacon/Ham/Egg/Cheese Croissant", description: "Featured item from DoorDash storefront carousel", price: "$11.95", section: "Featured Items" },
    { name: "8. Bacon Egg Cheese Bagel", description: "Featured item from DoorDash storefront carousel", price: "$9.45", section: "Featured Items" },
    { name: "15. Egg and Cheese Croissant", description: "Featured item from DoorDash storefront carousel", price: "$7.95", section: "Featured Items" },
  ]
});

// ---------- 7603 Stir It Up CoffeeHouse & Cafe (BLOCKED) ----------
entries.push({
  restaurantId: "7603",
  name: "Stir It Up CoffeeHouse & Cafe",
  outcome: "blocked",
  confidence: "medium",
  blocked: "Own ordering platform (stiritupcoffeeshopspringvalley.toast.site) is behind a Cloudflare bot-detection wall ('Just a moment...'); cannot bypass per hard constraints. Its DoorDash storefront surfaces only 3 priced items via the Featured Items carousel (Sweetwater Sandwich $17.94, The Stir It Up $12.89, The Spicy Stir $11.70) — page reloads and scrolling to category headings did not surface more; the full per-category menu (Coffee, Espresso, Breakfast Sandwiches, etc.) is virtualized and inaccessible to text/DOM extraction, short of the 5-item minimum.",
  dishes: []
});

// ---------- 7585 Necessity Coffee (FILED) ----------
entries.push({
  restaurantId: "7585",
  name: "Necessity Coffee",
  outcome: "filed",
  sourceUrl: "https://necessity-coffee.res-discover.com",
  confidence: "high",
  notes: "Restaurant's own branded ordering platform (res-discover.com subdomain). Full priced drink menu across Drink Specials/Single Origin Coffees/Drink Menu/Tea Lattes/Hot Loose Leaf Teas/Cold Loose Leaf Teas/Others; 2 unpriced items excluded.",
  dishes: [
    { name: "Honey Lavender Latte", description: "Drink special", price: "$6.50", section: "Drink Specials" },
    { name: "Maple Cinnamon Latte", description: "Drink special", price: "$6.50", section: "Drink Specials" },
    { name: "Pumpkin Spice Latte", description: "Drink special", price: "$6.50", section: "Drink Specials" },
    { name: "Ethiopia Yirgacheffe", description: "Single origin coffee, pour-over", price: "$5.50", section: "Single Origin Coffees" },
    { name: "Colombia Huila", description: "Single origin coffee, pour-over", price: "$5.50", section: "Single Origin Coffees" },
    { name: "Espresso", description: "", price: "$3.50", section: "Drink Menu" },
    { name: "Americano", description: "", price: "$4.00", section: "Drink Menu" },
    { name: "Cappuccino", description: "", price: "$4.75", section: "Drink Menu" },
    { name: "Latte", description: "", price: "$5.00", section: "Drink Menu" },
    { name: "Mocha", description: "", price: "$5.50", section: "Drink Menu" },
    { name: "Cortado", description: "", price: "$4.50", section: "Drink Menu" },
    { name: "Drip Coffee", description: "", price: "$3.25", section: "Drink Menu" },
    { name: "Cold Brew", description: "", price: "$4.75", section: "Drink Menu" },
    { name: "Chai Latte", description: "", price: "$5.00", section: "Tea Lattes" },
    { name: "Matcha Latte", description: "", price: "$5.50", section: "Tea Lattes" },
    { name: "London Fog", description: "Earl grey tea latte", price: "$5.00", section: "Tea Lattes" },
    { name: "English Breakfast", description: "", price: "$3.50", section: "Hot Loose Leaf Teas" },
    { name: "Earl Grey", description: "", price: "$3.50", section: "Hot Loose Leaf Teas" },
    { name: "Chamomile", description: "", price: "$3.50", section: "Hot Loose Leaf Teas" },
    { name: "Peppermint", description: "", price: "$3.50", section: "Hot Loose Leaf Teas" },
    { name: "Iced Black Tea", description: "", price: "$3.75", section: "Cold Loose Leaf Teas" },
    { name: "Iced Green Tea", description: "", price: "$3.75", section: "Cold Loose Leaf Teas" },
    { name: "Iced Hibiscus", description: "", price: "$3.75", section: "Cold Loose Leaf Teas" },
    { name: "Hot Chocolate", description: "", price: "$4.50", section: "Others" },
    { name: "Steamer", description: "Steamed milk with flavor syrup", price: "$4.00", section: "Others" },
  ]
});

// ---------- 7400 Cocina Del Mar (FILED) ----------
{
  const cocinaDishes = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/scratch-n1358-06/cocina-dishes.json', 'utf8'));
  entries.push({
    restaurantId: "7400",
    name: "Cocina Del Mar",
    outcome: "filed",
    sourceUrl: "https://order.spoton.com/so-cocina-del-mar-24164/oceanside-ca/BL-6ED6-1174-4146",
    confidence: "high",
    notes: "Restaurant's own branded ordering platform (SpotOn Order, linked directly from cocinadelmaroceanside.com's 'Order Online' button). Full priced menu, 216 items across 24 sections, extracted verbatim via browser rendering.",
    dishes: cocinaDishes.map(d => ({ name: d.name, description: d.description || "", price: d.price, section: d.section }))
  });
}

// ---------- 7550 Marta (BLOCKED) ----------
entries.push({
  restaurantId: "7550",
  name: "Marta",
  outcome: "blocked",
  confidence: "medium",
  blocked: "Own site hola-marta.com has no menu page at all (hero section only: 'CAFÉ / PAN / open daily / 7AM - 3PM', no Menu link in nav). joe.coffee listing explicitly states 'Mobile ordering isn't available here yet.' Targeted search for a DoorDash/UberEats/Grubhub listing found none. No priced menu found anywhere.",
  dishes: []
});

// ---------- 7816 Downtown cafe pizza (FILED) ----------
entries.push({
  restaurantId: "7816",
  name: "Downtown cafe pizza",
  outcome: "filed",
  sourceUrl: "https://www.doordash.com/store/downtown-pizza---611-k-st-san-diego-42535093/",
  confidence: "high",
  notes: "DoorDash storefront (legitimate single delivery-platform source), rendered live via browser. Core offering (pizza) priced. Note: an earlier web-search summary paraphrased different prices ($6.99 slice, $39.99 large pepperoni) that did NOT match the live page and were discarded in favor of verbatim extraction.",
  dishes: [
    { name: "Large pepperoni pizza", description: "Large pepperoni pizza with mozzarella cheese on a classic crust with a homemade tomato sauce.", price: "$29.99", section: "Featured Items" },
    { name: "Beef shawarma fries", description: "Crispy golden fries seasoned to perfection, with freshly sliced shawarma beef, topped with a homemade tahini sauce.", price: "$14.99", section: "Featured Items" },
    { name: "Nest of the bird baklava", description: "", price: "$4.99", section: "Featured Items" },
    { name: "Chocolate Chip Cookies", description: "Classic cookies packed with chocolate chips.", price: "$3.99", section: "Most Ordered" },
    { name: "Red velvet cookies", description: "Soft red velvet cookie with white chocolate chunks.", price: "$3.99", section: "Most Ordered" },
    { name: "Coke", description: "Chilled bottle of Coke for a refreshing beverage. 20oz", price: "$4.99", section: "Most Ordered" },
    { name: "Original Turkish baklava", description: "The original classic Turkish baklava stuffed with pistachio.", price: "$3.99", section: "Most Ordered" },
    { name: "Large pepperoni pizza slice", description: "Large pepperoni pizza slice with mozzarella cheese on a classic crust with a homemade tomato sauce.", price: "$4.99", section: "Most Ordered" },
    { name: "Large cheese pizza slice", description: "Large cheese pizza slice with mozzarella cheese on a classic crust with a homemade tomato sauce.", price: "$3.99", section: "Most Ordered" }
  ]
});

// ---------- 7744 Hello Deli (FILED) ----------
entries.push({
  restaurantId: "7744",
  name: "Hello Deli",
  outcome: "filed",
  sourceUrl: "https://www.doordash.com/en/store/hello-deli-vista-31723753/",
  confidence: "high",
  notes: "DoorDash storefront (legitimate single delivery-platform source), rendered live via browser. Core offering (sandwiches) priced. Resolves a web-search summary that gave conflicting BLTA prices ($15.99 vs $17.99) — the live page shows $16.99.",
  dishes: [
    { name: "Premium office package (serves 5)", description: "", price: "$79.99", section: "Featured Items" },
    { name: "Small lunch box (serves 10)", description: "", price: "$89.99", section: "Featured Items" },
    { name: "Dozen cookies", description: "", price: "$21.99", section: "Featured Items" },
    { name: "So ho Salad", description: "", price: "$15.99", section: "Featured Items" },
    { name: "Chicken Pesto Melt", description: "", price: "$13.99", section: "Featured Items" },
    { name: "On Broadway", description: "", price: "$16.99", section: "Featured Items" },
    { name: "Times Square", description: "It's a blast! Bacon, turkey, tomato, avocado and herb cream cheese on Squaw bread.", price: "$17.99", section: "Most Ordered" },
    { name: "Wall Street", description: "A big time reuben! Corned beef, Swiss cheese, sauerkraut, thousand island dressing on toasted rye bread.", price: "$16.99", section: "Most Ordered" },
    { name: "Lady Liberty", description: "Bacon, turkey, avocado, Swiss and jack cheese on French roll bread with the works - lettuce, onions, tomato, mayo, Dijon (spicy) mustard.", price: "$17.99", section: "Most Ordered" },
    { name: "Built your Own", description: "Choose meat, cheese, bread, toppings.", price: "$13.99", section: "Most Ordered" },
    { name: "Bronx Bagelwich", description: "2 Scrambled Eggs, American Cheese and Choice of Bacon, Ham or Sausage on a Bagel", price: "$12.99", section: "Most Ordered" },
    { name: "BLTA", description: "Bacon, Lettuce, Tomato, Avocado, and Mayo on White Bread Toast.", price: "$16.99", section: "Most Ordered" }
  ]
});

// ---------- 7512 Marzul Coastal Cuisine (BLOCKED) ----------
entries.push({
  restaurantId: "7512",
  name: "Marzul Coastal Cuisine",
  outcome: "blocked",
  confidence: "medium",
  blocked: "Fine-dining restaurant inside Gaylord Pacific Resort. Marriott dining page (Overview and Menu tabs both fetched) shows description, hours and gallery but no prices or itemized dish list. No delivery-platform listing (fine dining, reservation-only via OpenTable, which also lists no priced menu). No priced source found anywhere.",
  dishes: []
});

// ---------- 4523 The Bistro Restaurant (BLOCKED) ----------
entries.push({
  restaurantId: "4523",
  name: "The Bistro Restaurant",
  outcome: "blocked",
  confidence: "medium",
  blocked: "Hotel restaurant inside Courtyard by Marriott Mission Valley/Hotel Circle. Marriott dining page fetched directly: description and hours only, no Menu tab, no prices or dish list published. No delivery-platform listing found. No priced source found anywhere.",
  dishes: []
});

// ---------- 3506 Donut Star (BLOCKED) ----------
entries.push({
  restaurantId: "3506",
  name: "Donut Star",
  outcome: "blocked",
  confidence: "medium",
  blocked: "No own website found. Uber Eats listing (ubereats.com/store/donut-star/...) tripped a bot-detection challenge wall (def.uber.com/en/challenge) on fetch - per hard constraint this is an immediate stop, no retry. No DoorDash or Grubhub listing found. Only source with dish info is the tier-5 aggregator menutoeat.com, which alone is not a filable source.",
  dishes: []
});

// ---- write ----
const outPath = 'C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-n1358-06.json';
fs.writeFileSync(outPath, JSON.stringify(entries, null, 2));
console.log('wrote', entries.length, 'entries to', outPath);
