import fs from "fs";
const p="scripts/screen-menus.mjs";
let t=fs.readFileSync(p,"utf8");
const OLD=`      new Set((e.dishes || []).map((d) => (d.section || "").trim().toLowerCase())).size === 1 &&
      CAROUSEL_SECTION.test(((e.dishes || [])[0]?.section || "").trim())`;
if(!t.includes(OLD)){console.log("REFUSING: old condition not found");process.exit(1);}
const NEW=`      [...new Set((e.dishes || []).map((d) => (d.section || "").trim()))].every((s) =>
        CAROUSEL_SECTION.test(s),
      )`;
t=t.replace(OLD,NEW);
const OLDR=`        \`every row sits in one section named "\${(e.dishes || [])[0]?.section}" - that is a \` +
        \`marketplace carousel, not a menu; the rest of the catalog was never opened (\${host})\`;`;
if(!t.includes(OLDR)){console.log("REFUSING: old reason not found");process.exit(1);}
const NEWR=`        \`every section is a carousel (\${[...new Set((e.dishes || []).map((d) => d.section))].join(", ")}) \` +
        \`- that is the marketplace front page, not a menu; the catalog was never opened (\${host})\`;`;
t=t.replace(OLDR,NEWR);
fs.writeFileSync(p,t);
console.log("widened carousel check to: every section is a carousel label");
