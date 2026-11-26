// The reason line on a For me pick, for the 40-axis account only (lib/forMeGate.ts isFlavor40User). It is written
// from what the ranker already knows: where the viewer's taste and the place (or its named dish) overlap, how firmly
// their history backs it, repeat visits, and a high crowd rating. The profile itself never shows: no scores, no
// percentages, no axis names, only food words. Pure functions, no I/O.
import { AXES, N_AXES, N_CORE, PARENT, type PlaceVectors, type Profile40 } from "@/lib/flavor40";

/** How an axis reads in a sentence, lowercase, as a noun phrase. `neg` is the other pole of a two-sided axis. */
const PHRASE: Record<string, { pos: string; neg?: string }> = {
  indulgent: { pos: "indulgent comfort-food richness", neg: "light, fresh-feeling food" },
  adventurous: { pos: "bold, off-the-beaten-path flavors" },
  spicy: { pos: "a real chili kick" },
  sweet: { pos: "a sweet edge" },
  sour: { pos: "bright, tangy acidity" },
  umami: { pos: "deep savory umami" },
  rich: { pos: "rich, creamy depth" },
  smoky: { pos: "smoky char" },
  crispy: { pos: "shattering crunch" },
  meat: { pos: "meat-forward cooking", neg: "plant-led cooking" },
  seafood: { pos: "fresh seafood" },
  sweetheat: { pos: "sweet-and-spicy heat" },
  dessert: { pos: "dessert-case sweetness" },
  citrus: { pos: "citrus brightness" },
  funky: { pos: "fermented, funky tang" },
  earthy: { pos: "earthy mushroom-and-truffle depth" },
  allium: { pos: "garlic-forward savor" },
  salty: { pos: "salty, cured savor" },
  cheese: { pos: "melty cheese" },
  creamsauce: { pos: "creamy sauces" },
  lowslow: { pos: "low-and-slow smoke" },
  grilled: { pos: "wood-fire grill char" },
  crunchfresh: { pos: "crunchy-fresh texture" },
  redmeat: { pos: "red-meat heft" },
  poultry: { pos: "juicy poultry" },
  offal: { pos: "adventurous cuts" },
  rawfish: { pos: "raw-fish freshness" },
  bitter: { pos: "a bitter edge" },
  warmspice: { pos: "warm-spice depth" },
  herbs: { pos: "fresh-herb lift" },
  traditional: { pos: "old-school, traditional technique", neg: "inventive fusion twists" },
  brothy: { pos: "brothy warmth" },
  chewy: { pos: "chewy, hand-made texture" },
  braised: { pos: "slow-braised tenderness" },
  carbs: { pos: "carb-loaded comfort" },
  plated: { pos: "plated, sit-down polish", neg: "relaxed counter-service ease" },
  value: { pos: "generous portions" },
  drinks: { pos: "coffee-and-drinks craft" },
  brunch: { pos: "brunch-table appeal" },
  latenight: { pos: "late-night appeal" },
};

export type AxisPick = { a: number; phrase: string; score: number };

const fnv = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const cap1 = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

