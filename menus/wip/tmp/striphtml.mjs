import fs from 'fs';
const file = process.argv[2];
let html = fs.readFileSync(file, 'utf-8');
// remove script/style
html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
// convert block-level tags to newlines
html = html.replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/td)[^>]*>/gi, '\n');
html = html.replace(/<[^>]+>/g, '');
html = html.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#036;/g, '$');
html = html.replace(/[ \t]+/g, ' ');
html = html.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n');
fs.writeFileSync(file + '.txt', html);
console.log('wrote', file + '.txt', html.length);
