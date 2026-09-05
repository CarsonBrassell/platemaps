import fs from "fs";
const p="probe/AGENT-BRIEF.md";
const L=fs.readFileSync(p,"utf8").split("\n");
if(L.some(l=>l.includes("Write the result file INCREMENTALLY"))){console.log("already present");process.exit(0);}
const i=L.findIndex(l=>/^8\. Use full explicit Windows paths/.test(l));
if(i<0){console.log("REFUSING: rule 8 missing");process.exit(1);}
L.splice(i+1,0,
'9. **Write the result file INCREMENTALLY.** Rewrite the whole result file after',
'   every 3-4 restaurants rather than once at the end. Sessions get killed by',
'   rate limits mid-batch: on 2026-09-04 four agents died at once and only the',
'   one that had already written its file kept any work. A partial file with',
'   correct entries is worth far more than a perfect file that never got',
'   written. Entries you have not reached yet simply are not in it.');
fs.writeFileSync(p,L.join("\n"));
console.log("ok");
