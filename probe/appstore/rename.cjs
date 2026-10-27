// Swap the usernames on the map bubbles; shift the rest of each meta line to follow.
const sharp = require('sharp'), { chromium } = require('playwright');
const SRC = 'probe/appstore/raw/full-map.png';
// [line top, line bottom, name start x, old length, card right edge, new name]
const LINES = [[712, 760, 518, 10, 1160, '@CARSON'], [1114, 1162, 236, 12, 900, '@ELLIE'], [1776, 1824, 527, 12, 1179, '@CALVIN']];
(async () => {
  const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, px = (x, y) => (y * W + x) * 3;
  const br = await chromium.launch(); const pg = await br.newPage();
  for (const [t, b, S, n, R, name] of LINES) {
    // measure the old name: cell pitch, ink colour, cap top/bottom
    let x1 = 0, top = 1e9, bot = 0, dark = [255, 255, 255];
    for (let x = S; x < S + n * 22; x++) for (let y = t; y < b; y++) { const i = px(x, y); const s = data[i] + data[i + 1] + data[i + 2]; if (s < 600) { x1 = Math.max(x1, x); top = Math.min(top, y); bot = Math.max(bot, y); if (s < dark[0] + dark[1] + dark[2]) dark = [data[i], data[i + 1], data[i + 2]]; } }
    const bg = [data[px(S - 4, t + 2)], data[px(S - 4, t + 2) + 1], data[px(S - 4, t + 2) + 2]];
    let x0 = S; while ((() => { for (let y = t; y < b; y++) { const i = px(x0, y); if (data[i] + data[i + 1] + data[i + 2] < 600) return false } return true })()) x0++;
    const pitch = (x1 - x0 + 3) / n;
    const restFrom = Math.round(x0 + (n + 0.15) * pitch), restTo = Math.round(x0 + (name.length + 0.15) * pitch);
    // shift remainder left
    for (let y = t; y < b; y++) {
      for (let x = restTo; x < R; x++) { const sx = x + (restFrom - restTo); const d = px(x, y); if (sx < R) { const s = px(sx, y); data[d] = data[s]; data[d + 1] = data[s + 1]; data[d + 2] = data[s + 2]; } else { data[d] = bg[0]; data[d + 1] = bg[1]; data[d + 2] = bg[2]; } }
      for (let x = x0 - 2; x < restTo; x++) { const d = px(x, y); data[d] = bg[0]; data[d + 1] = bg[1]; data[d + 2] = bg[2]; }
    }
    // render new name to match pitch + cap height
    const fs = pitch / 0.6;
    await pg.setContent(`<link href="https://fonts.googleapis.com/css2?family=Spline+Sans+Mono:wght@500&display=block" rel="stylesheet"><body style="margin:0;background:rgb(${bg})"><span id=s style="font:500 ${fs}px 'Spline Sans Mono';color:rgb(${dark});line-height:1;display:inline-block;padding:10px 0">${name}</span></body>`, { waitUntil: 'networkidle' });
    await pg.evaluate(() => document.fonts.ready);
    const buf = await (await pg.$('#s')).screenshot();
    const r = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    let ct = 1e9, cb = 0, cl = 1e9;
    for (let y = 0; y < r.info.height; y++) for (let x = 0; x < r.info.width; x++) { const i = (y * r.info.width + x) * r.info.channels; if (r.data[i] + r.data[i + 1] + r.data[i + 2] < 600) { ct = Math.min(ct, y); cb = Math.max(cb, y); cl = Math.min(cl, x); } }
    const scale = (bot - top) / (cb - ct);
    const g = await sharp(buf).resize(Math.round(r.info.width * scale)).raw().toBuffer({ resolveWithObject: true });
    const ox = x0 - Math.round(cl * scale), oy = top - Math.round(ct * scale);
    for (let y = 0; y < g.info.height; y++) for (let x = 0; x < g.info.width; x++) { const X = ox + x, Y = oy + y; if (X < x0 - 2 || X >= restTo || Y < t || Y >= b) continue; const s = (y * g.info.width + x) * g.info.channels, d = px(X, Y); data[d] = g.data[s]; data[d + 1] = g.data[s + 1]; data[d + 2] = g.data[s + 2]; }
    console.log(name, 'pitch', pitch.toFixed(2), 'scale', scale.toFixed(3), 'ink', dark, 'bg', bg);
  }
  await br.close();
  await sharp(data, { raw: { width: W, height: info.height, channels: 3 } }).png().toFile(SRC);
  const rows = LINES.map(([t]) => sharp(SRC).extract({ left: 200, top: t - 8, width: 979, height: 64 }).toBuffer());
  const bs = await Promise.all(rows);
  await sharp({ create: { width: 979, height: 200, channels: 3, background: '#f0f' } }).composite(bs.map((x, i) => ({ input: x, left: 0, top: i * 67 }))).png().toFile('probe/appstore/out/names.png');
})();
