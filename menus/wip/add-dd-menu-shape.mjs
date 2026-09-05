import fs from "fs";
const p="probe/AGENT-BRIEF.md";
const L=fs.readFileSync(p,"utf8").split("\n");
if(L.some(l=>l.includes('@type:"Menu"'))){console.log("already present - no edit");process.exit(0);}
const a=L.findIndex(l=>l.includes("DoorDash embeds its schema.org JSON-LD TWICE"));
if(a<0){console.log("REFUSING: anchor missing");process.exit(1);}
let i=a+1;
while(i<L.length && !/^- \*\*/.test(L[i])) i++;
if(i>=L.length){console.log("REFUSING: no following bullet found");process.exit(1);}
const add=[
'- **DoorDash also serves a second JSON-LD shape.** Alongside the',
'  `@type:"Restaurant"` wrapper some stores carry a standalone `@type:"Menu"`',
'  block with `hasMenuSection` -> `hasMenuItem` -> `offers.price`. It is cleaner',
'  than the wrapper and is sometimes the ONLY place the prices live. Confirmed on',
'  2026-09-04. Check both shapes before calling a DoorDash store client-rendered.',
'  The duplicate-block rule above still applies: dedupe on name+price.',
''];
L.splice(i,0,...add);
fs.writeFileSync(p,L.join("\n"));
console.log("inserted at line "+(i+1));
