import fs from "fs";
const CARO=/^(featured items|art[ií]culos destacados|most ordered|most popular|popular items|picked for you|recommended)$/i;
const seen=new Map();
for(const f of fs.readdirSync("menus/wip").filter(f=>/^clean-.*\.json$/.test(f))){
  let j; try{ j=JSON.parse(fs.readFileSync("menus/wip/"+f,"utf8")); }catch{ continue; }
  const arr=Array.isArray(j)?j:(j.restaurants||j.results||[]);
  for(const e of arr){
    const d=e.dishes||[]; if(!d.length) continue;
    const secs=new Set(d.map(x=>(x.section||"").trim().toLowerCase()));
    if(secs.size===1 && CARO.test((d[0].section||"").trim())){
      const id=String(e.restaurantId||e.id);
      if(!seen.has(id)) seen.set(id,{restaurantId:id,name:e.name,dishes:d.length,section:d[0].section,source:e.sourceUrl,firstSeenIn:f});
    }
  }
}
const out=[...seen.values()].sort((a,b)=>b.dishes-a.dishes);
fs.writeFileSync("menus/wip/carousel-captures.json",JSON.stringify(out,null,1));
console.log("distinct restaurants loaded from a carousel: "+out.length);
console.log("total dishes involved: "+out.reduce((s,x)=>s+x.dishes,0));
