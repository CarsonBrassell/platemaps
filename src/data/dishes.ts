export type Dish = {
  id: string;
  name: string;
  /** One short line under the name — what's on the plate, not a review. */
  description?: string;
  price: string;
  section: string;
  yesVotes: number;
  noVotes: number;
};

export function dishStats(yesVotes: number, noVotes: number) {
  const total = yesVotes + noVotes;
  const pct = total > 0 ? Math.round((yesVotes / total) * 100) : null;
  return { total, pct };
}

// Sample menus, re-keyed to the ids in restaurants.ts. These are placeholder
// dishes, descriptions and prices, NOT extracted from any restaurant's real
// menu — run scripts/fetch-menus.mjs with an ANTHROPIC_API_KEY to replace them
// with real ones. Restaurants absent from this map have no menu yet, which the
// UI states rather than filling in.
export const dishesByRestaurant: Record<string, Dish[]> = {
  "1": [
    { id: "1-1", name: "Pretzel bites", description: "Warm and salted, with beer cheese", price: "$8.00", section: "Starters", yesVotes: 26, noVotes: 4 },
    { id: "1-2", name: "Nachos supreme", description: "Beans, jalapeños, crema, pickled onion", price: "$13.00", section: "Starters", yesVotes: 19, noVotes: 6 },
    { id: "1-3", name: "Tavern burger", description: "Double patty, aged cheddar, house sauce", price: "$15.00", section: "Mains", yesVotes: 33, noVotes: 5 },
    { id: "1-4", name: "BBQ chicken sandwich", description: "Grilled chicken, slaw, smoky barbecue", price: "$14.00", section: "Mains", yesVotes: 14, noVotes: 3 },
    { id: "1-5", name: "Beer-battered fish and chips", description: "Cod in ale batter, tartar, lemon", price: "$16.00", section: "Mains", yesVotes: 10, noVotes: 4 },
    { id: "1-6", name: "Chili cheese fries", description: "Fries under chili and melted cheddar", price: "$9.00", section: "Starters", yesVotes: 8, noVotes: 1 },
  ],
  "3": [
    { id: "3-1", name: "Loaded fries", description: "Bacon, cheddar, scallion, ranch", price: "$9.00", section: "Starters", yesVotes: 22, noVotes: 3 },
    { id: "3-2", name: "Buffalo wings", description: "Fried crisp, tossed hot, blue cheese", price: "$12.00", section: "Starters", yesVotes: 31, noVotes: 6 },
    { id: "3-3", name: "Gaslamp burger", description: "Half pound, cheddar, brioche bun", price: "$16.00", section: "Mains", yesVotes: 44, noVotes: 5 },
    { id: "3-4", name: "Ribeye steak", description: "12 oz, herb butter, fries", price: "$32.00", section: "Mains", yesVotes: 18, noVotes: 7 },
    { id: "3-5", name: "Grilled salmon", description: "Lemon, capers, seasonal vegetables", price: "$24.00", section: "Mains", yesVotes: 12, noVotes: 4 },
    { id: "3-6", name: "Mac and cheese", description: "Three cheeses, toasted breadcrumbs", price: "$10.00", section: "Mains", yesVotes: 9, noVotes: 2 },
  ],
  "4": [
    { id: "4-1", name: "Street tacos", description: "Three corn tortillas, onion, cilantro", price: "$9.00", section: "Mains", yesVotes: 24, noVotes: 3 },
    { id: "4-2", name: "Carne asada fries", description: "Fries, steak, guacamole, crema", price: "$11.00", section: "Starters", yesVotes: 17, noVotes: 4 },
    { id: "4-3", name: "Enchiladas verdes", description: "Chicken, tomatillo salsa, queso fresco", price: "$13.00", section: "Mains", yesVotes: 10, noVotes: 2 },
    { id: "4-4", name: "Chile relleno", description: "Poblano stuffed with cheese, ranchera", price: "$12.00", section: "Mains", yesVotes: 6, noVotes: 3 },
    { id: "4-5", name: "Horchata", description: "Rice and cinnamon, poured over ice", price: "$4.00", section: "Drinks", yesVotes: 7, noVotes: 0 },
  ],
  "5": [
    { id: "5-1", name: "Wood-fired focaccia", description: "Rosemary, sea salt, olive oil", price: "$8.00", section: "Starters", yesVotes: 31, noVotes: 3 },
    { id: "5-2", name: "Burrata", description: "Heirloom tomato, basil, grilled bread", price: "$16.00", section: "Starters", yesVotes: 24, noVotes: 7 },
    { id: "5-3", name: "Charred octopus", description: "Potato, chorizo, smoked paprika", price: "$19.00", section: "Starters", yesVotes: 12, noVotes: 6 },
    { id: "5-4", name: "Wood-fired oysters", description: "Garlic butter and lemon, each", price: "$4.00", section: "Wood-Fired", yesVotes: 28, noVotes: 2 },
    { id: "5-5", name: "Whole roasted branzino", description: "Herbs, charred lemon, serves two", price: "$36.00", section: "Wood-Fired", yesVotes: 14, noVotes: 9 },
    { id: "5-6", name: "Duck breast", description: "Crisp skin, cherry, farro", price: "$34.00", section: "Mains", yesVotes: 17, noVotes: 4 },
    { id: "5-7", name: "Short rib pappardelle", description: "Slow braised, wide ribbons, parmesan", price: "$29.00", section: "Mains", yesVotes: 9, noVotes: 8 },
    { id: "5-8", name: "Mushroom risotto", description: "Wild mushrooms, thyme, mascarpone", price: "$26.00", section: "Mains", yesVotes: 4, noVotes: 3 },
    { id: "5-9", name: "Butterscotch budino", description: "Salted caramel, cream, olive oil", price: "$11.00", section: "Desserts", yesVotes: 20, noVotes: 1 },
    { id: "5-10", name: "Affogato", description: "Espresso poured over gelato", price: "$9.00", section: "Desserts", yesVotes: 2, noVotes: 0 },
  ],
  "6": [
    { id: "6-1", name: "Deviled eggs", description: "Smoked paprika, chive, crisp shallot", price: "$9.00", section: "Starters", yesVotes: 18, noVotes: 4 },
    { id: "6-2", name: "Crispy brussels sprouts", description: "Fried hard, lemon, chili honey", price: "$11.00", section: "Starters", yesVotes: 26, noVotes: 3 },
    { id: "6-3", name: "Kale caesar", description: "Shaved parmesan, garlic croutons", price: "$13.00", section: "Salads", yesVotes: 9, noVotes: 6 },
    { id: "6-4", name: "Beet salad", description: "Roasted beets, goat cheese, pistachio", price: "$12.00", section: "Salads", yesVotes: 5, noVotes: 5 },
    { id: "6-5", name: "Prime burger", description: "Dry-aged beef, gruyère, onion jam", price: "$18.00", section: "Entrees", yesVotes: 37, noVotes: 5 },
    { id: "6-6", name: "Roasted chicken", description: "Half bird, pan jus, bitter greens", price: "$24.00", section: "Entrees", yesVotes: 14, noVotes: 7 },
    { id: "6-7", name: "Braised short rib", description: "Red wine, potato purée", price: "$29.00", section: "Entrees", yesVotes: 16, noVotes: 2 },
    { id: "6-8", name: "Salmon", description: "Seared, lentils, salsa verde", price: "$27.00", section: "Entrees", yesVotes: 4, noVotes: 4 },
    { id: "6-9", name: "Butterscotch pot de creme", description: "Chilled custard, whipped cream", price: "$9.00", section: "Desserts", yesVotes: 12, noVotes: 1 },
    { id: "6-10", name: "Seasonal cobbler", description: "Whatever's ripe, vanilla ice cream", price: "$9.00", section: "Desserts", yesVotes: 0, noVotes: 0 },
  ],
  "7": [
    { id: "7-1", name: "Toro nigiri", description: "Fatty bluefin belly, two pieces", price: "$9.00", section: "Nigiri", yesVotes: 44, noVotes: 2 },
    { id: "7-2", name: "Uni nigiri", description: "Santa Barbara sea urchin, nori", price: "$11.00", section: "Nigiri", yesVotes: 27, noVotes: 10 },
    { id: "7-3", name: "Yellowtail nigiri", description: "Hamachi with a touch of yuzu", price: "$6.50", section: "Nigiri", yesVotes: 30, noVotes: 3 },
    { id: "7-4", name: "Salmon nigiri", description: "King salmon over warm rice", price: "$5.50", section: "Nigiri", yesVotes: 19, noVotes: 5 },
    { id: "7-5", name: "Spicy tuna roll", description: "Chopped tuna, chili mayo, scallion", price: "$8.00", section: "Rolls", yesVotes: 22, noVotes: 6 },
    { id: "7-6", name: "Dragon roll", description: "Eel and avocado over shrimp tempura", price: "$14.00", section: "Rolls", yesVotes: 15, noVotes: 8 },
    { id: "7-7", name: "Rainbow roll", description: "California roll under assorted sashimi", price: "$15.00", section: "Rolls", yesVotes: 10, noVotes: 3 },
    { id: "7-8", name: "Edamame", description: "Steamed, sea salt", price: "$5.00", section: "Appetizers", yesVotes: 6, noVotes: 2 },
    { id: "7-9", name: "Miso soup", description: "Tofu, wakame, scallion", price: "$3.50", section: "Appetizers", yesVotes: 3, noVotes: 3 },
    { id: "7-10", name: "Omakase (chef's choice)", description: "Roughly twelve courses, whatever's best", price: "$85.00", section: "Specials", yesVotes: 33, noVotes: 1 },
  ],
  "8": [
    { id: "8-1", name: "Marlin taco", description: "Smoked marlin, cabbage, chipotle crema", price: "$4.50", section: "Tacos", yesVotes: 61, noVotes: 4 },
    { id: "8-2", name: "Shrimp taco", description: "Grilled shrimp, pico, avocado", price: "$4.50", section: "Tacos", yesVotes: 38, noVotes: 9 },
    { id: "8-3", name: "Fish taco, battered", description: "Fried cod, cabbage, white sauce", price: "$4.00", section: "Tacos", yesVotes: 22, noVotes: 14 },
    { id: "8-4", name: "Octopus taco", description: "Grilled pulpo, salsa negra", price: "$5.25", section: "Tacos", yesVotes: 17, noVotes: 2 },
    { id: "8-5", name: "Scallop tostada", description: "Raw scallop, cucumber, soy and lime", price: "$8.50", section: "Tostadas", yesVotes: 29, noVotes: 3 },
    { id: "8-6", name: "Ceviche tostada", description: "Lime-cured fish, onion, cilantro", price: "$7.75", section: "Tostadas", yesVotes: 14, noVotes: 6 },
    { id: "8-7", name: "Shrimp aguachile tostada", description: "Raw shrimp, chile-lime, cucumber", price: "$8.75", section: "Tostadas", yesVotes: 6, noVotes: 1 },
    { id: "8-8", name: "Whole grilled branzino", description: "Butterflied, garlic, grilled lemon", price: "$24.00", section: "Specialties", yesVotes: 19, noVotes: 5 },
    { id: "8-9", name: "Seafood molcajete", description: "Shrimp, octopus and fish in hot stone", price: "$28.00", section: "Specialties", yesVotes: 11, noVotes: 10 },
    { id: "8-10", name: "Shrimp cocktail", description: "Chilled, tomato-lime broth, avocado", price: "$12.00", section: "Specialties", yesVotes: 3, noVotes: 1 },
    { id: "8-11", name: "Horchata", description: "Rice and cinnamon, over ice", price: "$3.50", section: "Drinks", yesVotes: 8, noVotes: 1 },
    { id: "8-12", name: "Jamaica agua fresca", description: "Hibiscus, lightly sweetened", price: "$3.50", section: "Drinks", yesVotes: 0, noVotes: 0 },
  ],
  "10": [
    { id: "10-1", name: "Stack of pancakes", description: "Three buttermilk, butter, syrup", price: "$9.00", section: "Breakfast", yesVotes: 14, noVotes: 1 },
    { id: "10-2", name: "Denver omelet", description: "Ham, pepper, onion, cheddar", price: "$11.00", section: "Breakfast", yesVotes: 8, noVotes: 2 },
    { id: "10-3", name: "Patty melt", description: "Griddled rye, swiss, grilled onion", price: "$12.00", section: "Mains", yesVotes: 10, noVotes: 3 },
    { id: "10-4", name: "Chicken fried steak", description: "Country gravy and two eggs", price: "$14.00", section: "Mains", yesVotes: 5, noVotes: 4 },
    { id: "10-5", name: "Milkshake", description: "Hand-spun, your flavor", price: "$6.00", section: "Drinks", yesVotes: 9, noVotes: 0 },
  ],
  "11": [
    { id: "11-1", name: "Fish tacos", description: "Two grilled, cabbage, lime crema", price: "$10.00", section: "Mains", yesVotes: 41, noVotes: 4 },
    { id: "11-2", name: "Clam chowder", description: "New England style, oyster crackers", price: "$8.00", section: "Starters", yesVotes: 22, noVotes: 2 },
    { id: "11-3", name: "Grilled swordfish", description: "Local catch, herb butter", price: "$26.00", section: "Mains", yesVotes: 16, noVotes: 3 },
    { id: "11-4", name: "Lobster roll", description: "Cold claw meat, buttered bun", price: "$19.00", section: "Mains", yesVotes: 13, noVotes: 5 },
    { id: "11-5", name: "Ceviche", description: "Citrus-cured, avocado, chips", price: "$12.00", section: "Starters", yesVotes: 9, noVotes: 1 },
    { id: "11-6", name: "Calamari", description: "Flash fried, lemon aioli", price: "$11.00", section: "Starters", yesVotes: 7, noVotes: 3 },
  ],
  "12": [
    { id: "12-1", name: "Fish tacos", description: "Grilled or battered, house slaw", price: "$9.00", section: "Mains", yesVotes: 18, noVotes: 1 },
    { id: "12-2", name: "Shrimp tostada", description: "Crisp shell, shrimp, avocado", price: "$10.00", section: "Mains", yesVotes: 9, noVotes: 2 },
    { id: "12-3", name: "Grilled mahi plate", description: "Rice, beans, grilled vegetables", price: "$17.00", section: "Mains", yesVotes: 8, noVotes: 2 },
    { id: "12-4", name: "Coconut shrimp", description: "Crisp coconut crust, sweet chili", price: "$12.00", section: "Starters", yesVotes: 5, noVotes: 3 },
    { id: "12-5", name: "Fish burger", description: "Fried fillet, tartar, pickles", price: "$11.00", section: "Mains", yesVotes: 4, noVotes: 1 },
  ],
  "16": [
    { id: "16-1", name: "Al pastor taco", description: "Trompo pork, pineapple, onion", price: "$3.25", section: "Tacos", yesVotes: 54, noVotes: 6 },
    { id: "16-2", name: "Carne asada taco", description: "Grilled steak, cilantro, salsa roja", price: "$3.50", section: "Tacos", yesVotes: 41, noVotes: 8 },
    { id: "16-3", name: "Carnitas taco", description: "Slow-cooked pork, crisped edges", price: "$3.25", section: "Tacos", yesVotes: 20, noVotes: 5 },
    { id: "16-4", name: "Nopales taco", description: "Grilled cactus, queso fresco", price: "$3.00", section: "Tacos", yesVotes: 9, noVotes: 7 },
    { id: "16-5", name: "California burrito", description: "Carne asada, fries, cheese, crema", price: "$10.50", section: "Burritos", yesVotes: 33, noVotes: 2 },
    { id: "16-6", name: "Bean and cheese burrito", description: "Refried beans, melted cheddar", price: "$6.50", section: "Burritos", yesVotes: 12, noVotes: 4 },
    { id: "16-7", name: "Chips and guac", description: "Guacamole made to order, warm chips", price: "$5.00", section: "Sides", yesVotes: 16, noVotes: 3 },
    { id: "16-8", name: "Elote", description: "Grilled corn, crema, cotija, chile", price: "$4.50", section: "Sides", yesVotes: 5, noVotes: 0 },
    { id: "16-9", name: "Rice and beans", description: "Spanish rice, refried pintos", price: "$3.75", section: "Sides", yesVotes: 4, noVotes: 4 },
    { id: "16-10", name: "Jarritos", description: "Mexican soda, several flavors", price: "$2.50", section: "Drinks", yesVotes: 0, noVotes: 0 },
  ],
  "18": [
    { id: "18-1", name: "Margherita pizza", description: "San Marzano, mozzarella, basil", price: "$15.00", section: "Mains", yesVotes: 18, noVotes: 2 },
    { id: "18-2", name: "Fettuccine alfredo", description: "Butter, cream, parmesan", price: "$17.00", section: "Mains", yesVotes: 12, noVotes: 3 },
    { id: "18-3", name: "Osso buco", description: "Braised veal shank, gremolata", price: "$28.00", section: "Mains", yesVotes: 9, noVotes: 2 },
    { id: "18-4", name: "Tiramisu", description: "Espresso-soaked ladyfingers, mascarpone", price: "$8.00", section: "Desserts", yesVotes: 11, noVotes: 0 },
    { id: "18-5", name: "Caprese salad", description: "Tomato, mozzarella, basil, olive oil", price: "$12.00", section: "Starters", yesVotes: 6, noVotes: 1 },
  ],
  "19": [
    { id: "19-1", name: "Wedge salad", description: "Iceberg, blue cheese, bacon", price: "$11.00", section: "Starters", yesVotes: 8, noVotes: 2 },
    { id: "19-2", name: "New York strip", description: "14 oz, dry-aged, herb butter", price: "$34.00", section: "Mains", yesVotes: 12, noVotes: 3 },
    { id: "19-3", name: "Lobster bisque", description: "Cream, sherry, lobster meat", price: "$10.00", section: "Starters", yesVotes: 7, noVotes: 1 },
    { id: "19-4", name: "Creme brulee", description: "Vanilla custard, torched sugar", price: "$9.00", section: "Desserts", yesVotes: 6, noVotes: 0 },
  ],
  "20": [
    { id: "20-1", name: "Brisket plate", description: "Sliced, two sides, pickles", price: "$17.00", section: "Mains", yesVotes: 22, noVotes: 2 },
    { id: "20-2", name: "Pulled pork sandwich", description: "Smoked shoulder, slaw, soft bun", price: "$12.00", section: "Mains", yesVotes: 19, noVotes: 3 },
    { id: "20-3", name: "Baby back ribs", description: "Half rack, dry rub, sauce on side", price: "$19.00", section: "Mains", yesVotes: 16, noVotes: 2 },
    { id: "20-4", name: "Smoked mac and cheese", description: "Smoked cheddar, crisp top", price: "$8.00", section: "Starters", yesVotes: 11, noVotes: 1 },
    { id: "20-5", name: "Cornbread", description: "Skillet-baked, honey butter", price: "$4.00", section: "Starters", yesVotes: 8, noVotes: 0 },
  ],
  "26": [
    { id: "26-1", name: "Crab cakes", description: "Lump crab, remoulade, little filler", price: "$16.00", section: "Starters", yesVotes: 19, noVotes: 2 },
    { id: "26-2", name: "Ahi tuna tartare", description: "Sesame, avocado, wonton crisps", price: "$17.00", section: "Starters", yesVotes: 14, noVotes: 3 },
    { id: "26-3", name: "Grilled branzino", description: "Whole fish, lemon, olive oil", price: "$28.00", section: "Mains", yesVotes: 12, noVotes: 2 },
    { id: "26-4", name: "Filet mignon", description: "8 oz, red wine reduction", price: "$36.00", section: "Mains", yesVotes: 9, noVotes: 4 },
    { id: "26-5", name: "Key lime pie", description: "Graham crust, whipped cream", price: "$9.00", section: "Desserts", yesVotes: 11, noVotes: 1 },
  ],
  "27": [
    { id: "27-1", name: "Al pastor tacos", description: "Three, pineapple, onion, cilantro", price: "$8.00", section: "Mains", yesVotes: 21, noVotes: 2 },
    { id: "27-2", name: "Carnitas burrito", description: "Pork, rice, beans, salsa verde", price: "$10.00", section: "Mains", yesVotes: 13, noVotes: 3 },
    { id: "27-3", name: "Quesabirria", description: "Three dipped tacos, consommé", price: "$12.00", section: "Mains", yesVotes: 16, noVotes: 1 },
    { id: "27-4", name: "Tamales", description: "Two, masa steamed in the husk", price: "$9.00", section: "Mains", yesVotes: 5, noVotes: 2 },
    { id: "27-5", name: "Agua fresca", description: "Made fresh daily, ask the flavor", price: "$3.00", section: "Drinks", yesVotes: 4, noVotes: 0 },
  ],
  "28": [
    { id: "28-1", name: "Burrata toast", description: "Grilled sourdough, tomato, basil", price: "$13.00", section: "Starters", yesVotes: 17, noVotes: 2 },
    { id: "28-2", name: "Roasted beet salad", description: "Citrus, goat cheese, hazelnut", price: "$12.00", section: "Starters", yesVotes: 8, noVotes: 4 },
    { id: "28-3", name: "Pan-seared halibut", description: "Brown butter, spring vegetables", price: "$27.00", section: "Mains", yesVotes: 15, noVotes: 3 },
    { id: "28-4", name: "Braised short rib", description: "Soft polenta, red wine jus", price: "$26.00", section: "Mains", yesVotes: 12, noVotes: 2 },
    { id: "28-5", name: "Butternut risotto", description: "Sage, brown butter, parmesan", price: "$22.00", section: "Mains", yesVotes: 5, noVotes: 5 },
    { id: "28-6", name: "Lemon tart", description: "Torched meringue, shortbread crust", price: "$9.00", section: "Desserts", yesVotes: 9, noVotes: 1 },
  ],
  "34": [
    { id: "34-1", name: "Cobb salad", description: "Chicken, bacon, egg, blue cheese", price: "$13.00", section: "Mains", yesVotes: 11, noVotes: 3 },
    { id: "34-2", name: "Grilled chicken sandwich", description: "Avocado, lettuce, garlic aioli", price: "$12.00", section: "Mains", yesVotes: 9, noVotes: 4 },
    { id: "34-3", name: "Classic cheeseburger", description: "Cheddar, lettuce, tomato, pickles", price: "$13.00", section: "Mains", yesVotes: 18, noVotes: 2 },
    { id: "34-4", name: "Fish and chips", description: "Beer-battered cod, tartar", price: "$15.00", section: "Mains", yesVotes: 6, noVotes: 3 },
    { id: "34-5", name: "Loaded nachos", description: "Cheese, beans, jalapeños, crema", price: "$10.00", section: "Starters", yesVotes: 5, noVotes: 2 },
  ],
  "35": [
    { id: "35-1", name: "Classic ahi poke bowl", description: "Shoyu ahi, rice, seaweed salad", price: "$13.00", section: "Bowls", yesVotes: 26, noVotes: 2 },
    { id: "35-2", name: "Spicy tuna bowl", description: "Chili aioli, cucumber, scallion", price: "$14.00", section: "Bowls", yesVotes: 19, noVotes: 3 },
    { id: "35-3", name: "Salmon poke bowl", description: "Ponzu salmon, avocado, edamame", price: "$13.00", section: "Bowls", yesVotes: 15, noVotes: 2 },
    { id: "35-4", name: "Edamame", description: "Steamed, sea salt", price: "$4.00", section: "Sides", yesVotes: 8, noVotes: 1 },
    { id: "35-5", name: "Miso soup", description: "Tofu, scallion, wakame", price: "$3.00", section: "Sides", yesVotes: 5, noVotes: 0 },
  ],
};
