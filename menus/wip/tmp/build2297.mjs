import fs from 'fs';

const dishes = [
 // Breakfast/Brunch
 {name:'Overnight Oats', description:'Rolled Old Fashion Oats, Overnight Oats, Vermont Maple Syrup, Banana, Toasted Almonds, HoneyComb, strawberry', price:'$12.00', section:'Breakfast/Brunch'},
 {name:'Avocado Toast', description:'Artisan Mutigrain, Micro Greens, Heirloom Cherry Tomato, Balsamic Glaze, Hard Boiled Egg, side-Seasonal Fruits', price:'$15.00', section:'Breakfast/Brunch'},
 {name:'Breakfast Sandwich', description:'Thick Cut Brioche, Egg, Melted Cheddar, Turkey Bacon, Side-Seasonal Fruits', price:'$13.00', section:'Breakfast/Brunch'},
 {name:'Breakfast Pizza', description:'Flat Bread, Feather Jack, Cheddar, Turkey Sausage, Turkey Bacon, Poached Eggs, Side-Seasonal Fruits', price:'$18.00', section:'Breakfast/Brunch'},
 {name:'Breakfast Burrito', description:'Egg, Potato Fries, Salsa Verde, Turkey Sausage, Feather Jack Cheese, Green Chiles, Side-Seasonal Fruits', price:'$15.00', section:'Breakfast/Brunch'},
 {name:'Benedict Sando', description:'English Muffin, Turkey Bacon, Havarti, Poached Eggs, Homemade Hollandaise Sauce, Mixed Greens, Side-Seasonal Fruits', price:'$18.00', section:'Breakfast/Brunch'},
 {name:'Turkey Croque Madame', description:'Oven Roasted Turkey, Swiss, Thick Cut Brioche, Bechamel, Greens, Cherry Tomato, Hard Boiled Egg, Side-Seasonal Fruits', price:'$18.00', section:'Breakfast/Brunch'},
 // Specials/Bagels
 {name:'Cream Cheese Bagel', description:'Choose your bagel: plain, sesame, everything, jalapeno cheddar', price:'$5.00', section:'Specials/Bagels'},
 {name:'Butter & Jam Bagel', description:'Choose your bagel: plain, sesame, everything, jalapeno cheddar', price:'$5.00', section:'Specials/Bagels'},
 {name:"Chef's Favorite", description:'Smashed Avocado, Egg, Melted Cheddar, Turkey Bacon, Side-Seasonal Fruits', price:'$15.00', section:'Specials/Bagels'},
 {name:'Lox Bagel (Open Face)', description:'Cream Cheese, Smashed Avocado, Smoked Salmon, Pickled Onion, Capers, Side-Seasonal Fruits', price:'$18.00', section:'Specials/Bagels'},
 {name:'Classic BLT', description:'Aioli Spread, Turkey Bacon, Lettuce, Tomato, Side-Seasonal Fruits. Add Avocado $2.50', price:'$12.00', section:'Specials/Bagels'},
 {name:'Market Street', description:'Aioli Spread, Turkey Bacon, Lettuce, Tomato, Side-Seasonal Fruits. Add Avocado $2.50, Add Turkey Bacon $5', price:'$10.00', section:'Specials/Bagels'},
 {name:'Chilaquiles', description:'Tortilla Chips, Homemade Salsa Verde, Two Poached Eggs, Sour Cream, Queso Fresco, Pickled Onions, Side-Seasonal Fruits. Add Chicken $6.00', price:'$19.00', section:'Specials/Bagels'},
 {name:'Grilled Cheese & Soup', description:'Thick Cut Brioche, Havarti, Feather Jack, Boursin, Swiss, Cheddar, Creamy Tomato Basil Soup, Side-Seasonal Fruits', price:'$16.00', section:'Specials/Bagels'},
 // Acai/Waffles
 {name:'Classic Waffle', description:'Whipped Cream, Strawberry, Banana, Butter, Maple Syrup, Powdered Sugar', price:'$13.00', section:'Acai/Waffles'},
 {name:'Berries Waffle', description:'Mixed Local Berries, Peanut Butter, Banana, Crunchy Granola, Powdered Sugar, Butter, Maple Syrup', price:'$15.00', section:'Acai/Waffles'},
 {name:"Tiger's Waffle", description:'Two Poached Eggs, Turkey Bacon, Salt & Pepper, Maple Syrup, Side-Seasonal Fruits', price:'$17.00', section:'Acai/Waffles'},
 {name:'Classic Acai', description:'Strawberry, Banana, Crunchy Granola, Toasted Coconut, Honey', price:'$12.00', section:'Acai/Waffles'},
 {name:'Mixed Berries Acai', description:'Mixed Local Berries, Crunchy Granola, Peanut Butter, Toasted Coconut', price:'$15.00', section:'Acai/Waffles'},
 {name:'Tropical Acai', description:'Strawberry, Pineapple, Crunchy Granola, Almonds, Toasted Coconut, Honey', price:'$14.00', section:'Acai/Waffles'},
 // Lunch
 {name:'Lox Toast', description:'Artisan Multigrain Bread, Boursin, Tomato, Smoked Salmon, Pickled Onions, Dill, Lemon Juice, Side-Seasonal Fruits', price:'$18.00', section:'Lunch'},
 {name:'Chicken Club', description:'Thick Cut Brioche, Aioli Spread, Grilled Chicken Breast, Havarti, Greens, Tomato, Red Onion, Side-Seasonal Fruits', price:'$15.00', section:'Lunch'},
 {name:'Chicken Aioli', description:'Thick Cut Brioche, Aioli Spread, Grilled Chicken Breast, Havarti, Greens, Tomato, Red Onion, Side-Seasonal Fruits', price:'$15.00', section:'Lunch'},
 {name:'Cheese Pizza', description:'Flat Bread, Marinara Sauce, Feather Jack Cheese, Oregano, Side-Seasonal Fruits', price:'$14.00', section:'Lunch'},
 {name:'BBQ Chicken Pizza', description:'Flat Bread, BBQ Sauce, Feather Jack Cheese, Grilled Chicken Breast, Red Onion, Side-Seasonal Fruits', price:'$18.00', section:'Lunch'},
 {name:"Tiger's House Salad", description:'Greens, tomato, red onion. Add chicken $6.00', price:'$10.00', section:'Lunch'},
 {name:'Caesar Salad', description:'Creamy Caesar Dressing, Lettuce, Homemade Croutons, Parmesan. Add chicken $6.00. Gluten free options available upon request', price:'$10.00', section:'Lunch'},
 // Drinks - Coffee
 {name:'Espresso', description:'', price:'$3.75', section:'Drinks - Coffee'},
 {name:'Cortado', description:'', price:'$4.75', section:'Drinks - Coffee'},
 {name:'Cappuccino', description:'', price:'$5.50', section:'Drinks - Coffee'},
 // Brewed Crafts
 {name:'House Coffee', description:'', price:'$4.75 - $5.25', section:'Drinks - Brewed Crafts'},
 {name:'Iced Coffee', description:'', price:'$5.25 - $5.75', section:'Drinks - Brewed Crafts'},
 {name:'Americano', description:'', price:'$5.50 - $6.50', section:'Drinks - Brewed Crafts'},
 {name:'Cold Brew', description:'', price:'$6.25 - $7.25', section:'Drinks - Brewed Crafts'},
 {name:'Mocha Fomo', description:'Cold brew, half & half, chocolate, cold foam', price:'$7.00 - $7.50', section:'Drinks - Brewed Crafts'},
 // Signature Crafts
 {name:'Tiger Eye', description:'Espresso, Coconut, Matcha', price:'$6.25 - $7.25', section:'Drinks - Signature Crafts'},
 {name:'Matchata', description:'Horchata, Matcha', price:'$5.75 - $6.75', section:'Drinks - Signature Crafts'},
 {name:'Nutella Latte', description:'', price:'$7.50 - $8.25', section:'Drinks - Signature Crafts'},
 {name:'Coconut Latte', description:'', price:'$6.00 - $7.00', section:'Drinks - Signature Crafts'},
 {name:'Dirty Horchata', description:'', price:'$6.25 - $7.25', section:'Drinks - Signature Crafts'},
 {name:'Miel Fomo', description:'Espresso, Vanilla, Honey, Coconut, Cinnamon', price:'$7.00 - $8.00', section:'Drinks - Signature Crafts'},
 // Lattes
 {name:'Latte', description:'', price:'$6.00 - $6.50', section:'Drinks - Lattes'},
 {name:'Mocha', description:'', price:'$6.25 - $6.75', section:'Drinks - Lattes'},
 {name:'White Mocha', description:'', price:'$6.00 - $6.25', section:'Drinks - Lattes'},
 {name:'Caramel Macchiato', description:'', price:'$6.25 - $6.75', section:'Drinks - Lattes'},
 // Non-Coffee
 {name:'Matcha Latte', description:'', price:'$5.75 - $6.25', section:'Drinks - Non-Coffee'},
 {name:'Chai Tea Latte', description:'', price:'$5.75 - $6.25', section:'Drinks - Non-Coffee'},
 {name:'Horchata', description:'', price:'$5.75 - $6.25', section:'Drinks - Non-Coffee'},
 {name:'Hot Chocolate', description:'', price:'$5.00 - $5.75', section:'Drinks - Non-Coffee'},
 // Refreshers
 {name:'Iced Tea', description:'', price:'$5.50 - $6.25', section:'Drinks - Refreshers'},
 {name:'Lemonada', description:'', price:'$5.25 - $6.00', section:'Drinks - Refreshers'},
 {name:"Tiger's Blood", description:'', price:'$5.75 - $6.25', section:'Drinks - Refreshers'},
 {name:'Orange Juice', description:'', price:'$5.75 - $6.25', section:'Drinks - Refreshers'},
 {name:'Berry Hibiscus', description:'', price:'$6.00 - $6.75', section:'Drinks - Refreshers'},
 {name:'Strawberry Bliss', description:'', price:'$6.00 - $6.75', section:'Drinks - Refreshers'},
 // Teas
 {name:'Earl Gray', description:'', price:'$6.00', section:'Drinks - Teas'},
 {name:'English Breakfast', description:'', price:'$6.00', section:'Drinks - Teas'},
 {name:'Jasmine Green', description:'', price:'$6.00', section:'Drinks - Teas'},
 {name:'Passion Peach', description:'', price:'$6.00', section:'Drinks - Teas'},
 {name:'Raspberry', description:'', price:'$6.00', section:'Drinks - Teas'},
];

const entry = {
  restaurantId: '2297',
  name: 'Tiger Cafe',
  sourceUrl: 'https://tigercafeinc.com/menu',
  confidence: 'high',
  crossCheckedAgainst: '',
  blocked: '',
  notes: 'Full priced HTML menu on the restaurant\'s own site (345 Market Street matches the work list; the Market Street sandwich is even named after it). All sections reached: Breakfast/Brunch, Specials/Bagels, Acai/Waffles, Lunch, and a full Drinks Menu (Coffee, Brewed Crafts, Signature Crafts, Lattes, Non-Coffee, Refreshers, Teas). Drink prices are ranges printed on the page for small/large cup sizes (hot 12/16oz, cold 16/20oz); recorded as printed rather than picking one size.',
  dishes
};

const path = 'menus/wip/result-60.json';
const arr = JSON.parse(fs.readFileSync(path, 'utf8'));
arr.push(entry);
fs.writeFileSync(path, JSON.stringify(arr, null, 1));
console.log('total entries now', arr.length, 'dishes', dishes.length);
