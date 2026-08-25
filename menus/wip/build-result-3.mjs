import fs from 'fs';

const results = [];

// ---------------------------------------------------------------
// 1. K Sandwiches (1640)
// ---------------------------------------------------------------
{
  const dishes = [];
  const sec = (section, items) => items.forEach(([name, price, description]) => dishes.push({ name, description: description || '', price, section }));

  sec('Banh Mi', [
    ["#1 K's Special (K Dac Biet)", "$8.59", "Variety of Cold Cut Hams & Pate"],
    ["#2 Pate Saigon", "$8.59", "Variety of Cold Cut Hams & Pate"],
    ["#3 Pate Pork Meat Loaf (Pate Cha Lua)", "$8.25", "Pork Meat Loaf, Pork Belly & Pate"],
    ["#4 Pate Cold Cut Ham (Pate Thit Nguoi)", "$8.25", "Thinly Sliced Pork Meat Loaf & Pate"],
    ["#5 Shredded Pork Skin (Bi)", "$8.59", "Shredded Pork & Pork Skin, Fish Sauce & Scallions"],
    ["#6 Pork Meatball (Xiu Mai)", "$8.59", "House Made Pork Meatball in Tomato Sauce"],
    ["#7 Sardine (Ca Moi)", "$8.59", "Sardines with Tomato Sauce"],
    ["#8 Vegetarian (Bi Chay)", "$8.59", "Crispy Root Veg with Sweet Tangy Sauce - No Mayo"],
    ["#9 Grilled Pork (Thit Nuong)", "$8.59", "Marinated Grilled Pork"],
    ["#10 Grilled Beef (Bo Nuong)", "$8.99", "Marinated Grilled Beef"],
    ["#11 Grilled Chicken (Ga Nuong)", "$8.59", "Marinated Grilled Chicken"],
    ["#12 Pork Patty (Nem Nuong)", "$8.59", "Grilled Pork Patty"],
    ["Fried Egg Banh Mi", "$6.99", ""],
    ["Pate Only Banh Mi", "$6.99", "Pate, House Mayo, House Pickles, Cilantro and Jalapenos Only"],
    ["BBQ Tofu Banh Mi", "$9.19", "Char Siu (BBQ) Tofu - Non-Vegan"],
    ["Lemongrass Tofu Banh Mi", "$9.19", ""],
    ["Just Veggies Banh Mi", "$5.99", "House Mayo, House Pickles, Cilantro and Jalapenos Only"],
    ["Pork Combo Banh Mi", "$11.99", "Grilled Pork, Shredded Pork Skin and Grilled Pork Patty"],
  ]);

  sec('Sandwiches (Baguette)', [
    ["#13 K's Club Baguette", "$11.49", "Ham, Turkey, Roast Beef, Bacon & Cheese"],
    ["#14 Roast Beef & Cheese Baguette", "$10.59", ""],
    ["#15 Tuna & Cheese Baguette", "$10.59", ""],
    ["#16 Turkey & Cheese Baguette", "$9.99", ""],
    ["#17 Ham & Cheese Baguette", "$9.99", ""],
    ["#18 Ham, Turkey & Cheese Baguette", "$9.99", ""],
    ["#19 Roast Beef, Turkey & Cheese Baguette", "$9.99", ""],
    ["Honey Mayo Shrimp Baguette", "$12.99", ""],
    ["Spicy Mayo Shrimp Baguette", "$12.99", ""],
    ["Cheese Baguette", "$8.99", ""],
  ]);

  sec('Croissant', [
    ["#13 K Club Croissant", "$11.49", "Ham, Turkey, Roast Beef, Bacon & Cheese"],
    ["#14 Roast Beef & Cheese Croissant", "$10.59", ""],
    ["#15 Tuna & Cheese Croissant", "$10.59", ""],
    ["#16 Turkey & Cheese Croissant", "$9.99", ""],
    ["#17 Ham & Cheese Croissant", "$9.99", ""],
    ["#18 Ham, Turkey & Cheese Croissant", "$9.99", ""],
    ["#19 Roast Beef, Turkey & Cheese Croissant", "$9.99", ""],
    ["Honey Mayo Shrimp Croissant", "$12.99", ""],
    ["Spicy Mayo Shrimp Croissant", "$12.99", ""],
    ["Cheese Croissant", "$8.99", ""],
  ]);

  sec('Breakfast', [
    ["K's Breakfast Croissant", "$7.99", "Eggs, Ham, Bacon and Cheese"],
    ["Eggs & Ham Croissant", "$6.49", ""],
    ["Eggs & Bacon Croissant", "$6.49", ""],
    ["Chinese Sausage Breakfast Banh Mi", "$10.59", "Chinese Sausage, Pork Loaf, & Eggs"],
    ["Pate Op La", "$9.59", "Variety of Cold Cut Ham, Over Easy Eggs & Pate"],
    ["Eggs & Cheese Croissant", "$6.49", ""],
    ["Eggs & Turkey Croissant", "$6.49", ""],
  ]);

  sec('Coffee', [
    ["Large Milk Coffee", "$7.25", "Our Specialty Coffee with Condensed Milk"],
    ["Americano", "$4.50", "Double Shot of Espresso over Ice/Hot Water"],
    ["Mocha", "$6.25", "Coffee with Chocolate"],
    ["Latte", "$6.25", "Coffee and Whole Milk"],
    ["Vanilla Latte", "$6.25", ""],
    ["Caramel Latte", "$6.25", "Coffee with Caramel"],
    ["Caramel Freezie", "$7.25", "Blended Coffee and Caramel"],
    ["Coffee Freezie", "$7.25", "Blended Coffee and Condensed Milk"],
    ["Mocha Freezie", "$7.25", "Blended Coffee with Chocolate"],
    ["Vanilla Freezie", "$7.25", "Blended Coffee with Vanilla"],
    ["Hot Chocolate", "$4.50", "Cocoa and Steamed Whole Milk"],
    ["Java Chip Freezie", "$7.25", ""],
    ["Pistachio Latte", "$6.25", ""],
    ["Pandan Mung Bean Coffee", "$7.25", ""],
  ]);

  sec('Smoothie', [
    ["Almond Smoothie", "$6.75", ""],
    ["Avocado Smoothie", "$7.25", "Contains Dairy"],
    ["Banana Smoothie", "$6.75", ""],
    ["Coconut Smoothie", "$6.75", ""],
    ["Cookies & Cream Smoothie", "$6.75", "Contains Dairy"],
    ["Matcha Green Tea Smoothie", "$6.75", ""],
    ["Chocolate Chip Smoothie", "$6.75", "Contains Dairy"],
    ["Honeydew Smoothie", "$6.75", ""],
    ["Jackfruit Smoothie", "$6.75", ""],
    ["Kiwi Strawberry Smoothie", "$6.75", ""],
    ["Mint Chocolate Chip Smoothie", "$6.75", "Contains Dairy"],
    ["Orange Smoothie", "$6.75", ""],
    ["Pennyworth Mung Bean Smoothie", "$6.75", ""],
    ["Pina Colada Smoothie", "$6.75", ""],
    ["Strawberry Smoothie", "$6.75", ""],
    ["Strawberry Banana Smoothie", "$6.75", ""],
    ["Taro Smoothie", "$6.75", ""],
    ["Thai Tea Smoothie", "$6.75", ""],
    ["Durian Smoothie", "$8.00", ""],
  ]);

  sec('Slushies', [
    ["Green Apple Slushie", "$6.75", ""],
    ["Kiwi Slushie", "$6.75", ""],
    ["Lychee Slushie", "$6.75", ""],
    ["Mango Slushie", "$6.75", ""],
    ["Passion Fruit Slushie", "$6.75", ""],
    ["Peach Slushie", "$6.75", ""],
    ["Pineapple Slushie", "$6.75", ""],
    ["Rose Slushie", "$6.75", ""],
    ["Lemon Slushie", "$6.75", ""],
    ["Pineapple Tart Slushie", "$6.75", ""],
    ["Strawberry Slushie", "$6.75", ""],
  ]);

  sec('Springrolls', [
    ["Springroll: Shrimp and Pork", "$6.99", ""],
    ["Springroll: Shrimp Only", "$6.99", ""],
    ["Springroll: Grilled Chicken", "$6.99", ""],
    ["Springroll: Grilled Pork", "$6.99", ""],
    ["Springroll: Pork Patty (Nem Nuong)", "$6.99", ""],
    ["Springroll: Vegetarian", "$6.99", ""],
    ["Springroll: Pork Skin Bi", "$6.99", ""],
    ["Springroll: Tofu", "$6.99", ""],
    ["Springroll: Grilled Beef", "$6.99", ""],
  ]);

  sec('Fresh Juice', [
    ["Pennyworth Juice", "$6.50", ""],
    ["Brown Sugar Marble Milk", "$6.50", ""],
    ["Orange Juice", "$6.50", ""],
    ["Yakult Drink", "$5.95", ""],
    ["SugarCane Juice", "$6.99", ""],
    ["Watermelon Juice", "$6.50", ""],
    ["Iced Strawberry Milk", "$6.50", ""],
  ]);

  sec('Teas', [
    ["Milk Tea", "$5.95", "Sweet Black Tea with Half & Half"],
    ["Thai Tea", "$5.95", ""],
    ["Thai Green Tea", "$5.95", ""],
    ["Jasmine Green Milk Tea", "$5.95", ""],
    ["Jasmine Green Tea", "$5.95", ""],
    ["Chrysanthemum Tea", "$5.95", ""],
  ]);

  sec('Flavored Teas', [
    ["Matcha Milk Tea", "$6.50", ""],
    ["Taro Milk Tea", "$6.50", ""],
    ["Strawberry Milk Tea", "$6.50", ""],
    ["Honeydew Milk Tea", "$6.50", ""],
    ["Brown Sugar Milk Tea", "$6.50", ""],
    ["Almond Milk Tea", "$6.50", ""],
    ["Strawberry Green Tea", "$6.50", ""],
    ["Passion Fruit Green Tea", "$6.50", ""],
    ["Peach Green Tea", "$6.50", ""],
    ["Mango Milk Tea", "$6.50", ""],
    ["Mango Green Tea", "$6.50", ""],
    ["Lychee Green Tea", "$6.50", ""],
    ["Lemon Tea", "$6.50", ""],
    ["WinterMelon Milk Tea", "$6.50", ""],
  ]);

  sec('Noodle/Rice Combo', [
    ["Vermicelli Rice Noodle Combo", "$12.99", ""],
    ["Steam Rice Combo", "$12.99", ""],
    ["Chicken Curry", "$12.99", ""],
  ]);

  results.push({
    restaurantId: "1640",
    name: "K Sandwiches",
    sourceUrl: "https://ksandwichesinc.kwickmenu.com/",
    confidence: "high",
    dishes,
  });
}

