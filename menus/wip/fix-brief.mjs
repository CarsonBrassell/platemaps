import fs from "fs";
const p="probe/AGENT-BRIEF.md";
let L=fs.readFileSync(p,"utf8").split("\n");
const findBlock=(marker)=>{
  const s=L.findIndex(l=>l.includes(marker));
  if(s<0) return null;
  let a=s; while(a>0 && L[a-1].trim()!=="") a--;
  let b=s; while(b<L.length-1 && L[b+1].trim()!=="") b++;
  return {a,b};
};
const nf=findBlock("confidence` field is the declaration");
const mg=findBlock("Merging is the trap that keeps catching agents");
if(!nf||!mg){console.log("REFUSING: block not found");process.exit(1);}
const nfText=L.slice(nf.a,nf.b+1);
const mgText=L.slice(mg.a,mg.b+1);
// remove both blocks plus the blank line preceding each
const kill=new Set();
for(const blk of [nf,mg]){ for(let i=blk.a;i<=blk.b;i++) kill.add(i); if(L[blk.a-1]!==undefined&&L[blk.a-1].trim()==="") kill.add(blk.a-1); }
L=L.filter((_,i)=>!kill.has(i));
const after=(marker)=>{
  const s=L.findIndex(l=>l.includes(marker));
  if(s<0) return -1;
  let b=s; while(b<L.length-1 && L[b+1].trim()!=="") b++;
  return b+1;
};
const i5=after("**`not_found` is permanent**");
if(i5<0){console.log("REFUSING: rule 5 missing");process.exit(1);}
L.splice(i5,0,...["",...nfText]);
const i1=after("**Never construct a price.**");
if(i1<0){console.log("REFUSING: rule 1 missing");process.exit(1);}
L.splice(i1,0,...["",...mgText]);
fs.writeFileSync(p,L.join("\n"));
console.log("reattached: merge para after rule 1, not_found para after rule 5");
