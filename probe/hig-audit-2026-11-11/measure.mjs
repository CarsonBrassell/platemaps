// HIG audit runtime measurements. Run from the repo root:
//   node probe/hig-audit-2026-11-11/measure.mjs [task ...]
// Tasks (substring match, none = all): r:<route> i:<interaction> dark:<route> rm:<route> small:<route> scale:<route>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = "probe/hig-audit-2026-11-11";
const SHOTS = path.join(OUT, "shots");
const BASE = "http://localhost:3000";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const JSON_PATH = path.join(OUT, "measurements.json");
const args = process.argv.slice(2);
const want = (id) => args.length === 0 || args.some((a) => id.includes(a));

let R = {};
try {
  if (args.length && fs.existsSync(JSON_PATH)) R = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
} catch {}
R.meta = { ...(R.meta || {}), startedAt: new Date().toISOString(), viewport: "393x852@2", notes: [] };
R.routes ||= {};
R.interactions ||= {};
R.variants ||= {};
const save = () => fs.writeFileSync(JSON_PATH, JSON.stringify(R, null, 1));

/* ---------------------------------------------------------------- page-side library */
function pageLib() {
  if (window.__m) return;
  const SEL =
    "a,button,input,select,textarea,summary,label[for],[role=button],[role=tab],[role=switch],[role=slider],[role=link],[role=checkbox]";
  const seen = new WeakSet();
  const txt = (s, n = 40) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const vis = (el) => {
    try {
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    } catch {
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
    }
  };
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    const c = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 2);
    if (c.length) s += "." + c.map((x) => x.slice(0, 40)).join(".");
    return s;
  };
  const nm = (el) => {
    let n = el.getAttribute("aria-label");
    if (n && n.trim()) return n;
    const lb = el.getAttribute("aria-labelledby");
    if (lb) {
      const t = lb.split(/\s+/).map((i) => document.getElementById(i)?.textContent || "").join(" ");
      if (t.trim()) return t;
    }
    if (el.labels && el.labels.length) {
      const t = Array.from(el.labels).map((l) => l.textContent).join(" ");
      if (t.trim()) return t;
    }
    const inner = el.innerText || el.textContent || "";
    if (inner.trim()) return inner;
    const img = el.querySelector("img[alt]");
    if (img && img.alt.trim()) return img.alt;
    const svgT = el.querySelector("svg title");
    if (svgT && svgT.textContent.trim()) return svgT.textContent;
    const t = el.getAttribute("title");
    if (t && t.trim()) return t;
    if (el.tagName === "INPUT" && el.value && /submit|button|reset/.test(el.type)) return el.value;
    return "";
  };
  const rootOf = (r) => (r ? document.querySelector(r) || document.body : document.body);

  // colours
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 1;
  const ctx = cvs.getContext("2d", { willReadFrequently: true });
  const cache = new Map();
  const parse = (str) => {
    if (cache.has(str)) return cache.get(str);
    let out;
    const m = str.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if (m) {
      let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      out = [+m[1], +m[2], +m[3], a];
    } else {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = str;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out = [d[0], d[1], d[2], d[3] / 255];
    }
    cache.set(str, out);
    return out;
  };
  const over = (top, bot, a) => [0, 1, 2].map((i) => top[i] * a + bot[i] * (1 - a));
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => {
    const l1 = lum(a),
      l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  // scroller
  let scroller = null; // null = window
  const findScroller = () => {
    const se = document.scrollingElement;
    if (se.scrollHeight > innerHeight + 20) return null;
    let best = null,
      bestH = 0;
    for (const n of document.querySelectorAll("*")) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 20 && n.clientHeight > 300) {
        if (n.scrollHeight > bestH) {
          best = n;
          bestH = n.scrollHeight;
        }
      }
    }
    return best;
  };
  const pos = () => (scroller ? scroller.scrollTop : window.scrollY);

  const hit = (el, x, y) => {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
    const t = document.elementFromPoint(x, y);
    if (!t) return false;
    return el === t || el.contains(t) || (t.closest && t.closest(SEL) === el);
  };
  const ext = (el, cx, cy, dx, dy) => {
    let d = 0;
    for (let i = 1; i <= 40; i++) {
      if (hit(el, cx + dx * i, cy + dy * i)) d = i;
      else break;
    }
    return d;
  };
  const isFixedChain = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === "fixed" || p === "sticky") return true;
    }
    return false;
  };

  const M = {};
  M.init = () => {
    scroller = findScroller();
    return { scroller: scroller ? sel(scroller) : "window", scrollHeight: scroller ? scroller.scrollHeight : document.scrollingElement.scrollHeight };
  };
  M.scrollNext = () => {
    const before = pos();
    const amt = Math.round(innerHeight * 0.8);
    if (scroller) scroller.scrollTop = before + amt;
    else window.scrollBy(0, amt);
    const after = pos();
    const max = scroller ? scroller.scrollHeight - scroller.clientHeight : document.scrollingElement.scrollHeight - innerHeight;
    return { moved: after > before + 1, pos: after, max, atEnd: after >= max - 2 };
  };
  M.scrollTop = () => {
    if (scroller) scroller.scrollTop = 0;
    else window.scrollTo(0, 0);
  };

  M.step = (rootSel) => {
    const root = rootOf(rootSel);
    const sp = pos();
    const out = { targets: [], contrast: [], examined: 0, skipped: {} };
    const skip = (k) => (out.skipped[k] = (out.skipped[k] || 0) + 1);
    // ---- tap targets
    for (const el of root.querySelectorAll(SEL)) {
      if (seen.has(el)) continue;
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.width <= 2 && r.height <= 2) {
        seen.add(el);
        skip("sr-only target");
        continue;
      }
      const inV = r.bottom > 0 && r.top < innerHeight;
      const inH = r.right > 0 && r.left < innerWidth;
      const fixed = isFixedChain(el);
      if (!inH) {
        seen.add(el);
        out.targets.push({ tag: el.tagName.toLowerCase(), name: txt(nm(el)), sel: sel(el), x: Math.round(r.left), y: Math.round(r.top + (fixed ? 0 : sp)), w: Math.round(r.width), h: Math.round(r.height), fixed, offscreenX: true });
        continue;
      }
      if (!inV) continue;
      seen.add(el);
      const rec = {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role") || undefined,
        type: el.type || undefined,
        name: txt(nm(el)),
        sel: sel(el),
        x: Math.round(r.left),
        y: Math.round(r.top + (fixed ? 0 : sp)),
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        fixed,
        disabled: !!(el.disabled || el.getAttribute("aria-disabled") === "true") || undefined,
      };
      if (r.width < 44 || r.height < 44) {
        const vx0 = Math.max(r.left, 0),
          vx1 = Math.min(r.right, innerWidth),
          vy0 = Math.max(r.top, 0),
          vy1 = Math.min(r.bottom, innerHeight);
        const cx = Math.round((vx0 + vx1) / 2),
          cy = Math.round((vy0 + vy1) / 2);
        const pts = [[0, 0], [-22, 0], [22, 0], [0, -22], [0, 22]];
        const c = hit(el, cx, cy);
        rec.hit = {
          centre: c,
          n5: pts.filter(([dx, dy]) => hit(el, cx + dx, cy + dy)).length,
          effW: c ? ext(el, cx, cy, -1, 0) + ext(el, cx, cy, 1, 0) + 1 : 0,
          effH: c ? ext(el, cx, cy, 0, -1) + ext(el, cx, cy, 0, 1) + 1 : 0,
          partial: r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth || undefined,
        };
      }
      out.targets.push(rec);
    }
    // ---- contrast
    for (const el of root.querySelectorAll("*")) {
      if (seen.has(el)) continue;
      const tn = el.tagName;
      if (/^(SCRIPT|STYLE|NOSCRIPT|TITLE|HEAD|META|LINK|OPTION)$/.test(tn)) continue;
      let tnode = null;
      for (const ch of el.childNodes) if (ch.nodeType === 3 && ch.nodeValue.trim()) { tnode = ch; break; }
      if (!tnode) continue;
      const r = el.getBoundingClientRect();
      if (!(r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)) continue;
      seen.add(el);
      if (!vis(el) || r.width < 3 || r.height < 3) continue;
      if (el.closest(".maplibregl-map,.mapboxgl-map,.leaflet-container,canvas")) { skip("map"); continue; }
      const cs = getComputedStyle(el);
      const fontSize = parseFloat(cs.fontSize);
      if (cs.webkitTextFillColor && cs.webkitTextFillColor === "rgba(0, 0, 0, 0)") { skip("text-fill transparent"); continue; }
      // backdrop chain
      let layers = [],
        opaque = null,
        opacity = 1,
        reason = null;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const ncs = n === el ? cs : getComputedStyle(n);
        if (!opaque) {
          if (ncs.backgroundImage !== "none") { reason = "bg image/gradient"; break; }
          const bc = parse(ncs.backgroundColor);
          if (bc[3] > 0) layers.push(bc);
          if (bc[3] >= 0.999) { opaque = bc; continue; }
          opacity *= parseFloat(ncs.opacity);
        }
      }
      if (reason) { skip(reason); continue; }
      // stack below the text
      const range = document.createRange();
      range.selectNodeContents(tnode);
      const rr = range.getClientRects()[0] || r;
      const cx = Math.min(Math.max(rr.left + rr.width / 2, 1), innerWidth - 1),
        cy = Math.min(Math.max(rr.top + rr.height / 2, 1), innerHeight - 1);
      const stack = document.elementsFromPoint(cx, cy);
      const idx = stack.indexOf(el);
      if (idx < 0) { skip("covered/not at centre"); continue; }
      let overMedia = false;
      for (let i = idx + 1; i < stack.length; i++) {
        const s = stack[i];
        if (/^(IMG|VIDEO|CANVAS|PICTURE)$/.test(s.tagName)) { overMedia = true; break; }
        const scs = getComputedStyle(s);
        if (scs.backgroundImage !== "none") { overMedia = true; break; }
        if (parse(scs.backgroundColor)[3] >= 0.999) break;
      }
      if (overMedia) { skip("over image/media"); continue; }
      let base = opaque || [255, 255, 255, 1];
      const lowers = layers.filter((l) => l !== opaque).reverse();
      let bg = base.slice(0, 3);
      for (const l of lowers) bg = over(l, bg, l[3]);
      const fgc = parse(cs.color);
      const fg = over(fgc, bg, fgc[3] * opacity);
      const ratioV = ratio(fg, bg);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
      const thr = large ? 3 : 4.5;
      out.examined++;
      const disabled = !!(el.closest("button:disabled,[aria-disabled=true],input:disabled"));
      if (ratioV < thr) {
        out.contrast.push({
          text: txt(tnode.nodeValue, 50),
          fg: hex(fg),
          bg: hex(bg),
          ratio: Math.round(ratioV * 100) / 100,
          thr,
          size: Math.round(fontSize * 10) / 10,
          weight,
          opacity: Math.round(opacity * 100) / 100,
          sel: sel(el),
          y: Math.round(r.top + (isFixedChain(el) ? 0 : sp)),
          disabled: disabled || undefined,
          assumedWhite: !opaque || undefined,
        });
      }
    }
    return out;
  };

  M.endCheck = (rootSel) => {
    const root = rootOf(rootSel);
    let barTop = null,
      barSel = null;
    const els = Array.from(root.querySelectorAll("*"));
    for (const el of els) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed") continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height <= 200 && r.width >= innerWidth * 0.6 && r.bottom >= innerHeight - 1 && vis(el)) {
        if (barTop === null || r.top < barTop) { barTop = r.top; barSel = sel(el); }
      }
    }
    let contentBottom = 0,
      cSel = null;
    for (const el of els) {
      if (isFixedChain(el)) continue;
      let has = el.tagName === "IMG";
      if (!has) for (const ch of el.childNodes) if (ch.nodeType === 3 && ch.nodeValue.trim()) { has = true; break; }
      if (!has || !vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height <= 0 || r.top >= innerHeight) continue;
      if (r.bottom > contentBottom) { contentBottom = r.bottom; cSel = sel(el); }
    }
    return { barTop, barSel, contentBottom: Math.round(contentBottom), contentSel: cSel, hiddenUnderBar: barTop !== null ? Math.round(contentBottom - barTop) : null, innerHeight };
  };

  const clippedText = (root) => {
    const out = [];
    for (const el of root.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) continue;
      let own = false;
      for (const ch of el.childNodes) if (ch.nodeType === 3 && ch.nodeValue.trim()) own = true;
      if (!own) continue;
      if (!vis(el)) continue;
      const clipX = el.scrollWidth > el.clientWidth + 1 && /hidden|clip/.test(cs.overflowX);
      const clipY = el.scrollHeight > el.clientHeight + 1 && /hidden|clip/.test(cs.overflowY);
      if (!clipX && !clipY) continue;
      const ellipsis = cs.textOverflow === "ellipsis";
      const lineClamp = cs.webkitLineClamp && cs.webkitLineClamp !== "none";
      out.push({ text: txt(el.textContent, 50), sel: sel(el), cw: el.clientWidth, sw: el.scrollWidth, ch: el.clientHeight, sh: el.scrollHeight, ellipsis, lineClamp: !!lineClamp });
      if (out.length >= 25) break;
    }
    return out;
  };

  const overflow = (root) => {
    const iw = innerWidth;
    const escapes = [];
    let clippedByAncestor = 0;
    for (const el of root.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.right <= iw + 1 && r.left >= -1) continue;
      if (!vis(el)) continue;
      let clipped = false;
      for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.overflowX !== "visible") {
          const nr = n.getBoundingClientRect();
          if (nr.right <= iw + 1 && nr.left >= -1) { clipped = true; break; }
        }
      }
      if (clipped) { clippedByAncestor++; continue; }
      const cs = getComputedStyle(el);
      escapes.push({ sel: sel(el), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), pos: cs.position, text: txt(el.textContent, 30) });
      if (escapes.length >= 25) break;
    }
    return { scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth, innerWidth: iw, clientWidth: document.documentElement.clientWidth, overflowX: document.documentElement.scrollWidth > iw + 1, escapes, clippedByAncestor };
  };

  M.overflow = (rootSel) => overflow(rootOf(rootSel));
  M.clipped = (rootSel) => clippedText(rootOf(rootSel));

  M.static = (rootSel) => {
    const root = rootOf(rootSel);
    const o = {};
    // text
    const hist = {};
    const tiny = [];
    const tinyKeys = new Set();
    let nodes = 0;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const parents = new Set();
    while (tw.nextNode()) {
      const n = tw.currentNode;
      if (!n.nodeValue.trim()) continue;
      const p = n.parentElement;
      if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TITLE|OPTION)$/.test(p.tagName)) continue;
      if (!vis(p)) continue;
      const r = p.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) continue;
      nodes++;
      const fs = parseFloat(getComputedStyle(p).fontSize);
      const k = String(Math.round(fs * 2) / 2);
      hist[k] = (hist[k] || 0) + 1;
      parents.add(p);
      if (fs < 11) {
        const key = sel(p) + "|" + txt(n.nodeValue, 20);
        if (!tinyKeys.has(key) && tiny.length < 60) {
          tinyKeys.add(key);
          tiny.push({ text: txt(n.nodeValue, 40), size: Math.round(fs * 10) / 10, sel: sel(p), y: Math.round(r.top + pos()) });
        }
      }
    }
    o.textNodes = nodes;
    o.fontHist = hist;
    o.tinyText = tiny;
    o.tinyTextCount = Object.entries(hist).filter(([k]) => +k < 11).reduce((a, [, v]) => a + v, 0);
    // fields
    o.fields = [];
    for (const el of root.querySelectorAll("input,textarea,select")) {
      if (el.type === "hidden" || !vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 2 && r.height <= 2) continue;
      const cs = getComputedStyle(el);
      o.fields.push({
        tag: el.tagName.toLowerCase(),
        type: el.type,
        name: el.getAttribute("name") || undefined,
        fontSize: parseFloat(cs.fontSize),
        inputmode: el.getAttribute("inputmode"),
        autocomplete: el.getAttribute("autocomplete"),
        autocapitalize: el.getAttribute("autocapitalize"),
        autocorrect: el.getAttribute("autocorrect"),
        spellcheck: el.getAttribute("spellcheck"),
        enterkeyhint: el.getAttribute("enterkeyhint"),
        hasLabel: !!((el.labels && el.labels.length) || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")),
        placeholder: txt(el.getAttribute("placeholder"), 40),
        w: Math.round(r.width),
        h: Math.round(r.height),
        sel: sel(el),
      });
    }
    // overflow + clipped
    o.overflow = overflow(root);
    o.clippedText = clippedText(root);
    // unnamed controls + imgs
    o.unnamed = [];
    for (const el of root.querySelectorAll(SEL)) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 2 && r.height <= 2) continue;
      if (nm(el).trim()) continue;
      const placeholderOnly = !!el.getAttribute("placeholder");
      o.unnamed.push({ tag: el.tagName.toLowerCase(), type: el.type, sel: sel(el), placeholderOnly: placeholderOnly || undefined, html: el.outerHTML.slice(0, 120), y: Math.round(r.top + pos()) });
      if (o.unnamed.length >= 40) break;
    }
    o.imgsNoAlt = [];
    let imgTotal = 0;
    for (const img of root.querySelectorAll("img")) {
      imgTotal++;
      if (!img.hasAttribute("alt")) o.imgsNoAlt.push({ src: (img.currentSrc || img.src || "").replace(/\?.*$/, "").slice(-60), sel: sel(img) });
      if (o.imgsNoAlt.length >= 30) break;
    }
    o.imgTotal = imgTotal;
    // head
    const metas = {};
    for (const m of document.querySelectorAll("meta[name],meta[property]")) {
      const k = m.getAttribute("name") || m.getAttribute("property");
      if (/^(viewport|theme-color|color-scheme|apple-.*|mobile-web-app-capable|format-detection|msapplication.*)$/.test(k)) {
        (metas[k] ||= []).push(m.getAttribute("media") ? m.content + " [" + m.getAttribute("media") + "]" : m.content);
      }
    }
    o.head = {
      metas,
      lang: document.documentElement.lang,
      title: document.title,
      appleTouchIcons: document.querySelectorAll("link[rel~=apple-touch-icon]").length,
      manifest: document.querySelector("link[rel=manifest]")?.getAttribute("href") || null,
      htmlColorScheme: getComputedStyle(document.documentElement).colorScheme,
      htmlFontSize: getComputedStyle(document.documentElement).fontSize,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
      prefersDark: matchMedia("(prefers-color-scheme: dark)").matches,
      bodyFont: getComputedStyle(document.body).fontFamily.slice(0, 80),
    };
    // headings
    o.headings = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter(vis).map((h) => h.tagName.toLowerCase() + ": " + txt(h.textContent, 60));
    o.landmarks = { main: document.querySelectorAll("main,[role=main]").length, nav: document.querySelectorAll("nav,[role=navigation]").length, header: document.querySelectorAll("header,[role=banner]").length };
    // fixed / sticky
    const safeRules = [];
    try {
      const walk = (rules) => {
        for (const rule of rules) {
          if (rule.cssRules && rule.cssRules.length && !rule.selectorText) walk(rule.cssRules);
          else if (rule.selectorText && /safe-area/.test(rule.cssText)) safeRules.push(rule);
        }
      };
      for (const ss of document.styleSheets) {
        try { walk(ss.cssRules); } catch {}
      }
    } catch {}
    o.safeAreaRuleCount = safeRules.length;
    o.fixedBars = [];
    for (const el of root.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const edgeTop = r.top <= 1 && r.top >= -1,
        edgeBot = r.bottom >= innerHeight - 1 && r.bottom <= innerHeight + 1;
      const stickyEdge = cs.position === "sticky" && (cs.top === "0px" || cs.bottom === "0px" || /safe-area/.test(cs.top + cs.bottom));
      if (!edgeTop && !edgeBot && !stickyEdge) continue;
      const via = [];
      for (const rule of safeRules) {
        try { if (el.matches(rule.selectorText)) via.push(rule.selectorText.slice(0, 80)); } catch {}
      }
      o.fixedBars.push({
        sel: sel(el),
        pos: cs.position,
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        edge: edgeTop ? "top" : edgeBot ? "bottom" : "sticky",
        paddingTop: cs.paddingTop,
        paddingBottom: cs.paddingBottom,
        classMentionsSafeArea: /safe-area/.test(el.getAttribute("class") || "") || /safe-area/.test(el.getAttribute("style") || ""),
        cssRulesWithSafeArea: via.slice(0, 5),
        zIndex: cs.zIndex,
      });
      if (o.fixedBars.length >= 20) break;
    }
    // colour signature
    let sig = "";
    let i = 0;
    for (const el of root.querySelectorAll("*")) {
      if (i++ > 500) break;
      const cs = getComputedStyle(el);
      sig += cs.color + cs.backgroundColor + "|";
    }
    let h = 0;
    for (let k = 0; k < sig.length; k++) h = (h * 31 + sig.charCodeAt(k)) | 0;
    o.colorSig = h;
    o.url = location.href;
    return o;
  };

  M.textScale = () => {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const ps = [];
    const set = new Set();
    while (tw.nextNode()) {
      const n = tw.currentNode;
      if (!n.nodeValue.trim()) continue;
      const p = n.parentElement;
      if (!p || set.has(p) || /^(SCRIPT|STYLE|NOSCRIPT|TITLE|OPTION)$/.test(p.tagName) || !vis(p)) continue;
      const r = p.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) continue;
      set.add(p);
      ps.push(p);
    }
    const before = ps.map((p) => parseFloat(getComputedStyle(p).fontSize));
    const ovBefore = overflow(document.body);
    document.documentElement.style.fontSize = "130%";
    const after = ps.map((p) => parseFloat(getComputedStyle(p).fontSize));
    let grew = 0,
      fixedN = 0;
    const fixedBy = {};
    ps.forEach((p, i) => {
      if (after[i] >= before[i] * 1.2) grew++;
      else {
        fixedN++;
        const k = sel(p) + " @" + before[i] + "px";
        const e = (fixedBy[k] ||= { sel: sel(p), size: before[i], count: 0, sample: txt(p.textContent, 30) });
        e.count++;
      }
    });
    const ovAfter = overflow(document.body);
    const clippedAfter = clippedText(document.body);
    // controls whose box did not grow while their text did
    const out = {
      total: ps.length,
      grew,
      fixed: fixedN,
      shareGrew: Math.round((grew / Math.max(ps.length, 1)) * 100),
      htmlFontSizeAfter: getComputedStyle(document.documentElement).fontSize,
      fixedGroups: Object.values(fixedBy).sort((a, b) => b.count - a.count).slice(0, 20),
      overflowBefore: { scrollWidth: ovBefore.scrollWidth, overflowX: ovBefore.overflowX },
      overflowAfter: ovAfter,
      clippedAfter,
    };
    document.documentElement.style.fontSize = "";
    return out;
  };

  M.anims = () => {
    const a = document.getAnimations();
    const running = a.filter((x) => x.playState === "running");
    const names = {};
    let infinite = 0;
    for (const x of running) {
      const n = x.animationName || x.transitionProperty || "web-animation";
      const inf = x.effect && x.effect.getComputedTiming().iterations === Infinity;
      if (inf) infinite++;
      const k = (x.constructor.name || "A") + ":" + n + (inf ? ":infinite" : "");
      names[k] = (names[k] || 0) + 1;
    }
    return { total: a.length, running: running.length, infinite, names };
  };

  window.__m = M;
}

