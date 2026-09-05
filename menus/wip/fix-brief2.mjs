import fs from "fs";
const p="probe/AGENT-BRIEF.md";
let L=fs.readFileSync(p,"utf8").split("\n");
const grab=(marker)=>{
  const s=L.findIndex(l=>l.includes(marker));
  if(s<0) return null;
  let a=s; while(a>0 && L[a-1].trim()!=="") a--;
  let b=s; while(b<L.length-1 && L[b+1].trim()!=="") b++;
  return {a,b,text:L.slice(a,b+1)};
};
const mg=grab("Merging is the trap that keeps catching agents");
const nf=grab("confidence` field is the declaration");
if(!mg||!nf){console.log("REFUSING: orphan block not found");process.exit(1);}
const kill=new Set();
for(const blk of [mg,nf]){for(let i=blk.a;i<=blk.b;i++)kill.add(i); if(L[blk.a-1]!==undefined&&L[blk.a-1].trim()==="")kill.add(blk.a-1);}
L=L.filter((_,i)=>!kill.has(i));
const reindent=t=>t.map(l=>"   "+l.replace(/^\s+/,""));
const before=(re,text)=>{
  const i=L.findIndex(l=>re.test(l));
  if(i<0){console.log("REFUSING: no line matching "+re);process.exit(1);}
  L.splice(i,0,...["",...reindent(text)]);
};
before(/^6\. Fewer than 5 priced items/, nf.text);
before(/^2\. \*\*Never pipe large page content/, mg.text);
fs.writeFileSync(p,L.join("\n"));
console.log("ok");
