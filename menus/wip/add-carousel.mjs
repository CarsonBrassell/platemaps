import fs from "fs";
const p="scripts/screen-menus.mjs";
let t=fs.readFileSync(p,"utf8");
if(t.includes("CAROUSEL_SECTION")){console.log("REFUSING: already present");process.exit(1);}
const A=`    else if (dishes < THIN && !COMPLETE_BUT_SHORT.has(String(e.restaurantId)))`;
if(!t.includes(A)){console.log("REFUSING: anchor not found");process.exit(1);}
const add=`    /*
     * A marketplace front page opens with a carousel - "Featured Items" on
     * order.online and Uber Eats, "Artículos destacados" on the Spanish
     * locale of the same page - and the browser tier has been capturing that
     * carousel and stopping. JOE & THE JUICE came through as 25 rows spanning
     * juices, sandwiches, coffee and bottled water in one section, three
     * alphabetised carousel pages concatenated, filed as the whole menu.
     *
     * Twenty-six restaurants reached the corpus this way before anyone looked.
     * The signature is exact: every row in ONE section, and that section named
     * for the carousel rather than for food. A real single-section menu names
     * itself after what it sells ("Cake & Cupcakes", "Smoothies & Bowls"), so
     * matching the label list rather than the section COUNT keeps those out of
     * it. A carousel is a partial capture whatever its length, so this sits
     * above the THIN check and reports the specific cause.
     */
    else if (
      dishes > 0 &&
      new Set((e.dishes || []).map((d) => (d.section || "").trim().toLowerCase())).size === 1 &&
      CAROUSEL_SECTION.test(((e.dishes || [])[0]?.section || "").trim())
    )
      reason =
        \`every row sits in one section named "\${(e.dishes || [])[0]?.section}" - that is a \` +
        \`marketplace carousel, not a menu; the rest of the catalog was never opened (\${host})\`;
`;
t=t.replace(A, add+A);
// module-level constant, placed just before the THIN constant if present, else at first use scope
const decl=`const CAROUSEL_SECTION =\n  /^(featured items|art[ií]culos destacados|most ordered|most popular|popular items|picked for you|recommended)$/i;\n`;
const m=t.match(/^const THIN = .*$/m);
if(m) t=t.replace(m[0], decl+m[0]);
else { console.log("REFUSING: no THIN declaration to anchor the constant"); process.exit(1); }
fs.writeFileSync(p,t);
console.log("patched");
