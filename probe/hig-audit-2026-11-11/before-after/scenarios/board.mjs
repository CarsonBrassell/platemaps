// Before/after board for the visual HIG items. CSS/DOM injection only; no source edits.
const SHEET = (title, rows) => `
  const wrap = document.createElement('div'); wrap.id='__hig_mock';
  wrap.style.cssText='position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:center;padding:0 8px 42px';
  wrap.innerHTML = \`<div style="width:100%;font-family:-apple-system,system-ui,sans-serif">
    <div style="background:rgba(255,255,255,.96);border-radius:14px;overflow:hidden;text-align:center">
      ${title ? `<div style="padding:14px 16px;font-size:13px;color:#71717a;border-bottom:1px solid #e4e4e7">${title}</div>` : ""}
      ${rows.map((r, i) => `<div style="padding:17px;font-size:19px;${r.red ? "color:#dc2626;" : "color:#A8481A;"}${i ? "border-top:1px solid #e4e4e7" : ""}">${r.t}</div>`).join("")}
    </div>
    <div style="margin-top:8px;background:#fff;border-radius:14px;padding:17px;text-align:center;font-size:19px;font-weight:600;color:#A8481A">Cancel</div></div>\`;
  document.body.appendChild(wrap);`;

export default async function (h) {
  const step = async (name, fn) => {
    if (process.env.ONLY && !process.env.ONLY.split(",").includes(name)) return;
    try { await fn(); h.log("ok", name); } catch (e) { h.log("FAIL", name, e.message.split("\n")[0]); }
  };

  // #5 map buttons + #3 status bar over the map
  await step("map", async () => {
    const p = await h.open();
    await h.go(p, "/m/feed", 4000); await h.css(p, "nextjs-portal{display:none!important}"); await h.openMap(p);
    const sel = ".map-fun-tiles .maplibregl-ctrl-group button, .map-locate-btn";
    await h.statusBar(p, { glyphs: "dark" });
    await h.shot(p, "03-before", { clip: { x: 0, y: 0, width: 393, height: 300 } });
    await h.clearStatusBar(p);
    await h.statusBar(p, { glyphs: "light" });
    await h.shot(p, "03-after", { clip: { x: 0, y: 0, width: 393, height: 300 } });
    await h.clearStatusBar(p);
    await h.hitboxes(p, sel);
    await h.shot(p, "05-before");
    await h.clearHitboxes(p);
    await h.css(p, `${sel}{width:44px!important;height:44px!important;min-width:44px!important}`);
    await p.waitForTimeout(400);
    await h.hitboxes(p, sel);
    await h.shot(p, "05-after");
  });

  // #6 tiny text on Discover cards
  await step("discover", async () => {
    const p = await h.open();
    await h.go(p, "/m", 5000); await h.css(p, "nextjs-portal{display:none!important}");
    await p.evaluate(() => window.scrollTo(0, 120));
    await p.waitForTimeout(600);
    const mark = () => p.evaluate(() => {
      let n = 0;
      for (const el of document.querySelectorAll("body *")) {
        const t = [...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim());
        if (t && parseFloat(getComputedStyle(el).fontSize) < 11) { el.style.outline = "2px solid #dc2626"; n++; }
      }
      return n;
    });
    h.log("under 11px", await mark());
    await h.shot(p, "06-before");
    await p.evaluate(() => {
      for (const el of document.querySelectorAll("body *")) {
        el.style.outline = "";
        const t = [...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim());
        if (t && parseFloat(getComputedStyle(el).fontSize) < 11) el.style.fontSize = "11px";
        if (el.classList.contains("text-zinc-400")) el.style.color = "#71717a";
      }
    });
    await p.waitForTimeout(300);
    await h.shot(p, "06-after");
  });

  // #7 feed card links + #10 Larger Text + mocks #9 / #11
  await step("feed", async () => {
    const p = await h.open();
    await h.go(p, "/m/feed", 5000); await h.css(p, "nextjs-portal{display:none!important}");
    const sel = 'a[href*="/restaurant/"]';
    await p.evaluate(() => document.querySelector('a[href*="/restaurant/"]').scrollIntoView({ block: "center" }));
    await p.waitForTimeout(800);
    await h.hitboxes(p, sel);
    await h.shot(p, "07-before");
    await h.clearHitboxes(p);
    await h.hitboxes(p, sel, { pad: 14 });
    await h.shot(p, "07-after");
    await h.clearHitboxes(p);

    await h.shot(p, "10-before");
    await h.textScale(p, 1.35);
    await p.waitForTimeout(500);
    await h.shot(p, "10-after");
  });

  await step("composer", async () => {
    const p = await h.open();
    await h.go(p, "/m/post", 5000); await h.css(p, "nextjs-portal{display:none!important}");
    await h.shot(p, "09-before");
    await p.evaluate(SHEET("Discard this post? Your photo and notes will be lost.", [{ t: "Discard post", red: true }, { t: "Keep editing" }]));
    await h.shot(p, "09-after");
  });

  await step("report", async () => {
    const p = await h.open();
    await h.go(p, "/m/feed", 5000); await h.css(p, "nextjs-portal{display:none!important}");
    await h.shot(p, "11-before");
    await p.evaluate(SHEET("", [{ t: "Report post", red: true }, { t: "Block this user", red: true }, { t: "Share" }]));
    await h.shot(p, "11-after");
  });

  // #8 comment vote arrows: try opening a thread from the feed
  await step("comments", async () => {
    const p = await h.open();
    await h.go(p, "/m/feed", 5000); await h.css(p, "nextjs-portal{display:none!important}");
    const sel = 'button[aria-label$="this comment"], button[aria-label^="Collapse "], button[aria-label^="Expand "]';
    const btns = p.locator('button[aria-label*="omment"], a[aria-label*="omment"]');
    const n = await btns.count();
    let found = false;
    for (let i = 0; i < Math.min(n, 12) && !found; i++) {
      const b = btns.nth(i);
      if (!(await b.isVisible().catch(() => false))) { await b.scrollIntoViewIfNeeded().catch(() => {}); }
      await b.tap({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(2500);
      const c = await p.locator('button[aria-label="Upvote this comment"]').count();
      h.log("try", i, p.url(), "votes", c);
      if (c > 0) found = true;
      else { await h.go(p, "/m/feed", 4000); await h.css(p, "nextjs-portal{display:none!important}"); }
    }
    await h.hitboxes(p, sel);
    await h.shot(p, "08-before");
    await h.clearHitboxes(p);
    await h.css(p, `button[aria-label$="this comment"]{width:32px!important}
      button[aria-label^="Collapse "],button[aria-label^="Expand "]{height:44px!important;width:32px!important}`);
    await p.waitForTimeout(300);
    await h.hitboxes(p, sel);
    await h.shot(p, "08-after");
  });
}
