import sharp from "sharp";
const f = "C:/Users/Calvin  Lensink/.claude/uploads/859e1bab-eb9d-472e-814b-473ee9aa0576/892b1dc5-image.png";
const img = sharp(f);
const meta = await img.metadata();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
console.log("image", W, "x", H, "channels", C);
const px = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };
const near = (p, t, tol = 60) => Math.abs(p[0]-t[0])<tol && Math.abs(p[1]-t[1])<tol && Math.abs(p[2]-t[2])<tol;
const targets = { magenta:[255,0,212], cyan:[0,229,255], green:[124,255,0] };
for (const [name, t] of Object.entries(targets)) {
  const rows = [];
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x += 4) if (near(px(x, y), t)) n++;
    if (n > (W / 4) * 0.6) rows.push(y);
  }
  const cssTop = rows.length ? (rows[0] / H * 852).toFixed(1) : "-";
  const cssBot = rows.length ? ((rows.at(-1) + 1) / H * 852).toFixed(1) : "-";
  console.log(name.padEnd(8), rows.length ? `rows ${rows[0]}-${rows.at(-1)}  css ${cssTop} -> ${cssBot}` : "NOT PAINTED");
}
// last row that is not a flat single colour
let lastVaried = -1;
for (let y = H - 1; y >= 0; y--) {
  const first = px(0, y); let varied = false;
  for (let x = 4; x < W; x += 4) if (!near(px(x, y), first, 6)) { varied = true; break; }
  if (varied) { lastVaried = y; break; }
}
console.log("last varied row", lastVaried, "css", (lastVaried / H * 852).toFixed(1), "colour below:", px(10, H - 3));
