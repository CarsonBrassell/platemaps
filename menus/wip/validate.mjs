import fs from "fs";
const t=process.argv[2];
const j=JSON.parse(fs.readFileSync("menus/wip/result-"+t+".json","utf8"));
const wl=JSON.parse(fs.readFileSync("menus/wip/"+t+".json","utf8"));
const want=new Set((Array.isArray(wl)?wl:wl.restaurants).map(r=>String(r.id||r.restaurantId)));
const got=new Set(j.map(e=>String(e.restaurantId||e.id)));
const miss=[...want].filter(x=>!got.has(x)), extra=[...got].filter(x=>!want.has(x));
const re=/^\$\d+(\.\d{2})?$/;
let bad=[], thin=[];
for(const e of j){
  const d=e.dishes||[];
  for(const x of d) if(!re.test(String(x.price))) bad.push((e.restaurantId||e.id)+" "+x.name+" "+x.price);
  if(d.length>0 && d.length<5) thin.push((e.restaurantId||e.id)+" n="+d.length);
}
console.log("entries="+j.length+" missing="+miss.length+" extra="+extra.length+" badPrice="+bad.length+" under5="+thin.length);
if(miss.length)console.log("missing: "+miss.join(","));
if(extra.length)console.log("extra: "+extra.join(","));
if(bad.length)console.log(bad.slice(0,10).join(" | "));
if(thin.length)console.log("thin: "+thin.join(","));
for(const e of j) if((e.dishes||[]).length) console.log("  FILED "+(e.restaurantId||e.id)+" "+(e.name||"")+" n="+e.dishes.length+" conf="+(e.confidence||"?")+" src="+(e.sourceUrl||e.source||"?").slice(0,60));
