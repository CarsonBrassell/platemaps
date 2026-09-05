const fs = require('fs');
const j = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/mama_state.json', 'utf8'));
const menu = j['Menu:f8a97822-f55b-4df2-be92-5c60adedcdd4'];
console.log('MENU NAME:', menu.name);
const rows = [];
for (const g of menu.groups) {
  console.log('GROUP:', g.name, '-', (g.items||[]).length, 'items');
  for (const it of (g.items || [])) {
    if (it.outOfStock) continue;
    const prices = it.prices || [];
    if (!prices.length || prices[0] == null) continue;
    const price = '$' + Number(prices[0]).toFixed(2);
    rows.push({ name: it.name, description: it.description || '', price, section: g.name });
  }
}
fs.writeFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/mama_rows.json', JSON.stringify(rows, null, 2));
console.log('TOTAL ROWS', rows.length);

const prices = rows.map(r => parseFloat(r.price.replace('$','')));
for (const div of [1.04,1.1,1.15,1.2,1.25]) {
  let round=0, ninetyfive=0;
  for (const p of prices) {
    const d = p/div;
    const cents = Math.round((d - Math.floor(d))*100);
    if (cents===0 || cents===50) round++;
    if (cents===95) ninetyfive++;
  }
  console.log('div',div,'round/half:',round,'/',prices.length,'  .95:',ninetyfive);
}
