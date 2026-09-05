import fs from "fs";
const j=JSON.parse(fs.readFileSync("menus/wip/result-n1728-01.json","utf8"));
for(const id of ["7110","5940","6762"]){
  const e=j.find(x=>String(x.restaurantId)===id); const d=e.dishes||[];
  const c={}; for(const x of d){const s=(x.section||"(none)").trim(); c[s]=(c[s]||0)+1;}
  const ks=Object.keys(c);
  console.log(id+" "+e.name+" -> "+ks.map(k=>k+":"+c[k]).join(", "));
}
