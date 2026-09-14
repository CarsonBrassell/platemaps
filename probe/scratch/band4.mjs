import sharp from "sharp";
for (const [tag, f] of [
  ["BEFORE", "C:/Users/Calvin  Lensink/.claude/uploads/859e1bab-eb9d-472e-814b-473ee9aa0576/892b1dc5-image.png"],
  ["AFTER ", "C:/Users/Calvin  Lensink/.claude/uploads/859e1bab-eb9d-472e-814b-473ee9aa0576/2e61ad69-image.png"],
]) {
  const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const px = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i+1], data[i+2]]; };
  const isCream = (p) => Math.abs(p[0]-237)<14 && Math.abs(p[1]-232)<14 && Math.abs(p[2]-220)<16;
  const rows = [];
  for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x += 3) if (isCream(px(x, y))) n++; if (n > (W/3)*0.35) rows.push(y); }
  const css = (r) => (r / H * 852).toFixed(1);
  console.log(`${tag} nav-bar cream rows ${rows[0]}-${rows.at(-1)}  css ${css(rows[0])}-${css(rows.at(-1)+1)}  gap below = ${(852 - (rows.at(-1)+1)/H*852).toFixed(1)}px`);
  // detail profile: variance per row, sampled
  const varAt = (y) => { let s=0,s2=0,n=0; for (let x=0;x<W;x+=3){const p=px(x,y);const v=(p[0]+p[1]+p[2])/3;s+=v;s2+=v*v;n++;} return Math.sqrt(s2/n-(s/n)**2); };
  const prof = [];
  for (let cssY = 600; cssY < 852; cssY += 20) prof.push(`${cssY}:${varAt(Math.round(cssY/852*H)).toFixed(1)}`);
  console.log(`       row detail (stddev) ${prof.join("  ")}`);
}
