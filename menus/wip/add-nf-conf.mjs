import fs from "fs";
const p="probe/AGENT-BRIEF.md";
const L=fs.readFileSync(p,"utf8").split("\n");
if(L.some(l=>l.includes("If your own confidence is `medium` or `low`"))){console.log("already present");process.exit(0);}
const a=L.findIndex(l=>l.includes("`not_found` is permanent"));
if(a<0){console.log("REFUSING: anchor missing");process.exit(1);}
let i=a+1;
while(i<L.length && L[i].trim()!=="") i++;
if(i>=L.length){console.log("REFUSING: no paragraph end");process.exit(1);}
const add=['',
'  Your own `confidence` field is the declaration of whether you actually',
'  confirmed it. If your own confidence is `medium` or `low`, the correct',
'  outcome is `blocked`, not `not_found` - say what would settle it. A wrong',
'  `not_found` deletes a live restaurant from the corpus and only a hand-written',
'  DELETE brings it back; a wrong `blocked` costs one more pass. On 2026-09-04 a',
'  batch retired four bars on medium-confidence Yelp and menupix evidence alone;',
'  all four were held back and re-queued.'];
L.splice(i,0,...add);
fs.writeFileSync(p,L.join("\n"));
console.log("inserted after line "+i);
