import sharp from "sharp";
for (const [tag, f] of [
  ["BEFORE", "C:/Users/Calvin  Lensink/.claude/uploads/859e1bab-eb9d-472e-814b-473ee9aa0576/892b1dc5-image.png"],
  ["AFTER ", "C:/Users/Calvin  Lensink/.claude/uploads/859e1bab-eb9d-472e-814b-473ee9aa0576/2e61ad69-image.png"],
]) {
  const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const px = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i+1], data[i+2]]; };
  const flat = (y) => { const a = px(0, y); for (let x = 2; x < W; x += 2) { const p = px(x, y); if (Math.abs(p[0]-a[0])>6||Math.abs(p[1]-a[1])>6||Math.abs(p[2]-a[2])>6) return false; } return true; };
  // top: first non-flat row
  let firstVaried = 0; while (firstVaried < H && flat(firstVaried)) firstVaried++;
  // bottom: last non-flat row
  let lastVaried = H - 1; while (lastVaried > 0 && flat(lastVaried)) lastVaried--;
  const css = (r) => (r / H * 852).toFixed(1);
  console.log(`${tag} top flat 0-${firstVaried - 1} (css 0-${css(firstVaried)})   bottom flat ${lastVaried + 1}-${H - 1} (css ${css(lastVaried + 1)}-852)  colours top=${px(0,2)} bottom=${px(0,H-3)}`);
}
