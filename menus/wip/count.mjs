import fs from "fs";
for(const t of ["n1329-03","n1329-04","n1329-06","n1358-01"]){
  const r="menus/wip/result-"+t+".json", w="menus/wip/"+t+".json";
  let n="(no file)", ok="";
  try{const j=JSON.parse(fs.readFileSync(r,"utf8")); n=Array.isArray(j)?j.length:"not-array";
    const f=j.filter(e=>e.outcome==="filed"||(e.dishes&&e.dishes.length)).length; ok=" filed/with-dishes="+f;
  }catch(e){ n=fs.existsSync(r)?"UNPARSEABLE":"(no file)"; }
  let w2="?"; try{const k=JSON.parse(fs.readFileSync(w,"utf8")); w2=(Array.isArray(k)?k:k.restaurants||[]).length;}catch(e){}
  console.log(t+": result entries="+n+ok+"  worklist="+w2);
}
