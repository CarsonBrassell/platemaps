const fs = require('fs');
const path = 'C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/scratch-n1358-06/antique-menu.html';
let h = fs.readFileSync(path, 'utf8');
h = h.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");

// Find each GridTextBox object's desktop top/left and content, in the raw escaped JSON.
// Pattern: "type":[0,"GridTextBox"] ... "content":[0,"<p ...>TEXT</p>..."] ... "desktop":[0,{"top":[0,N], ... "left":[0,M], ...
const re = /"type":\[0,"GridTextBox"\],"mobile":\[0,\{[^}]*\}\],"content":\[0,"([\s\S]*?)"\],"desktop":\[0,\{"top":\[0,(\d+)\],[^}]*?"left":\[0,(\d+)\]/g;
let m;
const rows = [];
while ((m = re.exec(h))) {
  let content = m[1];
  content = content.replace(/\\"/g, '"');
  let text = content.replace(/<[^>]+>/g, '').trim();
  if (!text) continue;
  rows.push({ top: parseInt(m[2]), left: parseInt(m[3]), text });
}
console.log('total text boxes', rows.length);
for (const r of rows) {
  console.log(r.top, r.left, JSON.stringify(r.text));
}
