import fs from "fs";
const j=JSON.parse(fs.readFileSync("menus/wip/clean-br.json","utf8"));
const arr=Array.isArray(j)?j:(j.restaurants||j.results||[]);
const e=arr.find(x=>String(x.restaurantId)==="7800");
console.log(e.name,"|",e.sourceUrl,"| dishes:",e.dishes.length);
for(const d of e.dishes.slice(0,25)) console.log("   ",d.section,"|",d.name,"|",d.price);
