import fs from "fs";
const j=JSON.parse(fs.readFileSync("menus/wip/result-n1637-05.json","utf8"));
for(const e of j){
  const d=e.dishes||[]; if(!d.length) continue;
  const secs=[...new Set(d.map(x=>(x.section||"(none)").trim()))];
  console.log(String(e.restaurantId).padEnd(5)+String(d.length).padStart(4)+" dishes | "+String(secs.length).padStart(2)+" sect | "+e.name);
}
console.log("--- 6914 Shoots sections ---");
const s=j.find(x=>String(x.restaurantId)==="6914");
console.log([...new Set(s.dishes.map(d=>d.section))].join(" | "));
console.log("--- 1593 El Cilantro sections + src ---");
const c=j.find(x=>String(x.restaurantId)==="1593");
console.log(c.sourceUrl);
console.log([...new Set(c.dishes.map(d=>d.section))].join(" | "));
