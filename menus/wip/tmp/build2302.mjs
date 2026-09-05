import fs from 'fs';

const dishes = [
 {name:'Well Drink', description:'Happy Hour (4-7pm Tues-Sun, all day Monday) well cocktail', price:'$4.00', section:'Happy Hour'},
 {name:'Draft Beer', description:'Happy Hour (4-7pm Tues-Sun, all day Monday) draft', price:'$5.00', section:'Happy Hour'},
 {name:'Snaquiri', description:"It's just a rum snack. (Shot)", price:'$3.00', section:'Shots'},
 {name:'My Milkshake Brings All The Boys To The Yard', description:'Small. Boozy. Coffee. Milkshake. (Shot)', price:'$3.00', section:'Shots'},
 {name:'Peanut Butter Jelly Time', description:'Just like your mom made, except with whiskey. (Shot)', price:'$3.00', section:'Shots'},
 {name:'Left Over Crack', description:'This liquor comes from the Colombian Coca leaf. (Shot)', price:'$3.00', section:'Shots'},
 {name:'Queen B Lemonade', description:"It's a blackberry vodka lemonade shot.", price:'$3.00', section:'Shots'},
 {name:"Payable by Death", description:'Vodka and peach schnapps mixed with cranberry and citrus juices, topped with Liquid Death sparkling water. Pitcher.', price:'$35.00', section:'Cocktail Pitchers'},
 {name:"I'm The Firestarter", description:'Plantation White 3 Star, Plantation pineapple rum, Wray & Nephew overproof rum, pineapple, passion fruit, and lime. Pitcher.', price:'$40.00', section:'Cocktail Pitchers'},
];

const entry = {
  restaurantId: '2302',
  name: 'Til-Two Club',
  sourceUrl: 'http://tiltwoclub.com/drinks/',
  confidence: 'high',
  crossCheckedAgainst: '',
  blocked: '',
  notes: 'Own site, dive bar / live music venue whose only menu is its Drink Menu page (address on the page: 4746 El Cajon Blvd, San Diego, matches work list). Only Happy Hour categories (Wells $4, Drafts $5, Shots $3) and Cocktail Pitchers ($35, $40) carry explicit prices; priced under those categories. A full named "Cocktails" section (Funky Drummer, Til-Two Tai, Whiskey Bent and Hell Bound, Barmy Army, Mijo Goes To College, Smokin\' in The Boys Room, Raspberry Beret, Hot In Here, Lil Kimlet, Lil Saigon Sling, Cannibal Corpse Reviver, One Last Caress) is listed with descriptions but genuinely no price anywhere on the page -- omitted per the no-placeholder-price rule rather than guessed. This is a bar with no food menu; drinks are the entire menu.',
  dishes
};

const path = 'menus/wip/result-60.json';
const arr = JSON.parse(fs.readFileSync(path, 'utf8'));
arr.push(entry);
fs.writeFileSync(path, JSON.stringify(arr, null, 1));
console.log('total entries now', arr.length, 'dishes', dishes.length);
