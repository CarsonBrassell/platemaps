import fs from "fs";
const j=JSON.parse(fs.readFileSync("menus/wip/result-n1358-06.json","utf8"));
for(const e of j){
  const d=e.dishes||[];
  if(!d.length) continue;
  const secs=[...new Set(d.map(x=>(x.section||"(none)").trim()))];
  console.log(String(e.restaurantId).padEnd(5)+" "+String(d.length).padStart(4)+" dishes | "+secs.length+" sect | "+e.name);
  if(secs.length<=2) console.log("        sections: "+JSON.stringify(secs)+"  src="+(e.sourceUrl||"").slice(0,70));
}
