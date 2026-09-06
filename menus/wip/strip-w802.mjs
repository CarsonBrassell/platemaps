import { readFileSync } from 'fs';
let html = readFileSync(0, 'utf8');
// remove scripts/styles
html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
// convert breaks
html = html.replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])[^>]*>/gi, '\n');
let text = html.replace(/<[^>]+>/g, ' ');
text = text.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"');
text = text.replace(/[ \t]+/g,' ').split('\n').map(l=>l.trim()).filter(Boolean).join('\n');
process.stdout.write(text.slice(0, 15000));