/* ---------------------------------------------------------------- node-side helpers */
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function inject(page) {
  await page.evaluate(`(${pageLib.toString()})()`);
}

async function go(page, route) {
  const resp = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3000);
  return resp ? resp.status() : null;
}

async function shot(page, name) {
  const file = path.join(SHOTS, name + ".jpg");
  try {
    await page.screenshot({ path: file, type: "jpeg", quality: 70, fullPage: false, scale: "css" });
    return file.replace(/\\/g, "/");
  } catch (e) {
    return "ERR " + String(e.message).slice(0, 100);
  }
}

function derive(res) {
  const t = res.targets || [];
  const tested = t.filter((x) => x.hit);
  const small = t.filter((x) => !x.disabled && !x.offscreenX && (x.w < 44 || x.h < 44));
  const smallEff = small.filter((x) => (x.hit ? Math.min(x.hit.effW, x.hit.effH) : Math.min(x.w, x.h)) < 44);
  res.counts = {
    targets: t.length,
    smallBox: small.length,
    smallEffective: smallEff.length,
    tinyText: res.static?.tinyTextCount ?? null,
    contrastFails: (res.contrast || []).filter((c) => !c.disabled).length,
    unnamed: (res.static?.unnamed || []).length,
    imgsNoAlt: (res.static?.imgsNoAlt || []).length,
    overflowX: res.static?.overflow?.overflowX ?? null,
    overflowEscapes: res.static?.overflow?.escapes?.length ?? null,
    tested: tested.length,
  };
  res.smallTargets = smallEff
    .map((x) => ({ name: x.name, sel: x.sel, w: x.w, h: x.h, effW: x.hit?.effW, effH: x.hit?.effH, n5: x.hit?.n5, y: x.y, fixed: x.fixed || undefined }))
    .sort((a, b) => Math.min(a.effW ?? a.w, a.effH ?? a.h) - Math.min(b.effW ?? b.w, b.effH ?? b.h));
  // pairs closer than 8 px
  const pairs = [];
  const cand = t.filter((x) => !x.offscreenX && !x.disabled);
  for (let i = 0; i < cand.length; i++) {
    for (let j = i + 1; j < cand.length; j++) {
      const a = cand[i],
        b = cand[j];
      if (a.fixed !== b.fixed) continue;
      if (Math.abs(a.y - b.y) > 400) continue;
      const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
      const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
      const d = Math.hypot(dx, dy);
      if (d >= 8) continue;
      const aInB = a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;
      const bInA = b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.w <= a.x + a.w + 1 && b.y + b.h <= a.y + a.h + 1;
      if (aInB || bInA) continue;
      // only interesting when at least one is small
      pairs.push({ a: a.name || a.sel, b: b.name || b.sel, gap: Math.round(d * 10) / 10, aSize: a.w + "x" + a.h, bSize: b.w + "x" + b.h, aSel: a.sel, bSel: b.sel });
    }
  }
  res.closePairsTotal = pairs.length;
  res.closePairs = pairs.sort((x, y) => x.gap - y.gap).slice(0, 40);
  return res;
}