// ---------------------------------------------------------------
// 2. Sushi Deli (1993)
// ---------------------------------------------------------------
{
  const dishes = [];
  const sec = (section, items) => items.forEach(([name, price, description]) => dishes.push({ name, description: description || '', price, section }));

  sec('Apps', [
    ["Spicy Garlic Edamame", "$8.66", "Edamame sauteed with a spicy garlic sauce"],
    ["Garlic Edamame", "$7.98", "Tender edamame pods tossed in a savory garlic sauce and garnished with minced garlic"],
    ["Regular Edamame", "$6.65", "Steamed young soybeans lightly salted"],
    ["Veggie Tempura", "$11.98", "2 Pieces Each of Broccoli, Zucchini, Sweet Potato, Carrot"],
    ["Crab Lagoon", "$9.66", "Deep Fried Wontons Stuffed with Crab Surimi, Cream Cheese and Green Onions - Served with Spicy Mayo"],
    ["Spicy Tuna Poppers", "$14.65", "Panko Crusted Fresh Jalapenos Stuffed with Spicy Tuna and Cream Cheese, Served with Spicy Mayo"],
    ["Fried Gyoza", "$7.98", "Pork and Vegetable Dumplings"],
    ["Fried Calamari", "$13.31", "Served with Spicy Mayo and Ranch"],
    ["Garlic Shishito Peppers", "$10.65", "Shishito Peppers Stir Fried in Garlic Sauce"],
    ["Steamed Gyoza", "$7.98", "Pork and Vegetable Dumplings"],
    ["California Egg Rolls", "$11.33", "Kanikama, Avocado, Cream Cheese - Served with Spicy Mayo"],
    ["Chicken Katsu App", "$11.98", "Panko Crusted Chicken Breast Topped with Katsu Sauce"],
    ["Shrimp Tempura", "$11.98", "5 Pieces Shrimp Tempura"],
    ["Monkey Brains", "$11.66", "Tempura Style Inari Pockets, Stuffed with Spicy Tuna and Crab Surimi. Topped with Spicy Mayo, Sweet Sauce and Dynamite Sauce"],
    ["Lemon Pepper Wings", "$13.99", "6 Wings"],
  ]);

  sec('Kitchen', [
    ["Deluxe Bento", "$26.64", "Teriyaki Chicken, Mixed Tempura, Fried Gyoza, Full California Roll. Served with Edamame, Rice, Miso and Green Salad"],
    ["Chicken Fried Rice", "$17.31", "Fried Rice with Egg, Onions, Zucchini, Carrots and Garlic Sesame Oil"],
    ["Chicken Katsu Platter", "$18.64", "Served with Rice, Miso and Green Salad"],
    ["Chicken Thigh Yakisoba", "$16.32", "Stir Fried Noodles with Vegetables and Chicken Thigh"],
    ["Ramen", "$18.64", "Choice of noodle: thick, thin, udon, kale. Protein: chashu pork, chicken various cuts, tofu. Broth: Tonkotsu, spicy miso, or creamy vegetarian"],
    ["Chicken Breast Yakisoba", "$17.66", "Stir Fried Noodles with Vegetables and Chicken Breast"],
    ["Teriyaki Chicken Breast Platter", "$18.64", "Served with Rice, Miso and Green Salad"],
    ["Sesame Chicken Platter", "$18.64", "Served with Rice, Miso and Green Salad"],
    ["Vegetable Yakisoba", "$13.66", "Stir Fried Noodles with Vegetables"],
    ["Katsu Curry", "$19.98", "Deep-fried breaded pork cutlet with Japanese curry and rice"],
    ["Vegetarian Bento", "$21.31", "Sesame Tofu Tempura, Vegetable Tempura, Full Avocado & Cucumber Roll. Served With Regular Edamame, Green Salad, Rice"],
    ["Carnitas Fried Rice", "$17.31", "Fried Rice with Egg, Onions, Zucchini, Carrots, Jalapeno and Garlic Sesame Oil"],
    ["Monthly Bento", "$17.99", "Includes Teriyaki Chicken, Vegetable Eggrolls, One Gyoza, Half California Roll, Lemon Pepper Edamame, Rice, and Green Salad"],
    ["Teriyaki Chicken Thigh Platter", "$15.32", "Served with Rice, Miso and Green Salad"],
  ]);

  sec('Sushi', [
    ["Sunkissed", "$21.99", "Inside: Spicy Tuna, Avocado, Cucumber, Fresh Jalapeno, Cilantro Top: Yellowtail, Lemon Slices, Black Pepper, Salt, Dynamite Sauce"],
    ["Lime Time", "$21.65", "Inside: Salmon, Yellowtail, Shrimp Tempura, Cucumber, Fresh Jalapeno, Lime Juice Top: Avocado, Lemon Slices, Onion, Cilantro, Wonton Chips, Firecracker Sauce, Spicy Mayo"],
    ["Hawaiian", "$16.99", "Wrapped in Soy Paper - Inside: Salmon, Seared Albacore, Avocado, Spicy Mayo, Dynamite Top: Spicy Tuna, Green Onion, Sweet Sauce, Mango Sauce"],
    ["Crunchy", "$9.99", "Inside: Shrimp Tempura, Crab Surimi, Avocado Top: Crunchies, Green Onion, Sweet Sauce"],
    ["Triple Threat", "$24.99", "Wrapped In Soy Paper Inside: Tuna, Salmon, Yellowtail Top: Avocado, Masago, Green Onion, Spicy Mayo, Sweet Sauce, Dynamite Sauce, Ponzu"],
    ["Spicy Tuna Roll", "$12.66", "Inside: Spicy Tuna Top: Sesame Seeds"],
    ["Rainbow", "$13.31", "Inside: Crab Surimi, Cucumber Top: Tuna, Salmon, Yellowtail, Avocado"],
    ["Island Breeze", "$16.99", "Inside: Salmon, Shrimp Tempura, Cucumber, Fresh Jalapeno, Cilantro Top: Crab Surimi, Avocado, Green Onion, Spicy Mayo, Dynamite Sauce, Mango Sauce, Sesame Seeds"],
    ["Dragon", "$17.99", "Inside: Shrimp Tempura, Crab Surimi, Cucumber Top: Eel, Avocado, Sesame Seeds, Sweet Sauce"],
    ["Fire Fire", "$15.66", "Inside: Spicy Salmon, Crab Surimi, Cucumber Top: Avocado, Fresh Jalapeno, Spicy Mayo, Dynamite"],
    ["Katie", "$15.98", "Inside: Shrimp Tempura, Avocado, Cream Cheese Top: Salmon"],
    ["Heatwave", "$16.32", "Inside: Shrimp Tempura, Avocado, Cream Cheese, Cilantro Top: Spicy Tuna, Fresh Jalapeno, Spicy Mayo, Firecracker Sauce, Cayenne Pepper"],
    ["Black Magic", "$20.32", "Inside: Spicy Tuna, Scallop, Cucumber Top: Eel, Avocado, Spicy Mayo, Sweet Sauce, Dynamite Sauce, Sesame Seeds"],
  ]);

  sec('Sushi Combos', [
    ["4x4 Sushi Combo", "$21.31", "4 Pcs Each of the following rolls: Katie, Keith Special, Mango Punch, Spicy Tuna"],
    ["Shogun Sushi Combo", "$25.31", "Full Rainbow Roll & 1 Piece each of the following Nigiri: Tuna, Salmon, Albacore, Shrimp, Eel"],
    ["Poke", "$19.98", "Build Your Own Poke"],
    ["Best Seller Sushi Combo", "$20.66", "4 Pcs Each of the following rolls: California, Crunchy, Rainbow, Dragon"],
    ["Monthly Sushi", "$19.98", "Includes 4 pieces of each of the following: Fire Fire, Heatwave, California, Crunchy Bunny"],
  ]);

  sec('Sashimi/Nigiri', [
    ["Salmon Carpaccio", "$17.31", "Sliced Salmon Sashimi Drizzled with Ponzu and Yuzu Sauce, Sesame Seeds"],
    ["Rainbow Carpaccio", "$19.98", "Thinly Sliced Albacore, Tuna, Salmon, Yellowtail with Spicy Ponzu, Carrots, Fresh Jalapeno Slices"],
    ["Salmon Nigiri", "$2.65", "1 Pcs"],
    ["Yellowtail Nigiri", "$3.00", "1 Pcs"],
    ["Tuna Nigiri", "$3.00", "1 Pcs"],
    ["Eel Nigiri", "$3.33", "1 Pcs"],
    ["Albacore Nigiri", "$2.65", "1 Pcs"],
    ["Spicy Scallop Nigiri", "$2.65", "1 Pcs"],
    ["Inari Nigiri", "$2.65", "Fried tofu skin typically stuffed with sushi rice"],
    ["Smelt Roe Nigiri", "$3.00", "1 Pcs"],
    ["Shrimp Nigiri", "$2.65", "1 Pcs"],
    ["12 Piece Sashimi", "$29.30", "A variety of 12 pieces of sashimi, including Salmon, Yellowtail, Tuna, Albacore, and Octopus"],
  ]);

  sec('Baked/Fried Sushi', [
    ["Hot Hot Pearl (Baked)", "$16.66", "Inside: Salmon, Avocado, Cream Cheese Top: Scallops, Green Onion, Spicy Mayo"],
    ["San Diego Fried", "$15.66", "Inside: Crab Surimi, Cream Cheese Top: Spicy Tuna, Crab Surimi, Crunchies, Spicy Mayo, Dynamite, Sweet Sauce (Spicy Tuna is Raw)"],
    ["Hot Hot Shauna (Baked)", "$12.66", "Inside: Sweet Potato Tempura, Avocado, Cream Cheese Top: Sesame Seeds, Spicy Mayo"],
    ["Hot Hot Crunchy (Baked)", "$11.33", "Inside: Shrimp Tempura, Crab Surimi, Avocado Top: Crunchies, Green Onion, Spicy Mayo"],
    ["Hot Hot California (Baked)", "$7.98", "Inside: Crab Surimi, Avocado, Cucumber Top: Sesame Seeds, Spicy Mayo"],
  ]);

  sec('Veggie Sushi', [
    ["Mango Punch", "$11.98", "Inside: Sweet Potato Tempura, Avocado, Seaweed Salad, Cucumber, Mango Top: Inari, Mango Sauce, 7 Spices"],
    ["Shauna", "$11.33", "Inside: Sweet Potato Tempura, Avocado, Cream Cheese Top: Sesame Seeds"],
    ["Crunchy Bunny", "$11.33", "Inside: Avocado, Asparagus, Carrot, Fresh Jalapeno Top: Inari, Cilantro, Fried Onion, Spicy Miso Sauce, Yuzu Sauce"],
    ["Bee-Hive", "$11.33", "Inside: Shishito Pepper, Avocado, Cucumber, Asparagus, Gobo Carrot Top: Fresh Jalapeno, Lemon Slices, Yuzu Sauce"],
    ["Avocado & Cucumber", "$7.98", "Inside: Avocado, Cucumber Top: Sesame Seeds"],
  ]);

  sec('Sides', [
    ["Miso Soup", "$3.98", "Traditional Japanese soup made from miso paste with tofu, seaweed, and scallions"],
    ["Rice", "$3.98", "Flavorful rice dish prepared to perfection"],
    ["Tofu", "$5.32", "Side of Diced Tofu"],
    ["French Fries", "$7.98", "Piping hot and perfectly salted"],
  ]);

  sec('Dessert', [
    ["Apple Bliss", "$7.98", "Caramelized apples with a hint of cinnamon"],
    ["Banana Bliss", "$7.98", ""],
  ]);

  sec('Gluten Free Sushi', [
    ["GF Black & Yellow", "$21.31", "Inside: Yellowtail, Avocado, Cucumber, Fresh Jalapeno Top: Cilantro, Lemon Slices"],
    ["GF Shipwreck", "$21.31", "Inside: Salmon, Cucumber, Fresh Jalapeno Top: Tuna, Avocado, Green Onion, Sesame Seeds"],
    ["GF Mango Punch", "$11.98", "Inside: Mango, Avocado, Cucumber Top: Mango Sauce, 7 Spices"],
    ["GF Rainbow", "$13.31", "Inside: Cucumber Top: Tuna, Salmon, Yellowtail, Avocado"],
    ["GF Mellow Yellow", "$17.99", "Inside: Ebi Shrimp, Fresh Habanero, Onion, Cucumber, Cilantro Top: Salmon, Avocado, Lemon Slices, 7 Spices"],
    ["GF Hadouken", "$16.32", "Inside: Yellowtail Top: Lemon Slices, Green Onion"],
    ["GF Mango Tango", "$13.66", "Inside: Salmon, Mango, Cream Cheese, Fresh Jalapeno Top: Avocado, 7 Spices"],
    ["GF Philadelphia", "$11.98", "Inside: Salmon, Cream Cheese, Cucumber Top: Sesame Seeds"],
    ["GF Crunchy Bunny", "$11.33", "Inside: Avocado, Asparagus, Carrot, Fresh Jalapenos Top: Cilantro, Yuzu"],
    ["GF Fire Fire", "$15.32", "Inside: Salmon, Cucumber Top: Avocado, Fresh Jalapeno"],
    ["GF Bee-Hive", "$11.33", "Inside: Avocado, Cucumber, Asparagus Top: Fresh Jalapeno, Lemon Slices, Yuzu Sauce"],
    ["GF Avocado & Cucumber", "$7.98", "Inside: Avocado, Cucumber Top: Sesame Seeds"],
  ]);

  results.push({
    restaurantId: "1993",
    name: "Sushi Deli",
    sourceUrl: "https://www.doordash.com/store/sushi-deli-1-san-diego-27555/",
    confidence: "medium",
    dishes,
  });
}

