import fs from "fs";
const p="probe/AGENT-BRIEF.md";
let t=fs.readFileSync(p,"utf8");
if(t.includes("exactly 79 dishes")){console.log("REFUSING: already present");process.exit(1);}
const A="**A DoorDash or Uber Eats capture of 5-15 items is the front-page CAROUSEL, not";
if(!t.includes(A)){console.log("REFUSING: anchor not found");process.exit(1);}
const add=`**Two dish counts in this corpus are extraction artefacts, not menus: 79 and
91.** Across 363 DoorDash menus already filed, the counts either side of 79 hold
between one and nine restaurants each - and 79 holds thirty-five. 91 holds
twenty-four. Real menu sizes do not pile up on two numbers like that; something
in the capture path stops there. One of them was caught in the act: a Frutimania
capture came back as 158 items and deduped to exactly 79, so the payload lists
the catalog twice. If your count lands on 79 or 91, treat the capture as
truncated until you have confirmed otherwise: find the last section on the live
page and check that your last section is the same one. A catalog that stops
mid-category, or mid-alphabet inside a category, was cut. Say so and block
rather than filing it as complete.

`;
fs.writeFileSync(p, t.replace(A, add+A));
console.log("added 79/91 rule");
