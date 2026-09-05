import fs from "fs";
const g=(f,id)=>{const j=JSON.parse(fs.readFileSync("menus/wip/"+f,"utf8"));
  const a=Array.isArray(j)?j:(j.restaurants||j.results||[]);
  return a.find(x=>String(x.restaurantId)===id);};
const caro=g("clean-br.json","7800");                     // 25 rows, all "Featured Items"
const j4=JSON.parse(fs.readFileSync("menus/wip/clean-n1358-04.json","utf8"));
const a4=Array.isArray(j4)?j4:(j4.restaurants||j4.results||[]);
const good=a4.find(x=>new Set((x.dishes||[]).map(d=>d.section)).size>3);
if(!caro||!good){console.log("REFUSING: could not build fixture");process.exit(1);}
console.log("carousel fixture:",caro.name,caro.dishes.length,"rows");
console.log("control fixture:",good.name,good.dishes.length,"rows,",new Set(good.dishes.map(d=>d.section)).size,"sections");
fs.writeFileSync("menus/wip/result-carotest.json",JSON.stringify([caro,good],null,1));