// ---------------------------------------------------------------
// 3. Filippi's Pizza Grotto Imperial Beach (4298)
// ---------------------------------------------------------------
{
  const dishes = [];
  const sec = (section, items) => items.forEach(([name, price, description]) => dishes.push({ name, description: description || '', price, section }));

  sec('Pizza - Filippi\'s Specials', [
    ["Fit For A King", "$28.85 (Medium 12\") / $34.05 (Large 16\")", "Cheese, Sausage, Mushroom, Pepperoni, Black Olive, Bell Pepper & Onion"],
    ["Fit For A Queen", "$28.85 (Medium) / $34.05 (Large)", "Cheese, Alfredo Sauce, Meatball & Pepperoncini"],
    ["Hawaiian Style", "$25.75 (Medium) / $30.95 (Large)", "Cheese, Ham & Pineapple"],
    ["The Works", "$27.55 (Medium) / $32.75 (Large)", "Cheese, Sausage, Mushroom & Pepperoni"],
    ["Vegetarian Pizza", "$27.55 (Medium) / $32.75 (Large)", "Cheese, Mushroom, Black Olive, Bell Pepper & Onion"],
    ["Lillian's All White", "$27.55 (Medium) / $32.75 (Large)", "Garlic Mozzarella, Provolone & Oil"],
    ["Margherita", "$25.75 (Medium) / $30.95 (Large)", "Cheese, Tomato & Basil"],
    ["Meat Lovers", "$28.85 (Medium) / $34.05 (Large)", "Cheese, Sausage, Pepperoni, Ham & Meatball"],
  ]);

  sec('Build Your Own Pizza', [
    ["Cheese Pizza", "$22.25 (Medium) / $27.45 (Large)", "Choice of toppings: Pepperoni, Jalapeno, Mushroom, Sausage, Basil, Pineapple, Black Olive, Capicola, Meatball, Bell Pepper, Ham, Canadian Bacon, Onion, Tomato"],
    ["1 Topping Pizza", "$24.35 (Medium) / $29.55 (Large)", ""],
    ["2 Topping Pizza", "$25.75 (Medium) / $30.95 (Large)", ""],
    ["3 Topping Pizza", "$27.55 (Medium) / $32.75 (Large)", ""],
    ["Additional Topping", "$2.10 (Medium) / $2.60 (Large)", ""],
    ["Additional Premium Topping", "$2.60 (Medium) / $3.65 (Large)", "Salami, Anchovy, Garlic, Pepperoncini, Green Olive"],
    ["Extra Cheese", "$3.90 (Medium) / $4.95 (Large)", ""],
    ["Thick Crust", "$3.70 (Medium) / $4.00 (Large)", ""],
    ["Extra Sauce (pizza)", "$1.65 (Medium) / $1.90 (Large)", ""],
    ["Gluten Free Crust", "$4.95", "Medium only; not a gluten free restaurant, cannot guarantee no cross contamination"],
  ]);

  sec('Pasta', [
    ["Spaghetti", "$13.70", "Meat or Marinara Sauce"],
    ["Ravioli Beef or Cheese", "$15.70", "Meat or Marinara Sauce"],
    ["Lasagna", "$16.60", "Meat or Marinara Sauce"],
    ["Rigatoni, Shells, or Mostaccioli", "$16.60", "Includes small house salad & bread"],
  ]);

  sec('Dinners', [
    ["Filippi's Family Combo", "$19.65 (A La Carte) / $24.85 (Dinner)", "Spaghetti, Lasagna & Ravioli"],
    ["Eggplant Parmigiana with Spaghetti", "$19.65 (A La Carte) / $24.85 (Dinner)", ""],
    ["Fettuccine Alfredo Cream Sauce", "$22.10 (A La Carte) / $27.30 (Dinner)", ""],
    ["Linguine with Clams", "$22.10 (A La Carte) / $27.30 (Dinner)", "White or Red sauce"],
    ["Chicken Parmigiana with Spaghetti", "$21.05 (A La Carte) / $26.25 (Dinner)", ""],
    ["Manicotti", "$21.05 (A La Carte) / $26.25 (Dinner)", "Stuffed with 3 types of cheese, Meat or Marinara Sauce"],
    ["Veal Parmigiana", "$23.65 (A La Carte) / $28.85 (Dinner)", "Baked with Mushroom & Cheese"],
    ["Veal Scaloppini", "$23.65 (A La Carte) / $28.85 (Dinner)", "Sauteed with Mushroom, Onion & Wine"],
    ["Spaghetti & Meatball", "$20.55", ""],
    ["Ravioli & Meatball", "$21.60", ""],
    ["Lasagna & Meatball", "$22.60", ""],
  ]);

  sec('Sandwiches', [
    ["Super Torpedo", "$15.35", "Ham, Capicola, Cotto, Hard Salami & Provolone Cheese"],
    ["Torpedo", "$13.00", "Cotto, Hard Salami & Provolone Cheese"],
    ["Italian Sausage or Meatball Sandwich", "$13.00", ""],
    ["Italian Sausage or Meatball Sandwich with Mozzarella", "$15.10", ""],
    ["Italian Sausage or Meatball Sandwich with Bell Pepper", "$14.05", ""],
    ["Italian Sausage or Meatball Sandwich with Mozzarella and Bell Pepper", "$15.60", ""],
    ["Ham Sandwich", "$12.50", ""],
    ["Capicola Sandwich", "$13.70", "Italian Ham with Black Peppered Rim"],
    ["Provolone Cheese Sandwich", "$12.20", ""],
    ["Eggplant Parmigiana Sandwich", "$14.80", "Meat or Marinara Sauce; allow 10 minutes"],
    ["Chicken Parmigiana Sandwich", "$16.60", "Allow 10 minutes"],
    ["Veal Parmigiana Sandwich", "$17.65", "Allow 10 minutes"],
  ]);

  sec('Salads', [
    ["Antipasto Salad (Small)", "$14.30", "Serves 1-2"],
    ["Antipasto Salad (Large)", "$20.30", "Serves 2-4"],
    ["Antipasto Salad (Special)", "$36.15", "Serves 6 plus"],
    ["House Salad (Small)", "$9.10", "Serves 1-2"],
    ["House Salad (Large)", "$15.35", "Serves 2-4; add chicken small $7.25"],
    ["Caesar Salad (Small)", "$11.95", "Serves 1-2"],
    ["Caesar Salad (Large)", "$18.20", "Serves 2-4; add chicken large $9.30"],
  ]);

  sec('Half & Half / Half Orders', [
    ["Spaghetti & Ravioli", "$15.60", ""],
    ["Spaghetti & Lasagna", "$16.10", ""],
    ["Ravioli & Lasagna", "$16.60", ""],
    ["Half Order Spaghetti", "$10.15", ""],
    ["Half Order Ravioli", "$11.20", "Beef or Cheese"],
    ["Half Order Lasagna", "$12.20", ""],
  ]);

  sec('Children\'s Order', [
    ["Spaghetti or Ravioli (Kids)", "$10.15", "10 & under, dine in only, includes bread & fountain drink; beef or cheese"],
    ["Kids Fruit Juice", "$3.10", ""],
  ]);

  sec('Side Orders', [
    ["Small Dressing", "$2.25", ""],
    ["Large Dressing", "$3.90", ""],
    ["Extra Sauce (side)", "$2.10", ""],
    ["Side Sauce", "$4.40", ""],
    ["Pepperoncini", "$3.65", ""],
    ["1/2 Pepperoncini", "$2.05", ""],
    ["Garlic Cheese Bread", "$11.25", "With marinara"],
    ["Garlic Bread", "$5.70", ""],
    ["Homemade Minestrone Soup", "$5.70", ""],
    ["Side of Bread", "$4.10", ""],
    ["Meatball or Sausage with Mozzarella", "$11.20", ""],
    ["Chicken Wings", "$13.50", ""],
    ["Sicilian Olives", "$5.70", ""],
    ["Sauteed Mushrooms", "$10.65", ""],
  ]);

  sec('Beverages', [
    ["Pitcher of Soda", "$12.20", "No refills"],
    ["Fountain Soft Drinks", "$4.15", "3 refills maximum"],
    ["20 oz. Bottled Sodas", "$4.10", ""],
    ["Iced Tea", "$4.15", ""],
    ["Coffee", "$4.15", ""],
    ["Fruit Juice", "$4.95", "Apple, Orange, or Cranberry"],
    ["Filippi's Bottled Water", "$3.40", ""],
  ]);

  sec('Desserts', [
    ["Cannoli (1)", "$7.00", ""],
    ["Cannolis (2)", "$13.00", ""],
    ["Cheesecake", "$8.30", ""],
    ["Tiramisu", "$8.30", ""],
    ["Chocolate Cake", "$8.30", ""],
    ["Spumoni Bomba", "$8.85", ""],
  ]);

  sec('Wine & Beer', [
    ["House Wine (Rose, Chablis, or Chianti)", "$9.90 (Glass) / $17.15 (1/2 Carafe) / $22.35 (Carafe)", ""],
    ["Lambrusco", "$23.90 (Bottle)", ""],
    ["Merlot", "$10.60 (Glass) / $25.20 (Bottle)", ""],
    ["Domestic Chianti", "$19.75 (Bottle)", ""],
    ["Imported Chianti", "$28.00 (Bottle)", ""],
    ["Sangria", "$10.65 (Glass) / $25.20 (Bottle)", ""],
    ["White Zinfandel", "$10.15 (Glass) / $21.85 (Bottle)", ""],
    ["Chardonnay", "$10.65 (Glass) / $25.20 (Bottle)", ""],
    ["Pinot Grigio", "$10.95 (Glass) / $28.00 (Bottle)", ""],
    ["Domestic Beer", "$7.00 (Bottle) / $7.30 (Pint) / $16.65 (Sm Pitcher) / $23.65 (Lg Pitcher)", ""],
    ["Non-Alcoholic Beer", "$6.75 (Bottle)", ""],
    ["Import Beer", "$8.05 (Bottle) / $8.30 (Pint) / $18.90 (Sm Pitcher) / $25.95 (Lg Pitcher)", ""],
    ["Craft Beer", "$8.60 (Bottle) / $8.85 (Pint) / $21.05 (Sm Pitcher) / $27.55 (Lg Pitcher)", ""],
  ]);

  results.push({
    restaurantId: "4298",
    name: "Filippi's Pizza Grotto Imperial Beach",
    sourceUrl: "https://www.realcheesepizza.com/imperial-beach",
    confidence: "high",
    dishes,
  });
}

