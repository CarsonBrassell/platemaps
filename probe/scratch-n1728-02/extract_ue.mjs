import fs from 'fs';
const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');
const m = html.match(/<script type="application\/json" id="__REACT_QUERY_STATE__"[^>]*>([\s\S]*?)<\/script>/);
if (!m) { console.log('no __REACT_QUERY_STATE__ found'); process.exit(1); }
let raw = m[1];
raw = raw.split('\\u0022').join('"');
raw = raw.split('%5C"').join('\\"');
fs.writeFileSync(file + '.rqs.json', raw);
let data;
try { data = JSON.parse(raw); } catch (e) { console.log('parse error', e.message); process.exit(1); }

// walk to find catalogSectionsMap and catalogItems
let sectionsMap = null, catalogItems = null;
function walk(obj) {
  if (Array.isArray(obj)) { obj.forEach(walk); return; }
  if (obj && typeof obj === 'object') {
    if (obj.catalogSectionsMap && !sectionsMap) sectionsMap = obj.catalogSectionsMap;
    if (obj.catalogItems && !catalogItems) catalogItems = obj.catalogItems;
    for (const k of Object.keys(obj)) walk(obj[k]);
  }
}
walk(data);
console.log('sectionsMap found:', !!sectionsMap, 'catalogItems found:', !!catalogItems);
if (sectionsMap) fs.writeFileSync(file + '.sectionsMap.json', JSON.stringify(sectionsMap, null, 2));
if (catalogItems) fs.writeFileSync(file + '.catalogItems.json', JSON.stringify(catalogItems, null, 2));
