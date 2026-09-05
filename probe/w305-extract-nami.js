const fs = require('fs');
const file = process.argv[2];
const section = process.argv[3];
const h = fs.readFileSync(file, 'utf8');
const re = /<h3 class="elementskit-info-box-title">\s*([^<]+?)\s*<\/h3>([\s\S]*?)\$(\d+\.\d{2})/g;
let m;
let count = 0;
while ((m = re.exec(h))) {
  let name = m[1].trim();
  let descRaw = m[2];
  // strip tags from desc
  let desc = descRaw.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  // desc may contain leftover from previous unrelated markup; truncate to reasonable length
  if (desc.length > 300) desc = desc.slice(0, 300);
  const price = '$' + m[3];
  console.log(JSON.stringify({ name, desc, price, section }));
  count++;
}
console.error(file, 'items:', count);