// ---------------------------------------------------------------
// 4. Filippi's Pizza Grotto Santee (4297)
// ---------------------------------------------------------------
{
  const dishes = [];
  const sec = (section, items) => items.forEach(([name, price, description]) => dishes.push({ name, description: description || '', price, section }));

  sec('Pizza - Filippi\'s Specials', [
    ["Fit For A King", "$28.85 (Medium 12\") / $34.05 (Large 16\")", "Cheese, Sausage, Mushroom, Pepperoni, Black Olive, Bell Pepper & Onion"],
    ["Fit For A Queen", "$28.85 (Medium) / $34.05 (Large)", "Cheese, Alfredo Sauce, Meatball & Pepperoncini"],
    ["Hawaiian Style", "$25.75 (Medium) / $30.95 (Large)", "Cheese, Ham & Pineapple"],
    ["The Works", "$27.55 (Medium) / $32.75 (Large)", "Cheese, Sausage, Mushroom & Pepperoni"],
    ["Vegetarian Pizza", "$27.55 (Medium) / $32.75 (Large)", "Cheese, Mushroom, Black Olive, Bell Pepper & Onion"],
    ["Lillian's All White", "$27.55 (Medium) / $32.75 (Large)", "Garlic Mozzarella, Provolone & Oil"],
    ["Margherita", "$25.75 (Medium) / $30.95 (Large)", "Cheese, Tomato & Basil"],
    ["Meat Lovers", "$28.85 (Medium) / $34.05 (Large)", "Cheese, Sausage, Pepperoni, Ham & Meatball"],
  ]);

  sec('Build Your Own Pizza', [
    ["Cheese Pizza", "$22.25 (Medium) / $27.45 (Large)", "Choice of toppings: Pepperoni, Jalapeno, Mushroom, Sausage, Basil, Pineapple, Black Olive, Capicola, Meatball, Bell Pepper, Ham, Canadian Bacon, Onion, Tomato"],
    ["1 Topping Pizza", "$24.35 (Medium) / $29.55 (Large)", ""],
    ["2 Topping Pizza", "$25.75 (Medium) / $30.95 (Large)", ""],
    ["3 Topping Pizza", "$27.55 (Medium) / $32.75 (Large)", ""],
    ["Additional Topping", "$2.10 (Medium) / $2.60 (Large)", ""],
    ["Additional Premium Topping", "$2.60 (Medium) / $3.65 (Large)", "Salami, Anchovy, Garlic, Pepperoncini, Green Olive"],
    ["Extra Cheese", "$3.90 (Medium) / $4.95 (Large)", ""],
    ["Thick Crust", "$3.70 (Medium) / $4.00 (Large)", ""],
    ["Gluten Free Crust", "$4.95", "Medium only"],
  ]);

  sec('Pasta', [
    ["Spaghetti", "$13.70", "Meat or Marinara Sauce"],
    ["Ravioli Beef or Cheese", "$15.70", "Meat or Marinara Sauce"],
    ["Lasagna", "$16.60", "Meat or Marinara Sauce"],
    ["Rigatoni, Shells, or Mostaccioli", "$16.60", "Includes small house salad & bread"],
  ]);

  sec('Dinners', [
    ["Filippi's Family Combo", "$19.65 (A La Carte) / $24.85 (Dinner)", "Spaghetti, Lasagna & Ravioli"],
    ["Eggplant Parmigiana with Spaghetti", "$19.65 (A La Carte) / $24.85 (Dinner)", ""],
    ["Chicken Parmigiana with Spaghetti", "$21.05 (A La Carte) / $26.25 (Dinner)", ""],
    ["Veal Parmigiana", "$23.65 (A La Carte) / $28.85 (Dinner)", "Baked with Mushroom & Cheese"],
    ["Veal Scaloppini", "$23.65 (A La Carte) / $28.85 (Dinner)", "Sauteed with Mushroom, Onion & Wine"],
    ["Shrimp Filippi", "$23.65 (A La Carte) / $28.85 (Dinner)", "Tiger shrimp and mushrooms sauteed in olive oil, wine, butter and spices over linguine"],
    ["Fettuccine Alfredo Cream Sauce", "$22.10 (A La Carte) / $27.30 (Dinner)", ""],
    ["Linguine with Clams", "$22.10 (A La Carte) / $27.30 (Dinner)", "White or Red sauce"],
    ["Manicotti", "$21.05 (A La Carte) / $26.25 (Dinner)", "Meat or Marinara Sauce, stuffed with three types of cheese"],
    ["Spaghetti & Meatball", "$20.55", ""],
    ["Ravioli & Meatball", "$21.60", ""],
    ["Lasagna & Meatball", "$22.60", ""],
  ]);

  sec('Sandwiches', [
    ["Super Torpedo", "$15.35", "Ham, Capicola, Cotto, Hard Salami & Provolone Cheese"],
    ["Torpedo", "$13.00", "Cotto, Hard Salami & Provolone Cheese"],
    ["Italian Sausage or Meatball Sandwich", "$13.00", ""],
    ["Italian Sausage or Meatball Sandwich with Mozzarella", "$15.10", ""],
    ["Italian Sausage or Meatball Sandwich with Bell Pepper", "$14.05", ""],
    ["Italian Sausage or Meatball Sandwich with Mozzarella and Bell Pepper", "$15.60", ""],
    ["Ham Sandwich", "$12.50", ""],
    ["Capicola Sandwich", "$13.70", "Italian Ham with Black Peppered Rim"],
    ["Provolone Cheese Sandwich", "$12.20", ""],
    ["Turkey Sandwich", "$14.05", "Lettuce, Tomato & Mayonnaise"],
    ["Eggplant Parmigiana Sandwich", "$14.80", "Meat or Marinara Sauce; allow 10 minutes"],
    ["Chicken Parmigiana Sandwich", "$16.60", "Allow 10 minutes"],
    ["Veal Parmigiana Sandwich", "$17.65", "Allow 10 minutes"],
  ]);

  sec('Appetizers', [
    ["Fried Zucchini", "$10.40", ""],
    ["Calamari Rings", "$13.50", ""],
    ["Fried Mozzarella", "$11.95", ""],
    ["Fried Cheese Ravioli's", "$11.95", "With marinara"],
    ["Chicken Strips", "$12.50", ""],
    ["Chicken Wings", "$13.50", ""],
    ["French Fries", "$7.00", ""],
    ["Garlic Cheese Bread", "$11.20", "With marinara"],
  ]);

  sec('Salads', [
    ["Antipasto Salad (Small)", "$14.30", "Serves 1-2"],
    ["Antipasto Salad (Large)", "$20.30", "Serves 2-4"],
    ["Antipasto Salad (Special)", "$36.15", "Serves 6 plus"],
    ["House Salad (Small)", "$9.10", "Serves 1-2"],
    ["House Salad (Large)", "$15.35", "Serves 2-4; add chicken small $7.25"],
    ["Caesar Salad (Small)", "$11.95", "Serves 1-2"],
    ["Caesar Salad (Large)", "$18.20", "Serves 2-4; add chicken large $9.30"],
  ]);

  sec('Half & Half / Half Orders', [
    ["Spaghetti & Ravioli", "$15.60", ""],
    ["Spaghetti & Lasagna", "$16.10", ""],
    ["Ravioli & Lasagna", "$16.60", ""],
    ["Half Order Spaghetti", "$10.15", ""],
    ["Half Order Ravioli", "$11.20", "Beef or Cheese"],
    ["Half Order Lasagna", "$12.20", ""],
  ]);

  sec('Children\'s Order', [
    ["Spaghetti or Ravioli (Kids)", "$10.15", "10 & under, dine in only, includes bread & fountain drink; beef or cheese"],
    ["Kids Fruit Juice", "$3.10", ""],
  ]);

  sec('Side Orders', [
    ["Small Dressing", "$2.25", ""],
    ["Large Dressing", "$3.90", ""],
    ["Side of Sauce", "$4.40", ""],
    ["Pepperoncini", "$3.65", ""],
    ["1/2 Pepperoncini", "$2.05", ""],
    ["Garlic Bread", "$5.70", ""],
    ["Homemade Minestrone Soup", "$5.70", ""],
    ["Meatball or Sausage with Mozzarella", "$11.20", ""],
    ["Sicilian Olives", "$5.70", ""],
    ["Side Alfredo Sauce", "$7.80", ""],
    ["Side of Bread", "$4.10", ""],
  ]);

  sec('Beverages', [
    ["Pitcher of Soda", "$12.20", "No refills"],
    ["Fountain Soft Drinks", "$4.15", "3 refills maximum"],
    ["20 oz. Bottled Sodas", "$4.10", ""],
    ["Iced Tea", "$4.15", ""],
    ["Coffee", "$4.15", ""],
    ["Fruit Juice", "$4.95", "Apple, Orange, or Cranberry"],
    ["Filippi's Bottled Water", "$3.40", ""],
  ]);

  sec('Desserts', [
    ["Cannoli (1)", "$7.00", ""],
    ["Cannolis (2)", "$13.00", ""],
    ["Cheesecake", "$8.30", ""],
    ["Tiramisu", "$8.30", ""],
    ["Chocolate Cake", "$8.30", ""],
    ["Spumoni Bomba", "$8.85", ""],
  ]);

  sec('Wine & Beer', [
    ["House Wine (Rose, Chablis, or Chianti)", "$9.90 (Glass) / $17.15 (1/2 Carafe) / $22.35 (Carafe)", ""],
    ["Lambrusco", "$23.90 (Bottle)", ""],
    ["Merlot", "$10.65 (Glass) / $25.20 (Bottle)", ""],
    ["Domestic Chianti", "$19.75 (Bottle)", ""],
    ["Imported Chianti", "$28.00 (Bottle)", ""],
    ["Sangria", "$10.65 (Glass) / $25.20 (Bottle)", ""],
    ["White Zinfandel", "$10.15 (Glass) / $21.85 (Bottle)", ""],
    ["Chardonnay", "$10.65 (Glass) / $25.20 (Bottle)", ""],
    ["Pinot Grigio", "$10.95 (Glass) / $28.00 (Bottle)", ""],
    ["Domestic Beer", "$7.00 (Bottle) / $7.30 (Pint) / $16.65 (Sm Pitcher) / $23.65 (Lg Pitcher)", ""],
    ["Non-Alcoholic Beer", "$6.75 (Bottle)", ""],
    ["Import Beer", "$8.05 (Bottle) / $8.30 (Pint) / $18.90 (Sm Pitcher) / $25.95 (Lg Pitcher)", ""],
    ["Craft Beer", "$8.60 (Bottle) / $8.85 (Pint) / $21.05 (Sm Pitcher) / $27.55 (Lg Pitcher)", ""],
  ]);

  results.push({
    restaurantId: "4297",
    name: "Filippi's Pizza Grotto Santee",
    sourceUrl: "https://www.realcheesepizza.com/santee",
    confidence: "high",
    dishes,
  });
}

// ---------------------------------------------------------------
// 5. The Blind Burro (3373)
// ---------------------------------------------------------------
{
  const dishes = [];
  const sec = (section, items) => items.forEach(([name, price, description]) => dishes.push({ name, description: description || '', price, section }));

  sec('Botanas', [
    ["To-Go Chips/Salsa", "$5.00", "House fried corn tortilla chips dusted with salt, served with house salsa"],
    ["Traditional Guac", "$13.00", "Mashed avocado, tomato, onion, lime juice, garlic, cilantro (vegan)"],
    ["Chorizo Fundido", "$14.00", ""],
    ["Baja Ceviche", "$18.00", "Chopped Mexican white shrimp and bay scallops with tomato, onion, avocado, cilantro, lime juice, olive oil, served with chips"],
    ["Asada Wings", "$16.00", "8 jumbo chicken wings marinated 24 hours, baked then fried, served with buffalo salsa verde and Serrano ranch"],
    ["Calamari", "$16.00", "Squid dredged in egg wash and flour blend, deep fried, served with macha aioli and avocado salsa verde"],
    ["Bacon Wrapped Jalapenos", "$12.00", ""],
    ["Cheese Crisp", "$14.00", "Flour tortilla baked to a crisp with melted Oaxaca cheese, roasted poblanos, diced tomatoes, guac, cilantro, cotija cheese"],
    ["Nachos", "$16.00", "Flour and corn tortilla chips with Manchego cheese, chile cheese sauce, pico de gallo, radish, candied jalapenos, guac, cotija"],
    ["Tinga Tostadas", "$13.00", ""],
    ["TJ Dog", "$9.00", "Bacon wrapped all-beef hot dog, griddled onions & peppers, ketchup, mustard, mayo, candied jalapenos, served with fries"],
    ["Flautas", "$12.00", ""],
    ["Quesadilla", "$13.00", "Large flour tortilla stuffed with Oaxaca cheese; pico, guacamole, sour cream on the side; choice of protein"],
    ["Salsa Flight", "$9.00", ""],
  ]);

  sec('Tacos', [
    ["Asada Tacos", "$22.00", "2 corn tortillas, grilled marinated short rib, charred scallion, white onion, cilantro, taco shop guac"],
    ["Baja Shrimp Tacos", "$22.00", ""],
    ["Batter Fish Tacos", "$22.00", "Grilled or beer battered fish of the day, lime crema, cabbage, carrot escabeche"],
    ["Carne Molida Tacos", "$21.00", ""],
    ["Cilantro Shrimp Tacos", "$24.00", "Grilled marinated shrimp, avocado-corn relish, fried jalapenos, bacon crumbles, queso fresco, chipotle aioli"],
    ["Grill Fish Tacos", "$22.00", "Grilled fish of the day, lime crema, cabbage, carrot escabeche"],
    ["Lobster Tacos", "$25.00", "Maine lobster pieces cooked in garlic butter and pico de gallo, cabbage, avocado"],
    ["Macha Tacos", "$23.00", "Salsa macha, grilled short rib, guacamole tradicional, pico de gallo"],
    ["Pastor Tacos", "$22.00", "Pork shoulder and bacon marinated in red chile adobo, pineapple, roasted pineapple salsa, salsa verde"],
    ["Salmon Tacos", "$23.00", "Salmon rubbed with coffee, cumin, ancho chile, tomatillo-avocado kale slaw, lime crema"],
    ["Steak Tacos", "$27.00", "Salsa macha, grilled skirt steak, guacamole tradicional, pico de gallo"],
    ["Street Asada Tacos", "$20.00", ""],
    ["Street Carnitas Tacos", "$19.00", ""],
    ["Surf & Turf Tacos", "$25.00", "Maine lobster and grilled Angus short rib in garlic butter and macha salsa, cabbage, avocado, ancho-ajo crema"],
    ["Tacos De Pollo", "$21.00", "Grilled chicken, guacamole tradicional, pico de gallo"],
    ["Veggie Tacos", "$20.00", "Lemon-Serrano crema, spiced crispy cauliflower, kale-cabbage slaw, chipotle-orange BBQ sauce"],
    ["Baja Carnitas Tacos", "$23.00", ""],
  ]);

  sec('Machetes', [
    ["Machete California", "$24.00", "Grilled short rib carne asada, onion, cilantro, charred scallion, guac, french fries, Oaxaca and Manchego cheese"],
    ["Machete Pollo", "$24.00", "Grilled chicken, grilled corn, roasted poblano, smoked tomato pico, chipotle crema, Oaxaca and Manchego cheese"],
    ["Machete Birria", "$24.00", ""],
  ]);

  sec('Bowl, Sopas y Ensaladas', [
    ["Burro Bowl", "$15.00", "Poblano rice, pinto beans, shredded iceberg lettuce, queso fresco, pickled radishes, avocado, salsa verde"],
    ["Caesar Salad", "$16.00", ""],
    ["Cup Pozole", "$10.00", ""],
    ["Panzanella Salad", "$16.00", "Mixed greens, tomatoes, cucumber, queso fresco, pickled red onion, avocado, serrano-lime vinaigrette, chile herb tortilla crisps"],
    ["Power Bowl", "$15.00", "Spinach, kale slaw, quinoa, calabecitas, bell peppers, onion, corn tossed with salsa verde, goat cheese"],
    ["Pozole", "$15.00", "Chicken broth and roasted tomatillo soup with lime, onions, hominy, celery, spices, 4 oz grilled chicken"],
    ["Small Panzanella", "$11.00", ""],
  ]);

  sec('Tortas', [
    ["Torta Short Rib", "$20.00", ""],
    ["Torta Al Pastor", "$19.00", ""],
    ["Bandalero Burger", "$19.00", ""],
    ["Torta Chicken Tinga", "$19.00", ""],
  ]);

  sec('Especiales', [
    ["Bean & Cheese Burrito", "$11.00", ""],
    ["Birria Burro-ito", "$24.00", "Slow braised beef, rice, pinto beans, salsa verde, cilantro, onions, served wet with barbacoa sauce"],
    ["Chimichanga", "$23.00", ""],
    ["Skirt Steak Plate", "$31.00", "8 oz macha marinated skirt steak, street corn on the cob, jalapeno mash, charred scallion"],
    ["Tinga Enchiladas", "$24.00", "3 corn tortillas with melted oaxaca, chicken tinga, roasted beat adobo sauce, queso fresco, crema, pickled onions"],
    ["Skillet Burrito", "$26.00", ""],
  ]);

  sec('Single Tacos', [
    ["Single Taco Asada", "$11.00", ""],
    ["Single Taco Baja Shrimp", "$11.50", ""],
    ["Single Taco Battered", "$11.00", ""],
    ["Single Taco Carne Molida", "$10.50", ""],
    ["Single Taco Carnitas", "$10.50", ""],
    ["Single Taco Grill Fish", "$11.00", ""],
    ["Single Taco Lobster", "$13.00", ""],
    ["Single Taco Macha", "$11.00", ""],
    ["Single Taco Pastor", "$11.00", ""],
    ["Single Taco Pollo", "$10.00", ""],
    ["Single Taco Salmon", "$11.00", ""],
    ["Single Taco Shrimp Grilled", "$12.50", ""],
    ["Single Taco Steak", "$14.00", ""],
    ["Single Taco Surf & Turf", "$13.00", ""],
    ["Single Taco Veggie", "$10.00", ""],
  ]);

  sec('Kids Menu', [
    ["Kids Quesadilla", "$10.00", ""],
    ["Kids Dog", "$10.00", ""],
    ["Kids Asada Taco", "$10.00", ""],
    ["Kids Chicken Taco", "$10.00", ""],
  ]);

  sec('Dessert', [
    ["Churros", "$10.00", ""],
  ]);

  results.push({
    restaurantId: "3373",
    name: "The Blind Burro",
    sourceUrl: "https://order.toasttab.com/online/blind-burro",
    confidence: "high",
    dishes,
  });
}

