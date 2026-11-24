"use client";

import { useEffect, useRef } from "react";
import type { FlavorWheel } from "@/lib/flavorWheelSnapshots";

/**
 * The flavor wheel drawn as a constellation (picked by Calvin 2026-11-24, mockup
 * ~/flavor-tree.html). Collapsed it is the familiar ring of family arcs with one
 * spoke per flavor. Tapping a family opens its stars: basics on the inner orbit
 * (the wheel's own flavors), then a regional orbit and a rare orbit, each star
 * linked to the one it grows from. Hollow stars are still to find.
 *
 * Only rendered inside PhoneFlavorProfile, which is already gated to the For me
 * accounts (lib/forMeGate.ts). Lit stars come from the caller's own snapshot:
 * a basic is lit when the wheel leans toward it, a regional or rare star when
 * one of their scored plates names it (and that lights the stars it grows from).
 *
 * Drawn imperatively into one <svg> because the open/close tween re-lays out
 * every spoke per frame; React only owns the container.
 */

/* Family, short word, colour, tree: basics split by ";", "basic>regional|regional",
   rares in (a/b). Basics are the wheel's own flavor names. */
const TREE: [string, string, string, string][] = [
  ["Heat and smoke", "Heat", "#E2622A", "Spicy>Sichuan(Mala hot pot)|Thai chili(Nam prik)|Nashville hot;Smoky>Mesquite(Binchotan)|Chipotle;Sweet heat>Gochujang(Mango habanero)|Hot honey;Charred>Al pastor;Warm spice>Berbere(Ras el hanout)"],
  ["Rich and melty", "Rich", "#C9952B", "Cheese>Burrata(Stracciatella)|Raclette;Creamy>Tahini(Labneh);Buttery>Brown butter(Beurre blanc);Rich>Pork belly;Nutty>Pesto;Premium>Wagyu(A5 wagyu)|Truffle(White truffle)|Caviar"],
  ["Meat", "Meat", "#8E3B46", "Meat>Carnitas(Lengua)|Birria(Goat birria);Cured>Prosciutto(Jamón ibérico)|Chorizo;Poultry>Yakitori(Duck tongue)|Fried chicken;Offal>Tripe(Bone marrow);Red meat>Brisket(Dry-aged);Low and slow>Barbacoa|Oxtail;Braised>Short rib(Osso buco)"],
  ["Carbs and comfort", "Carbs", "#A9865A", "Brunch>Chilaquiles(Shakshuka)|Benedict;Crispy>Tempura;Garlic, onion>Garlic noodles;Pasta, noodles>Udon(Soba)|Cacio e pepe;Bread, dough>Sourdough(Injera);Carbs>Dumplings(Xiao long bao);Fried>Pani puri;Brothy>Ramen(Tsukemen)|Pho;World foods>Pupusa(Tlayuda)"],
  ["Fresh and bright", "Fresh", "#4F8A4B", "Bitter>Radicchio;Herbs>Shiso(Lovage)|Chimichurri;Fruity>Tamarind;Pickled, tangy>Giardiniera;Greens>Watercress;Fresh, light>Gazpacho(Ajo blanco);Fermented>Kimchi(Natto)|Kombucha;Citrus>Yuzu(Finger lime)|Calamansi;Sour>Verjus"],
  ["Sea", "Sea", "#2F7F86", "Raw fish>Ceviche(Aguachile)|Sashimi(Uni)|Poke;Seafood>Oysters(Percebes/Geoduck)|Fish tacos"],
  ["Sweets and sips", "Sweet", "#B8578F", "Sweet>Ube(Halo-halo)|Mochi;Drinks>Horchata(Chicha morada)|Boba|Matcha;Dessert>Churros(Kunafa)|Tres leches"],
];

const INK = "#2a2622", GREY = "#665c4e", TAN2 = "#b8a88c", LOCKC = "#857a69", ORANGE = "#a8481a", CARD = "#fffdf8";
const NS = "http://www.w3.org/2000/svg", C = 205, R0 = 78, K = 88, GAP = 26;
const HINT_KEY = "pmConstellationHint";

