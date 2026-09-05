import fs from 'fs';

const dishes = [];
const add = (name, description, price, section) => dishes.push({name, description, price: price.startsWith('$') ? price : '$'+price, section});

// BREAKFAST
add('Verdes Breakfast Burrito', 'Chorizo, Fries, Scrambled Eggs, Cheese, and Sour Cream', '20.50', 'Breakfast');
add('Carne Asada Con Huevos', 'Grilled Carne Asada, 2 Eggs any style. Served with tortillas, rice, and beans.', '24.50', 'Breakfast');
add('Machaca Con Huevos', 'Shredded Beef and Eggs, scrambled with grilled veggies. Served with tortillas, rice, and beans.', '19.50', 'Breakfast');
add('Machaca Burrito w/Huevos', 'Shredded Beef and 2 Egg, scrambled with Grilled Veggies', '18.50', 'Breakfast');
add('Huevos Rancheros', '2 Eggs any style, baked over a corn tortilla, topped with Ranchero sauce and Monterey jack. Served with tortillas, rice, and beans.', '18.25', 'Breakfast');
add('Chilaquiles', 'Crisp corn tortillas, simmered in red or green enchilada sauce until softened, topped with onion, sour cream, and Cotija cheese. Served with rice and beans.', '16.00', 'Breakfast');
add('Chilaquiles with Chicken', 'Chilaquiles topped with chicken', '21.00', 'Breakfast');
add('Chorizo Con Huevos', '2 Eggs scrambled with Chorizo. Served with tortillas, rice, and beans.', '17.50', 'Breakfast');

// A LA CARTE - Burritos
add('Bean Burrito', 'Large soft flour tortilla filled with various options.', '9.00', 'A La Carte - Burritos');
add('Bean & Cheese Burrito', 'Large soft flour tortilla filled with various options.', '10.50', 'A La Carte - Burritos');
add('Chile Verde Burrito', 'Large soft flour tortilla filled with various options.', '18.95', 'A La Carte - Burritos');
add('Chile Colorado Burrito', 'Large soft flour tortilla filled with various options.', '20.50', 'A La Carte - Burritos');
add('Chorizo with Beans and Cheese Burrito', 'Large soft flour tortilla filled with various options.', '17.95', 'A La Carte - Burritos');
add('Shredded Chicken Burrito', 'Includes guacamole, Monterey Jack and salsa fresca.', '16.95', 'A La Carte - Burritos');
add('Shredded or Ground Beef Burrito', 'Includes guacamole, Monterey Jack and salsa fresca.', '17.50', 'A La Carte - Burritos');
add('Pollo Asada Burrito', 'Includes guacamole, Monterey Jack and salsa fresca.', '18.50', 'A La Carte - Burritos');
add('Carne Asada Burrito', 'Includes guacamole, Monterey Jack and salsa fresca.', '21.50', 'A La Carte - Burritos');
add('Carnitas Burrito', 'Includes guacamole, Monterey Jack and salsa fresca.', '20.50', 'A La Carte - Burritos');
add('Grilled Veggie Burrito', 'Includes guacamole, Monterey Jack and salsa fresca.', '18.75', 'A La Carte - Burritos');
add('California Burrito', 'Carne Asada, French fries, sour cream, guacamole, Monterey jack, and salsa fresca.', '22.00', 'A La Carte - Burritos');
add('Surf and Turf Burrito', 'Carne Asada, Grilled Shrimp, Guacamole, Salsa Fresca, Cheese', '24.75', 'A La Carte - Burritos');
add('Grilled or Battered Fish Burrito', 'Large soft flour tortilla filled with grilled battered fish, soap beans, cabbage, avocado slices, and white sauce.', '20.25', 'A La Carte - Burritos');
add('Grilled Shrimp and Rice Burrito', 'Grilled shrimp and seasoned rice, layered with crisp cabbage, fresh salsa fresca, and Mexican white sauce.', '21.95', 'A La Carte - Burritos');

