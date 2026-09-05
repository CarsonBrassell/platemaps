import fs from "fs";
const files=fs.readdirSync("menus/wip").filter(f=>/^clean-.*\.json$/.test(f));
let hits=[];
for(const f of files){
  let j; try{ j=JSON.parse(fs.readFileSync("menus/wip/"+f,"utf8")); }catch{ continue; }
  const arr=Array.isArray(j)?j:(j.restaurants||j.results||[]);
  for(const e of arr){
    const d=e.dishes||[];
    if(d.length<1) continue;
    const secs=new Set(d.map(x=>x.section||"").filter(Boolean));
    if(secs.size<=1 && d.length<40) hits.push([f,e.restaurantId||e.id,e.name||"?",d.length,[...secs][0]||"(none)"]);
  }
}
hits.sort((a,b)=>a[3]-b[3]);
console.log("single-section filed menus: "+hits.length);
for(const h of hits) console.log("  "+h[1]+" | "+h[2]+" | "+h[3]+" dishes | section="+h[4]+" | "+h[0]);
