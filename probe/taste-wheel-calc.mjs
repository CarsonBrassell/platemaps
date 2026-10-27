import fs from 'fs';
const D = JSON.parse(fs.readFileSync(process.argv[2],'utf8')).data;
const FAM = [['Brunch',['Breakfast & Brunch']],['Cafe & Sweets',['Coffee & Tea','Bakery & Desserts','Juice']],['Deli & Pub',['Sandwiches','American','Bars']],['Burgers & BBQ',['Burgers','BBQ','Chicken','Steakhouse','Fast Food']],['Pizza & Italian',['Pizza','Italian']],['Mexican & Latin',['Mexican','Latin American']],['Asian',['Japanese','Chinese','Korean','Thai','Vietnamese','Indian','Asian','Hawaiian']],['Med & Seafood',['Mediterranean','Seafood','Vegetarian','French','African']]];
const fam = c => FAM.findIndex(([,cs]) => cs.includes(c));
const sup = D.localSupplyListedRestaurantsByCuisine, tot = Object.values(sup).reduce((a,b)=>a+b,0);
const Q = FAM.map(([,cs]) => cs.reduce((a,c)=>a+(sup[c]||0),0)/tot);
const C = {MU:84.5,SD:8.7,KM:5,TCAP:1.5,DEAD:0.5,DCAP:1.5,FLOOR:1,K0:6,KC:0.15,AVE0:3,AVSPAN:5,AVMAX:0.25,SMIN:-0.45,SMAX:0.7};
const cl=(x,a,b)=>Math.min(b,Math.max(a,x)), r3=x=>Math.round(x*1000)/1000;
function person(p){
  const rated=p.posts.filter(x=>x.rating!=null), m=(rated.reduce((a,x)=>a+x.rating,0)+C.KM*C.MU)/(rated.length+C.KM);
  const L=Array(8).fill(0),Dip=Array(8).fill(0),DV=Array(8).fill(0),touch=Array(8).fill(0); let ev=p.posts.length;
  for(const x of p.posts){const f=fam(x.cuisine);touch[f]++;const t=x.rating==null?0:(x.rating-m)/C.SD;L[f]+=1+cl(t,0,C.TCAP);Dip[f]+=cl(-t-C.DEAD,0,C.DCAP);}
  for(const [k,w] of [['upvotes',1],['saves',1],['hearts',2],['downvotes',0]]) for(const [c,n] of Object.entries(p[k])){const f=fam(c);touch[f]+=n;ev+=n;if(w)L[f]+=w*n;else DV[f]+=n;}
  const T=L.reduce((a,b)=>a+b,0),K=Math.max(C.K0,C.KC*T),N=p.posts.length;
  const s=L.map((l,f)=>{const Dpre=2*DV[f]+Dip[f],De=Math.max(0,Dpre-C.FLOOR),E=N*Q[f],AV=touch[f]?0:C.AVMAX*cl((E-C.AVE0)/C.AVSPAN,0,1);return r3(cl((l-De)/(l+De+K)-AV,C.SMIN,C.SMAX));});
  return {m:r3(m),T:r3(T),K:r3(K),ev,s,thin:L.map((l,f)=>l+2*DV[f]+Dip[f]<2),split:L.map((l,f)=>Math.min(l,2*DV[f]+Dip[f])>=3)};
}
const a=person(D.calvin),b=person(D.carson);let sh=0,tt=0;
for(let i=0;i<8;i++){const ap=Math.max(a.s[i],0),bp=Math.max(b.s[i],0),an=Math.max(-a.s[i],0),bn=Math.max(-b.s[i],0);sh+=Math.min(ap,bp)+Math.min(an,bn);tt+=Math.max(ap,bp)+Math.max(an,bn);}
console.log(JSON.stringify({calvin:a,carson:b,shared:r3(sh),total:r3(tt),match:Math.round(100*sh/tt)}));
