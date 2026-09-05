import fs from 'fs';
const cats = {20166:'Mon Khai Vi (Appetizers)',20167:'An Tai Cho Hoac Togo',20168:'Chao (Rice Porridge)',20169:'Mien (Glass Noodle Soup)',20170:'Banh Canh (Thick Noodle Soup)',20171:'Mi (Egg Noodle Soup)'};
let all = [];
for (const [id,label] of Object.entries(cats)) {
  const html = fs.readFileSync(`tuthanh_cat_${id}.html`,'utf8');
  const re = /<span class="pull-right"[^>]*>(\$[0-9.]+)<\/span>[\s\S]*?<h4 class="media-heading">\s*([^<]+?)\s*<\/h4>\s*<div class="text-sm[^"]*"[^>]*>([^<]*)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    all.push({ section: label, price: m[1], name: m[2].trim(), description: m[3].trim() });
  }
}
console.log('total items:', all.length);
fs.writeFileSync('tuthanh_items.json', JSON.stringify(all, null, 2));
for (const i of all) console.log(i.section,'|',i.name,'|',i.price,'|',i.description);
