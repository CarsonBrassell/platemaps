import fs from "fs";
const j=JSON.parse(fs.readFileSync("menus/wip/result-n1637-04.json","utf8"));
for(const id of ["3093","1507","1715"]){
  const e=j.find(x=>String(x.restaurantId)===id);
  console.log(id+" | "+e.name+" | status="+(e.notFound?"not_found":(e.blocked?"blocked":"filed"))+" | conf="+e.confidence);
  console.log("     "+JSON.stringify(e.notFound||e.blocked||"").slice(0,300));
}
