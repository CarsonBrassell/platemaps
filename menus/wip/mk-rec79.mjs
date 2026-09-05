import { neon } from "@neondatabase/serverless";
import fs from "fs";
const sql = neon(process.env.DATABASE_URL);
const j = JSON.parse(fs.readFileSync("menus/wip/truncated-79.json","utf8"));
const out=[];
for(const r of j){
  const a = await sql`select address from restaurants where id=${r.restaurantId}`;
  out.push({restaurantId:String(r.restaurantId),name:r.name,address:a[0]?.address??null,
            storedDishes:r.dishes,storedSections:r.sections,storedLastSection:r.lastSection,sourceUrl:r.sourceUrl});
}
fs.writeFileSync("menus/wip/rec79-01.json",JSON.stringify(out.slice(0,20),null,1));
fs.writeFileSync("menus/wip/rec79-02.json",JSON.stringify(out.slice(20),null,1));
console.log("rec79-01: "+out.slice(0,20).length+"  rec79-02: "+out.slice(20).length);
