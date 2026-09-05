import fs from "fs";
const p="probe/AGENT-BRIEF.md";
let t=fs.readFileSync(p,"utf8");
if(t.includes("pill-nav")){console.log("REFUSING: already present");process.exit(1);}
const A="**Two dish counts in this corpus are extraction artefacts, not menus: 79 and";
if(!t.includes(A)){console.log("REFUSING: anchor not found");process.exit(1);}
const add=`**DoorDash truncates its own JSON-LD menu at about 91 raw items, and the cut is
invisible.** This was confirmed against three unrelated restaurants - a
Vietnamese place, a Mediterranean place and an American diner - and all three
told the same story: the \`@type:"Menu"\` block held a 12-item "Most Ordered"
carousel plus 79 real items, stopped dead at a section boundary, and the live
category pill-nav on the page listed seven more sections that the JSON-LD never
mentioned. Phở King lost Fried Rice, Kid Meals, Beverages, Dessert, Smoothies
and Coffee that way. The block is well-formed and parses cleanly; nothing in it
says it is partial. So the JSON-LD is a starting point, never proof of
completeness. **Cross-check it against the rendered category pill-nav** - the
row of category buttons above the menu, which is NOT virtualised and lists every
section the restaurant has. If the nav names sections the JSON-LD lacks, the
catalog is truncated: pull the missing sections through the React Query
catalog-map path, or block it as a partial. Do not file the JSON-LD as the whole
menu. Note that 91 is not automatically bad - one restaurant checked had a
genuine complete 91-item menu with no carousel at all - so verify against the
nav rather than judging by the number.

`;
fs.writeFileSync(p, t.replace(A, add+A));
console.log("added confirmed truncation mechanism");
