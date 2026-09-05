import fs from "fs";
for (const tag of ["n1728-03","n1728-04","n1728-05"]) {
  const p = `menus/wip/result-${tag}.json`;
  if (!fs.existsSync(p)) { console.log(`${tag}: NO FILE`); continue; }
  let j; try { j = JSON.parse(fs.readFileSync(p,"utf8")); }
  catch(e){ console.log(`${tag}: UNPARSEABLE (${e.message.slice(0,60)})`); continue; }
  console.log(`\n=== ${tag}: ${j.length} entries ===`);
  for (const e of j) {
    const d = Array.isArray(e.dishes) ? e.dishes.length : (e.dishes===undefined ? "none" : "?");
    const secs = Array.isArray(e.dishes) ? [...new Set(e.dishes.map(x=>x.section||""))] : [];
    const carousel = secs.length>0 && secs.every(s=>/featured|most ordered|popular/i.test(s));
    const flag = (d===79||d===91) ? "  <-- 79/91 SUSPECT" : (carousel ? "  <-- ALL-CAROUSEL" : "");
    console.log(`  ${e.restaurantId} | ${e.name} | ${d} dishes | ${secs.length} sections${flag}`);
    if (d===79||d===91||carousel) console.log(`      sections: ${secs.join(" | ").slice(0,300)}`);
  }
}
