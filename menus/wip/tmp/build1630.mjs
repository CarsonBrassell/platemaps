import fs from 'fs';

const dishes = [
 {name:'Oregon Cheese & Ham', description:"California Golden Nugget Ham + 2-yr Aged Cheddar + Honeycrisp Red Apple + Micro & Greens Mix + Padron Jam + Big Bill's Mustard & Mayo, on Bread Bar Seeded bread", price:'$14.00', section:'Classic Sandos'},
 {name:'Bent River Brie & Ham', description:"Nugget Ham + Bent River Brie + Red Onion + Micro & Greens Mix + Datil Hot Honey + Big Bill's Mustard & Mayo", price:'$14.00', section:'Classic Sandos'},
 {name:'California Cheese & Turkey', description:"SoCal Smoked Turkey + American Swiss Cheese + Granny Smith Apple + Cucumber + Micro & Greens Mix + Padron Jam + Big Bill's Mustard & Mayo", price:'$14.00', section:'Classic Sandos'},
 {name:'Wisconsin CPT (Chevre/Pesto/Turkey)', description:'Blakesville Fresh Goat Chevre + SoCal Smoked Turkey + Local Basil Pesto + Cucumber + Baby Arugula + Dried Cranberries & Mayo', price:'$14.00', section:'Classic Sandos'},
 {name:'Washington Holy Mole', description:"Seattle Mole Salami + Bent River Brie + Dried Cranberries + Micro & Greens Mix + Radish + Velvet Bees Honey Butter & Big Bill's Mustard", price:'$14.00', section:'Classic Sandos'},
 {name:'Golden Gate Phoney Baloney', description:'San Francisco Mortadella + Aged Cheddar + Red Onion + Micro & Greens Mix + Apple Butter + Dijon Mustard & Mayo', price:'$14.00', section:'Classic Sandos'},
 {name:'Smallgoods American Sampler', description:'Ham, Mortadella & Salami + Sheep Milk Alpine Cheese + Arugula + Oil + Seasonings + Mustard & Mayo. Add spicy Salami +$3', price:'$15.00', section:'Classic Sandos'},
 {name:'California Wagyu', description:'California Thin-Sliced Dry-Aged Wagyu Beef Bresaola + Sheep Milk Alpine Cheese + Baby Arugula + Lemon + Oil & Pepper + Cornichons & Big Bill’s Mustard', price:'$17.00', section:'Classic Sandos'},
 {name:'SoCal Veggie', description:'American Swiss Cheese + Chilled Cucumber + Granny Smith Apple + Micro & Greens Mix + Local Basil Pesto + Padron Jam & Mayo', price:'$13.00', section:'Veggie Sandos'},
 {name:'NorCal Veggie', description:'Bent River Brie + Micro & Greens Mix + Honeycrisp Apple + Chilled Cucumber + Apple Butter & Mayo', price:'$13.00', section:'Veggie Sandos'},
 {name:'Local Veggie', description:'Blakesville Fresh Goat Chevre + Sugar Snap Peas + Honeycrisp Red Apple + Dried Cranberries + Micro & Greens Mix + Velvet Bees Honey Butter & Mayo', price:'$13.00', section:'Veggie Sandos'},
 {name:'Sobrasada Sando', description:"Sobrasada + Vermont Alpine Chef's Shred & Cheese mix + Big Bill's Mustard + Red Onion + Datil Hot Honey & Arugula, with choice of Ham, Salami, Turkey or Mortadella", price:'$18.00', section:'Hot Sando Melts'},
 {name:"Sheboygan Snake N' Bake", description:'Deer Creek Rattlesnake Tequila Habanero Pepper Cheddar + Calabrian Mangalitsa Salami + Nugget Ham + Grilled Pineapple + Red Onion (no substitutions or alterations)', price:'$18.00', section:'Hot Sando Melts'},
 {name:'SG Cheese Melt', description:"Vermont Alpine Chef's Shred & Cheese mix + Big Bill's Mustard + Padron Jam + Honeycrisp Red Apple & Red Onion. Add Nugget Ham, Salami, Turkey or Mortadella +$4", price:'$14.00', section:'Hot Sando Melts'},
 {name:'Classic Grilled Cheese', description:"Vermont Alpine Chef's Shred & Cheese mix. Add Nugget Ham, Salami, Turkey or Mortadella +$4", price:'$12.00', section:'Hot Sando Melts'},
 {name:'Local Micro Greens Salad', description:"Fred's Urban Micro Greens with light lemon vinaigrette dressing. Add cheese +$3, add meats +$4", price:'$12.50', section:'Classic Sandos'},
 {name:'Cheese Tray', description:'A single-serve "catch of the day" tray of American cheeses and tasty accompaniments', price:'$16.00 - $19.00', section:'Cheese & Charcuterie Trays'},
 {name:'Beach Box', description:'A larger shareable and casual offering of cheeses & cured meats plus tasty accompaniments', price:'$26.50', section:'Cheese & Charcuterie Trays'},
];

const entry = {
  restaurantId: '1630',
  name: 'Smallgoods Cheese Shop & Cafe',
  sourceUrl: 'https://www.smallgoodsusa.com/s/SGMenu826.pdf',
  confidence: 'high',
  crossCheckedAgainst: '',
  blocked: '',
  notes: 'PDF menu linked from the restaurant\'s own Squarespace site (shop-menu page), text-layer extracted with pdftotext -layout. Menu header reads "SUMMER 2026" and the footer confirms the address (7524 La Jolla Blvd, La Jolla) and phone matching the work list. Sections reached: Classic Sandos, Veggie Sandos, Hot Sando Melts / Grilled Melt Menu (duplicate listing of the same 4 items, deduplicated), Cheese & Charcuterie Trays. Party Platters section has no fixed prices ("Prices vary" -- omitted per no-placeholder rule, noted here). This is a small specialty sandwich/cheese shop and the PDF appears to be its complete current menu.',
  dishes
};

const path = 'menus/wip/result-60.json';
const arr = JSON.parse(fs.readFileSync(path, 'utf8'));
arr.push(entry);
fs.writeFileSync(path, JSON.stringify(arr, null, 1));
console.log('total entries now', arr.length, 'dishes', dishes.length);
