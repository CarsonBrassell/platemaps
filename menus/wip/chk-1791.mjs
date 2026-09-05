import fs from "fs";
const j=JSON.parse(fs.readFileSync("menus/wip/result-n1637-01.json","utf8"));
const e=j.find(x=>String(x.restaurantId)==="1791");
console.log("dishes in result file:", (e.dishes||[]).length, "| confidence:", e.confidence, "| src:", e.sourceUrl);
console.log("first 3:", JSON.stringify((e.dishes||[]).slice(0,3)));
