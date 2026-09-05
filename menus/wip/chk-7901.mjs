import fs from "fs";
const j=JSON.parse(fs.readFileSync("menus/wip/result-n1728-01.json","utf8"));
for(const e of j){
  const d=e.dishes||[]; if(!d.length) continue;
  const secs=[...new Set(d.map(x=>(x.section||"(none)").trim()))];
  const names=new Set(d.map(x=>x.name));
  console.log(String(e.restaurantId).padEnd(5)+String(d.length).padStart(4)+" dishes | "+String(names.size).padStart(3)+" uniq | "+String(secs.length).padStart(2)+" sect | "+e.name);
  console.log("      "+secs.slice(0,12).join(" | "));
}