// ---------------------------------------------------------------
// 6. Smashburger (3520) - chain, San Diego location pricing
// ---------------------------------------------------------------
{
  const dishes = [];
  const sec = (section, items) => items.forEach(([name, price, description]) => dishes.push({ name, description: description || '', price, section }));

  sec('Smashburgers', [
    ["Double Smoked Brisket Bacon Smash", "$15.39", ""],
    ["Smoked Brisket Bacon Smash", "$12.89", ""],
    ["Double Pickle Stack Smash", "$7.49", ""],
    ["Pickle Stack Smash", "$4.99", ""],
    ["Double Avocado Bacon Ranch Stack", "$12.99", ""],
    ["Avocado Bacon Ranch Stack", "$10.19", ""],
    ["Double All-American Smash", "$7.49", ""],
    ["All-American Smash", "$4.99", ""],
    ["Double Deluxe Smash", "$7.49", ""],
    ["Deluxe Smash", "$4.99", ""],
    ["Double Classic Smash", "$10.39", ""],
    ["Classic Smash", "$7.89", "Certified Angus Beef burger, American cheese, lettuce, tomatoes, red onions, pickles, Smash Sauce, ketchup, butter-toasted bun"],
    ["Double Bacon Stack Smash", "$12.99", ""],
    ["Bacon Stack Smash", "$10.19", ""],
    ["Double Colorado Smash", "$12.69", ""],
    ["Colorado Smash", "$10.19", ""],
    ["Black Bean Smash", "$9.89", ""],
    ["Double BBQ Bacon Smash", "$12.19", ""],
    ["BBQ Bacon Smash", "$9.69", ""],
    ["Double Truffle Mushroom Smash", "$12.69", ""],
    ["Truffle Mushroom Smash", "$10.19", ""],
  ]);

  sec('All-Angus Big Dogs', [
    ["Colorado Big Dog", "$7.29", ""],
    ["Americana Big Dog", "$4.99", ""],
    ["Bacon Cheese Big Dog", "$7.29", ""],
    ["Chili Cheese Big Dog", "$7.29", ""],
  ]);

  sec('Chicken', [
    ["Crispy Chicken Sandwich", "$8.99", ""],
    ["Double Avocado Bacon Ranch Stack Chicken Smash", "$14.09", ""],
    ["Avocado Bacon Ranch Stack Chicken Smash", "$11.29", ""],
    ["Scorchin' Hot Crispy Chicken Sandwich", "$9.29", ""],
    ["Double Deluxe Chicken Smash", "$7.49", ""],
    ["Deluxe Chicken Smash", "$4.99", ""],
    ["3 Tenders", "$7.19", ""],
    ["5 Tenders", "$8.99", ""],
    ["3 Scorchin' Hot Tenders", "$7.49", ""],
    ["5 Scorchin' Hot Tenders", "$9.49", ""],
  ]);

  sec('Salad', [
    ["Crispy Chicken Bacon Ranch Salad", "$7.99", ""],
  ]);

  sec('Sides', [
    ["SmashFries", "$4.19", ""],
    ["Large SmashFries", "$4.89", ""],
    ["Smash Tots", "$4.19", ""],
    ["French Fries", "$4.19", ""],
    ["Large French Fries", "$4.89", ""],
    ["Tots", "$4.19", ""],
    ["Sweet Potato Waffle Fries", "$4.39", ""],
    ["Large Sweet Potato Waffle Fries", "$4.99", ""],
    ["Scorchin' Hot Fries", "$4.19", ""],
    ["Large Scorchin' Hot Fries", "$4.89", ""],
    ["Scorchin' Hot Tots", "$4.19", ""],
    ["Crispy Brussels Sprouts", "$4.49", ""],
    ["Cup of Homestyle Chili", "$4.99", ""],
    ["Cup of Cheddar Cheese Sauce", "$2.49", ""],
  ]);

  sec('Kids Meals', [
    ["Kids Hamburger", "$8.49", ""],
    ["Kids Cheeseburger", "$8.49", ""],
    ["Kids Chicken Tenders", "$8.49", ""],
  ]);

  sec('Hand-Spun Shakes', [
    ["Dark Cherry Chip Shake", "$7.49", ""],
    ["Chocolate Banana Chip Shake", "$7.49", ""],
    ["Oreo Cookies & Cream Shake", "$6.99", ""],
    ["Chocolate Shake", "$6.49", ""],
    ["Vanilla Shake", "$6.49", ""],
    ["Strawberry Shake", "$6.49", ""],
    ["Dark Cherry Shake", "$6.99", ""],
    ["Banana Shake", "$6.99", ""],
  ]);

  sec('Beverages', [
    ["20 oz Fountain Drink", "$3.39", ""],
    ["30 oz Fountain Drink", "$3.69", ""],
    ["Regular Craft Refreshers", "$3.39", ""],
    ["Large Craft Refreshers", "$3.69", ""],
    ["Coke Bottle", "$3.29", ""],
    ["Diet Coke Bottle", "$3.29", ""],
    ["Sprite Bottle", "$3.29", ""],
    ["Kids Honest Organic Apple Juice", "$2.69", ""],
    ["Kids Horizon Organic Milk", "$2.69", ""],
    ["Kids Horizon Organic Chocolate Milk", "$2.69", ""],
  ]);

  results.push({
    restaurantId: "3520",
    name: "Smashburger",
    sourceUrl: "https://smashburger.com/locations/us/ca/san-diego/6061-el-cajon-blvd",
    confidence: "high",
    dishes,
  });
}

// ---------------------------------------------------------------
// 7. IHOP (4834) - chain, official national menu (San Diego location page linked to same menu)
// ---------------------------------------------------------------
{
  const dishes = [];
  const sec = (section, items) => items.forEach(([name, price, description]) => dishes.push({ name, description: description || '', price, section }));

  sec('Family Feasts (IHOP N Go only)', [
    ["Buttermilk Crispy Chicken Family Feast", "$39.99", ""],
    ["Breakfast Family Feast with Pancakes", "$39.99", ""],
    ["Breakfast Family Feast with Waffles", "$39.99", ""],
    ["Breakfast Family Feast with Thick 'N Fluffy French Toast", "$39.99", ""],
    ["Pancake Creations Family Feast with Bacon", "$39.99", ""],
    ["Pancake Creations Family Feast with Sausage", "$39.99", ""],
    ["Steakburgers Family Feast", "$39.99", ""],
    ["Breakfast Beverage Bundle", "$11.29", ""],
    ["Lunch/Dinner Beverage Bundle", "$11.29", ""],
  ]);

  sec('Biscuits', [
    ["Chicken Biscuit Sandwich", "$11.99", ""],
    ["Breakfast Biscuit Sandwich", "$7.99", ""],
  ]);

  sec('Eggs Benedict', [
    ["Spicy Poblano Eggs Benedict", "$13.79", "Creamy hollandaise, poached egg, toasty English muffin"],
    ["Classic Eggs Benedict", "$13.29", ""],
  ]);

  sec('Combos', [
    ["Breakfast Sampler", "$14.79", ""],
    ["Country Fried Steak & Eggs", "$13.99", ""],
    ["Split Decision Breakfast", "$12.69", ""],
    ["T-Bone Steak & Eggs", "$17.99", ""],
    ["Sirloin Steak Tips & Eggs", "$17.59", ""],
    ["Quick 2-Egg Breakfast", "$11.29", ""],
    ["Chicken & Pancakes", "$13.59", ""],
  ]);

  sec("Stuffed 'N Stacked Omelettes", [
    ["Spicy Poblano Omelette", "$14.99", ""],
    ["Big Steak Omelette", "$15.99", ""],
    ["Chicken Fajita Omelette", "$15.99", ""],
    ["Colorado Omelette", "$15.99", ""],
    ["Bacon Temptation Omelette", "$14.99", ""],
    ["Spinach & Mushroom Omelette", "$13.99", ""],
    ["Veggie Egg White Omelette", "$13.49", ""],
    ["Build Your Own Omelette", "$10.59", ""],
  ]);

  sec('World-Famous Buttermilk Pancakes', [
    ["World-Famous Pancake Combo", "$12.59", ""],
    ["Original Buttermilk Pancakes (Full Stack)", "$9.69", ""],
    ["Original Buttermilk Pancakes (Short Stack)", "$7.89", ""],
    ["New York Cheesecake Pancakes", "$11.99", ""],
    ["Cinn-A-Stack Pancakes", "$11.99", ""],
    ["Double Blueberry Pancakes", "$11.99", ""],
    ["Mexican Tres Leches Pancakes", "$11.49", ""],
    ["Strawberry Banana Pancakes", "$11.99", ""],
    ["Protein Power Pancakes", "$11.29", ""],
    ["Chocolate Chocolate Chip Pancakes", "$11.99", ""],
    ["Buttermilk Chocolate Chip Pancakes", "$11.99", ""],
  ]);

  sec('Waffles', [
    ["Waffle Combo", "$12.99", ""],
    ["Strawberry Cheesecake Waffle", "$11.89", ""],
    ["Oreo Cookie Crumble Waffle", "$11.89", ""],
    ["Chicken & Waffles", "$13.99", ""],
    ["Belgian Waffle", "$10.29", ""],
  ]);

  sec('Sweet & Savory Crepes', [
    ["Crepe Combo", "$12.59", ""],
    ["Breakfast Crepes", "$11.79", ""],
    ["Cinnamon Bun Crepes", "$11.99", ""],
    ["Fresh Berry Crepes", "$11.89", ""],
  ]);

  sec("Thick 'N Fluffy French Toast", [
    ["Thick 'N Fluffy French Toast Combo", "$12.99", ""],
    ["Thick 'N Fluffy Classic French Toast", "$10.59", ""],
    ["Thick 'N Fluffy Strawberry Banana French Toast", "$12.99", ""],
  ]);

  sec('Sides', [
    ["Slice of Ham", "$4.59", ""],
    ["2 Eggs", "$2.29", ""],
    ["Seasonal Fresh Fruit", "$4.49", ""],
    ["Buttered English Muffin", "$3.09", ""],
    ["Buttered Toast", "$2.99", ""],
    ["Hash Browns", "$3.59", ""],
    ["Crispy Breakfast Potatoes", "$4.09", ""],
    ["French Fries", "$3.29", ""],
    ["Onion Rings", "$1.99", ""],
  ]);

  sec('Appetizers', [
    ["Chicken Quesadilla", "$12.29", ""],
    ["Mozza Sticks", "$8.99", ""],
    ["Appetizer Sampler", "$12.29", ""],
    ["Crispy Shrimp", "$12.49", ""],
  ]);

  sec('Hand-Crafted Sandwiches & Salad', [
    ["Cali Roasted Turkey Melt", "$13.59", ""],
    ["Philly Cheese Steak Stacker", "$13.99", ""],
  ]);

  sec('Platters', [
    ["Crispy Shrimp & Fries Platter", "$14.29", ""],
    ["Crispy Fish & Fries Platter", "$13.59", ""],
    ["Fisherman's Platter", "$14.29", ""],
    ["Buttermilk Crispy Chicken Strips & Fries", "$13.29", ""],
  ]);

  sec('Entrees', [
    ["Country Fried Steak", "$14.99", ""],
    ["T-Bone Steak Dinner", "$18.29", ""],
    ["Sirloin Steak Tips", "$16.99", ""],
  ]);

  sec('55+ Menu', [
    ["55+ Breakfast Sampler", "$8.99", ""],
    ["55+ Rise 'N Shine", "$8.99", ""],
    ["55+ Thick 'N Fluffy French Toast", "$8.99", ""],
    ["55+ Crispy Shrimp", "$11.49", ""],
    ["55+ Crispy Fish", "$11.49", ""],
  ]);

  sec("IHOP's Spotlight Stack", [
    ["August: Pancake of the Month Combo", "$12.59", ""],
    ["Sept: Pancake of the Month Combo", "$12.59", "760-1140 Cal"],
  ]);

  results.push({
    restaurantId: "4834",
    name: "IHOP",
    sourceUrl: "https://www.ihop.com/en/menu",
    confidence: "high",
    dishes,
  });
}

