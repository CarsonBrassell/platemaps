import fs from "fs";
const p=process.argv[2], ids=process.argv.slice(3).map(String);
const j=JSON.parse(fs.readFileSync(p,"utf8"));
if(!Array.isArray(j)){console.log("NOT a bare array - refusing");process.exit(1);}
const before=j.length;
const out=j.filter(e=>!ids.includes(String(e.restaurantId||e.id)));
if(out.length!==before-ids.length){console.log("REFUSING: asked to drop "+ids.length+", would drop "+(before-out.length));process.exit(1);}
fs.writeFileSync(p,JSON.stringify(out,null,1));
console.log("withdrew "+ids.join(",")+": "+before+" -> "+out.length);
