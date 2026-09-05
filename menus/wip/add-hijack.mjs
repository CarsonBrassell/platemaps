import fs from "fs";
const p="probe/AGENT-BRIEF.md";
let t=fs.readFileSync(p,"utf8");
if(t.includes("haciendadevega.com")){console.log("REFUSING: already present");process.exit(1);}
const anchor="obfuscated ad-injection chains. Text-extract only, never execute.";
if(!t.includes(anchor)){console.log("REFUSING: anchor not found");process.exit(1);}
t=t.replace(anchor, anchor+" `haciendadevega.com` (Hacienda De Vega) is hijacked and now serves an Alibaba/Taobao e-commerce storefront with no restaurant content at all. **A domain that resolves to something completely unrelated to food is a hijack, not a redesign** - do not go looking for the menu deeper in it, block the restaurant and name the domain.");
fs.writeFileSync(p,t);
console.log("added haciendadevega.com to hostile list");