function join(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const related = (x: number, y: number): boolean => PARENT[x] === PARENT[y] || PARENT[x] === y || PARENT[y] === x;

/** Best first, one per family of axes (a finer axis and its core axis count as one). */
function distinct(cand: AxisPick[], max: number): AxisPick[] {
  const out: AxisPick[] = [];
  for (const c of cand) {
    if (out.some((k) => related(k.a, c.a))) continue;
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** The axes where the person's taste and the place (plus its named dish) overlap most, best first. */
export function overlapAxes(profile: Profile40, vecs: PlaceVectors, p: number, dish: Float32Array | null, max = 3): AxisPick[] {
  const o = p * N_AXES;
  const cand: AxisPick[] = [];
  for (let a = 0; a < N_AXES; a++) {
    const id = AXES[a].id;
    const ph = PHRASE[id];
    if (!ph || profile.w[a] === 0) continue;
    const bip = AXES[a].bipolar === true;
    const z = vecs.z[o + a] + (dish ? 1.5 * dish[a] : 0);
    const u = profile.u[a];
    // Both sides must lean the same way, and the place (or its dish) must clearly show it.
    if (bip ? !(u * z > 0 && Math.abs(z) >= 0.6) : !(u > 0.05 && z >= 0.6)) continue;
    const phrase = bip && z < 0 ? ph.neg : ph.pos;
    if (!phrase) continue;
    cand.push({ a, phrase, score: profile.w[a] * Math.abs(u) * Math.abs(z) * (dish && dish[a] >= 0.3 ? 1.4 : 1) });
  }
  cand.sort((x, y) => y.score - x.score);
  const out = distinct(cand, max);
  // A core axis with a finer axis of theirs under it says it more exactly ("sweet-and-spicy" for "spicy").
  for (const k of out) {
    if (k.a >= N_CORE) continue;
    let best: AxisPick | null = null;
    for (const c of cand) if (c.a >= N_CORE && PARENT[c.a] === k.a && (!best || c.score > best.score)) best = c;
    if (best) {
      k.a = best.a;
      k.phrase = best.phrase;
    }
  }
  const lead = out.length > 0 ? out[0].score : 0;
  return out.filter((k, i) => i < 2 || k.score >= 0.4 * lead);
}

/** The place's own leading axes, for a pick with nothing of theirs to match. */
export function placeAxes(vecs: PlaceVectors, p: number, max = 3): AxisPick[] {
  const o = p * N_AXES;
  const cand: AxisPick[] = [];
  for (let a = 0; a < N_AXES; a++) {
    const id = AXES[a].id;
    const ph = PHRASE[id];
    if (!ph || id === "latenight" || id === "value") continue;
    const z = vecs.z[o + a];
    if (AXES[a].bipolar ? Math.abs(z) < 1 : z < 0.9) continue;
    const g = vecs.g[o + a];
    if (!Number.isFinite(g) || Math.abs(g) < 0.2) continue;
    const phrase = AXES[a].bipolar && z < 0 ? ph.neg : ph.pos;
    if (phrase) cand.push({ a, phrase, score: Math.abs(z) });
  }
  cand.sort((x, y) => y.score - x.score);
  return distinct(cand, max);
}

export type EvidenceNote = {
  /** 0 a lean their history keeps showing, 1 a mix they rate above their usual, 2 the mix they rate highest. */
  tier: 0 | 1 | 2;
  /** Return visits (past the first) to the places of theirs that carry the leading axes. 0 when under two. */
  back: number;
};

/** How firmly their own history stands behind these axes, and how often they went back. */
export function evidenceNote(
  axes: readonly AxisPick[],
  profile: Profile40,
  vecs: PlaceVectors,
  ridIndex: ReadonlyMap<string, number>,
  places: ReadonlyMap<string, { visits: number; y: number }>,
): EvidenceNote {
  let maxU = 0;
  for (let a = 0; a < N_AXES; a++) if (!AXES[a].bipolar && profile.w[a] > 0) maxU = Math.max(maxU, profile.u[a]);
  const lead = axes[0];
  const rel = lead && maxU > 0 ? Math.abs(profile.u[lead.a]) / maxU : 0;
  const tier: 0 | 1 | 2 = rel >= 0.8 ? 2 : rel >= 0.5 ? 1 : 0;
  let back = 0;
  const top = axes.slice(0, 2);
  for (const [rid, info] of places) {
    const pi = ridIndex.get(rid);
    if (pi === undefined || info.y <= 0.1 || info.visits < 2) continue;
    if (top.some((k) => vecs.g[pi * N_AXES + k.a] * (PHRASE[AXES[k.a].id].neg === k.phrase ? -1 : 1) >= 0.35)) back += info.visits - 1;
  }
  return { tier, back: back >= 2 ? back : 0 };
}

export type ReasonFacts = {
  id: string;
  /** The dish to order, already tidied; null when none can be named. */
  dish: string | null;
  cuisine: string | null;
  priceBand: string | null;
  axes: readonly AxisPick[];
  /** Null: nothing of theirs to match (a cold start or a cuisine-only pick). */
  evidence: EvidenceNote | null;
  /** Other posters' high ratings for the place. `label` is "5★" or "4.5★ and up". */
  crowd: { n: number; label: string } | null;
  /** A past dish of theirs, named only as supporting evidence. */
  seed: { dish: string; place: string } | null;
};

const PRICE_WORD: Record<string, string> = { $: "budget-friendly", $$: "mid-priced", $$$: "special-occasion", $$$$: "splurge-level" };

const FIT: Record<0 | 1 | 2, string[]> = {
  2: ["the combo you rate highest", "the kind of plate you rate above all", "your highest-rated kind of eating", "what you give your best scores to", "the mix you rate highest of all"],
  1: ["a mix you rate above your usual", "the sort of plate you score well", "a pairing your ratings favor", "a combination you tend to rate up", "territory you score above your usual"],
  0: ["a lean your history keeps showing", "a thread running through what you like", "a pull your past picks share", "a tilt that shows up across your ratings"],
};

type Parts = { d: string | null; A: string; fit: string; back: string };

/** Templates with a dish to order. `A` is the axis phrase, `fit` the history phrase, `back` "" or a repeat-visit tail. */
const DISH_T: ((p: Parts) => string)[] = [
  (p) => `Order the ${p.d}: ${p.A} — ${p.fit}${p.back}.`,
  (p) => `Pick the ${p.d} for ${p.A}, ${p.fit}${p.back}.`,
  (p) => `The ${p.d} brings ${p.A}. That's ${p.fit}${p.back}.`,
  (p) => `Get the ${p.d} for ${p.A} — ${p.fit}${p.back}.`,
  (p) => `You rate ${p.A} well, and the ${p.d} has it${p.back}.`,
  (p) => `${cap1(p.A)}, all in the ${p.d}: ${p.fit}${p.back}.`,
  (p) => `Start with the ${p.d}. ${cap1(p.A)}, ${p.fit}${p.back}.`,
  (p) => `The ${p.d} puts ${p.A} on the plate — ${p.fit}${p.back}.`,
];

const PLAIN_T: ((p: Parts) => string)[] = [
  (p) => `This menu leans on ${p.A} — ${p.fit}${p.back}.`,
  (p) => `A kitchen built on ${p.A}, ${p.fit}${p.back}.`,
  (p) => `Leans hard on ${p.A}. That's ${p.fit}${p.back}.`,
  (p) => `The menu here is ${p.A} — ${p.fit}${p.back}.`,
];

type Cold = { A: string; cuisine: string | null; price: string | null };
const COLD_T: ((c: Cold) => string)[] = [
  (c) => `${c.cuisine ? `${c.cuisine}: ` : ""}${c.A}${c.price ? `, at a ${c.price} spot` : ""}.`,
  (c) => `${cap1(c.A)} from a ${c.price ? `${c.price} ` : ""}${c.cuisine ? `${c.cuisine.toLowerCase()} ` : ""}kitchen.`,
  (c) => `A ${c.price ? `${c.price} ` : ""}${c.cuisine ? `${c.cuisine.toLowerCase()} ` : ""}kitchen leaning on ${c.A}.`,
];

const backTails = (n: number): string[] => [`, and you've gone back to places like it ${n} times`, ` — you keep returning: ${n} repeat visits to places like it`];

function crowdSentence(c: { n: number; label: string }, h: number): string {
  const who = c.n === 1 ? "A PlateMaps regular" : `${c.n === 2 ? "Two" : c.n === 3 ? "Three" : "Several"} PlateMaps regulars`;
  return h % 2 === 0 ? `${who} gave it ${c.label}.` : `${who} rated it ${c.label}.`;
}

function seedSentence(s: { dish: string; place: string }, h: number): string {
  return h % 2 === 0 ? `Same pull as your ${s.dish} at ${s.place}.` : `It echoes the ${s.dish} you rated well at ${s.place}.`;
}

/** One reason within `cap` characters, or "" when there is nothing real to say. The wording is picked by the place's id. */
export function composeReason(f0: ReasonFacts, cap: number, clipWords: (t: string, n: number) => string): string {
  const h = fnv(f0.id);
  const bare = (t: string): string => t.replace(/[\s.!?,;:]+$/, "");
  const f: ReasonFacts = { ...f0, dish: f0.dish ? bare(f0.dish) : null, seed: f0.seed ? { dish: bare(f0.seed.dish), place: bare(f0.seed.place) } : null };
  if (!f.evidence && f.cuisine) {
    // An axis that only repeats the cuisine ("coffee-and-drinks craft" for a coffee shop) says nothing new.
    const dup = /coffee|tea|caf[eé]|juice|smoothie|boba/i.test(f.cuisine) ? ["drinks"] : /dessert|bakery|ice cream|donut|sweet|candy/i.test(f.cuisine) ? ["dessert", "sweet"] : [];
    if (dup.length > 0) f.axes = f.axes.filter((k) => !dup.includes(AXES[k.a].id));
  }
  if (f.axes.length === 0) return "";
  const price = f.priceBand ? (PRICE_WORD[f.priceBand] ?? null) : null;
  if (!f.evidence) {
    const t = COLD_T[h % COLD_T.length];
    for (const withPrice of [true, false]) {
      for (let na = Math.min(3, f.axes.length); na >= 1; na--) {
        const out = cap1(t({ A: join(f.axes.slice(0, na).map((k) => k.phrase)), cuisine: f.cuisine, price: withPrice ? price : null }));
        if (out.length <= cap) return out;
      }
    }
    return cap1(clipWords(t({ A: f.axes[0].phrase, cuisine: null, price: null }), cap));
  }
  const ev = f.evidence;
  type Combo = { na: number; b: boolean; c: boolean; s: boolean; score: number };
  const combos: Combo[] = [];
  for (let na = Math.min(3, f.axes.length); na >= 1; na--)
    for (const b of ev.back > 0 ? [true, false] : [false])
      for (const c of f.crowd ? [true, false] : [false])
        for (const s of f.seed ? [true, false] : [false]) combos.push({ na, b, c, s, score: na * 2 + (c ? 3.2 : 0) + (b ? 1.5 : 0) + (s ? 0.5 : 0) });
  combos.sort((x, y) => y.score - x.score);
  const fit = FIT[ev.tier][(h >>> 3) % FIT[ev.tier].length];
  const tails = backTails(ev.back);
  const render = (cb: Combo, dish: string | null): string => {
    const parts: Parts = { d: dish, A: join(f.axes.slice(0, cb.na).map((k) => k.phrase)), fit, back: cb.b ? tails[(h >>> 5) % tails.length] : "" };
    const T = dish ? DISH_T : PLAIN_T;
    let out = T[h % T.length](parts);
    if (cb.c && f.crowd) out += ` ${crowdSentence(f.crowd, h >>> 7)}`;
    if (cb.s && f.seed) out += ` ${seedSentence(f.seed, h >>> 9)}`;
    return out;
  };
  for (const cb of combos) {
    const out = render(cb, f.dish);
    if (out.length <= cap) return out;
  }
  // The dish's name is what is too long: shorten it before giving up anything else.
  if (f.dish) {
    for (const room of [26, 20, 14]) {
      const d = clipWords(f.dish, room);
      for (const cb of combos) {
        const out = render(cb, d);
        if (out.length <= cap) return out;
      }
    }
  }
  return clipWords(render(combos[combos.length - 1], f.dish), cap);
}

/** "5★" when every high rating is a 5, else "4.5★ and up". */
export function crowdLabel(minStars: number): string {
  return minStars >= 4.95 ? "5★" : "4.5★ and up";
}