type Star = { name: string; on: boolean };
type Spoke = { f: number; t: number; s: Star; score: number };
type Vis = { w: number; len: number; lab: number; wd: number };

const hsh = (n: string, k: number) => { let h = k * 7919; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) | 0; return ((h >>> 0) % 1000) / 1000; };
const mix = (hex: string, t: number) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t)); return `rgb(${c})`; };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const pt = (r: number, d: number): [number, number] => [C + r * Math.cos((d * Math.PI) / 180), C + r * Math.sin((d * Math.PI) / 180)];
const arcD = (r: number, a1: number, a2: number, rev?: boolean) => { const [x1, y1] = pt(r, rev ? a2 : a1), [x2, y2] = pt(r, rev ? a1 : a2); return `M${x1} ${y1}A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} ${rev ? 0 : 1} ${x2} ${y2}`; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const words = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function mount(svg: SVGSVGElement, note: HTMLDivElement, data: FlavorWheel) {
  const store = { get: () => { try { return localStorage.getItem(HINT_KEY); } catch { return "1"; } }, set: () => { try { localStorage.setItem(HINT_KEY, "1"); } catch { /* private mode */ } } };
  const scoreOf = new Map(data.wheel.map(([n, s]) => [n, s]));
  const maxS = Math.max(0.01, ...data.wheel.map(([, s]) => s));
  /* Everything the person's scored plates say, to match regional and rare stars by name. */
  const plates = words(Object.entries(data.flavors).map(([k, v]) => `${k.replace("|", " ")} ${v.read}`).join(" \n "));
  const named = (n: string) => new RegExp(`(^|[^a-z])${words(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(plates);

  const PAR: Record<string, string> = {};
  const fams = TREE.map(([full, word, col, tree]) => {
    const b: Star[] = [], r: Star[] = [], x: Star[] = [];
    tree.split(";").forEach((bs) => {
      const [bn, rest] = bs.split(">");
      const B = { name: bn, on: (scoreOf.get(bn) ?? 0) > 0 };
      b.push(B);
      (rest || "").split("|").filter(Boolean).forEach((rs) => {
        const m = rs.match(/^([^(]+)(?:\((.*)\))?$/)!;
        const R = { name: m[1], on: named(m[1]) };
        r.push(R); PAR[R.name] = B.name;
        (m[2] || "").split("/").filter(Boolean).forEach((xs) => { const X = { name: xs, on: named(xs) }; x.push(X); PAR[X.name] = R.name; });
      });
    });
    /* A star you reached lights the path back to its basic. */
    x.forEach((X) => { if (X.on) { const R = r.find((q) => q.name === PAR[X.name]); if (R) R.on = true; } });
    r.forEach((R) => { if (R.on) { const B = b.find((q) => q.name === PAR[R.name]); if (B) B.on = true; } });
    return { full, word, col, tiers: [b, r, x] as Star[][] };
  });

  const S: Spoke[] = [];
  fams.forEach((f, fi) => f.tiers.forEach((list, ti) => list.forEach((s) => S.push({ f: fi, t: ti, s, score: 0.4 + 0.65 * clamp((scoreOf.get(s.name) ?? 0) / maxS) }))));
  const IDX: Record<string, number> = {};
  S.forEach((x, i) => (IDX[x.f + "|" + x.s.name] = i));
  const all = S.map((_, i) => i);
  const KIDS = S.map((x) => all.filter((i) => S[i].f === x.f && S[i].t === x.t + 1 && PAR[S[i].s.name] === x.s.name));
  const SUB: number[][] = [];
  const subOf = (i: number): number[] => SUB[i] || (SUB[i] = [i, ...KIDS[i].flatMap(subOf)]);
  S.forEach((_, i) => subOf(i));
  const LW = S.map((_, i) => (KIDS[i].length ? 0 : 1));
  const famOrder = (fi: number) => {
    const sub = (p: number): number[] => { const k = KIDS[p].map(sub), h = Math.floor(k.length / 2); return [...k.slice(0, h).flat(), p, ...k.slice(h).flat()]; };
    return all.filter((i) => S[i].f === fi && S[i].t === 0).flatMap(sub);
  };
  const ORD0 = all;
  /* ALL: every family open at once, each in its own slice of the ring. */
  const ALL = -1, ORDA = fams.flatMap((_, fi) => famOrder(fi));
  const ORD = fams.map((_, fi) => { const o: number[] = []; let put = false; S.forEach((x, i) => { if (x.f !== fi) o.push(i); else if (!put) { o.push(...famOrder(fi)); put = true; } }); return o; });

  function target(fo: number | null): Vis[] {
    if (fo === ALL) return S.map((_, i) => ({ w: LW[i], len: 0, lab: 0, wd: 6.5 }));
    const nL = fo == null ? 0 : S.reduce((a, x, i) => a + (x.f === fo ? LW[i] : 0), 0);
    const nO = S.filter((x) => x.t === 0 && x.f !== fo).length, A = fo == null ? 1 : (0.8 * nO) / (0.2 * nL);
    return S.map((x, i) => {
      const on = x.s.on, len = on ? x.score * K : 5;
      if (fo == null) return x.t === 0 ? { w: 1, len, lab: 1, wd: 6.5 } : { w: 0, len: 0, lab: 0, wd: 6.5 };
      if (x.f === fo) return { w: LW[i] * A, len: 0, lab: 0, wd: 6.5 };
      return x.t === 0 ? { w: 1, len: on ? x.score * K * 0.32 : 3, lab: 0, wd: 2.6 } : { w: 0, len: 0, lab: 0, wd: 2.6 };
    });
  }
  function layout(vis: Vis[], rot: number, fo: number | null) {
    const W = vis.reduce((a, v) => a + v.w, 0), u = 360 / W, L: { s: number; e: number; m: number }[] = [];
    let c = 0;
    (fo == null ? ORD0 : fo === ALL ? ORDA : ORD[fo]).forEach((i) => { const v = vis[i], s = -90 + rot + c * u, e = -90 + rot + (c + v.w) * u; c += v.w; L[i] = { s, e, m: (s + e) / 2 }; });
    return L;
  }
  function rotFor(vis: Vis[], fo: number) {
    const L = layout(vis, 0, fo), idx = all.filter((i) => S[i].f === fo);
    const mid = (Math.min(...idx.map((i) => L[i].s)) + Math.max(...idx.map((i) => L[i].e))) / 2;
    return (((-90 - mid) + 540) % 360) - 180;
  }

  let focus: number | null = null, cur = target(null), rot = 0, anim = 0, dead = false;
  const el = (p: Element, t: string, a: Record<string, string | number>, txt?: string) => {
    const e = document.createElementNS(NS, t);
    for (const k in a) e.setAttribute(k, String(a[k]));
    if (txt != null) e.textContent = txt;
    p.appendChild(e);
    return e;
  };

  function draw(vis: Vis[], rot: number, fo: number | null, ft: number, moving: boolean) {
    svg.replaceChildren();
    const L = layout(vis, rot, fo), staticCollapsed = !moving && ft === 0;
    const top = S.filter((x) => x.t === 0 && x.s.on).sort((a, b) => b.score - a.score).slice(0, 3);
    const hint = staticCollapsed && !store.get();
    fams.forEach((f, fi) => {
      let famA1: number | null = null, famA2 = 0;
      const idx = all.filter((i) => S[i].f === fi && (fo === fi || fo === ALL || S[i].t === 0) && vis[i].w > 1e-3);
      if (!idx.length) return;
      const s0 = Math.min(...idx.map((i) => L[i].s)), s1 = Math.max(...idx.map((i) => L[i].e)), span = s1 - s0;
      if (span < 0.6) return;
      const ins = Math.min(3, span * 0.2), a1 = s0 + ins, a2 = s1 - ins, nm = ((((a1 + a2) / 2) % 360) + 360) % 360, bot = nm > 0 && nm < 180;
      famA1 = a1; famA2 = a2;
      const arc = el(svg, "path", { d: arcD(R0, a1, a2), fill: "none", stroke: f.col, "stroke-width": 4, "stroke-linecap": "round" });
      if (hint) {
        const dl = `${0.5 + 0.14 * fi}s`;
        arc.setAttribute("class", "pmc-hintarc"); (arc as SVGElement).style.animationDelay = dl;
        el(svg, "path", { d: arcD(R0, a1, a2), fill: "none", stroke: "#fff", "stroke-width": 3, "stroke-linecap": "round", pathLength: 100, "stroke-dasharray": "16 300", "stroke-dashoffset": 16, opacity: 0.9, class: "pmc-sweep", style: `animation-delay:${dl}` });
      }
      const op = fo == null || fo === ALL ? 1 : fo === fi ? 1 - ft : Math.max(0, 1 - ft * 1.6);
      if (op > 0.02) {
        const rr = bot ? R0 + 18 : R0 + 9, need = f.word.length * 7.2;
        if ((rr * (a2 - a1) * Math.PI) / 180 > need) {
          const id = "pmc-p" + fi;
          el(svg, "path", { id, d: arcD(rr, a1, a2, bot), fill: "none" });
          const t = el(svg, "text", { "font-size": 12.5, "font-weight": 700, fill: f.col, "text-anchor": "middle", opacity: op });
          el(t, "textPath", { href: "#" + id, startOffset: "50%" }, f.word);
        }
      }
      if (famA1 != null && !moving && fo !== fi) {
        const hit = el(svg, "path", { d: arcD(R0 + 8, famA1, famA2), fill: "none", stroke: "transparent", "stroke-width": 30, style: "cursor:pointer", role: "button", "aria-label": `Open ${f.full}` });
        hit.addEventListener("click", () => { store.set(); go(fi); });
      }
    });
    const ff = fo == null ? null : fo === ALL ? { word: "All flavors", col: INK, tiers: [S.map((x) => x.s)] } : fams[fo];
    if (ff && ft > 0) {
      const stars = ff.tiers.flat(), got = stars.filter((s) => s.on).length, g = el(svg, "g", { opacity: ft });
      el(g, "text", { x: C, y: C - 10, "text-anchor": "middle", "font-size": fo === ALL ? 14 : 16, "font-weight": 800, fill: ff.col }, ff.word);
      el(g, "text", { x: C, y: C + 7, "text-anchor": "middle", "font-size": 12, "font-weight": 600, fill: GREY }, `${got} of ${stars.length} found`);
      el(g, "text", { x: C, y: C + 24, "text-anchor": "middle", "font-size": 11, "font-weight": 600, fill: ORANGE }, "tap to fold");
      if (!moving) { const c = el(svg, "circle", { cx: C, cy: C, r: R0 - 12, fill: "transparent", style: "cursor:pointer", role: "button", "aria-label": "Fold back" }); c.addEventListener("click", () => go(null)); }
    }
    if (ft < 1) {
      const g = el(svg, "g", { opacity: 1 - ft });
      const a = el(g, "g", { class: hint ? "pmc-ctrA" : "" });
      ["tap to see", "entire", "constellation"].forEach((s, i) => el(a, "text", { x: C, y: C + (i - 1) * 14 + 4, "text-anchor": "middle", "font-size": 11, "font-weight": 600, fill: ORANGE }, s));
      if (hint) { const b = el(g, "g", { class: "pmc-ctrB" }); ["tap a", "family"].forEach((s, i) => el(b, "text", { x: C, y: C + (i - 0.5) * 15 + 4, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: ORANGE }, s)); }
    }
    if (fo == null && !moving) { const c = el(svg, "circle", { cx: C, cy: C, r: R0 - 12, fill: "transparent", style: "cursor:pointer", role: "button", "aria-label": "See entire constellation" }); c.addEventListener("click", () => { store.set(); go(ALL); }); }
    /* spokes: the basics, around the ring */
    const hitLines: Element[] = [];
    S.forEach((x, i) => {
      const v = vis[i];
      if (v.w < 1e-3 || x.t > 0 || v.len < 0.5) return;
      const d = L[i].m, lk = !x.s.on, isTop = fo == null && top.includes(x);
      const [x1, y1] = pt(R0 + GAP, d), [x2, y2] = pt(R0 + GAP + v.len, d);
      el(svg, "line", { x1, y1, x2, y2, stroke: lk ? TAN2 : fams[x.f].col, "stroke-width": lk ? Math.min(5, v.wd) : isTop ? 8 : v.wd, "stroke-linecap": "round", opacity: lk ? 0.45 : 1 });
      /* The bar itself opens its family too: a wide invisible hit line from the
         ring out past the label, so a thumb on the spoke or its word works. */
      if (!moving && fo !== x.f) {
        const [hx1, hy1] = pt(R0 + 8, d), [hx2, hy2] = pt(R0 + GAP + v.len + (v.lab > 0.04 ? 9 + x.s.name.length * 6.5 : 6), d);
        const hit = el(svg, "line", { x1: hx1, y1: hy1, x2: hx2, y2: hy2, stroke: "transparent", "stroke-width": 16, "stroke-linecap": "round", style: "cursor:pointer", "aria-label": `Open ${fams[x.f].full}` });
        hit.addEventListener("click", () => { store.set(); go(x.f); });
        hitLines.push(hit);
      }
      if (v.lab < 0.04) return;
      const [lx, ly] = pt(R0 + GAP + v.len + 9, d), nd = ((d % 360) + 360) % 360, flip = nd > 90 && nd < 270;
      el(svg, "text", { x: lx, y: ly, dy: "0.35em", "text-anchor": flip ? "end" : "start", transform: `rotate(${flip ? d + 180 : d} ${lx} ${ly})`, opacity: v.lab,
        "font-size": lk ? 13 : isTop ? 14 : 11.5, "font-weight": lk ? 700 : isTop ? 800 : 600, fill: lk ? LOCKC : INK }, lk ? "?" : x.s.name);
    });
    hitLines.forEach((h) => svg.appendChild(h)); // above the labels, so taps on a word land
    /* open family: the constellation */
    const allMode = fo === ALL;
    if (fo != null && ft > 0) (allMode ? fams.map((_, k) => k) : [fo]).forEach((fo) => {
      const f = fams[fo], RO = [130, 190, 244], DR = [8, 6, 4.5], cw = (n: string, fs: number) => n.length * fs * 0.57;
      const P: Record<number, { a: number; r: number; g: number; s0: number; s1: number; lk: boolean }> = {};
      const famI = all.filter((i) => S[i].f === fo);
      const fs0 = Math.min(...famI.map((i) => L[i].s)), fs1 = Math.max(...famI.map((i) => L[i].e));
      const gT = (t: number) => (t === 0 ? clamp(ft * 1.8) : t === 1 ? clamp((ft - 0.25) / 0.5) : clamp((ft - 0.5) / 0.5));
      const gs = gT(1), whole = allMode;
      if (gs > 0.01) for (let k = 0; k < (allMode ? 14 : 46); k++) {
        const a = fs0 - 4 + (fs1 - fs0 + 8) * hsh(f.word, k * 3 + 1), r = R0 + 30 + 190 * Math.sqrt(hsh(f.word, k * 3 + 2)) * gs, [sx, sy] = pt(r, a);
        el(svg, "circle", { cx: sx, cy: sy, r: 0.8 + 1.4 * hsh(f.word, k * 3 + 3), fill: mix(f.col, 0.55), opacity: 0.35 * gs });
      }
      famI.forEach((i) => {
        const x = S[i], g = gT(x.t), sub = SUB[i], s0 = Math.min(...sub.map((j) => L[j].s)), s1 = Math.max(...sub.map((j) => L[j].e)), cwid = s1 - s0, nm = x.s.name;
        /* The whole sky scatters far more: deep radial bands that overlap, and
           children allowed to wander past their slice, so stars don't stack. */
        const a = allMode
          ? (s0 + s1) / 2 + (hsh(nm, 1) - 0.5) * (x.t ? Math.min(cwid * 1.6 + 6, 22) : Math.min(cwid * 0.5, 8))
          : (s0 + s1) / 2 + (x.t ? (hsh(nm, 1) - 0.5) * Math.min(cwid * 0.5, 14) : 0);
        const rr = allMode ? [102, 132, 170][x.t] + [48, 100, 108][x.t] * hsh(nm, 2) : RO[x.t] + (hsh(nm, 2) - 0.5) * 2 * [7, 15, 17][x.t];
        P[i] = { a, r: R0 + (rr - R0) * g, g, s0, s1, lk: !x.s.on };
      });
      famI.forEach((i) => {
        const x = S[i];
        if (x.t === 0) return;
        const c = P[i], q = P[IDX[fo + "|" + PAR[x.s.name]]];
        if (!q || c.g < 0.02) return;
        const [x1, y1] = pt(q.r, q.a), [x2, y2] = pt(c.r, c.a), [kx, ky] = pt(c.r, q.a);
        el(svg, "path", { d: `M${x1} ${y1}Q${kx} ${ky} ${x2} ${y2}`, fill: "none", stroke: c.lk ? TAN2 : mix(f.col, x.t === 1 ? 0.25 : 0.5), "stroke-width": c.lk ? 1.2 : x.t === 1 ? 2.4 : 1.8, "stroke-dasharray": c.lk ? "2 4" : "", "stroke-linecap": "round", opacity: c.g * (c.lk ? 0.8 : 1) });
      });
      famI.forEach((i) => {
        const x = S[i], c = P[i];
        if (c.g < 0.01) return;
        const lk = c.lk, dr = DR[x.t] * (allMode ? 0.62 : 1) * Math.min(1, c.g * 1.4), [cx, cy] = pt(c.r, c.a);
        if (!lk && x.t === 0) el(svg, "circle", { cx, cy, r: dr + (allMode ? 2.5 : 4), fill: f.col, opacity: 0.16 });
        el(svg, "circle", { cx, cy, r: dr, fill: lk ? CARD : x.t === 0 ? f.col : mix(f.col, x.t === 1 ? 0.3 : 0.55), stroke: lk ? TAN2 : "none", "stroke-width": lk ? 1.4 : 0 });
        if (c.g < 0.7) return;
        const op = (c.g - 0.7) / 0.3, fs = x.t === 2 ? 11 : 11.5, nm = ((c.a % 360) + 360) % 360, bot = nm > 0 && nm < 180;
        const rl = c.r - DR[x.t] - 4 - fs * 0.55, half = Math.min(c.s1 - c.s0, 40) / 2, a1 = c.a - half, a2 = c.a + half;
        const room = (rl * (a2 - a1) * Math.PI) / 180 - 4 + (x.t ? 10 : 0), cut = (l: string) => l.slice(0, Math.max(1, Math.floor((room + 6) / (fs * 0.57)) - 1)) + "…";
        let txt = x.s.name, two: string[] | null = null;
        if (cw(txt, fs) > room && txt.includes(" ")) { const w = txt.split(" "), h = Math.ceil(w.length / 2); two = [w.slice(0, h).join(" "), w.slice(h).join(" ")]; }
        if (two) two = two.map((l) => (cw(l, fs) > room + 6 ? cut(l) : l));
        if (!two && cw(txt, fs) > room + 6) txt = cut(txt);
        if (whole && (two || txt.endsWith("…"))) return; // the whole sky only names stars that fit
        const at = { "font-size": fs, "font-weight": x.t === 0 ? 700 : x.t === 1 ? 600 : 500, "font-style": x.t === 2 && !lk ? "italic" : "normal", fill: lk ? LOCKC : x.t === 0 ? f.col : x.t === 1 ? INK : GREY, "text-anchor": "middle", dy: "0.35em", opacity: op * (lk ? 0.85 : 1) };
        const lines = two || [txt];
        lines.forEach((ln, q) => {
          const off = lines.length === 1 ? 0 : (q === 0) !== bot ? 0 : -fs * 1.1, id = `pmc-s${i}_${q}`;
          el(svg, "path", { id, d: arcD(rl + off, a1 - 25, a2 + 25, bot), fill: "none" });
          el(el(svg, "text", at), "textPath", { href: "#" + id, startOffset: "50%" }, ln);
        });
      });
    });
  }

  function info() {
    if (focus == null) { note.innerHTML = "Tap a family to see its stars."; return; }
    const f = focus === ALL ? { word: "all flavors", col: INK, tiers: [0, 1, 2].map((t) => S.filter((x) => x.t === t).map((x) => x.s)) } : fams[focus], stars = f.tiers.flat(), got = stars.filter((s) => s.on).length, pct = Math.round((got / stars.length) * 100);
    const nextReg = f.tiers[1].find((s) => !s.on && f.tiers[0].some((b) => b.on && b.name === PAR[s.name])) ?? f.tiers[1].find((s) => !s.on);
    const names = ["Basics", "Regional", "Rare"];
    note.innerHTML = `<div><b style="color:${INK}">${pct}%</b> of ${esc(f.word)} found</div>` +
      `<div style="height:4px;border-radius:9px;background:#efe6d4;margin:6px 0 4px"><i style="display:block;height:100%;border-radius:9px;width:${pct}%;background:${f.col}"></i></div>` +
      `<div style="font-size:12px;margin:-2px 0 6px">${f.tiers.map((l, ti) => `${names[ti]} ${l.filter((s) => s.on).length}/${l.length}`).join(" · ")}</div>` +
      (nextReg ? `Next to find: <b style="color:${INK}">${esc(nextReg.name)}</b>.` : "Every regional star found.");
  }

  const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  function tween(to: number | null, done?: () => void) {
    const from = cur, tgt = target(to), r0 = rot, r1 = to == null || to === ALL ? 0 : rotFor(tgt, to), fo = to == null ? focus : to;
    const t0 = focus == null ? 0 : 1, t1 = to == null ? 0 : 1, st = performance.now();
    const D = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 560;
    focus = to;
    const step = (now: number) => {
      if (dead) return;
      const p = Math.min(1, (now - st) / D), e = ease(p);
      cur = from.map((a, i) => ({ w: a.w + (tgt[i].w - a.w) * e, len: a.len + (tgt[i].len - a.len) * e, lab: a.lab + (tgt[i].lab - a.lab) * e, wd: a.wd + (tgt[i].wd - a.wd) * e }));
      rot = r0 + (r1 - r0) * e;
      if (p < 1) { draw(cur, rot, fo, t0 + (t1 - t0) * e, true); anim = requestAnimationFrame(step); }
      else { anim = 0; if (done) done(); else settle(); }
    };
    anim = requestAnimationFrame(step);
  }
  function settle() { draw(cur, rot, focus, focus == null ? 0 : 1, false); info(); }
  function go(to: number | null) {
    if (anim) return;
    if (focus != null && to != null && to !== focus) tween(null, () => tween(to));
    else if (to !== focus) tween(to);
  }
  settle();
  return () => { dead = true; if (anim) cancelAnimationFrame(anim); };
}

export function FlavorConstellation({ data }: { data: FlavorWheel }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!svgRef.current || !noteRef.current) return;
    return mount(svgRef.current, noteRef.current, data);
  }, [data]);
  return (
    <div>
      <style>{`
        .pmc-sweep{animation:pmc-sw 7s cubic-bezier(.45,0,.3,1) infinite both}@keyframes pmc-sw{0%{stroke-dashoffset:16}16%,100%{stroke-dashoffset:-100}}
        .pmc-hintarc{animation:pmc-th 7s ease-in-out infinite both}@keyframes pmc-th{0%,100%{stroke-width:4}6%{stroke-width:7.5}16%{stroke-width:4}}
        .pmc-ctrA{animation:pmc-ca 7s .5s infinite both}@keyframes pmc-ca{0%,3%{opacity:1}8%,42%{opacity:0}48%,100%{opacity:1}}
        .pmc-ctrB{animation:pmc-cb 7s .5s infinite both}@keyframes pmc-cb{0%,3%{opacity:0}8%,42%{opacity:1}48%,100%{opacity:0}}
        @media (prefers-reduced-motion: reduce){.pmc-sweep,.pmc-hintarc,.pmc-ctrA,.pmc-ctrB{animation:none}.pmc-ctrB{opacity:0}}
      `}</style>
      <svg ref={svgRef} viewBox="-85 -85 580 580" className="my-1 block h-auto w-full" style={{ touchAction: "manipulation" }} role="img" aria-label={`Flavor constellation: ${data.wheel.slice(0, 3).map(([n]) => n).join(", ")} lead`} />
      <div ref={noteRef} className="min-h-11 border-t border-[#efe6d4] pt-2.5 text-[13px] text-[#665c4e]" aria-live="polite" />
    </div>
  );
}
