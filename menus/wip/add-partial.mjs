import fs from "fs";
const p="probe/AGENT-BRIEF.md";
const L=fs.readFileSync(p,"utf8").split("\n");
if(L.some(l=>l.includes("Hanu Korean BBQ"))){console.log("already present");process.exit(0);}
const i=L.findIndex(l=>/^5\. \*\*`not_found` is permanent\*\*/.test(l));
if(i<0){console.log("REFUSING: rule 5 missing");process.exit(1);}
L.splice(i,0,'',
'   "Say so" is not enough on its own: nothing downstream records partial as a',
'   state, so a partial you file lands as a COMPLETE menu. Block it instead. On',
'   2026-09-04 a batch filed Hanu Korean BBQ with 49 items that were entirely',
'   drinks and desserts, because the core BBQ is flat-rate all-you-can-eat and',
'   unpriced. That would have put a Korean BBQ restaurant on the map selling',
'   nothing but soda and ice cream. If the restaurant\'s CORE offering is',
'   unpriced, block it and name which sections were priced and which were not.');
fs.writeFileSync(p,L.join("\n"));
console.log("ok");