async function measure(page, name, { root = null, steps = 6, doShot = true, shotName = null } = {}) {
  const res = { name, errors: [] };
  const safe = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      res.errors.push(label + ": " + String(e.message).slice(0, 150));
      return null;
    }
  };
  res.url = page.url();
  if (doShot) res.screenshot = await shot(page, shotName || name);
  await safe("inject", () => inject(page));
  await safe("noanim", () => page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" }));
  await page.waitForTimeout(300);
  res.scroller = await safe("init", () => page.evaluate(() => window.__m.init()));
  res.static = await safe("static", () => page.evaluate((r) => window.__m.static(r), root));
  res.targets = [];
  res.contrast = [];
  res.contrastExamined = 0;
  res.skipped = {};
  res.scrollSteps = 0;
  for (let i = 0; i < steps; i++) {
    const s = await safe("step" + i, () => page.evaluate((r) => window.__m.step(r), root));
    if (s) {
      res.targets.push(...s.targets);
      res.contrast.push(...s.contrast);
      res.contrastExamined += s.examined;
      for (const [k, v] of Object.entries(s.skipped)) res.skipped[k] = (res.skipped[k] || 0) + v;
    }
    res.scrollSteps = i + 1;
    if (i === steps - 1 || root) break;
    const sc = await safe("scroll" + i, () => page.evaluate(() => window.__m.scrollNext()));
    await page.waitForTimeout(450);
    if (!sc || !sc.moved) break;
    if (sc.atEnd) {
      const s2 = await safe("stepEnd", () => page.evaluate((r) => window.__m.step(r), root));
      if (s2) {
        res.targets.push(...s2.targets);
        res.contrast.push(...s2.contrast);
        res.contrastExamined += s2.examined;
        for (const [k, v] of Object.entries(s2.skipped)) res.skipped[k] = (res.skipped[k] || 0) + v;
      }
      res.reachedEnd = true;
      break;
    }
  }
  if (!root) res.endCheck = await safe("endCheck", () => page.evaluate((r) => window.__m.endCheck(r), root));
  await safe("top", () => page.evaluate(() => window.__m.scrollTop()));
  return derive(res);
}

