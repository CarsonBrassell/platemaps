import fs from 'fs';

const lunch = [
  ['Starters','Chips & Dip',14],['Starters','Mezze Plate',18],['Starters','Ahi Tuna Tostadas',19],
  ['Starters','Pretzel Sticks',14],['Starters','Soup of the Day',10],
  ['Salads & Bowls','La Jolla Caesar',15],['Salads & Bowls','Kale & Farro Salad',16],
  ['Salads & Bowls','Sweet Potato & Quinoa Bowl',16],['Salads & Bowls','Poke Bowl',24],
  ['Flatbreads','Margherita Flatbread',20],['Flatbreads','Chorizo Flatbread',20],
  ['Handhelds','La Jolla Burger',22],['Handhelds','Mediterranean Wrap',18],
  ['Handhelds','Chicken Tinga Tacos',18],['Handhelds','Carne Asada Tacos',20],
  ['Handhelds','Lime & Tajin Mushroom Tacos',16],['Handhelds','Blackened Fish Sandwich',22],
  ['Handhelds','Turkey Club',18],
  ['Sweets','Lime & Tequila Cheesecake',14],['Sweets','Cookies & Ice Cream',14],
  ['Sweets','Gelato or Sorbet',10],
];

const dinner = [
  ['Starters','Chips & Dip',14],['Starters','Black Garlic Soy Chicken Wings',18],
  ['Starters','Ahi Tuna Tostadas',19],['Starters','Chicken & Chile Flautas',18],
  ['Starters','Romesco Shrimp',18],['Starters','Shrimp Empanadas',18],
  ['Starters','Antipasto',18],['Starters','Pretzel Sticks',14],['Starters','Soup of the Day',10],
  ['Salads & Bowls','La Jolla Caesar',15],['Salads & Bowls','Kale & Farro Salad',16],
  ['Salads & Bowls','Roquette Salad',16],['Salads & Bowls','Poke Bowl',24],
  ['Small Plates','Chicken Tinga Tacos',18],['Small Plates','Blackened Fish Tacos',20],
  ['Small Plates','Carne Asada Tacos',20],['Small Plates','Lime & Tajin Mushroom Tacos',16],
  ['Small Plates','Tuna Tartare',19],['Small Plates','Chorizo Flatbread',20],
  ['Small Plates','Margherita Flatbread',20],
  ['Entrees','Chile Crusted Salmon',36],['Entrees','Drift Burger',25],
  ['Entrees','Adobada Chicken',34],['Entrees','Summer Short Rib',38],
  ['Entrees',"Chimichurri Rub New York Steak",40],['Entrees','Cavatelli Primavera',28],
];

const seen = new Map();
for (const [section,name,price] of [...lunch, ...dinner]) {
  const key = name.toLowerCase()+'|'+price;
  if (!seen.has(key)) seen.set(key, { section, name, price: `$${price.toFixed(2)}` });
}
const dishes = [...seen.values()];
console.log('unique dishes:', dishes.length);
fs.writeFileSync('drift_dishes.json', JSON.stringify(dishes, null, 2));
