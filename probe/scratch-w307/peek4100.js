const fs = require('fs');
const obj = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/scratch-w307/4100-apollo.json', 'utf8'));
const key = Object.keys(obj).find(k => k.startsWith('RestaurantLocation:'));
console.log(JSON.stringify(obj[key], null, 2).slice(0, 3000));