// Chimichanga
add('Chimichanga - Shredded Chicken', 'Deep fried burrito filled with beans and choice of meat. Topped with sour cream, Cotija cheese and salsa fresca.', '16.95', 'A La Carte - Chimichanga');
add('Chimichanga - Shredded Beef', 'Deep fried burrito filled with beans and choice of meat. Topped with sour cream, Cotija cheese and salsa fresca.', '17.50', 'A La Carte - Chimichanga');
add('Chimichanga - Carne Asada', 'Deep fried burrito filled with beans and choice of meat. Topped with sour cream, Cotija cheese and salsa fresca.', '21.50', 'A La Carte - Chimichanga');

// Taquitos
add('Taquitos - Shredded Chicken', 'Three crisp rolled corn tortillas filled with your choice of meat. Topped with lettuce salsa, sour cream, salsa fresca, Cotija and Monterey Jack cheeses.', '13.75', 'A La Carte - Taquitos');
add('Taquitos - Beef', 'Three crisp rolled corn tortillas filled with your choice of meat. Topped with lettuce salsa, sour cream, salsa fresca, Cotija and Monterey Jack cheeses.', '14.50', 'A La Carte - Taquitos');
add('Taquitos - Carnitas', 'Three crisp rolled corn tortillas filled with your choice of meat. Topped with lettuce salsa, sour cream, salsa fresca, Cotija and Monterey Jack cheeses.', '15.75', 'A La Carte - Taquitos');

// Enchiladas
add('Enchiladas - Cheese', 'Soft corn tortilla wrapped around choice of filling, baked with red or green enchilada sauce and Monterey Jack cheese.', '7.50', 'A La Carte - Enchiladas');
add('Enchiladas - Shredded Chicken', 'Soft corn tortilla wrapped around choice of filling, baked with red or green enchilada sauce and Monterey Jack cheese.', '8.75', 'A La Carte - Enchiladas');
add('Enchiladas - Shrimp', 'Soft corn tortilla wrapped around choice of filling, baked with red or green enchilada sauce and Monterey Jack cheese.', '10.50', 'A La Carte - Enchiladas');
add('Enchiladas - Shredded Beef', 'Soft corn tortilla wrapped around choice of filling, baked with red or green enchilada sauce and Monterey Jack cheese.', '8.95', 'A La Carte - Enchiladas');
add('Enchiladas - Ground Beef', 'Soft corn tortilla wrapped around choice of filling, baked with red or green enchilada sauce and Monterey Jack cheese.', '8.95', 'A La Carte - Enchiladas');
add('Enchiladas - Carnitas', 'Soft corn tortilla wrapped around choice of filling, baked with red or green enchilada sauce and Monterey Jack cheese.', '9.95', 'A La Carte - Enchiladas');
add('Enchiladas - Grilled Veggie', 'Soft corn tortilla wrapped around choice of filling, baked with red or green enchilada sauce and Monterey Jack cheese.', '8.75', 'A La Carte - Enchiladas');

// Flautas
add('Flautas - Shredded Chicken', 'Two crisp rolled flour tortillas filled with your choice of meat. Topped with sour cream, salsa fresca, and Cotija cheese.', '13.75', 'A La Carte - Flautas');
add('Flautas - Beef', 'Two crisp rolled flour tortillas filled with your choice of meat. Topped with sour cream, salsa fresca, and Cotija cheese.', '14.50', 'A La Carte - Flautas');
add('Flautas - Carnitas', 'Two crisp rolled flour tortillas filled with your choice of meat. Topped with sour cream, salsa fresca, and Cotija cheese.', '15.75', 'A La Carte - Flautas');

add('Tamales', 'House made traditional corn cakes. Ask for selection.', '7.85', 'A La Carte');

