import fs from "fs";
const p="probe/AGENT-BRIEF.md";
let t=fs.readFileSync(p,"utf8");
let n=0;
const A="never execute, and block the restaurant rather than hunting for a menu on them.";
if(t.includes(A) && !t.includes("haciendadevega.com")){
  t=t.replace(A, A+"\n`haciendadevega.com` (Hacienda De Vega) is hijacked too and now serves an\nAlibaba/Taobao storefront. **A domain that resolves to something wholly\nunrelated to food is a hijack, not a redesign** - do not dig deeper into it for\na menu; block the restaurant and name the domain.");
  n++;
}else{console.log("skip hijack: anchor missing or already present");}
const B=/^\*\*A tight cluster of identical cent endings/m;
if(B.test(t) && !t.includes("never write a sample")){
  t=t.replace(B, `**The result file must contain EVERY dish you captured - never write a sample.**
Taco King was reported as an 80-item Uber Eats catalog but its result file held
10 dishes, all from one section, and it loaded as that restaurant's COMPLETE
menu. Nothing downstream knows your file was an excerpt. If your report says 80,
the file has 80. **A filed menu whose dishes all share a single section is the
signature of a truncated capture** - either you only got one section, in which
case it is a PARTIAL and must be blocked, or you sampled, which is worse.

$&`);
  n++;
}else{console.log("skip sample: anchor missing or already present");}
if(n===0){console.log("REFUSING: nothing to do");process.exit(1);}
fs.writeFileSync(p,t);
console.log("applied "+n+" addition(s)");
