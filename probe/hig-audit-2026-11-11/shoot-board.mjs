import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1100, height: 1400 } });
await p.goto("http://127.0.0.1:3077/BEFORE-AFTER.html", { waitUntil: "networkidle" });
const broken = await p.evaluate(() => [...document.images].filter(i => !i.naturalWidth).map(i => i.src));
console.log("images", await p.evaluate(() => document.images.length), "broken", JSON.stringify(broken));
await p.screenshot({ path: "probe/hig-audit-2026-11-11/board-check.jpg", quality: 60, type: "jpeg" });
await b.close();