// Soft Tacos
add('Soft Taco - Pollo Asado', 'Soft corn tortilla topped with your choice of grilled meat, guacamole, salsa fresca, and Cotija cheese.', '8.00', 'A La Carte - Soft Tacos');
add('Soft Taco - Grilled Veggie', 'Soft corn tortilla topped with your choice of grilled meat, guacamole, salsa fresca, and Cotija cheese.', '7.75', 'A La Carte - Soft Tacos');
add('Soft Taco - Carne Asada', 'Soft corn tortilla topped with your choice of grilled meat, guacamole, salsa fresca, and Cotija cheese.', '8.95', 'A La Carte - Soft Tacos');
add('Soft Taco - Carnitas', 'Soft corn tortilla topped with your choice of grilled meat, guacamole, salsa fresca, and Cotija cheese.', '8.75', 'A La Carte - Soft Tacos');

// Crispy Tacos
add('Crispy Taco - Shredded Chicken', 'A folded and crisp corn tortilla, filled with choice of filling, topped with lettuce salsa fresca and Cotija cheese.', '6.50', 'A La Carte - Crispy Tacos');
add('Crispy Taco - Shredded Beef', 'A folded and crisp corn tortilla, filled with choice of filling, topped with lettuce salsa fresca and Cotija cheese.', '6.75', 'A La Carte - Crispy Tacos');
add('Crispy Taco - Ground Beef', 'A folded and crisp corn tortilla, filled with choice of filling, topped with lettuce salsa fresca and Cotija cheese.', '6.75', 'A La Carte - Crispy Tacos');
add('Crispy Taco - Carnitas', 'A folded and crisp corn tortilla, filled with choice of filling, topped with lettuce salsa fresca and Cotija cheese.', '7.75', 'A La Carte - Crispy Tacos');
add('Crispy Taco - Guacamole', 'A folded and crisp corn tortilla, filled with choice of filling, topped with lettuce salsa fresca and Cotija cheese.', '6.75', 'A La Carte - Crispy Tacos');

// Tostadas
add('Tostada - Bean', 'A crisp flat corn tortilla, covered with beans. Topped with lettuce, salsa fresca, sour cream, Monterey Jack and Cotija cheeses.', '12.00', 'A La Carte - Tostadas');
add('Tostada - Shredded Chicken', 'A crisp flat corn tortilla, covered with beans. Topped with lettuce, salsa fresca, sour cream, Monterey Jack and Cotija cheeses.', '15.75', 'A La Carte - Tostadas');
add('Tostada - Shredded Beef', 'A crisp flat corn tortilla, covered with beans. Topped with lettuce, salsa fresca, sour cream, Monterey Jack and Cotija cheeses.', '16.75', 'A La Carte - Tostadas');
add('Tostada - Ground Beef', 'A crisp flat corn tortilla, covered with beans. Topped with lettuce, salsa fresca, sour cream, Monterey Jack and Cotija cheeses.', '16.75', 'A La Carte - Tostadas');
add('Tostada - Pollo Asada', 'A crisp flat corn tortilla, covered with beans. Topped with lettuce, salsa fresca, sour cream, Monterey Jack and Cotija cheeses.', '17.75', 'A La Carte - Tostadas');
add('Tostada - Grilled Veggie', 'A crisp flat corn tortilla, covered with beans. Topped with lettuce, salsa fresca, sour cream, Monterey Jack and Cotija cheeses.', '15.75', 'A La Carte - Tostadas');
add('Tostada - Carnitas', 'A crisp flat corn tortilla, covered with beans. Topped with lettuce, salsa fresca, sour cream, Monterey Jack and Cotija cheeses.', '19.50', 'A La Carte - Tostadas');
add('Tostada - Carne Asada', 'A crisp flat corn tortilla, covered with beans. Topped with lettuce, salsa fresca, sour cream, Monterey Jack and Cotija cheeses.', '19.95', 'A La Carte - Tostadas');
add('Tostada - Chorizo', 'A crisp flat corn tortilla, covered with beans. Topped with lettuce, salsa fresca, sour cream, Monterey Jack and Cotija cheeses.', '18.75', 'A La Carte - Tostadas');
add('Tostada - Soy Chorizo', 'A crisp flat corn tortilla, covered with beans. Topped with lettuce, salsa fresca, sour cream, Monterey Jack and Cotija cheeses.', '18.75', 'A La Carte - Tostadas');
add('Tostada - Grilled Shrimp', 'A crisp flat corn tortilla, covered with beans. Topped with lettuce, salsa fresca, sour cream, Monterey Jack and Cotija cheeses.', '19.95', 'A La Carte - Tostadas');

