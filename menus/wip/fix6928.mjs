import fs from "fs";
const p="menus/wip/result-n1637-05.json";
const j=JSON.parse(fs.readFileSync(p,"utf8"));
const e=j.find(x=>String(x.restaurantId)==="6928");
if(!e){console.log("REFUSING: 6928 not present");process.exit(1);}
if(e.name!=="Rincon Azteca"){console.log("REFUSING: name is now "+e.name);process.exit(1);}
e.name="Rincon Azteca Homestyle Mexican Restaurant";
fs.writeFileSync(p,JSON.stringify(j,null,1));
console.log("6928 renamed to DB name");
