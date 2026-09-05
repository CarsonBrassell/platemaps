const fs = require('fs');
const h = fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/bam1.html', 'utf8');
const blocks = [...h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
console.log('found', blocks.length, 'ld+json blocks');
blocks.forEach((b,i)=>{
  try {
    const j = JSON.parse(b);
    console.log(i, Array.isArray(j)?'array':j['@type'], JSON.stringify(j).length);
  } catch(e){ console.log(i,'PARSE ERROR', e.message); }
});
fs.writeFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/bam_ld.json', JSON.stringify(blocks.map(b=>{try{return JSON.parse(b);}catch(e){return null;}}), null, 2));
