import fs from "fs";
const ids=f=>{try{const j=JSON.parse(fs.readFileSync("menus/wip/"+f,"utf8"));
return new Set((Array.isArray(j)?j:j.restaurants||[]).map(r=>String(r.id||r.restaurantId)));}catch(e){return null;}};
const old=["n1329-05.json","n1329-06.json"];
const neu=["n1358-01.json","n1358-02.json","n1358-03.json","n1358-04.json","n1358-05.json","n1358-06.json"];
const O=new Set(); for(const f of old){const s=ids(f); if(!s){console.log("missing "+f);continue;} for(const x of s)O.add(x);}
const N=new Set(); for(const f of neu){const s=ids(f); if(!s){console.log("missing "+f);continue;} for(const x of s)N.add(x);}
const dup=[...O].filter(x=>N.has(x));
console.log("n1329-05/06 ids: "+O.size+"   n1358 ids: "+N.size+"   overlap: "+dup.length);
if(dup.length) console.log("overlapping: "+dup.join(","));
