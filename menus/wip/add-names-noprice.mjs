import fs from "fs";
const p="probe/AGENT-BRIEF.md";
const L=fs.readFileSync(p,"utf8").split("\n");
if(L.some(l=>l.includes("dish names but no prices"))){console.log("already present");process.exit(0);}
const i=L.findIndex(l=>/^6\. Fewer than 5 priced items/.test(l));
if(i<0){console.log("REFUSING: rule 6 missing");process.exit(1);}
L.splice(i,0,'',
'   Those three are the WHOLE list - do not invent a fourth. In particular, a',
'   site that publishes dish names but no prices is BLOCKED, not `not_found`:',
'   the restaurant is open, its own page is simply incomplete, and a delivery',
'   platform may well carry the prices. Retire it only if the OPERATOR is the',
'   one refusing to publish prices anywhere - a zoo or stadium concession, say -',
'   and say so in the reason. On 2026-09-04 an agent retired Tulum Seafood under',
'   a rule it made up for the occasion; it was held back and re-queued.');
fs.writeFileSync(p,L.join("\n"));
console.log("ok");
