// Replace the music Live Activity island with the plain resting Dynamic Island:
// diffuse the surrounding pixels into the expanded island's shape, then draw the resting pill.
const sharp = require('sharp');
const [src, out, mode] = process.argv.slice(2);
(async () => {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, C = 3, x0 = 288, x1 = 879, y0 = 24, y1 = 153, r = 65;
  const inMask = (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = (y0 + y1) / 2;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const f = Float32Array.from(data);
  const pts = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inMask(x, y)) pts.push((y * W + x) * C);
  // flat status bars: blend each row between its two edges; photos: relax into a smooth fill
  if (mode === "rows") { for (const i of pts) { const p = i / C, y = Math.floor(p / W), x = p % W; let a = x, b = x; while (inMask(a, y)) a--; while (inMask(b, y)) b++; const t = (x - a) / (b - a); for (let c = 0; c < 3; c++) f[i + c] = data[(y * W + a) * C + c] * (1 - t) + data[(y * W + b) * C + c] * t; } } else
  for (let it = 0; it < 3000; it++) for (const i of pts) for (let c = 0; c < 3; c++)
    f[i + c] = (f[i + c - C] + f[i + c + C] + f[i + c - W * C] + f[i + c + W * C]) / 4;
  for (const i of pts) for (let c = 0; c < 3; c++) data[i + c] = Math.round(f[i + c]);
  const pill = Buffer.from(`<svg width="${W}" height="200" xmlns="http://www.w3.org/2000/svg"><rect x="${W / 2 - 189}" y="34" width="378" height="110" rx="55" fill="#000"/></svg>`);
  await sharp(data, { raw: { width: W, height: info.height, channels: 3 } }).composite([{ input: pill, top: 0, left: 0 }]).png().toFile(out);
})();
