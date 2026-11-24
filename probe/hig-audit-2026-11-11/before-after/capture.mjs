// Before/after capture harness for the HIG audit board.
// It only LOOKS at the running app: fixes are simulated by injecting CSS/DOM into the page in a
// headless browser. Nothing here edits source files.
//
// Run from the repo root:
//   node probe/hig-audit-2026-11-11/before-after/capture.mjs <id>
// It loads scenarios/<id>.mjs, whose default export is `async (h) => { ... }`.
// HIG_BASE overrides the server (default http://localhost:3000).
//
// Helpers on h:
//   h.open({ quiet = true, storage, width = 393, height = 852, colorScheme = "light", insets })
//        -> Playwright page, sized like an iPhone 15/16 at 2x, signed out.
//        quiet=true pre-dismisses the first-run sign-up sheet and the free-food ticket popup.
//        storage = { key: value } sets extra localStorage entries before the app boots.
//        insets = { top: 59, bottom: 34 } by default: the real notch / home-indicator safe areas,
//        so env(safe-area-inset-*) resolves the way it does on the phone. Pass insets: null for none.
//   h.go(page, route, waitMs = 2500)            navigate to BASE + route, wait, then h.settle
//   h.settle(page, { timeout = 7000 })          waits for fonts, on-screen images and skeletons
//   h.safeArea(page)                            -> { top, bottom } as the page really resolves them
//   h.openMap(page, { waitMs = 8000 })          from /m/feed: taps the Map tab and waits for tiles
//   h.shot(page, name, { clip, fullPage })      writes img/<id>-<name>.jpg at 2x, returns the repo-relative path
//   h.css(page, cssText)                        inject a <style> (how most fixes are simulated); returns a handle,
//                                               h.uncss(page, handle) removes it again
//   h.hitboxes(page, selector, { label = true, pad = 0, side = "top" })
//        draws each visible matching element's tap box over the page with its WxH in CSS px.
//        red = under 28, amber = 28 to 43, green = 44 and up (smaller side decides).
//        side places the label: "top" | "bottom" | "left" | "right" | "inside" (use left/right when
//        boxes are stacked so labels do not cover each other).
//        It measures the element's own box. For a target grown with a transparent ::after, pass
//        pad (px added on every side) or use h.hitmap, which measures what a finger really hits.
//   h.clearHitboxes(page)
//   h.statusBar(page, { glyphs: "dark" | "light", island = true, home = true, homeColor })
//        draws a simulated iPhone status bar (9:41, signal, wifi, battery) and home indicator.
//   h.clearStatusBar(page)
//   h.hitmap(page, { step = 4, region })        which interactive element owns each point of the screen
//   h.hitmapDiff(a, b)                          -> { same, gained, lost, moved, gainedBy, movedPairs, ok }
//        ok = no point moved from one control to another and none was lost; "gained" = dead space
//        that now belongs to a control (that is the whole point of growing a target).
//   h.snap(page, name, { clip })                lossless PNG for comparisons (img/<id>-<name>.png)
//   h.pixelDiff(fileA, fileB)                   -> { identical, different, maxDelta, width, height }
//   h.textScale(page, factor)                   simulates iOS Larger Text: multiplies every text size
//   h.sleep(ms), h.log(...)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DIR = "probe/hig-audit-2026-11-11/before-after";
const IMG = path.join(DIR, "img");
const BASE = process.env.HIG_BASE || "http://localhost:3000";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const id = process.argv[2];
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error("usage: node " + DIR + "/capture.mjs <id>   (id: lowercase letters, digits, dashes)");
  process.exit(2);
}
const scenarioPath = path.resolve(DIR, "scenarios", id + ".mjs");
if (!fs.existsSync(scenarioPath)) {
  console.error("no scenario at " + scenarioPath);
  process.exit(2);
}
fs.mkdirSync(IMG, { recursive: true });

async function launch() {
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    console.log("default chromium failed, trying channel chrome:", String(e.message).slice(0, 100));
    return await chromium.launch({ headless: true, channel: "chrome" });
  }
}

const browser = await launch();
const made = [];
const contexts = [];
let styleSeq = 0;

