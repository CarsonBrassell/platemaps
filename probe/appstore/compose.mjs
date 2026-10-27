// Frame raw screens into 1320x2868 App Store images (iPhone 6.9").
// usage: node compose.mjs name "LABEL" "Headline" [dark]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [name, label, headline, dark] = process.argv.slice(2);
const img = 'data:image/png;base64,' + fs.readFileSync(`probe/appstore/raw/${name}.png`).toString('base64');
const bg = dark ? '#1c1a16' : '#F7F4EC', fg = dark ? '#F7F4EC' : '#232019';
const html = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Spline+Sans+Mono:wght@500&display=block" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{width:1320px;height:2868px;background:${bg};overflow:hidden;font-family:Fraunces,serif;color:${fg};position:relative}
.label{position:absolute;top:200px;left:0;right:0;text-align:center;font:500 40px 'Spline Sans Mono',monospace;letter-spacing:.18em;color:#C9591F}
.label:before{content:'';display:inline-block;width:16px;height:16px;border-radius:50%;background:#C9591F;margin-right:22px;vertical-align:middle;position:relative;top:-3px}
h1{position:absolute;top:290px;left:90px;right:90px;text-align:center;font-weight:700;font-size:124px;line-height:1.04;letter-spacing:-.02em}
.phone{position:absolute;left:50%;top:${process.env.FULL?720:780}px;width:${process.env.FULL?960:1060}px;transform:translateX(-50%);border-radius:130px;background:#0f0e0c;padding:26px;}
.phone img{display:block;width:100%;border-radius:106px}
</style></head><body>
<div class="label">${label}</div><h1>${headline}</h1>
<div class="phone"><img src="${img}"></div></body></html>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1320, height: 2868 } });
await p.setContent(html, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: `probe/appstore/out/${name}.png` });
await b.close(); console.log('out/' + name + '.png');