function ctxOpts(extra = {}) {
  return {
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: UA,
    locale: "en-US",
    ...extra,
  };
}

/* ---------------------------------------------------------------- main */
async function launch() {
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    log("default chromium failed:", String(e.message).slice(0, 120), "-> trying channel chrome");
    return await chromium.launch({ headless: true, channel: "chrome" });
  }
}

/* Context with the first-run overlays pre-dismissed (sign-up sheet, free-slice ticket popup) so
   routes are measured as the page itself, not as the page under a scrim. */
async function newCtx(b, opts, quiet = true) {
  const c = await b.newContext(opts);
  if (quiet)
    await c.addInitScript(() => {
      try {
        localStorage.setItem("pm-signup-sheet-dismissed", "1");
        localStorage.setItem("pm-ticket-pearl-2026-11-19-seen", "1");
      } catch {}
    });
  return c;
}

const ROUTES = {
  feed: "/m/feed",
  discover: "/m",
  account: "/m/account",
  friends: "/m/friends",
  post: "/m/post",
  settings: "/m/account/settings",
  privacy: "/m/privacy",
  terms: "/m/terms",
  forgot: "/m/forgot-password",
};

const browser = await launch();
try {
  const ctx = await newCtx(browser, ctxOpts());
  ctx.setDefaultTimeout(30000);
  let page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e.message).slice(0, 120)));

  /* ---- signed-out routes */
  for (const [key, route] of Object.entries(ROUTES)) {
    if (!want("r:" + key)) continue;
    try {
      log("route", route);
      const status = await go(page, route);
      let found = {};
      if (key === "feed" || key === "discover") {
        found = await page
          .evaluate(() => ({
            restaurant: Array.from(document.querySelectorAll('a[href^="/m/restaurant/"]')).map((a) => a.getAttribute("href")).slice(0, 3),
            user: Array.from(document.querySelectorAll('a[href^="/m/u/"]')).map((a) => a.getAttribute("href")).slice(0, 3),
          }))
          .catch(() => ({}));
        R.meta.found ||= {};
        for (const k of ["restaurant", "user"]) if (found[k]?.length) (R.meta.found[k] ||= found[k][0]);
      }
      const r = await measure(page, key, { shotName: key });
      r.status = status;
      R.routes[key] = r;
      log("  done", key, JSON.stringify(r.counts), r.errors.length ? "errors:" + r.errors.join(";") : "");
    } catch (e) {
      R.routes[key] = { error: String(e.message).slice(0, 200) };
      log("  FAIL", key, e.message.slice(0, 150));
    }
    save();
  }
  // restaurant + user detail
  for (const [key, kind] of [["restaurant", "restaurant"], ["user", "u"]]) {
    if (!want("r:" + key)) continue;
    try {
      let href = R.meta.found?.[key];
      if (!href) {
        await go(page, "/m/feed");
        href = await page.evaluate((k) => document.querySelector(`a[href^="/m/${k}/"]`)?.getAttribute("href"), kind);
        if (!href) {
          await go(page, "/m");
          href = await page.evaluate((k) => document.querySelector(`a[href^="/m/${k}/"]`)?.getAttribute("href"), kind);
        }
        if (href) (R.meta.found ||= {})[key] = href;
      }
      if (!href) {
        R.routes[key] = { error: "no link found on feed or Discover" };
        continue;
      }
      log("route", href);
      const status = await go(page, href);
      const r = await measure(page, key, { shotName: key });
      r.status = status;
      r.route = href;
      R.routes[key] = r;
      log("  done", key, JSON.stringify(r.counts));
    } catch (e) {
      R.routes[key] = { error: String(e.message).slice(0, 200) };
      log("  FAIL", key, e.message.slice(0, 150));
    }
    save();
  }

  /* ---- interactions (signed out) */
  const dialogSel = '[role=dialog],[aria-modal="true"]';
  const interactions = {
    comments: async (p) => {
      await go(p, "/m/feed");
      const btn = p.locator('[aria-label*="omment" i]').first();
      await btn.scrollIntoViewIfNeeded({ timeout: 10000 });
      await btn.click({ timeout: 8000 });
      await p.waitForTimeout(1500);
    },
    plate: async (p) => {
      await go(p, "/m/feed");
      const img = p.locator("article img").first();
      await img.click({ timeout: 8000 });
      await p.waitForTimeout(1500);
    },
    filters: async (p) => {
      await go(p, "/m");
      const btn = p.locator('button[aria-haspopup="dialog"]').first();
      await btn.click({ timeout: 10000 });
      await p.waitForTimeout(1200);
    },
    vote: async (p) => {
      await go(p, "/m/feed");
      const btn = p.locator('button[aria-label="Upvote this plate"]').first();
      await btn.scrollIntoViewIfNeeded({ timeout: 10000 });
      await btn.click({ timeout: 8000 });
      await p.waitForTimeout(1500);
    },
  };
  for (const [key, fn] of Object.entries(interactions)) {
    if (!want("i:" + key)) continue;
    const p = await ctx.newPage();
    try {
      log("interaction", key);
      await fn(p);
      const hasDialog = (await p.locator(dialogSel).count()) > 0;
      const r = await measure(p, "i-" + key, { root: hasDialog ? dialogSel : null, steps: 1, shotName: "i-" + key });
      r.hasDialog = hasDialog;
      r.urlAfter = p.url();
      if (hasDialog) {
        r.dialogInfo = await p.evaluate((s) => {
          const d = document.querySelector(s);
          const r = d.getBoundingClientRect();
          return { role: d.getAttribute("role"), ariaModal: d.getAttribute("aria-modal"), label: d.getAttribute("aria-label") || d.getAttribute("aria-labelledby"), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], text: (d.innerText || "").replace(/\s+/g, " ").slice(0, 160) };
        }, dialogSel).catch(() => null);
      }
      R.interactions[key] = r;
      log("  done", key, "dialog:", hasDialog, JSON.stringify(r.counts));
    } catch (e) {
      R.interactions[key] = { error: String(e.message).slice(0, 200) };
      log("  FAIL", key, e.message.slice(0, 150));
      await shot(p, "i-" + key + "-fail");
    }
    await p.close().catch(() => {});
    save();
  }
  await ctx.close();

  /* ---- first-run overlays, as a first-time visitor meets them */
  for (const [key, route, wait] of [["ov-feed", "/m/feed", 4500], ["ov-discover", "/m", 4500], ["ov-restaurant", R.meta.found?.restaurant || "/m", 4500]]) {
    if (!want("ov:" + key)) continue;
    const c = await newCtx(browser, ctxOpts(), false);
    const p = await c.newPage();
    try {
      log("overlay", key);
      await p.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 90000 });
      await p.waitForTimeout(wait);
      const dialogs = await p.evaluate(() => Array.from(document.querySelectorAll('[role=dialog],[aria-modal="true"]')).map((d) => { const r = d.getBoundingClientRect(); return { label: d.getAttribute("aria-label") || d.getAttribute("aria-labelledby"), modal: d.getAttribute("aria-modal"), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], text: (d.textContent || "").replace(/\s+/g, " ").slice(0, 80) }; }));
      const r = await measure(p, key, { root: dialogs.length ? '[role=dialog],[aria-modal="true"]' : null, steps: 1, shotName: key });
      r.dialogs = dialogs;
      R.interactions[key] = r;
      log("  done", key, JSON.stringify(r.counts), JSON.stringify(dialogs.map((d) => d.rect)));
    } catch (e) {
      R.interactions[key] = { error: String(e.message).slice(0, 200) };
      log("  FAIL", key, e.message.slice(0, 150));
    }
    await c.close().catch(() => {});
    save();
  }

  /* ---- variants */
  R.variants.dark ||= {};
  for (const key of ["feed", "account"]) {
    if (!want("dark:" + key)) continue;
    const c = await newCtx(browser, ctxOpts({ colorScheme: "dark" }));
    const p = await c.newPage();
    try {
      log("dark", key);
      await go(p, ROUTES[key]);
      const r = await measure(p, "dark-" + key, { steps: 2, shotName: "dark-" + key });
      const light = R.routes[key]?.static;
      r.sameAsLight = light ? { colorSigEqual: light.colorSig === r.static?.colorSig, lightBodyBg: light.head?.bodyBg, darkBodyBg: r.static?.head?.bodyBg, darkPrefers: r.static?.head?.prefersDark, htmlColorScheme: r.static?.head?.htmlColorScheme } : null;
      R.variants.dark[key] = r;
    } catch (e) {
      R.variants.dark[key] = { error: String(e.message).slice(0, 200) };
    }
    await c.close();
    save();
  }
  R.variants.reducedMotion ||= {};
  for (const key of ["feed", "discover", "friends"]) {
    if (!want("rm:" + key)) continue;
    R.variants.reducedMotion[key] = {};
    for (const rm of ["no-preference", "reduce"]) {
      const c = await newCtx(browser, ctxOpts({ reducedMotion: rm }));
      const p = await c.newPage();
      try {
        log("rm", key, rm);
        await go(p, ROUTES[key]);
        await inject(p);
        R.variants.reducedMotion[key][rm] = await p.evaluate(() => window.__m.anims());
      } catch (e) {
        R.variants.reducedMotion[key][rm] = { error: String(e.message).slice(0, 200) };
      }
      await c.close();
    }
    save();
  }
  R.variants.small ||= {};
  for (const key of ["feed", "discover", "post", "account"]) {
    if (!want("small:" + key)) continue;
    const c = await newCtx(browser, ctxOpts({ viewport: { width: 375, height: 667 } }));
    const p = await c.newPage();
    try {
      log("small", key);
      await go(p, ROUTES[key]);
      const r = await measure(p, "375-" + key, { steps: 5, shotName: "375-" + key });
      r.clipped = await p.evaluate(() => window.__m.clipped(null)).catch(() => null);
      R.variants.small[key] = r;
    } catch (e) {
      R.variants.small[key] = { error: String(e.message).slice(0, 200) };
    }
    await c.close();
    save();
  }
  R.variants.textScale ||= {};
  for (const key of ["feed", "account"]) {
    if (!want("scale:" + key)) continue;
    const c = await newCtx(browser, ctxOpts());
    const p = await c.newPage();
    try {
      log("scale", key);
      await go(p, ROUTES[key]);
      await inject(p);
      await p.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
      await p.waitForTimeout(300);
      const r = await p.evaluate(() => window.__m.textScale());
      document: {
      }
      // screenshot at 130%
      await p.evaluate(() => (document.documentElement.style.fontSize = "130%"));
      await p.waitForTimeout(400);
      r.screenshot = await shot(p, "scale130-" + key);
      R.variants.textScale[key] = r;
    } catch (e) {
      R.variants.textScale[key] = { error: String(e.message).slice(0, 200) };
    }
    await c.close();
    save();
  }
  R.meta.consoleErrors = consoleErrors.slice(0, 20);
  R.meta.signedInPass = R.meta.signedInPass || "skipped: probe/audit/.env (AUDIT_EMAIL/AUDIT_PASSWORD) does not exist on this machine";
} catch (e) {
  R.meta.fatal = String(e.stack || e.message).slice(0, 400);
  log("FATAL", e.message);
} finally {
  R.meta.finishedAt = new Date().toISOString();
  save();
  await browser.close().catch(() => {});
}

