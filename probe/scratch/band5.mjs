import sharp from "sharp";
const f = "C:/Users/Calvin  Lensink/.claude/uploads/859e1bab-eb9d-472e-814b-473ee9aa0576/2e61ad69-image.png";
const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const px = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i+1], data[i+2]]; };
const mean = [];
for (let y = 0; y < H; y++) { let s = 0, n = 0; for (let x = 0; x < W; x += 3) { const p = px(x, y); s += (p[0]+p[1]+p[2])/3; n++; } mean.push(s/n); }
const steps = [];
for (let y = 6; y < H - 6; y++) {
  const a = (mean[y-6]+mean[y-5]+mean[y-4]) / 3;
  const b = (mean[y+4]+mean[y+5]+mean[y+6]) / 3;
  steps.push([Math.abs(b - a), y, a.toFixed(1), b.toFixed(1)]);
}
steps.sort((p, q) => q[0] - p[0]);
const seen = [];
for (const [d, y, a, b] of steps) {
  if (seen.some(s => Math.abs(s - y) < 40)) continue;
  seen.push(y);
  console.log(`step ${d.toFixed(1)} at row ${y} css ${(y/H*852).toFixed(1)}  ${a} -> ${b}`);
  if (seen.length >= 8) break;
}
