import sharp from "sharp";
const f = "C:/Users/Calvin  Lensink/.claude/uploads/859e1bab-eb9d-472e-814b-473ee9aa0576/2e61ad69-image.png";
const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
console.log("image", W, "x", H);
const px = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i+1], data[i+2]]; };
const near = (p, t, tol) => Math.abs(p[0]-t[0])<tol && Math.abs(p[1]-t[1])<tol && Math.abs(p[2]-t[2])<tol;
// walk up from the bottom, report each row's uniformity on the left edge strip (x 0..300)
// so the nav pill / search chips (which start ~x=40) don't confuse it: use x 0..30 only
let runs = [];
let cur = null;
for (let y = 0; y < H; y++) {
  const first = px(2, y);
  let varied = false;
  for (let x = 2; x < 34; x += 2) if (!near(px(x, y), first, 8)) { varied = true; break; }
  const key = varied ? "map" : `flat ${first.join(",")}`;
  if (!cur || cur.key !== key) { cur = { key, from: y, to: y }; runs.push(cur); } else cur.to = y;
}
for (const r of runs.filter(r => r.to - r.from > 12)) {
  console.log(`${String(r.from).padStart(4)}-${String(r.to).padStart(4)}  css ${(r.from/H*852).toFixed(1)}-${((r.to+1)/H*852).toFixed(1)}  ${r.key}`);
}