/* ---------------------------------------------------------------- summary */
function buildSummary() {
  const L = [];
  L.push("# PlateMaps runtime measurements (Chromium, 393x852 @2x, signed out)");
  L.push("");
  L.push("Per route: small = targets with box under 44 px (effective hit size under 44 px in brackets), tiny = text nodes under 11 px, lowC = low-contrast text, unnamed = unnamed controls, noAlt = img without alt, overflow = horizontal overflow.");
  L.push("");
  L.push("| route | targets | small (eff) | tiny | lowC | unnamed | noAlt | overflow |");
  L.push("|---|---|---|---|---|---|---|---|");
  const all = [];
  const rows = [...Object.entries(R.routes), ...Object.entries(R.interactions).map(([k, v]) => ["i:" + k, v]), ...Object.entries(R.variants.small || {}).map(([k, v]) => ["375:" + k, v]), ...Object.entries(R.variants.dark || {}).map(([k, v]) => ["dark:" + k, v])];
  for (const [k, r] of rows) {
    if (!r || r.error || !r.counts) {
      L.push(`| ${k} | ERROR ${r?.error || ""} |||||||`);
      continue;
    }
    const c = r.counts;
    L.push(`| ${k} | ${c.targets} | ${c.smallBox} (${c.smallEffective}) | ${c.tinyText} | ${c.contrastFails} | ${c.unnamed} | ${c.imgsNoAlt} | ${c.overflowX ? "YES" : "no"} |`);
    if (!k.startsWith("375:") && !k.startsWith("dark:")) {
      for (const s of r.smallTargets || []) all.push({ kind: "target", route: k, text: s.name || s.sel, metric: `${s.w}x${s.h} box, ${s.effW ?? "?"}x${s.effH ?? "?"} hit`, score: Math.min(s.effW ?? s.w, s.effH ?? s.h) });
      for (const t of r.static?.tinyText || []) all.push({ kind: "text", route: k, text: t.text, metric: `${t.size}px`, score: t.size * 3 });
      for (const c2 of r.contrast || []) if (!c2.disabled) all.push({ kind: "contrast", route: k, text: c2.text, metric: `${c2.ratio}:1 (${c2.fg} on ${c2.bg}, ${c2.size}px)`, score: c2.ratio * 8 });
    }
  }
  L.push("");
  L.push("## Ten worst offenders overall (smallest hit area / smallest text / lowest contrast, deduplicated)");
  const seenK = new Set();
  const top = [];
  for (const a of all.sort((x, y) => x.score - y.score)) {
    const k = a.kind + "|" + a.text;
    if (seenK.has(k)) continue;
    seenK.add(k);
    top.push(a);
    if (top.length >= 10) break;
  }
  top.forEach((a, i) => L.push(`${i + 1}. [${a.kind}] ${a.route}: "${a.text}" - ${a.metric}`));
  L.push("");
  L.push("## Variants");
  for (const [k, v] of Object.entries(R.variants.reducedMotion || {})) {
    const n = v["no-preference"],
      d = v["reduce"];
    L.push(`- reduced motion ${k}: running animations ${n?.running ?? "?"} (infinite ${n?.infinite ?? "?"}) default vs ${d?.running ?? "?"} (infinite ${d?.infinite ?? "?"}) with Reduce Motion`);
  }
  for (const [k, v] of Object.entries(R.variants.dark || {})) L.push(`- dark ${k}: ${v.sameAsLight ? JSON.stringify(v.sameAsLight) : v.error || "n/a"}`);
  for (const [k, v] of Object.entries(R.variants.textScale || {})) L.push(`- text 130% ${k}: ${v.error || `${v.grew}/${v.total} text nodes grew (${v.shareGrew}%), ${v.fixed} stayed fixed; scrollWidth ${v.overflowAfter?.scrollWidth} vs ${v.overflowAfter?.innerWidth}; escapes ${v.overflowAfter?.escapes?.length}`}`);
  for (const [k, v] of Object.entries(R.variants.small || {})) L.push(`- 375x667 ${k}: ${v.error || `scrollWidth ${v.static?.overflow?.scrollWidth}, escapes ${v.static?.overflow?.escapes?.length}, clipped ${v.clipped?.length ?? "?"}`}`);
  L.push("");
  L.push("Signed-in pass: " + (R.meta.signedInPass || "not run"));
  fs.writeFileSync(path.join(OUT, "measurements-summary.md"), L.join("\n").split("\n").slice(0, 80).join("\n") + "\n");
}
try {
  buildSummary();
} catch (e) {
  console.log("summary failed", e.message);
}
log("finished");
