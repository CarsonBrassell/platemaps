// Retry a load after aligning ONLY cosmetically-different names.
// A name is aligned when file and DB agree after: NFD accent strip, case fold,
// whitespace collapse, and dropping a trailing " | Category" suffix.
// Anything else stays a hard failure - the guard exists to catch wrong IDs.
import { readFileSync, writeFileSync } from "node:fs";
const [clean, logPath] = process.argv.slice(2);
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .split("|")[0].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const log = readFileSync(logPath, "utf8");
const re = /^\s*(\d+): file says "(.*)", database says "(.*)"$/gm;
const rows = [...log.matchAll(re)];
if (!rows.length) { console.log("no name-mismatch rows to align"); process.exit(1); }
const arr = JSON.parse(readFileSync(clean, "utf8"));
let ok = 0, refused = 0;
for (const [, id, fileName, dbName] of rows) {
  if (norm(fileName) !== norm(dbName)) {
    console.log(`REFUSED ${id}: "${fileName}" is not a cosmetic variant of "${dbName}"`);
    refused++; continue;
  }
  const e = arr.find(x => String(x.restaurantId) === id);
  if (!e) { console.log(`REFUSED ${id}: not in clean file`); refused++; continue; }
  console.log(`aligned ${id}: "${fileName}" -> "${dbName}"`);
  e.name = dbName; ok++;
}
if (refused) { console.log("refusing to write - real mismatch present"); process.exit(1); }
writeFileSync(clean, JSON.stringify(arr, null, 2));
console.log(`aligned ${ok} name(s)`);
