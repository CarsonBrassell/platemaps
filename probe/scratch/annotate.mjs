import sharp from "sharp";
const f = "C:/Users/Calvin  Lensink/.claude/uploads/859e1bab-eb9d-472e-814b-473ee9aa0576/2e61ad69-image.png";
const H = 2556, W = 1179;
const y = (css) => Math.round(css / 852 * H);
const regions = [
  ["A", 0, 59, "top 59px — under the clock"],
  ["B", 530, 677, "dark map above the pills"],
  ["C", 719, 764, "between pills and nav"],
  ["D", 824, 852, "28px under the nav"],
];
const boxes = regions.map(([id, a, b, label]) => {
  const top = y(a), h = y(b) - y(a);
  return `<rect x="6" y="${top}" width="${W - 12}" height="${h}" fill="#ff00d4" fill-opacity="0.16" stroke="#ff00d4" stroke-width="5"/>
    <rect x="14" y="${top + 8}" width="${64 + label.length * 15}" height="52" rx="8" fill="#000" fill-opacity="0.8"/>
    <text x="26" y="${top + 46}" font-family="monospace" font-size="40" font-weight="700" fill="#ff00d4">${id}</text>
    <text x="72" y="${top + 45}" font-family="monospace" font-size="30" fill="#fff">${label}</text>`;
}).join("\n");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${boxes}</svg>`;
await sharp(f).composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png().toFile("probe/scratch/which-strip.png");
console.log("written");