// ---------------------------------------------------------------
// 8. Harbor Breakfast (2432)
// ---------------------------------------------------------------
{
  const dishes = [];
  const sec = (section, items) => items.forEach(([name, price, description]) => dishes.push({ name, description: description || '', price, section }));

  sec('Breakfast', [
    ["The Harbor Plate", "$22", "Two Eggs any style with choice of Pork Sausage, Bacon, Ham, or Chicken-Apple Sausage; hash browns, beet-n-sweet potato hash, or fruit; toast or biscuit included"],
    ["Corned Beef Hash", "$26", "Brisket sauteed with hash browns, peppers, and onions topped with two eggs; served with toast or biscuit"],
    ["Challah French Toast", "$17", "Custardy traditional Jewish braided loaf with maple syrup and powdered sugar; add meat for $6"],
    ["Buttermilk Pancakes", "$14", "Served with maple syrup and powdered sugar; chocolate chunks ($2) or blueberries ($4) available"],
    ["Steak and Eggs", "$31", "Six-ounce hanger steak with two eggs, potato/hash choice, and bread"],
    ["So-Cal Benedict", "$21", "English muffin with avocado, poached eggs, and hollandaise; protein add-ons $6"],
  ]);

  sec('Baja Specials', [
    ["Breakfast Burrito", "$20", "Flour tortilla with eggs, potatoes, avocado, tomato, green onion, cotija cheese, and salsa; meat options available"],
    ["Chilaquiles", "$21", "Fried corn tortilla chips tossed with choice of tomatillo or guajillo salsa, topped with eggs, cheese, sour cream, and beans"],
    ["Huevos Rancheros", "$19", "Fried tortillas with beans, eggs, salsa, avocado, and cheese; potato/fruit choice included"],
  ]);

  sec('Omelettes', [
    ["The Farmer", "$24", "Tomato, zucchini, spinach, pepper, green onion, goat cheese with fig sauce"],
    ["The Denver", "$26", "Ham, pepper, green onion, cheddar with sour cream"],
    ["The 'Rizo", "$22", "Chorizo or soyrizo with avocado, tomato, cotija cheese, and salsa fresca"],
  ]);

  sec('Lunch (Burgers & Sandwiches)', [
    ["Cheeseburger", "$18", "Lettuce, tomato, onion, mayo; customizable add-ons $2-$6"],
    ["Grilled Cheese", "$14", "Cheddar and Swiss on challah bread; egg ($4) or ham ($6) optional"],
    ["The Reuben", "$24", "Thinly-sliced corned beef brisket, with Swiss, sauerkraut, and Russian dressing on rye"],
    ["B.L.T.", "$16", "Bacon, lettuce, tomato on challah with mayo; avocado or egg add-ons $4"],
    ["Grilled Chicken Sandwich", "$24", "Swiss, avocado, bacon, pickled onions, lettuce, tomato, mayo on burger bun"],
    ["House Salad", "$12", "Mixed greens with tomato, cucumber, pickled onion, goat cheese; protein options available"],
  ]);

  sec('Sides', [
    ["Hashbrowns", "$7", ""],
    ["Beet 'n' Sweet Potato Hash", "$9", ""],
    ["Fries", "$7", ""],
    ["Onion Rings", "$8", ""],
    ["Sausage", "$7", ""],
    ["Bacon or Ham", "$7", ""],
    ["Fruit Bowl", "$7", ""],
    ["Eggs", "$4", "Each"],
    ["Grilled Vegetables", "$9", ""],
  ]);

  sec('Beverages', [
    ["Drip Coffee", "$5", ""],
    ["Tea", "$5", ""],
    ["Fresh Juice", "$9", ""],
    ["Martinelli's Apple Juice", "$6", ""],
    ["Hot Chocolate", "$6", ""],
    ["Milk", "$5", ""],
    ["Mexican Coke or Sprite", "$6", ""],
    ["Diet Coke", "$5", ""],
    ["Pellegrino", "$6", ""],
    ["Beer", "$9", ""],
    ["Mimosa", "$12", ""],
    ["Soju-Based Drinks", "$12", ""],
  ]);

  results.push({
    restaurantId: "2432",
    name: "Harbor Breakfast",
    sourceUrl: "https://harborbreakfastsd.com/",
    confidence: "high",
    dishes,
  });
}

// ---------------------------------------------------------------
// 9. Gossip Grill (1907)
// ---------------------------------------------------------------
{
  const dishes = [];
  const sec = (section, items) => items.forEach(([name, price, description]) => dishes.push({ name, description: description || '', price, section }));

  sec('Foreplay', [
    ["Sampler Platter (3 Fingers)", "$25", "Choice of: 4 mozzarella sticks, 4 fried pickles, 4 bacon mac n' cheese bites, 2 bacon wrapped jalapenos, 2 cheeseburger eggrolls, 2 buffalo chicken eggrolls (3 items)"],
    ["Sampler Platter (Whole Fist)", "$32", "Same choices, 5 items"],
    ["Bruschetta", "$13.50", "Three variations with stracciatella/goat cheese toppings on focaccia or toast points"],
    ["Seasonal Hummus", "$17.50", "Served with grilled focaccia, cucumber, roasted cauliflower, heirloom carrots & sweet peppers"],
    ["Oven Baked Spinach Dip", "$17", "Parmesan cheese, artichoke hearts, spinach, garlic, served with fried pita points, soft pita points, or tortilla chips"],
    ["Get Loaded & Topped - Philly Cheesesteak Fries", "$17.50", "Kennebec fries with philly cheesesteak toppings"],
    ["Get Loaded & Topped - Carne Asada Fries", "$17.50", ""],
    ["Get Loaded & Topped - Crispy Buffalo Chicken Fries", "$17.50", ""],
    ["Get Loaded & Topped - Pulled Pork Fries", "$18.50", ""],
    ["Ahi Poke Bowl", "$17.50", "Ahi tuna marinated in house poke sauce, cucumber, red onion, mango, crispy rice, avocado, wonton strips"],
    ["Fried Cauliflower", "$14.50", "Golden fried cauliflower tossed in sweet chili glaze, topped with spicy mayo"],
    ["Cheeseburger Eggrolls", "$14", "Seasoned ground beef, cheddar cheese, side of chipotle sauce (2 items)"],
    ["Buffalo Chicken Eggrolls", "$14", "Grilled buffalo chicken, cream cheese, green onions, side of GG house ranch (2 items)"],
    ["Chicks & Fries Basket", "$17", "Hand-dipped chicky tendies, Kennebec fries, housemade ranch dressing"],
    ["3 Cheese Truffle Mac", "$19", "Add BBQ pulled pork for $6"],
    ["Lamb Sliders", "$17", "Arugula, goat cheese, pickled shallots, brioche bun, mint yogurt sauce"],
    ["Vegan Pulled Pork Sliders", "$15", "Jackfruit slow cooked in Ghost tequila BBQ sauce, vegan jalapeno slaw"],
    ["Cheeseburger Sliders", "$16", "Cheddar cheese, lettuce, tomato, onion, brioche bun"],
    ["Bacon-Wrapped Jalapenos", "$14.50", "Stuffed with cream cheese, shredded cheddar, raspberries, berry chipotle sauce"],
    ["Deviled Egg of the Month", "$16.50", ""],
    ["Dipsticks", "$13", "Choice of fried mozzarella sticks, fried pickle spears, or bacon mac n' cheese bites"],
  ]);

  sec('Soup & Salad', [
    ["Gnocchi Chicken Pot Pie Soup", "$18", "Large bowl served with puff pastry pillow atop"],
    ["Tomato Basil Soup with Focaccia Grilled Cheese", "$20", "Grilled 3-cheese sandwich, caramelized onions on focaccia and bowl of tomato basil soup"],
    ["Soup of the Day", "$15", ""],
    ["Beet & Arugula Salad", "$18", "Goat cheese crumbles, supreme oranges, orange vinaigrette, candied pecans"],
    ["Caesar Salad", "$15", "Housemade caesar dressing, housemade croutons, grated Parmesan, grape tomatoes"],
    ["Ghost Tequila BBQ Ranch Chicken Salad", "$20", "Spring mix, cucumber, red onion, grape tomatoes, roasted corn, shredded cheese, tri-color tortilla strips"],
    ["Wings", "$15", "8 wings, multiple sauce/rub options"],
  ]);

  sec('Buns & Bread', [
    ["Philly Cheesesteak & Fries", "$19.50", "Amoroso roll, grilled onions & peppers, provolone cheese, cajun remoulade"],
    ["Ghost Tequila BBQ Pulled Pork Sandwich & Fries", "$19", "Slow cooked pulled pork with Ghost Tequila BBQ sauce, jalapeno slaw"],
    ["Chicken Po'Boy & Fries", "$19", "Crispy chicken strips, jalapeno slaw & cajun remoulade"],
    ["L.G.B.T. Sandwich", "$18.50", "Lettuce, guacamole, bacon, tomato on choice of bread"],
    ["Cheeseburger", "$18", "Cheddar cheese, lettuce, tomato, onion"],
    ["My Girlfriend Isn't Hungry", "$6.50", "1 chicken tender and handful of fries"],
  ]);

  sec('All the Way Mae', [
    ["Creamy Pesto Bucatini", "$17", "Heirloom grape tomatoes, fresh grated parmigiano-reggiano, crispy basil & balsamic caviar"],
    ["Taco Throuple", "$16.50", "Choice of carne asada, beer battered fish, or jackfruit & hatch chili"],
    ["Southern Shrimp & Grits", "$21", "Cheddar infused grits, shrimp in cajun sauce & green onions"],
    ["Fish n' Chips", "$20", "IPA beer battered Alaskan cod with housemade tartar sauce"],
  ]);

  sec('Happy Endings', [
    ["Skillet Chocolate Chip Cookie & Ice Cream", "$12.50", "Baked fresh in skillet, served with vanilla ice cream"],
    ["Chef's Choice Creme Brulee", "$9", ""],
  ]);

  results.push({
    restaurantId: "1907",
    name: "Gossip Grill",
    sourceUrl: "https://gossipgrill.com/food/",
    confidence: "high",
    dishes,
  });
}

