import fs from "fs";
const p="menus/wip/result-n1637-06.json";
const j=JSON.parse(fs.readFileSync(p,"utf8"));
const e=j.find(x=>String(x.restaurantId)==="6958");
if(!e){console.log("REFUSING: 6958 not present");process.exit(1);}
if(e.name!=="Carnitas Uruapan"){console.log("REFUSING: name is now "+e.name);process.exit(1);}
e.name="Carnitas Uruapan family restaunt";
fs.writeFileSync(p,JSON.stringify(j,null,1));
console.log("6958 renamed to DB name");
