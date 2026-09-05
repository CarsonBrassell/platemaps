import fs from "fs";
const p="probe/AGENT-BRIEF.md";
const L=fs.readFileSync(p,"utf8").split("\n");
const anchor=/^\*\*A price level below plausible 2026 is stale/;
const i=L.findIndex(l=>anchor.test(l));
if(i<0){console.log("REFUSING: anchor not found");process.exit(1);}
if(L.join("\n").includes("signature of a uniform markup")){console.log("REFUSING: already present");process.exit(1);}
const text=`**A tight cluster of identical cent endings is the SIGNATURE of a uniform
markup on round base prices, not evidence against one.** Juice Stop Encinitas
was filed from DoorDash at 68 items because the dominant \`.40\` ending "read as
a flat smoothie base price" with distinct premiums above it. The screen found
50 of those 68 divide by **1.08** onto round dollars — because $5.00 x 1.08 is
exactly $5.40. The cluster the agent explained away WAS the markup. This is the
third such catch (Mosa Tea 1.10 on 100% of 64 rows, Pina Smoothies 1.03 on 77%,
Juice Stop 1.08 on 74%), and in all three the agent reported its own test as
passing. **Run the divisor sweep BEFORE you reason about what the cents mean.**
An explanation for a cent pattern is not a test of it, and a story that accounts
for the pattern is the least reliable moment to stop checking.`.split("\n");
L.splice(i,0,...text,"");
fs.writeFileSync(p,L.join("\n"));
console.log("inserted at line "+(i+1));
