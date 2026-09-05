import fs from "fs";
const p="probe/AGENT-BRIEF.md";
let t=fs.readFileSync(p,"utf8");
if(t.includes("virtualises its category lists")){console.log("REFUSING: already present");process.exit(1);}
const A=/^\*\*The result file must contain EVERY dish you captured/m;
if(!A.test(t)){console.log("REFUSING: anchor not found");process.exit(1);}
t=t.replace(A,`**A DoorDash or Uber Eats capture of 5-15 items is the front-page CAROUSEL, not
a small restaurant.** DoorDash virtualises its category lists: only "Featured
Items" and "Most Ordered" are in the DOM, and everything else materialises on
scroll, so DOM and text extraction reliably return the carousel and nothing
else. Three captures in one batch (Bonsall Donut House 5, Downtown cafe pizza 9,
Hello Deli 12) were the front page filed as complete menus. The catalog is
reachable - it is in the \`@type:"Menu"\` JSON-LD block described above, with
\`hasMenuSection\` -> \`hasMenuItem\` -> \`offers.price\`. Read that, or block. A
capture whose sections are ALL carousel names is never a menu, however many
sections it has.

$&`);
fs.writeFileSync(p,t);
console.log("added DoorDash carousel note to brief");