// Tacos de Mariscos
add('Taco De Mariscos - Shrimp', 'A soft corn tortilla filled with your choice of fish or shrimp. Topped with cabbage, salsa fresca, and Mexican white sauce.', '9.75', 'A La Carte - Tacos De Mariscos');
add('Taco De Mariscos - Shrimp and Grilled Veggie', 'A soft corn tortilla filled with your choice of fish or shrimp. Topped with cabbage, salsa fresca, and Mexican white sauce.', '9.95', 'A La Carte - Tacos De Mariscos');
add('Taco De Mariscos - Grilled or Battered Fish', 'A soft corn tortilla filled with your choice of fish or shrimp. Topped with cabbage, salsa fresca, and Mexican white sauce.', '8.75', 'A La Carte - Tacos De Mariscos');

add('1/2 LB Hamburguesa', 'Served with lettuce, tomato, onion, and pickles.', '13.25', 'A La Carte');

// Tortas
add('Torta - Pollo Asado', 'A Mexican Telera Roll filled with your choice of meat, beans, Monterey Jack, lettuce, guacamole, and salsa fresca.', '18.95', 'A La Carte - Tortas');
add('Torta - Carne Asada', 'A Mexican Telera Roll filled with your choice of meat, beans, Monterey Jack, lettuce, guacamole, and salsa fresca.', '21.50', 'A La Carte - Tortas');
add('Torta - Carnitas', 'A Mexican Telera Roll filled with your choice of meat, beans, Monterey Jack, lettuce, guacamole, and salsa fresca.', '20.50', 'A La Carte - Tortas');
add('Torta - Grilled Fish', 'A Mexican Telera Roll filled with grilled fish, beans, cabbage, Mexican white sauce, salsa fresca.', '19.75', 'A La Carte - Tortas');

// SNACKS (Antojitos)
add('Nachos - Large', 'Homemade tortilla chips baked with Monterey Jack, jalapenos, sour cream, guacamole, and salsa fresca.', '18.50', 'Snacks');
add('Nachos - Small', 'Homemade tortilla chips baked with Monterey Jack, jalapenos, sour cream, guacamole, and salsa fresca.', '12.25', 'Snacks');
add('Guacamole - Large', '', '15.75', 'Snacks');
add('Guacamole - Small', '', '9.95', 'Snacks');
add('Cantina Queso Blanco', '', '10.50', 'Snacks');
add('Sonoran Crisp', 'An extra large crisp flour tortilla topped with melted Monterey Jack.', '10.50', 'Snacks');
add('Queso Fundido', 'Served with your choice of tortillas.', '8.50', 'Snacks');
add('Shrimp Ceviche', 'Shrimp marinated in lime juice, served in a spicy salsa fresca with diced avocados.', '23.75', 'Snacks');
add('Carne Asada Fries', 'Crispy seasoned fries piled high with tender grilled carne asada, melted cheese, fresh pico de gallo, guacamole, and cool sour cream.', '22.50', 'Snacks');
add('Jicama Con Chile Y Limon', 'Crisp jicama sticks sprinkled with chile and finished with a squeeze of fresh lime.', '5.95', 'Snacks');
add('Cantina Bean Dip', 'Refried beans, jalapenos, salsa, and Monterey Jack.', '10.50', 'Snacks');
add('Spicy Carrots Con Jalapenos', '', '3.75', 'Snacks');
add('Cheese Quesadilla', 'Large flour tortilla filled with melted Monterey Jack. Garnished with lettuce and salsa fresca.', '10.75', 'Snacks');
add('El Ranchero Special Cheese Crisp', 'Crisp flour tortilla covered with refried beans and Monterey Jack. Baked and topped with avocado slices, sour cream, and salsa fresca.', '13.25', 'Snacks');

