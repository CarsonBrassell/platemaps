import fs from 'fs';
const outPath = 'C:\\Users\\Calvin  Lensink\\Documents\\platemaps\\menus\\wip\\result-35.json';
const entryPath = process.argv[2];
const entry = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
let arr = [];
if (fs.existsSync(outPath)) {
  const raw = fs.readFileSync(outPath, 'utf8').trim();
  if (raw) arr = JSON.parse(raw);
}
// replace if same restaurantId already present
const idx = arr.findIndex(e => e.restaurantId === entry.restaurantId);
if (idx >= 0) arr[idx] = entry; else arr.push(entry);
fs.writeFileSync(outPath, JSON.stringify(arr, null, 2));
console.log('Wrote', outPath, 'entries:', arr.length);
