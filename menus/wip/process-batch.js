const fs = require('fs');
const { spawn } = require('child_process');

const batch = JSON.parse(fs.readFileSync('menus/wip/w8b-01.json', 'utf8'));
const results = [];
let callCount = 0;
const MAX_TOTAL_CALLS = 60;
const MAX_PER_RESTAURANT = 6;

// Type definitions for blocking
const NO_FOOD_BUSINESSES = [
  { id: '14086', name: 'Prohibition Lounge', reason: 'no food menu, hold candidate' },
  { id: '14087', name: 'Quartyard', reason: 'no food menu, hold candidate' },
  { id: '13994', name: 'Paradise Lounge & Grill', reason: 'needs manual check' },
  { id: '14088', name: 'EQ San Diego', reason: 'needs manual check' },
  { id: '14090', name: 'Helix Brewing Co.', reason: 'needs manual check' },
  { id: '14093', name: 'Pure Project Vista', reason: 'needs manual check' },
  { id: '14094', name: 'Aztec Brewing Company', reason: 'needs manual check' },
  { id: '14096', name: 'Deft Brewing', reason: 'needs manual check' },
  { id: '14101', name: 'Mujeres Brew House', reason: 'needs manual check' },
  { id: '14102', name: 'Oculto 477', reason: 'needs manual check' },
  { id: '14104', name: 'Captain\'s Quarters', reason: 'needs manual check' },
];

const restaurants = batch.restaurants;

console.log(`Processing ${restaurants.length} restaurants with max ${MAX_TOTAL_CALLS} calls total`);