// SOUPS
add('Pozole - Bowl', 'Stewed pork and hominy in a chicken and Pasilla chile broth, topped with avocado. Choice of tortillas.', '13.95', 'Soups');
add('Pozole - Cup', 'Stewed pork and hominy in a chicken and Pasilla chile broth, topped with avocado. Choice of tortillas.', '10.95', 'Soups');
add('Albondigas - Bowl', 'Vegetable soup with meatballs and special seasonings. Topped with cabbage and Cotija cheese. Choice of tortillas.', '13.95', 'Soups');
add('Albondigas - Cup', 'Vegetable soup with meatballs and special seasonings. Topped with cabbage and Cotija cheese. Choice of tortillas.', '10.95', 'Soups');
add('Chicken Tortilla Soup - Bowl', 'Hearty tomato based soup seasoned with garlic, cilantro, onion, dried Pasilla chiles, and spices. Shredded chicken, avocado, and crispy tortilla strips.', '13.95', 'Soups');
add('Chicken Tortilla Soup - Cup', 'Hearty tomato based soup seasoned with garlic, cilantro, onion, dried Pasilla chiles, and spices. Shredded chicken, avocado, and crispy tortilla strips.', '10.95', 'Soups');

// SALADS
add('De Casa Salad', 'Romaine lettuce, avocado slices, tomato, corn, sopa beans, onion, jicama, Cotija cheese, and crispy tortilla strips. Choice of dressing.', '18.25', 'Salads');
add('Grilled Caesar Salad', 'Lightly grilled Romaine lettuce, tomato, avocado, crispy tortilla strips, and a creamy Caesar dressing.', '18.25', 'Salads');
add('Side Salad', 'Romaine lettuce, tomato, onion, and avocado. Choice of dressing.', '8.25', 'Salads');

// HOUSE SPECIALS
add('Enchiladas Suizas - Chicken', '2 enchiladas baked in creamy homemade green cilantro cream sauce, topped with Monterey Jack and sliced avocado. Includes rice and refried beans.', '25.50', 'House Specials');
add('Enchiladas Suizas - Shrimp', '2 enchiladas baked in creamy homemade green cilantro cream sauce, topped with Monterey Jack and sliced avocado. Includes rice and refried beans.', '30.25', 'House Specials');
add('Chile Colorado - Pollo Asada', 'Grilled chicken or steak and onions sauteed in a spicy red chile sauce. Served with rice, refried beans, and tortillas.', '27.95', 'House Specials');
add('Chile Colorado - Carne Asada', 'Grilled chicken or steak and onions sauteed in a spicy red chile sauce. Served with rice, refried beans, and tortillas.', '31.50', 'House Specials');
add('Pollo Asado Plate', 'Marinated, grilled chicken breast served with a cheese enchilada, guacamole, rice, sopa beans, and tortillas.', '31.75', 'House Specials');
add('Fajitas - Pollo Asada', 'Specially seasoned grilled meat or shrimp, sauteed with onions and bell peppers. Served with refried beans, rice, guacamole, and tortillas.', '27.95', 'House Specials');
add('Fajitas - Carne Asada', 'Specially seasoned grilled meat or shrimp, sauteed with onions and bell peppers. Served with refried beans, rice, guacamole, and tortillas.', '31.25', 'House Specials');
add('Fajitas - Shrimp', 'Specially seasoned grilled meat or shrimp, sauteed with onions and bell peppers. Served with refried beans, rice, guacamole, and tortillas.', '32.50', 'House Specials');
add('Camarones al Mojo de Ajo', 'Shrimp sauteed in a garlic, chile, cilantro, butter sauce. Includes rice, refried beans, and choice of tortillas.', '28.50', 'House Specials');
add('Carnitas Michoacan', 'Tender pork braised in the traditional style of the Mexican state of Michoacan. Served with rice, refried beans, avocado, onions and tortillas.', '28.75', 'House Specials');
add('Chile Verde', 'Carnitas smothered in a green chile tomatillo sauce. Served with rice, refried beans, and tortillas.', '28.75', 'House Specials');
add('Carne Asada Plate', 'Marinated, grilled steak served with a cheese enchilada, guacamole, rice, sopa beans, and tortillas.', '31.75', 'House Specials');
add('Chile Relleno - Cheese Stuffed', 'Roasted pasilla chile, dipped in a light beer batter and fried crispy, baked in Ranchero sauce with melted Monterey Jack. Served with sour cream.', '13.50', 'House Specials');
add('Chile Relleno - Shrimp and Rice Stuffed', 'Roasted pasilla chile, dipped in a light beer batter and fried crispy, baked in Ranchero sauce with melted Monterey Jack. Served with sour cream.', '18.50', 'House Specials');

