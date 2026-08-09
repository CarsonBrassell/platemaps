export type Dish = {
  id: string;
  name: string;
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
// dishes and prices, NOT extracted from any restaurant's real menu â€” run
// scripts/fetch-menus.mjs with an ANTHROPIC_API_KEY to replace them with
// real ones. Restaurants absent from this map have no menu yet, which the
// UI states rather than filling in.
export const dishesByRestaurant: Record<string, Dish[]> = {
  "1": [
    { id: "1-1", name: "Pretzel bites", price: "$8.00", section: "Starters", yesVotes: 26, noVotes: 4 },
    { id: "1-2", name: "Nachos supreme", price: "$13.00", section: "Starters", yesVotes: 19, noVotes: 6 },
    { id: "1-3", name: "Tavern burger", price: "$15.00", section: "Mains", yesVotes: 33, noVotes: 5 },
    { id: "1-4", name: "BBQ chicken sandwich", price: "$14.00", section: "Mains", yesVotes: 14, noVotes: 3 },
    { id: "1-5", name: "Beer-battered fish and chips", price: "$16.00", section: "Mains", yesVotes: 10, noVotes: 4 },
    { id: "1-6", name: "Chili cheese fries", price: "$9.00", section: "Starters", yesVotes: 8, noVotes: 1 },
  ],
  "3": [
    { id: "3-1", name: "Loaded fries", price: "$9.00", section: "Starters", yesVotes: 22, noVotes: 3 },
    { id: "3-2", name: "Buffalo wings", price: "$12.00", section: "Starters", yesVotes: 31, noVotes: 6 },
    { id: "3-3", name: "Gaslamp burger", price: "$16.00", section: "Mains", yesVotes: 44, noVotes: 5 },
    { id: "3-4", name: "Ribeye steak", price: "$32.00", section: "Mains", yesVotes: 18, noVotes: 7 },
    { id: "3-5", name: "Grilled salmon", price: "$24.00", section: "Mains", yesVotes: 12, noVotes: 4 },
    { id: "3-6", name: "Mac and cheese", price: "$10.00", section: "Mains", yesVotes: 9, noVotes: 2 },
  ],
  "4": [
    { id: "4-1", name: "Street tacos", price: "$9.00", section: "Mains", yesVotes: 24, noVotes: 3 },
    { id: "4-2", name: "Carne asada fries", price: "$11.00", section: "Starters", yesVotes: 17, noVotes: 4 },
    { id: "4-3", name: "Enchiladas verdes", price: "$13.00", section: "Mains", yesVotes: 10, noVotes: 2 },
    { id: "4-4", name: "Chile relleno", price: "$12.00", section: "Mains", yesVotes: 6, noVotes: 3 },
    { id: "4-5", name: "Horchata", price: "$4.00", section: "Drinks", yesVotes: 7, noVotes: 0 },
  ],
  "5": [
    { id: "5-1", name: "Wood-fired focaccia", price: "$8.00", section: "Starters", yesVotes: 31, noVotes: 3 },
    { id: "5-2", name: "Burrata", price: "$16.00", section: "Starters", yesVotes: 24, noVotes: 7 },
    { id: "5-3", name: "Charred octopus", price: "$19.00", section: "Starters", yesVotes: 12, noVotes: 6 },
    { id: "5-4", name: "Wood-fired oysters", price: "$4.00", section: "Wood-Fired", yesVotes: 28, noVotes: 2 },
    { id: "5-5", name: "Whole roasted branzino", price: "$36.00", section: "Wood-Fired", yesVotes: 14, noVotes: 9 },
    { id: "5-6", name: "Duck breast", price: "$34.00", section: "Mains", yesVotes: 17, noVotes: 4 },
    { id: "5-7", name: "Short rib pappardelle", price: "$29.00", section: "Mains", yesVotes: 9, noVotes: 8 },
    { id: "5-8", name: "Mushroom risotto", price: "$26.00", section: "Mains", yesVotes: 4, noVotes: 3 },
    { id: "5-9", name: "Butterscotch budino", price: "$11.00", section: "Desserts", yesVotes: 20, noVotes: 1 },
    { id: "5-10", name: "Affogato", price: "$9.00", section: "Desserts", yesVotes: 2, noVotes: 0 },
  ],
  "6": [
    { id: "6-1", name: "Deviled eggs", price: "$9.00", section: "Starters", yesVotes: 18, noVotes: 4 },
    { id: "6-2", name: "Crispy brussels sprouts", price: "$11.00", section: "Starters", yesVotes: 26, noVotes: 3 },
    { id: "6-3", name: "Kale caesar", price: "$13.00", section: "Salads", yesVotes: 9, noVotes: 6 },
    { id: "6-4", name: "Beet salad", price: "$12.00", section: "Salads", yesVotes: 5, noVotes: 5 },
    { id: "6-5", name: "Prime burger", price: "$18.00", section: "Entrees", yesVotes: 37, noVotes: 5 },
    { id: "6-6", name: "Roasted chicken", price: "$24.00", section: "Entrees", yesVotes: 14, noVotes: 7 },
    { id: "6-7", name: "Braised short rib", price: "$29.00", section: "Entrees", yesVotes: 16, noVotes: 2 },
    { id: "6-8", name: "Salmon", price: "$27.00", section: "Entrees", yesVotes: 4, noVotes: 4 },
    { id: "6-9", name: "Butterscotch pot de creme", price: "$9.00", section: "Desserts", yesVotes: 12, noVotes: 1 },
    { id: "6-10", name: "Seasonal cobbler", price: "$9.00", section: "Desserts", yesVotes: 0, noVotes: 0 },
  ],
  "7": [
    { id: "7-1", name: "Toro nigiri", price: "$9.00", section: "Nigiri", yesVotes: 44, noVotes: 2 },
    { id: "7-2", name: "Uni nigiri", price: "$11.00", section: "Nigiri", yesVotes: 27, noVotes: 10 },
    { id: "7-3", name: "Yellowtail nigiri", price: "$6.50", section: "Nigiri", yesVotes: 30, noVotes: 3 },
    { id: "7-4", name: "Salmon nigiri", price: "$5.50", section: "Nigiri", yesVotes: 19, noVotes: 5 },
    { id: "7-5", name: "Spicy tuna roll", price: "$8.00", section: "Rolls", yesVotes: 22, noVotes: 6 },
    { id: "7-6", name: "Dragon roll", price: "$14.00", section: "Rolls", yesVotes: 15, noVotes: 8 },
    { id: "7-7", name: "Rainbow roll", price: "$15.00", section: "Rolls", yesVotes: 10, noVotes: 3 },
    { id: "7-8", name: "Edamame", price: "$5.00", section: "Appetizers", yesVotes: 6, noVotes: 2 },
    { id: "7-9", name: "Miso soup", price: "$3.50", section: "Appetizers", yesVotes: 3, noVotes: 3 },
    { id: "7-10", name: "Omakase (chef's choice)", price: "$85.00", section: "Specials", yesVotes: 33, noVotes: 1 },
  ],
  "8": [
    { id: "8-1", name: "Marlin taco", price: "$4.50", section: "Tacos", yesVotes: 61, noVotes: 4 },
    { id: "8-2", name: "Shrimp taco", price: "$4.50", section: "Tacos", yesVotes: 38, noVotes: 9 },
    { id: "8-3", name: "Fish taco, battered", price: "$4.00", section: "Tacos", yesVotes: 22, noVotes: 14 },
    { id: "8-4", name: "Octopus taco", price: "$5.25", section: "Tacos", yesVotes: 17, noVotes: 2 },
    { id: "8-5", name: "Scallop tostada", price: "$8.50", section: "Tostadas", yesVotes: 29, noVotes: 3 },
    { id: "8-6", name: "Ceviche tostada", price: "$7.75", section: "Tostadas", yesVotes: 14, noVotes: 6 },
    { id: "8-7", name: "Shrimp aguachile tostada", price: "$8.75", section: "Tostadas", yesVotes: 6, noVotes: 1 },
    { id: "8-8", name: "Whole grilled branzino", price: "$24.00", section: "Specialties", yesVotes: 19, noVotes: 5 },
    { id: "8-9", name: "Seafood molcajete", price: "$28.00", section: "Specialties", yesVotes: 11, noVotes: 10 },
    { id: "8-10", name: "Shrimp cocktail", price: "$12.00", section: "Specialties", yesVotes: 3, noVotes: 1 },
    { id: "8-11", name: "Horchata", price: "$3.50", section: "Drinks", yesVotes: 8, noVotes: 1 },
    { id: "8-12", name: "Jamaica agua fresca", price: "$3.50", section: "Drinks", yesVotes: 0, noVotes: 0 },
  ],
  "10": [
    { id: "10-1", name: "Stack of pancakes", price: "$9.00", section: "Breakfast", yesVotes: 14, noVotes: 1 },
    { id: "10-2", name: "Denver omelet", price: "$11.00", section: "Breakfast", yesVotes: 8, noVotes: 2 },
    { id: "10-3", name: "Patty melt", price: "$12.00", section: "Mains", yesVotes: 10, noVotes: 3 },
    { id: "10-4", name: "Chicken fried steak", price: "$14.00", section: "Mains", yesVotes: 5, noVotes: 4 },
    { id: "10-5", name: "Milkshake", price: "$6.00", section: "Drinks", yesVotes: 9, noVotes: 0 },
  ],
  "11": [
    { id: "11-1", name: "Fish tacos", price: "$10.00", section: "Mains", yesVotes: 41, noVotes: 4 },
    { id: "11-2", name: "Clam chowder", price: "$8.00", section: "Starters", yesVotes: 22, noVotes: 2 },
    { id: "11-3", name: "Grilled swordfish", price: "$26.00", section: "Mains", yesVotes: 16, noVotes: 3 },
    { id: "11-4", name: "Lobster roll", price: "$19.00", section: "Mains", yesVotes: 13, noVotes: 5 },
    { id: "11-5", name: "Ceviche", price: "$12.00", section: "Starters", yesVotes: 9, noVotes: 1 },
    { id: "11-6", name: "Calamari", price: "$11.00", section: "Starters", yesVotes: 7, noVotes: 3 },
  ],
  "12": [
    { id: "12-1", name: "Fish tacos", price: "$9.00", section: "Mains", yesVotes: 18, noVotes: 1 },
    { id: "12-2", name: "Shrimp tostada", price: "$10.00", section: "Mains", yesVotes: 9, noVotes: 2 },
    { id: "12-3", name: "Grilled mahi plate", price: "$17.00", section: "Mains", yesVotes: 8, noVotes: 2 },
    { id: "12-4", name: "Coconut shrimp", price: "$12.00", section: "Starters", yesVotes: 5, noVotes: 3 },
    { id: "12-5", name: "Fish burger", price: "$11.00", section: "Mains", yesVotes: 4, noVotes: 1 },
  ],
  "16": [
    { id: "16-1", name: "Al pastor taco", price: "$3.25", section: "Tacos", yesVotes: 54, noVotes: 6 },
    { id: "16-2", name: "Carne asada taco", price: "$3.50", section: "Tacos", yesVotes: 41, noVotes: 8 },
    { id: "16-3", name: "Carnitas taco", price: "$3.25", section: "Tacos", yesVotes: 20, noVotes: 5 },
    { id: "16-4", name: "Nopales taco", price: "$3.00", section: "Tacos", yesVotes: 9, noVotes: 7 },
    { id: "16-5", name: "California burrito", price: "$10.50", section: "Burritos", yesVotes: 33, noVotes: 2 },
    { id: "16-6", name: "Bean and cheese burrito", price: "$6.50", section: "Burritos", yesVotes: 12, noVotes: 4 },
    { id: "16-7", name: "Chips and guac", price: "$5.00", section: "Sides", yesVotes: 16, noVotes: 3 },
    { id: "16-8", name: "Elote", price: "$4.50", section: "Sides", yesVotes: 5, noVotes: 0 },
    { id: "16-9", name: "Rice and beans", price: "$3.75", section: "Sides", yesVotes: 4, noVotes: 4 },
    { id: "16-10", name: "Jarritos", price: "$2.50", section: "Drinks", yesVotes: 0, noVotes: 0 },
  ],
  "18": [
    { id: "18-1", name: "Margherita pizza", price: "$15.00", section: "Mains", yesVotes: 18, noVotes: 2 },
    { id: "18-2", name: "Fettuccine alfredo", price: "$17.00", section: "Mains", yesVotes: 12, noVotes: 3 },
    { id: "18-3", name: "Osso buco", price: "$28.00", section: "Mains", yesVotes: 9, noVotes: 2 },
    { id: "18-4", name: "Tiramisu", price: "$8.00", section: "Desserts", yesVotes: 11, noVotes: 0 },
    { id: "18-5", name: "Caprese salad", price: "$12.00", section: "Starters", yesVotes: 6, noVotes: 1 },
  ],
  "19": [
    { id: "19-1", name: "Wedge salad", price: "$11.00", section: "Starters", yesVotes: 8, noVotes: 2 },
    { id: "19-2", name: "New York strip", price: "$34.00", section: "Mains", yesVotes: 12, noVotes: 3 },
    { id: "19-3", name: "Lobster bisque", price: "$10.00", section: "Starters", yesVotes: 7, noVotes: 1 },
    { id: "19-4", name: "Creme brulee", price: "$9.00", section: "Desserts", yesVotes: 6, noVotes: 0 },
  ],
  "20": [
    { id: "20-1", name: "Brisket plate", price: "$17.00", section: "Mains", yesVotes: 22, noVotes: 2 },
    { id: "20-2", name: "Pulled pork sandwich", price: "$12.00", section: "Mains", yesVotes: 19, noVotes: 3 },
    { id: "20-3", name: "Baby back ribs", price: "$19.00", section: "Mains", yesVotes: 16, noVotes: 2 },
    { id: "20-4", name: "Smoked mac and cheese", price: "$8.00", section: "Starters", yesVotes: 11, noVotes: 1 },
    { id: "20-5", name: "Cornbread", price: "$4.00", section: "Starters", yesVotes: 8, noVotes: 0 },
  ],
  "26": [
    { id: "26-1", name: "Crab cakes", price: "$16.00", section: "Starters", yesVotes: 19, noVotes: 2 },
    { id: "26-2", name: "Ahi tuna tartare", price: "$17.00", section: "Starters", yesVotes: 14, noVotes: 3 },
    { id: "26-3", name: "Grilled branzino", price: "$28.00", section: "Mains", yesVotes: 12, noVotes: 2 },
    { id: "26-4", name: "Filet mignon", price: "$36.00", section: "Mains", yesVotes: 9, noVotes: 4 },
    { id: "26-5", name: "Key lime pie", price: "$9.00", section: "Desserts", yesVotes: 11, noVotes: 1 },
  ],
  "27": [
    { id: "27-1", name: "Al pastor tacos", price: "$8.00", section: "Mains", yesVotes: 21, noVotes: 2 },
    { id: "27-2", name: "Carnitas burrito", price: "$10.00", section: "Mains", yesVotes: 13, noVotes: 3 },
    { id: "27-3", name: "Quesabirria", price: "$12.00", section: "Mains", yesVotes: 16, noVotes: 1 },
    { id: "27-4", name: "Tamales", price: "$9.00", section: "Mains", yesVotes: 5, noVotes: 2 },
    { id: "27-5", name: "Agua fresca", price: "$3.00", section: "Drinks", yesVotes: 4, noVotes: 0 },
  ],
  "28": [
    { id: "28-1", name: "Burrata toast", price: "$13.00", section: "Starters", yesVotes: 17, noVotes: 2 },
    { id: "28-2", name: "Roasted beet salad", price: "$12.00", section: "Starters", yesVotes: 8, noVotes: 4 },
    { id: "28-3", name: "Pan-seared halibut", price: "$27.00", section: "Mains", yesVotes: 15, noVotes: 3 },
    { id: "28-4", name: "Braised short rib", price: "$26.00", section: "Mains", yesVotes: 12, noVotes: 2 },
    { id: "28-5", name: "Butternut risotto", price: "$22.00", section: "Mains", yesVotes: 5, noVotes: 5 },
    { id: "28-6", name: "Lemon tart", price: "$9.00", section: "Desserts", yesVotes: 9, noVotes: 1 },
  ],
  "34": [
    { id: "34-1", name: "Cobb salad", price: "$13.00", section: "Mains", yesVotes: 11, noVotes: 3 },
    { id: "34-2", name: "Grilled chicken sandwich", price: "$12.00", section: "Mains", yesVotes: 9, noVotes: 4 },
    { id: "34-3", name: "Classic cheeseburger", price: "$13.00", section: "Mains", yesVotes: 18, noVotes: 2 },
    { id: "34-4", name: "Fish and chips", price: "$15.00", section: "Mains", yesVotes: 6, noVotes: 3 },
    { id: "34-5", name: "Loaded nachos", price: "$10.00", section: "Starters", yesVotes: 5, noVotes: 2 },
  ],
  "35": [
    { id: "35-1", name: "Classic ahi poke bowl", price: "$13.00", section: "Bowls", yesVotes: 26, noVotes: 2 },
    { id: "35-2", name: "Spicy tuna bowl", price: "$14.00", section: "Bowls", yesVotes: 19, noVotes: 3 },
    { id: "35-3", name: "Salmon poke bowl", price: "$13.00", section: "Bowls", yesVotes: 15, noVotes: 2 },
    { id: "35-4", name: "Edamame", price: "$4.00", section: "Sides", yesVotes: 8, noVotes: 1 },
    { id: "35-5", name: "Miso soup", price: "$3.00", section: "Sides", yesVotes: 5, noVotes: 0 },
  ],
};
