// After the HIG visual fixes landed in source: real renders, no injection except hiding the Next dev badge.
export default async function (h) {
  const hide = (p) => h.css(p, "nextjs-portal{display:none!important}");
  const step = async (name, fn) => {
    if (process.env.ONLY && !process.env.ONLY.split(",").includes(name)) return;
    try { await fn(); h.log("ok", name); } catch (e) { h.log("FAIL", name, e.message.split("\n")[0]); }
  };
  await step("map", async () => {
    const p = await h.open();
    await h.go(p, "/m/feed", 4000); await hide(p); await h.openMap(p);
    const sizes = await p.evaluate(() => [...document.querySelectorAll(".maplibregl-ctrl-group button")].map((b) => `${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`));
    h.log("map buttons", JSON.stringify(sizes));
    await h.hitboxes(p, ".maplibregl-ctrl-group button");
    await h.shot(p, "map");
  });
  await step("discover", async () => {
    const p = await h.open();
    await h.go(p, "/m", 5000); await hide(p);
    await p.evaluate(() => window.scrollTo(0, 120)); await p.waitForTimeout(600);
    const n = await p.evaluate(() => {
      let n = 0;
      for (const el of document.querySelectorAll("body *")) {
        const t = [...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim());
        if (t && parseFloat(getComputedStyle(el).fontSize) < 11) { el.style.outline = "2px solid #dc2626"; n++; }
      }
      return n;
    });
    h.log("under 11px", n);
    await h.shot(p, "discover");
  });
  await step("feed", async () => {
    const p = await h.open();
    await h.go(p, "/m/feed", 5000); await hide(p);
    await p.evaluate(() => document.querySelector('a[href*="/restaurant/"]').scrollIntoView({ block: "center" }));
    await p.waitForTimeout(800);
    const hits = await p.evaluate(() => [...document.querySelectorAll('a[href*="/restaurant/"]')].slice(0, 3).map((a) => { const r = a.getBoundingClientRect(); const el = document.elementFromPoint(r.left + 4, r.top - 10); return el && (el === a || a.contains(el)); }));
    h.log("tap 10px above link hits it", JSON.stringify(hits));
    await h.hitboxes(p, 'a[href*="/restaurant/"]', { pad: 14 });
    await h.shot(p, "feed");
  });
}
