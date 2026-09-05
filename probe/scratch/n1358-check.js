import { extractJsonLdMenu } from "./n1358-lib.js";
const file = process.argv[2];
const r = extractJsonLdMenu(file);
console.log("name", r.name);
console.log("address", JSON.stringify(r.address));
console.log("rows", r.rows.length);
for (const row of r.rows) {
  console.log(row.section, "|", row.name, "|", row.price);
}
