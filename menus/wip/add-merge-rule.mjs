import fs from "fs";
const p="probe/AGENT-BRIEF.md";
const L=fs.readFileSync(p,"utf8").split("\n");
if(L.some(l=>l.includes("virtual-brand listings"))){console.log("already present");process.exit(0);}
const a=L.findIndex(l=>l.includes("Never construct a price"));
if(a<0){console.log("REFUSING: anchor missing");process.exit(1);}
let i=a+1;
while(i<L.length && L[i].trim()!=="") i++;
if(i>=L.length){console.log("REFUSING: no paragraph end");process.exit(1);}
const add=['',
'  Merging is the trap that keeps catching agents. On 2026-09-04 a batch filed',
'  @Spacebar Cafe by merging its two Uber Eats virtual-brand listings by dish',
'  name, noting ~5-10% price drift on the overlapping items. That drift is the',
'  whole problem: where two listings disagree, any merged price is a price',
'  NEITHER source states, and the loader cannot tell it from a real one. Two',
'  listings that disagree is a BLOCK. Say which two sources and how far apart.'];
L.splice(i,0,...add);
fs.writeFileSync(p,L.join("\n"));
console.log("inserted after line "+i);
