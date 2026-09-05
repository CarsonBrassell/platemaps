import fs from "fs";
const p=process.argv[2], id=process.argv[3];
const j=JSON.parse(fs.readFileSync(p,"utf8"));
if(!Array.isArray(j)){console.log("NOT a bare array - refusing");process.exit(1);}
const before=j.length;
const out=j.filter(e=>String(e.restaurantId||e.id)!==String(id));
if(out.length!==before-1){console.log("REFUSING: dropped "+(before-out.length));process.exit(1);}
fs.writeFileSync(p,JSON.stringify(out,null,1));
console.log("withdrew "+id+": "+before+" -> "+out.length);