const h = {
  log: (...a) => console.log("[" + id + "]", ...a),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),

  async open({
    quiet = true,
    storage = null,
    width = 393,
    height = 852,
    colorScheme = "light",
    insets = { top: 59, bottom: 34 },
  } = {}) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: UA,
      locale: "en-US",
      colorScheme,
    });
    contexts.push(ctx);
    const entries = { ...(storage || {}) };
    if (quiet) {
      entries["pm-signup-sheet-dismissed"] = "1";
      entries["pm-ticket-pearl-2026-11-19-seen"] = "1";
      entries["pm-ticket-pearl-2026-11-19-seen-7pm"] = "1";
    }
    if (Object.keys(entries).length)
      await ctx.addInitScript((kv) => {
        try {
          for (const k of Object.keys(kv)) localStorage.setItem(k, kv[k]);
        } catch {}
      }, entries);
    const page = await ctx.newPage();
    if (insets) {
      try {
        const cdp = await ctx.newCDPSession(page);
        const t = insets.top || 0;
        const b = insets.bottom || 0;
        await cdp.send("Emulation.setSafeAreaInsetsOverride", {
          insets: { top: t, topMax: t, bottom: b, bottomMax: b, left: 0, leftMax: 0, right: 0, rightMax: 0 },
        });
      } catch (e) {
        h.log("safe-area override unavailable:", String(e.message).slice(0, 120));
      }
    }
    return page;
  },

  async go(page, route, waitMs = 2500) {
    const resp = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(waitMs);
    await h.settle(page);
    return resp ? resp.status() : null;
  },

  async settle(page, { timeout = 7000 } = {}) {
    const t0 = Date.now();
    await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true)).catch(() => {});
    let pending = -1;
    while (Date.now() - t0 < timeout) {
      pending = await page
        .evaluate(() => {
          const onScreen = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
          };
          let n = 0;
          for (const img of document.images) if (onScreen(img) && !img.complete) n++;
          for (const el of document.querySelectorAll('[aria-busy="true"],[class*="skeleton"],[class*="shimmer"],.animate-pulse'))
            if (onScreen(el)) n++;
          return n;
        })
        .catch(() => 0);
      if (pending === 0) break;
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(350);
    return pending;
  },

  async safeArea(page) {
    return await page.evaluate(() => {
      const d = document.createElement("div");
      d.style.cssText =
        "position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)";
      document.documentElement.appendChild(d);
      const cs = getComputedStyle(d);
      const out = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
      d.remove();
      return out;
    });
  },

  async openMap(page, { waitMs = 8000 } = {}) {
    const tab = page.locator('[role="tablist"][aria-label="Feed filter"] [role="tab"]', { hasText: /^Map$/ });
    await tab.first().click();
    await page.waitForSelector("canvas.maplibregl-canvas", { timeout: 30000 });
    await page.waitForTimeout(waitMs);
  },

  async shot(page, name, { clip, fullPage = false } = {}) {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error("shot name must be lowercase letters, digits, dashes");
    const file = path.join(IMG, id + "-" + name + ".jpg");
    await page.screenshot({ path: file, type: "jpeg", quality: 86, fullPage, clip, scale: "device", animations: "disabled" });
    const rel = file.replace(/\\/g, "/");
    made.push(rel);
    h.log("shot", rel);
    return rel;
  },

  async snap(page, name, { clip } = {}) {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error("snap name must be lowercase letters, digits, dashes");
    const file = path.join(IMG, id + "-" + name + ".png");
    await page.screenshot({ path: file, type: "png", clip, scale: "device", animations: "disabled" });
    return file.replace(/\\/g, "/");
  },

  async pixelDiff(fileA, fileB) {
    const sharp = (await import("sharp")).default;
    const [A, B] = await Promise.all(
      [fileA, fileB].map((f) => sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
    );
    if (A.info.width !== B.info.width || A.info.height !== B.info.height)
      return { identical: false, sameSize: false, a: [A.info.width, A.info.height], b: [B.info.width, B.info.height] };
    let different = 0;
    let maxDelta = 0;
    for (let i = 0; i < A.data.length; i += 4) {
      const d = Math.max(
        Math.abs(A.data[i] - B.data[i]),
        Math.abs(A.data[i + 1] - B.data[i + 1]),
        Math.abs(A.data[i + 2] - B.data[i + 2]),
      );
      if (d > 0) {
        different++;
        if (d > maxDelta) maxDelta = d;
      }
    }
    return { identical: different === 0, sameSize: true, width: A.info.width, height: A.info.height, different, maxDelta };
  },

  async css(page, cssText) {
    const handle = "__hig_css_" + ++styleSeq;
    await page.evaluate(
      ({ handle, cssText }) => {
        const s = document.createElement("style");
        s.id = handle;
        s.textContent = cssText;
        document.head.appendChild(s);
      },
      { handle, cssText },
    );
    await page.waitForTimeout(250);
    return handle;
  },

  async uncss(page, handle) {
    await page.evaluate((handle) => document.getElementById(handle)?.remove(), handle);
    await page.waitForTimeout(150);
  },

  async hitboxes(page, selector, { label = true, pad = 0, side = "top" } = {}) {
    const n = await page.evaluate(
      ({ selector, label, pad, side }) => {
        let layer = document.getElementById("__hig_hit");
        if (!layer) {
          layer = document.createElement("div");
          layer.id = "__hig_hit";
          layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483646;";
          document.documentElement.appendChild(layer);
        }
        const place = {
          top: "right:0;top:0;transform:translateY(-100%);border-radius:3px 3px 0 0;",
          bottom: "right:0;bottom:0;transform:translateY(100%);border-radius:0 0 3px 3px;",
          right: "left:100%;top:50%;transform:translateY(-50%);margin-left:2px;border-radius:3px;",
          left: "right:100%;top:50%;transform:translateY(-50%);margin-right:2px;border-radius:3px;",
          inside: "left:50%;top:50%;transform:translate(-50%,-50%);border-radius:3px;",
        };
        let count = 0;
        for (const el of document.querySelectorAll(selector)) {
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none") continue;
          const w = r.width + pad * 2;
          const hh = r.height + pad * 2;
          const m = Math.min(w, hh);
          const c = m < 28 ? "229,72,77" : m < 44 ? "224,145,10" : "38,150,95";
          const box = document.createElement("div");
          box.style.cssText =
            "position:absolute;box-sizing:border-box;border-radius:3px;" +
            `left:${r.left - pad}px;top:${r.top - pad}px;width:${w}px;height:${hh}px;` +
            `background:rgba(${c},.22);outline:1.5px solid rgba(${c},.95);outline-offset:-1px;`;
          if (label) {
            const t = document.createElement("span");
            t.textContent = Math.round(w) + "×" + Math.round(hh);
            t.style.cssText =
              "position:absolute;white-space:nowrap;" +
              (place[side] || place.top) +
              "font:600 9px/1.2 ui-monospace,Menlo,Consolas,monospace;color:#fff;padding:1px 3px;" +
              `background:rgb(${c});`;
            box.appendChild(t);
          }
          layer.appendChild(box);
          count++;
        }
        return count;
      },
      { selector, label, pad, side },
    );
    h.log("hitboxes", selector, "->", n);
    return n;
  },

  async clearHitboxes(page) {
    await page.evaluate(() => document.getElementById("__hig_hit")?.remove());
  },

  async statusBar(page, { glyphs = "dark", island = true, home = true, homeColor } = {}) {
    await page.evaluate(
      ({ glyphs, island, home, homeColor }) => {
        document.getElementById("__hig_sb")?.remove();
        document.getElementById("__hig_home")?.remove();
        const c = glyphs === "light" ? "#FFFFFF" : "#000000";
        const bar = document.createElement("div");
        bar.id = "__hig_sb";
        bar.style.cssText =
          "position:fixed;left:0;right:0;top:0;height:54px;pointer-events:none;z-index:2147483647;color:" + c + ";";
        bar.innerHTML =
          (island
            ? '<div style="position:absolute;left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:19px;background:#000"></div>'
            : "") +
          '<div style="position:absolute;left:0;width:133px;top:17px;text-align:center;font:600 17px/22px -apple-system,\'SF Pro Text\',\'Segoe UI\',system-ui,sans-serif;letter-spacing:-.2px">9:41</div>' +
          '<div style="position:absolute;right:0;width:133px;top:22px;display:flex;justify-content:center;align-items:center;gap:6px">' +
          '<svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>' +
          '<svg width="17" height="12" viewBox="0 0 17 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 4.4a10 10 0 0 1 14 0"/><path d="M4.2 7.2a6.1 6.1 0 0 1 8.6 0"/><circle cx="8.5" cy="10.2" r="1.1" fill="currentColor" stroke="none"/></svg>' +
          '<svg width="27" height="13" viewBox="0 0 27 13" fill="none"><rect x=".5" y=".5" width="23" height="12" rx="3.5" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.2" fill="currentColor"/><rect x="25" y="4.3" width="1.6" height="4.4" rx=".8" fill="currentColor" opacity=".45"/></svg>' +
          "</div>";
        document.documentElement.appendChild(bar);
        if (home) {
          const hi = document.createElement("div");
          hi.id = "__hig_home";
          hi.style.cssText =
            "position:fixed;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px;pointer-events:none;z-index:2147483647;background:" +
            (homeColor || "#000000") +
            ";";
          document.documentElement.appendChild(hi);
        }
      },
      { glyphs, island, home, homeColor },
    );
  },

  async clearStatusBar(page) {
    await page.evaluate(() => {
      document.getElementById("__hig_sb")?.remove();
      document.getElementById("__hig_home")?.remove();
    });
  },

  async hitmap(page, { step = 4, region } = {}) {
    return await page.evaluate(
      ({ step, region }) => {
        const SEL =
          'a[href],button,input,select,textarea,summary,label,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"],[role="slider"],[tabindex]:not([tabindex="-1"])';
        const r = region || { x: 0, y: 0, width: innerWidth, height: innerHeight };
        const cols = Math.floor(r.width / step);
        const rows = Math.floor(r.height / step);
        window.__higIds = window.__higIds || new WeakMap();
        window.__higNext = window.__higNext || 1;
        window.__higNames = window.__higNames || {};
        const describe = (el) => {
          const lab = el.getAttribute("aria-label") || (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
          const b = el.getBoundingClientRect();
          return `${el.tagName.toLowerCase()} "${lab}" @${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}`;
        };
        const cells = new Array(cols * rows);
        for (let j = 0; j < rows; j++)
          for (let i = 0; i < cols; i++) {
            const el = document.elementFromPoint(r.x + i * step + step / 2, r.y + j * step + step / 2);
            const t = el && el.closest ? el.closest(SEL) : null;
            if (!t) {
              cells[j * cols + i] = 0;
              continue;
            }
            let n = window.__higIds.get(t);
            if (!n) {
              n = window.__higNext++;
              window.__higIds.set(t, n);
              window.__higNames[n] = describe(t);
            }
            cells[j * cols + i] = n;
          }
        return { step, cols, rows, x: r.x, y: r.y, cells, names: { ...window.__higNames } };
      },
      { step, region },
    );
  },

  hitmapDiff(a, b) {
    if (a.cols !== b.cols || a.rows !== b.rows) throw new Error("hitmaps have different grids");
    let same = 0;
    let gained = 0;
    let lost = 0;
    let moved = 0;
    const gainedBy = {};
    const lostBy = {};
    const movedPairs = {};
    for (let k = 0; k < a.cells.length; k++) {
      const p = a.cells[k];
      const q = b.cells[k];
      if (p === q) same++;
      else if (!p && q) {
        gained++;
        gainedBy[q] = (gainedBy[q] || 0) + 1;
      } else if (p && !q) {
        lost++;
        lostBy[p] = (lostBy[p] || 0) + 1;
      } else {
        moved++;
        movedPairs[p + ">" + q] = (movedPairs[p + ">" + q] || 0) + 1;
      }
    }
    const name = (n) => b.names[n] || a.names[n] || String(n);
    const px = a.step * a.step;
    return {
      ok: lost === 0 && moved === 0,
      cells: a.cells.length,
      same,
      gained,
      lost,
      moved,
      gainedBy: Object.entries(gainedBy).map(([n, c]) => ({ target: name(n), areaPx: c * px })),
      lostBy: Object.entries(lostBy).map(([n, c]) => ({ target: name(n), areaPx: c * px })),
      movedPairs: Object.entries(movedPairs).map(([k, c]) => {
        const [p, q] = k.split(">");
        return { from: name(p), to: name(q), areaPx: c * px };
      }),
    };
  },

  async textScale(page, factor) {
    const n = await page.evaluate((factor) => {
      const jobs = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      for (let el = walker.currentNode; el; el = walker.nextNode()) {
        if (el.closest("#__hig_sb,#__hig_home,#__hig_hit")) continue;
        let hasText = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
        if (!hasText)
          for (const c of el.childNodes)
            if (c.nodeType === 3 && c.nodeValue.trim()) {
              hasText = true;
              break;
            }
        if (!hasText) continue;
        const cs = getComputedStyle(el);
        const fs = parseFloat(cs.fontSize);
        const lh = cs.lineHeight === "normal" ? 0 : parseFloat(cs.lineHeight);
        if (fs > 0) jobs.push([el, fs, lh]);
      }
      // Read everything first, then write, so an inherited size is never multiplied twice.
      for (const [el, fs, lh] of jobs) {
        el.style.setProperty("font-size", (fs * factor).toFixed(2) + "px", "important");
        if (lh) el.style.setProperty("line-height", (lh * factor).toFixed(2) + "px", "important");
      }
      return jobs.length;
    }, factor);
    await page.waitForTimeout(300);
    h.log("textScale x" + factor, "->", n, "text elements");
    return n;
  },
};

let code = 0;
try {
  const mod = await import(pathToFileURL(scenarioPath).href + "?t=" + Date.now());
  if (typeof mod.default !== "function") throw new Error("scenario must `export default async function (h) {}`");
  await mod.default(h);
} catch (e) {
  code = 1;
  console.error("[" + id + "] FAILED:", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
} finally {
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close().catch(() => {});
}
console.log("[" + id + "] images:", JSON.stringify(made));
process.exit(code);
