const dishes = [];
const add = (section, items) => { for (const [name, price] of items) dishes.push({name, price, section}); };

add("Meals", [
  ["Bowl","$11.99"],
  ["Salad","$13.99"],
  ["Quesadilla with Meat","$10.99"],
  ["Rolled Tacos","$7.99"],
  ["California Burrito","$12.99"],
  ["Nachos","$12.99"],
  ["Fries","$12.99"],
  ["Burrito","$11.99"],
  ["Taco","$5.29"],
]);
add("Sides", [
  ["Side of Spanish Rice & Refried Beans","$2.50"],
  ["Side of Pico de Gallo","$0.99"],
  ["Side of Shredded Cheese","$0.75"],
  ["Side of Sour Cream","$0.99"],
  ["Side of Jalapeño Queso","$1.25"],
  ["Side of Guacamole","$1.25"],
  ["Side of Whole Black Beans","$1.25"],
  ["Side of Refried Beans","$1.25"],
  ["Side of Poblano Rice","$1.25"],
  ["Side of Spanish Rice","$1.25"],
  ["Pint of Poblano Rice","$3.99"],
  ["Pint of Whole Black Beans","$3.99"],
  ["Pint of Guacamole","$7.99"],
  ["Pint of Kennedy's Oaxaca Jalapeño Queso","$7.99"],
  ["Pint of Refried Beans","$3.99"],
  ["Pint of Spanish Rice","$3.99"],
]);
add("Kennedy's Kids", [
  ["Kid's Street Taco","$3.99"],
  ["Kid's Bean & Cheese","$2.99"],
  ["Kid's Quesadilla","$4.99"],
]);
add("Desserts", [
  ["Cajeta Churros","$4.99"],
  ["Cinnamon Churros","$3.99"],
]);
add("Breakfast", [
  ["Breakfast Burrito","$8.99"],
  ["Breakfast Taco","$3.99"],
  ["Carne Asada Breakfast Burrito","$10.99"],
]);
add("Other Items", [
  ["Bean & Cheese Burrito","$3.99"],
  ["Macho Burrito","$47.99"],
  ["Monster Burrito","$23.99"],
  ["Tiburon Burrito","$35.99"],
  ["Tornado Burrito","$71.99"],
  ["Tsunami Burrito","$95.99"],
]);

console.log(JSON.stringify(dishes, null, 2));
console.log("COUNT", dishes.length);