// KIDS MENU
add('Kids Chicken or Beef Crispy Taco', 'A crispy taco shell filled with your choice of seasoned chicken or beef, topped with cheese. Served with choice of rice or beans.', '5.50', 'Kids Menu');
add('Kids Bean & Cheese Burrito', 'A kid-sized burrito filled with warm beans and melted cheese. Served with choice of rice or beans.', '5.50', 'Kids Menu');
add('Kids Cheese Quesadilla', 'A warm, cheesy quesadilla. Served with choice of rice or beans.', '5.25', 'Kids Menu');
add('Kids Hamburger', 'A hamburger on a soft bun. Served with choice of rice, beans, or fries.', '6.75', 'Kids Menu');
add('Kids Nachos (No Sides)', 'A plate of crunchy chips covered in melted cheese.', '5.50', 'Kids Menu');
add('Kids Chicken or Beef Taquitos', 'Two crispy taquitos filled with your choice of chicken or beef. Served with rice and beans.', '7.25', 'Kids Menu');
add('Kids Chicken or Beef Burrito', 'Soft chicken or beef burrito. Served with choice of rice, beans, or fries.', '5.75', 'Kids Menu');
add('Kids Chicken or Beef Quesadilla', 'A cheese quesadilla packed with chicken or beef, served with choice of rice, beans, or fries.', '5.75', 'Kids Menu');
add('Kids Cheeseburger', 'A classic cheeseburger served on a soft bun. Served with choice of rice, beans, or fries.', '5.50', 'Kids Menu');
add('Kids Ice Cream', 'A scoop of ice cream.', '4.75', 'Kids Menu');

// DESSERT
add('Flan Especial', '', '8.50', 'Dessert');
add('Bunuelo', '', '9.75', 'Dessert');

const entry = {
  restaurantId: '2933',
  name: 'Verdes El Ranchero',
  sourceUrl: 'http://www.verdeselranchero.com/a-la-carte',
  confidence: 'high',
  crossCheckedAgainst: '',
  blocked: '',
  notes: 'Own site (Squarespace), full HTML text on every food subpage (7404 La Jolla Blvd matches work list). All eight food categories reached and captured: Breakfast, A La Carte (Burritos, Chimichanga, Taquitos, Enchiladas, Flautas, Tamales, Soft Tacos, Crispy Tacos, Tostadas, Tacos De Mariscos, Hamburguesa, Tortas), Snacks (Antojitos), Soups (Sopas), Salads (Ensaladas), House Specials (Especiales De La Casa), Kids Menu, and Dessert (Postre) -- this is the complete food menu. The site also has six drink pages (Margaritas, Tequila, Wine, Cocktails, Draft Beer, Bottle & Can Beer) listing drink names and descriptions but genuinely no price text anywhere in the raw HTML on any of the six pages -- confirmed by direct grep of the fetched bytes, not just a parsing miss. This reads as the restaurant choosing not to publish drink prices (bar menu priced only in-house) rather than a capture gap, so those items are omitted per the no-placeholder-price rule and the gap is named here rather than guessed at.',
  dishes
};

const path = 'menus/wip/result-60.json';
const arr = JSON.parse(fs.readFileSync(path, 'utf8'));
arr.push(entry);
fs.writeFileSync(path, JSON.stringify(arr, null, 1));
console.log('total entries now', arr.length, 'dishes', dishes.length);