// ---------------------------------------------------------------
// 10. Aqui es Texcoco (4189)
// ---------------------------------------------------------------
{
  const dishes = [];
  const sec = (section, items) => items.forEach(([name, price, description]) => dishes.push({ name, description: description || '', price, section }));

  sec('Antojitos (Other Plates)', [
    ["Sopes (Order of 3)", "$13.95", "Small shaped corn dough topped with refried beans, lettuce, cream and cheese with meat of choice (barbecue, chicken, pressed pork belly, blood sausage, or fresh cheese)"],
    ["Enchiladas Rojas, Verdes o Mole (Order of 3)", "$13.95", "Tortilla dipped in red, green or mole sauce, filled with meat of choice (barbecue, chicken, pressed pork belly or beans and cheese)"],
    ["Tostada", "$5.25", "Barbecue, chicken or beef feet"],
    ["Tacos Dorados de Sesos o Moronga", "$4.15", "Grilled brain or blood sausage tacos"],
    ["Quesataco (Grilled Cheese Taco)", "$5.75", "Grilled cheese with choice of lamb barbecue, chicken, pressed pork belly, blood sausage, huitlacoche, mushrooms, zucchini flower or poblano pepper"],
    ["Chicharron de Queso (Crunchy Grilled Cheese)", "$8.75", ""],
    ["Enfrijoladas (Order of 3)", "$13.95", "Tortilla stuffed with melted cheese, dipped in thinned beans, folded in half, served with cream and fresh cheese"],
    ["Quesadilla de Queso", "$4.50", "Cheese"],
    ["Quesadilla Barbacoa/Pollo/Chicharron/Moronga", "$5.75", "Lamb barbecue, chicken, pressed pork belly or blood sausage"],
    ["Quesadilla Huitlacoche/Champinones/Flor de Calabaza/Chile Poblano", "$5.75", "Corn truffle, mushrooms, zucchini flower or poblano pepper"],
    ["Flautas / Rolled Tacos (Order of 3)", "$13.95", "With cream, lettuce, cotija cheese and salsa; choice of lamb barbecue, chicken, potato or beans"],
  ]);

  sec('Especialidades', [
    ["Codornices Asadas (Order of 3)", "$16.75", "Grilled quails marinated with dark beer and spices, served with homemade grilled salsa and tortillas"],
    ["Codornices Asadas (1 Piece)", "$6.00", ""],
    ["Mixiotes - Borrego/Lamb (1/2 lb)", "$16.95", "Meat cooked in parchment, includes small lamb broth and tortillas"],
    ["Mixiotes - Conejo/Rabbit (1/2 lb)", "$16.95", ""],
    ["Mixiotes - Pollo/Chicken (1/2 lb)", "$16.25", ""],
    ["Chapulines/Grasshoppers", "$8.75", "With avocado slices"],
    ["Plato Azteca", "$16.25", "Grilled cactus with onions, and choice of mushrooms, rajas, huitlacoche or zucchini flower"],
  ]);

  sec('Combinaciones', [
    ["Combinaciones/Combos", "$16.50", "Includes small lamb broth; create your own, select any 3: plain quesadilla, taco, sope, grilled brain taco, roll taco"],
  ]);

  sec('Sopas', [
    ["Consome de Borrego/Lamb Broth (Chico/Small)", "$4.15", "With rice and garbanzo beans"],
    ["Consome de Borrego/Lamb Broth (Mediano/Medium)", "$7.85", ""],
    ["Consome de Borrego/Lamb Broth (Grande/Large)", "$11.25", ""],
    ["Sopa De Tortilla / Tortilla Soup (10 oz)", "$6.50", "Traditional with avocado, pasilla chile pepper and fresh cheese"],
    ["Sopa De Tortilla / Tortilla Soup (20 oz)", "$8.50", ""],
  ]);

  sec('Barbacoa de Borrego (Lamb Barbecue)', [
    ["Plato de Barbacoa / Lamb Barbecue Plate (Media Orden / Half, 1/3 lb)", "$15.25", "Choose meat, rib, head or tripe; includes small lamb broth, tortillas, salsa, lime, cilantro and onion"],
    ["Plato de Barbacoa / Lamb Barbecue Plate (Orden / Full, 1/2 lb)", "$17.25", ""],
    ["Tacos (Soft or Grilled)", "$4.15", "Choice of meat, rib, head, tripe, pressed pork belly, blood sausage, asada, chicken or pastor"],
    ["Barbacoa Tamano Familiar / Family Size (2.2 lbs, serves 4-6)", "$54.00", "Choose meat, rib, or tripe"],
    ["Cabeza Completa / Lamb Head", "$27.50", "Includes tortillas, salsa, lemons, cilantro and onions"],
    ["Plato de Barbacoa Mediterraneo (Media Orden / Half, 1/3 lb)", "$15.25", "Mediterranean style with pita bread, yogurt-dill sauce"],
    ["Plato de Barbacoa Mediterraneo (Orden / Full, 1/2 lb)", "$17.25", ""],
    ["Barbacoa en Pita / Lamb Barbecue Pita Sandwich", "$12.50", "Includes small lamb broth, pita bread with barbecue, lettuce, tomatoes, homemade dill yogurt sauce"],
  ]);

  sec('Complementos (Sides)', [
    ["Frijoles/Beans (Half Pint/Pint)", "$5.85 / $6.85", ""],
    ["Guacamole/Guac (Half Pint/Pint)", "$6.95 / $8.50", ""],
    ["Guacamole con Nopales / Guac & Cactus (Half Pint/Pint)", "$6.95 / $8.50", ""],
    ["Guacamole con Chapulines / Guac & Grasshoppers (Half Pint/Pint)", "$9.00 / $12.25", ""],
    ["Ensalada de Nopales / Cactus Salad (Half Pint/Pint)", "$6.95 / $8.50", ""],
    ["Chiles Toreados / Fried Hot Peppers", "$4.85", ""],
    ["Pan de Pita / Pita Bread (2)", "$2.50", ""],
    ["Queso Fresco a la Plancha / Grilled Fresh Cheese", "$9.25", ""],
    ["Esquite / Corn Cup", "$5.25", ""],
  ]);

  sec("Menu para Ninos (Kid's Menu, 10 and younger)", [
    ["Kid's Menu Entree + Side + Beverage", "$9.50", "Choice of taco de barbacoa, quesadilla sencilla or consome; side of fresh seasonal fruit, guacamole, ensalada de nopal, frijoles or yogurt; beverage of water, apple juice, club soda, horchata (10oz) or jamaica (10oz)"],
  ]);

  sec('Postres (Desserts)', [
    ["Helado Casero / High Quality Ice Cream", "$5.65", "Jamaica sorbet made specially for Texcoco, or various flavors"],
    ["Flan / Cream Caramel", "$5.65", ""],
    ["Arroz con Leche / Rice Pudding", "$5.65", ""],
    ["Camote Enmielado / Honeyed Yams", "$5.65", ""],
  ]);

  sec('Bebidas (Beverages)', [
    ["Agua Fresca (Medium)", "$3.95", "Horchata, jamaica, or tamarindo/limonada"],
    ["Agua Fresca (Large)", "$6.25", ""],
    ["Agua Fresca (Pitcher)", "$12.00", ""],
    ["Sodas - Lata/Can", "$3.25", ""],
    ["Jugo de Naranja Fresca / Fresh Orange Juice (10 oz)", "$5.75", ""],
    ["Jugo de Naranja Fresca / Fresh Orange Juice (16 oz)", "$8.50", ""],
    ["Jarritos o Sangria / Jarritos or Sangria, Mexican Sodas", "$3.50", ""],
    ["Cafe Americano o de Olla / American or Mexican-Style Coffee (10 oz)", "$3.75", ""],
    ["Cafe Americano o de Olla / American or Mexican-Style Coffee (20 oz)", "$5.95", ""],
    ["Te / Tea, assorted flavors (10 oz)", "$3.75", ""],
    ["Te / Tea, assorted flavors (20 oz)", "$5.95", ""],
  ]);

  results.push({
    restaurantId: "4189",
    name: "Aqui es Texcoco",
    sourceUrl: "https://www.aquiestexcoco.com/menu",
    confidence: "high",
    dishes,
  });
}

// ---------------------------------------------------------------
// 11. El Agave Tequileria (1132) - dinner menu (own site PDF)
// ---------------------------------------------------------------
{
  const dishes = [];
  const sec = (section, items) => items.forEach(([name, price, description]) => dishes.push({ name, description: description || '', price, section }));

  sec('Appetizers', [
    ["Pork Belly Sliders", "$19", "Three chiles adobo pork belly with red onion, avocado, mixed lettuce and habanero aioli served on brioche bun"],
    ["Sopecitos Surtidos", "$15", "Homemade soft flat tortilla shells topped with black beans and salsa verde: one with shredded chicken, one with homemade chorizo, one with shrimp in chipotle sauce; topped with lettuce and Mexican cream"],
    ["Tostadas Ahi Tuna", "$17", "Five homemade poblano pepper corn tostadas, topped with fresh ahi tuna, onions, crisp lettuce, avocado cream and sesame habanero chili oil"],
    ["Ceviche Trio", "$19", "Three different ceviches: octopus and shrimp with cucumber, cilantro and onion in salsa negra; ahi tuna with red onion, cucumber in black sauce and sesame seeds; verde ceviche, white fish cooked in lime with chile serrano and cucumber"],
    ["Duck Burritos", "$25", "Two duck margret flour tortilla burritos with caramelized onion, raisins, mixed nuts, romaine lettuce, in a serrano peppers and jamaica adobo"],
    ["Coliflor Jimena", "$13", "Grilled cauliflower, sauteed in citric sauce with chipotle and corn aioli"],
    ["Chalupas de Camaron", "$19", "Two chalupas of corn masa, topped with shrimp, diced tomato, cilantro and fresh mexican cheese crumbles finished with a touch of mexican cream"],
    ["Cazuela de Borrego", "$28", "Oaxacan style 8 hour slow cooked lamb with black beans, cilantro and salsa borracha"],
    ["Calamares", "$25", "Fried calamari on a bed of sofrito made with carrot, squash, onion, and jalapeno, accompanied by nopal tempura, hummus and avocado topped with a sweet habanero sauce"],
    ["Pulpo a las Brasas", "$26", "Grilled tender octopus marinated with garlic, paprika and fresh herbs, served on avocado and potato puree, drizzled with sundried chili oil"],
    ["Quesadillas de Flor de Calabaza", "$12", "Homemade poblano pepper corn dough quesadillas stuffed with mexican cheese and squash blossom"],
    ["Aguachile de Camaron", "$22", "Raw shrimp in a black citrus sauce with chile serrano, cilantro, cucumber and red onion"],
    ["Tlacoyos de Huitlacoche", "$16", "Savory corn masa cakes with corn truffle, salsa verde, queso fresco, onion and cilantro"],
    ["Quesadillas de Flor de Calabaza (Squash Blossom)", "$13", "Homemade poblano pepper corn dough quesadillas stuffed with mexican cheese and squash blossom"],
  ]);

  sec('Soups & Salads', [
    ["Sopa de Cilantro", "$11", "A delicate soup of fresh cilantro, cream and spice"],
    ["Caldo Xochitl", "$10", "Chicken soup with zucchini, carrots and tomato"],
    ["Crema de Chile Poblano con Huitlacoche", "$14", "Creamy chile poblano and cuitlacoche blended and enhanced with our spices"],
    ["Sopa de Tortilla", "$11", "Traditional Azteca soup infused with pasilla chili flavor, layered with tortilla strips, shredded chicken, manchego cheese, sour cream and avocado"],
    ["Ensalada Caesar", "$12", "The authentic recipe from Tijuana; add shrimp or chicken for $6"],
    ["Ensalada de Nopal", "$12", "Cactus paddle salad with freshly diced tomato, cilantro, onion, oregano, avocado, mexican cheese and olive oil"],
    ["Ensalada del Huerto", "$12", "Baby mixed greens tossed with red and gold beets, pistachios, figs, cherry tomato, goat cheese and pomegranate dressing"],
  ]);

  sec('Moles', [
    ["Mole Negro", "$26", "From Oaxaca with four different chilis: pasilla, mulato, ancho and chipotle; tortilla, deep fried banana, nuts, raisins, tomato, tomatillo, celery and more; served with chicken or pork"],
    ["Trilogia de Moles", "$29", "Three moles: verde, rojo and amarillo, served with pumpkin seeds and garlic garnished with fried plantains and Agave rice"],
    ["Mole Poblano Don Julio", "$28", "The soul of mexican moles, made from scratch with pasilla, ancho and mulato chilis, tomatillo, clove, chocolate, garlic, cinnamon, coriander seed; served over pork or chicken with Agave style rice"],
    ["Enchiladas en Mole Negro", "$18", "Shredded pork enchiladas topped with the traditional Oaxacan black mole"],
    ["Enchiladas de Mole Poblano Don Julio", "$16", "Chicken enchiladas in our famous Mole Poblano made from scratch, served with Agave rice"],
    ["Enchilada Mole Verde", "$16", "Shredded pork enchiladas in our outstanding mole verde sauce, served with black beans"],
    ["Enchiladas Vegetarianas", "$16", "Corn tortillas stuffed with sauteed mushrooms, carrots, zucchini, squash, served with Agave rice and choice of any of our delicious moles"],
    ["Enchiladas Verdes", "$16", "Tender chicken enchiladas in the traditional tomatillo sauce, under fresh cheese, onions and cilantro, served with black beans"],
    ["Enchiladas Rojas", "$16", "Chicken enchiladas in a red mexican sauce, layered with cream and cheese, served with black beans"],
  ]);

  sec('Seafood', [
    ["Salmon Cholula", "$19", "Baked salmon topped with a chile poblano sauce, served with Agave rice"],
    ["Tostada de Atun", "$11", "Homemade poblano pepper corn tostada, topped with fresh ahi tuna, onions, crisp cabbage, avocado cream and sesame habanero chili oil"],
    ["Arroz a la Tumbada", "$29", "A traditional dish from Veracruz; mixed seafood (shrimp, octopus, squid and seabass) sauteed with parboiled rice and delicate tomato butter, garlic and white wine sauce garnished with aromatic herbs"],
    ["Salmon Natas", "$33", "Fresh salmon, pan seared, served over a bed of mole rojo, mashed potatoes and vegetables finished with a red natas mole and touch of cream"],
    ["Camaron al Tequila", "$34", "Jumbo shrimp sauteed with extra virgin olive oil, julienne serrano peppers, fresh lime and lemon juice, flambeed with tequila and reduced with touch of cream; served with black beans and Agave rice"],
    ["Sea Bass Ajo y Achiote", "$36", "Fresh sea bass laid on a bed of potato puree, in a superb garlic-chipotle sauce, made to order; a true wonder of Mayan cuisine"],
  ]);

  sec('Gourmet Tacos & Burritos', [
    ["Taco al Pastor (3)", "$14", "Pork meat marinated in chile guajillo, pineapple, cilantro and onions"],
    ["Taco de Carnitas (3)", "$14", "Tender roasted pork Michoacan style, served over homemade tortillas, garnished with pico de gallo sauce"],
    ["Taco Gobernador (3)", "$16", "Grilled shrimp tacos, accompanied by pico de gallo and melted Oaxaca cheese"],
    ["Taco de Cochinita Pibil (3)", "$14", "Cochinita pibil tacos topped with habanero chili cream"],
    ["Taco de Arrachera (3)", "$14", "Carne asada taco with onions and cilantro, served with guacamole"],
    ["Burrito de Filete y Ave", "$18", "Tomato tortilla stuffed with filet mignon and poultry marinated in a citrus sauce"],
    ["Taco de Pescado (3)", "$16", "Grilled local seabass with adobo sauce, cabbage, beets and cream"],
    ["Taco de Camaron Enchilado (3)", "$16", "Shrimp chunks sauteed in garlic, arbol chili, cheese and a touch of mustard"],
    ["Burrito de Camaron Florentina", "$18", "Shrimp sauteed in butter, garlic, spinach, red pepper and Manchego cheese"],
    ["Agave Veggie Tacos (3)", "$14", "Roasted Oaxaca cheese, mushrooms, poblano pepper, spinach grilled with olive oil"],
    ["Burrito Vegetariano", "$14", "Grilled mushroom, Italian squash, spinach and Manchego cheese"],
    ["Burrito California", "$16", "Carne asada, french fries, guacamole, cheese and sour cream"],
  ]);

  sec('Meats', [
    ["Arrachera Tampiquena", "$21", "Grilled tender flat fillet with poblano chili strips, guacamole, black beans and enchilada"],
    ["Chile Relleno", "$24", "Poblano pepper stuffed with filet mignon chunks, peach, apple, almonds, peanuts and raisins, topped with Oaxaca cheese sauce"],
    ["Tacos de Filete y Tuetano (3)", "$26", "Grilled filet served with grated cheese, chile guajillo alioli, chile de arbol, caramelized onion with a side of roasted bone marrow"],
    ["El Agave Chile Relleno", "$29", "Poblano pepper stuffed with filet mignon chunks, peach, apple, almonds, peanuts and raisins, topped with Oaxaca cheese sauce"],
    ["Filete Chipotle", "$37", "Grilled mignon on a tortilla covered with melted Manchego cheese and chipotle sauce; served with potatoes, corn and vegetables"],
    ["Short Rib Poblano", "$29", "Tender short rib braised in our signature spices on a bed of creamy risotto with poblano chili, corn, squash blossom, Ramonetti cheese from Ensenada B.C. and beef juice"],
    ["Medallones Mar y Tierra", "$39", "Filet mignon medallions and jumbo shrimp, served with an exotic blend of spices from the Gulf of Mexico, made up of grilled onions, garlic and hoja santa, served with our grilled nopal (cactus paddle) julienne"],
  ]);

  sec('Sides', [
    ["Black Beans", "$3", ""],
    ["House Salad", "$3", ""],
    ["Agave Rice", "$3", ""],
    ["Pico de Gallo", "$3", ""],
    ["Guacamole", "Market Price", ""],
  ]);

  results.push({
    restaurantId: "1132",
    name: "El Agave Tequileria",
    sourceUrl: "https://elagave.com/wp-content/uploads/2023/12/El-Agave-Dinner-Menu.pdf",
    confidence: "high",
    dishes,
  });
}

