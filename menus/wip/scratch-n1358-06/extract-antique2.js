const fs = require('fs');
const path = 'C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/scratch-n1358-06/antique-menu.html';
let h = fs.readFileSync(path, 'utf8');
h = h.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");

// 1. Collect all component defs: id -> {top,left,text}
const defRe = /"([A-Za-z0-9_-]{6,12})":\[0,\{"type":\[0,"GridTextBox"\],"mobile":\[0,\{[^}]*\}\],"content":\[0,"([\s\S]*?)"\],"desktop":\[0,\{"top":\[0,(\d+)\],[^}]*?"left":\[0,(\d+)\]/g;
const defs = {};
let m;
while ((m = defRe.exec(h))) {
  let content = m[2].replace(/\\"/g, '"');
  let text = content.replace(/<[^>]+>/g, '').trim();
  if (!text) continue;
  defs[m[1]] = { top: parseInt(m[3]), left: parseInt(m[4]), text };
}
console.log('defs found', Object.keys(defs).length);

// 2. Collect block component-order lists: "components":[1,[[0,"id1"],[0,"id2"],...]]
const blockRe = /"components":\[1,\[((?:\[0,"[A-Za-z0-9_-]{6,12}"\],?)+)\]\]/g;
const blocks = [];
while ((m = blockRe.exec(h))) {
  const ids = [...m[1].matchAll(/"([A-Za-z0-9_-]{6,12})"/g)].map(x => x[1]);
  blocks.push(ids);
}
console.log('blocks found', blocks.length);

for (let bi = 0; bi < blocks.length; bi++) {
  const ids = blocks[bi];
  const items = ids.map(id => defs[id]).filter(Boolean);
  if (items.length === 0) continue;
  console.log('=== BLOCK', bi, 'items', items.length, '===');
  items.sort((a,b)=>a.top-b.top || a.left-b.left);
  for (const it of items) console.log(it.top, it.left, JSON.stringify(it.text));
}