// ---------------------------------------------------------------
// 12. Sandbar Sports Grill (1224)
// ---------------------------------------------------------------
{
  const dishes = [];
  const sec = (section, items) => items.forEach(([name, price, description]) => dishes.push({ name, description: description || '', price, section }));

  sec('Appetizers', [
    ["Chips & Salsa", "$4", "House-made roasted salsa"],
    ["Housemade Guacamole", "$12", "Avocado, onion, pico de gallo, lime juice, house chips"],
    ["Soyrizo-Queso", "$13", "Three cheese blend, soyrizo, cotija cheese, house chips"],
    ["Mission Nachos", "$17", "Mixed cheese, soyrizo queso, beans, guacamole, pico de gallo, sour cream, jalapenos; add protein +$3"],
    ["Quesadilla", "$14", "Served with a side of pico de gallo, guacamole, sour cream and house-made roasted salsa; add protein +$3; family size $17.50"],
    ["Carne Asada Tots", "$16.50", "Carne asada, tater tots, mixed cheese, green onion, chipotle aioli"],
    ["Loco Fries", "$16.50", "Fries tossed in garlic butter sauce, pork adobada, ranchero sauce, fresh jalapenos, soyrizo queso, crispy onion strings"],
    ["Southwest Chimi Rolls", "$13.75", "Chicken, mixed cheese, cilantro, corn, black beans, deep fried in a small flour tortilla"],
    ["Pretzel Bites", "$13", "Fresh baked pretzel bites served with celery, carrots, soyrizo queso, & honey mustard"],
    ["Wings", "$16.50", "Plain, buffalo, oaksteak BBQ, sweet chili, honey hot, jose's creamy garlic ranch, lemon pepper dry rub"],
    ["Chicken Tenders", "$17", "Natural tenders served with house made ranch & fries"],
  ]);

  sec('Tacos', [
    ["Two Taco Plate", "$17.50", "Choose any two tacos, any style, with any protein; served with house chips, guacamole, and beans"],
    ["Surf & Turf Taco", "$7.50", "Carne asada, grilled shrimp, cilantro, onion, garlic chipotle cream sauce on a corn tortilla with melted cheese"],
    ["Quesa-Birria Taco", "$7.50", "Birria style beef folded into a corn tortilla with melted cheese, cilantro, onion, served with a side of consome"],
    ["TKO Style Taco", "$7.50", "Cotija crusted flour tortilla, chipotle aioli, escabeche slaw, lime crema, spicy guacamole, crispy onion strings, fried cilantro"],
    ["Beach Style Taco", "$7", "Chipotle aioli, pico de gallo, mixed cheese, shredded lettuce on a soft flour tortilla (seafood served with shredded cabbage)"],
    ["Fried Avocado Taco", "$7", "Beer battered fried avocado, chipotle aioli, black beans, lettuce, pico de gallo, sour cream, cotija cheese on a soft flour tortilla"],
    ["Street Style Taco", "$6.75", "Spicy guacamole, cilantro, onion, topped with cotija cheese on a soft corn tortilla"],
    ["Juan's Street Taco", "$6.75", "Pork adobada, roasted pineapple, cilantro, onion, jalapeno cream sauce on a fresh corn tortilla"],
  ]);

  sec('Proteins (add to tacos)', [
    ["Protein add-on (carne asada, grilled mahi mahi, chicken, fried mahi mahi, pork adobada, or grilled shrimp)", "included in taco price", "Choice of protein for any taco style"],
  ]);

  sec('From the Sea', [
    ["Shrimp Ceviche", "$17.50", "White shrimp marinated in a citrus juice blend, pico de gallo, avocado, cucumber slices, house chips"],
    ["Fish & Chips", "$18", "Served with house made tartar sauce & fries"],
    ["Chilean Black Mussels", "$21", "Served in a chipotle cream sauce with roasted tomatoes, garlic confit, & toasted baguette slices"],
  ]);

  sec('Greens & Soup', [
    ["Chicken Fiesta Salad", "$16", "Grilled chicken, grilled bell peppers, grilled onions, black beans, pico de gallo, corn, cotija cheese, avocado, tortilla strips, romaine lettuce with cilantro lime dressing"],
    ["Steak Salad", "$17", "Grilled steak, strawberries, shaved almonds, feta cheese, spring mix, house dressing (balsamic & bleu cheese)"],
    ["Cobb Salad", "$14", "Bacon, hard boiled egg, avocado, tomato, feta cheese, romaine lettuce, ranch dressing; add chicken or steak +$3.50, mahi mahi or shrimp +$4.50"],
    ["Buddy Bowl", "$14.75", "Grilled chicken, black beans, grilled peppers, grilled onions, avocado, pico de gallo, corn, served with flour or corn tortillas; sub steak, shrimp, mahi mahi +$2"],
    ["Chicken Tortilla Soup (Cup)", "$5", ""],
    ["Chicken Tortilla Soup (Bowl)", "$7", ""],
  ]);

  sec('Burgers & Sandwiches', [
    ["Sandbar Bacon Cheeseburger", "$16.50", "Bacon, grilled onions, cheddar cheese, house sauce, lettuce, tomato; served with choice of side"],
    ["Diablo Burger", "$17", "Chipotle aioli, fresh jalapenos, pepper-jack cheese, spicy guacamole, crispy onion strings"],
    ["Ancho Chicken Sandwich", "$16", "Grilled chicken, chipotle aioli, pepper-jack cheese, avocado, lettuce, tomato"],
    ["Honey Hot Chicken Sandwich", "$16.50", "Fried chicken, house made honey hot sauce, pepper-jack cheese, lettuce, onion, pickles"],
  ]);

  sec('Kids', [
    ["Kids Cheeseburger", "$12", "Includes a drink and choice of side"],
    ["Kids Cheese Quesadilla", "$12", "Includes a drink and choice of side"],
    ["Kids Chicken Tenders", "$12", "Includes a drink and choice of side"],
    ["Kids Grilled Cheese", "$12", "Includes a drink and choice of side"],
    ["Kids Mini Corn Dogs", "$12", "Includes a drink and choice of side"],
  ]);

  sec('Cocktails & Beverages', [
    ["Sandbargarita", "$13", "Blanco tequila, lime juice, agave"],
    ["Mission Beach Melon Margarita", "$15", "Olmeca altos blanco tequila, licor 43, cointreau noir, lime juice, watermelon-cucumber puree, agave"],
    ["House Michelada", "$13", "Modelo, house blend bloody mary mix with clamato, lime juice"],
    ["Mango Michelada", "$13", "Mango cart, house blend bloody mary mix with clamato, lime juice"],
    ["Strawberry Agua Fresca Margarita", "$15", "Espolon reposado tequila, strawberry-mint puree, lime juice, agave"],
    ["Breakfast Shot", "$12", "Irish whiskey, butterscotch schnapps, orange juice, bacon"],
    ["Espresso Martini", "$15", "Vodka, kahlua, nitro cold brew coffee, simple syrup, pinch of cinnamon"],
    ["Guava-Rita", "$15", "Olmeca altos blanco tequila, guava puree, lime juice, agave"],
    ["Spicy Pineapple Mana-Rita", "$15", "Teremana blanco tequila, triple sec, pineapple, jalapeno, lime juice, agave"],
    ["Big Ass Bloody (serves 4-5)", "$18/$48", "Cutwater vodka, house blend bloody mary mix with clamato, lime juice, skewer of goodies"],
    ["Margarita Pitcher (serves 4-5)", "$48", "Classic house marg for the table"],
  ]);

  results.push({
    restaurantId: "1224",
    name: "Sandbar Sports Grill",
    sourceUrl: "http://www.sandbarsportsgrill.com/wp-content/uploads/2025/04/Sandbar-New-FB-Menu-04-26.pdf",
    confidence: "high",
    dishes,
  });
}

fs.writeFileSync('result-3.json', JSON.stringify(results, null, 2));
console.log('Wrote', results.length, 'restaurants,', results.reduce((a,r)=>a+r.dishes.length,0), 'dishes');
for (const r of results) console.log(' -', r.restaurantId, r.name, ':', r.dishes.length, 'dishes,', r.confidence);
