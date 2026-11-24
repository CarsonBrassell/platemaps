import { FA, gradeOf, tagDish } from "@/lib/flavor";

/**
 * The eight PlateMaps eater types: strongest flavor group × Explorer/Regular.
 * Pure — the route hands in the caller's own post rows. Design and numbers:
 * probe/personality-types/ (compute-type.mjs is the reference this ports).
 */

export type EaterType = { key: string; name: string; emoji: string; read: string; group: Group; explorer: boolean };
type Group = "Indulgent" | "Fire & smoke" | "Fresh" | "Bold";

const GROUPS: Record<Group, (keyof typeof FA)[]> = {
  Indulgent: ["sweet", "creamy", "crispy"],
  "Fire & smoke": ["smoky", "charred"],
  Fresh: ["fruity", "tangy"],
  Bold: ["spicy", "sweetheat", "umami"],
};

/** [explorer, regular] per group */
const TYPES: Record<Group, [Omit<EaterType, "group" | "explorer">, Omit<EaterType, "group" | "explorer">]> = {
  Indulgent: [
    { key: "enthusiast", name: "The Enthusiast", emoji: "🍩", read: "Your sweet tooth and restless map say you chase joy. Life's too short for a boring dessert, and you live like it." },
    { key: "nurturer", name: "The Nurturer", emoji: "🥞", read: "You eat the way you love: warm, generous, no pretense. People feel at home around you." },
  ],
  "Fire & smoke": [
    { key: "investigator", name: "The Investigator", emoji: "🔥", read: "Chasing every kind of smoke means you're curious to the core. You want to know how things work, then master them." },
    { key: "devotee", name: "The Devotee", emoji: "🍖", read: "Once you find the best, you commit. You're loyal, driven, and you know quality the second you taste it." },
  ],
  Fresh: [
    { key: "individualist", name: "The Individualist", emoji: "🍋", read: "Bright, sharp flavors and hidden spots: you see the world a little differently, and you'd rather be original than safe." },
    { key: "purist", name: "The Purist", emoji: "🥗", read: "Clean flavors done right, every time. You hold yourself to high standards and actually live by them." },
  ],
  Bold: [
    { key: "challenger", name: "The Challenger", emoji: "🌶️", read: "Your hunger for heat and bold flavor shows a real passion for life. You go after intensity and never back down from it." },
    { key: "loyalist", name: "The Loyalist", emoji: "🍜", read: "Deep, savory, familiar: you value what's real and lasting, and the people you trust can always count on you." },
  ],
};

export type EaterRow = {
  dish_name: string | null;
  rating: number | string | null;
  restaurant_id: string | null;
  lat: number | string | null;
  lng: number | string | null;
  cuisine: string | null;
  place_count: number | null;
};

const ASIAN = /japan|korea|chin|thai|vietnam|asian|sushi|ramen|taiwan|filipin|indones|malay|dim sum|pho/i;

/** Rows oldest first. Null when there is no flavor signal at all. */
export function eaterTypeOf(rows: EaterRow[]): EaterType | null {
  const w: Record<Group, number> = { Indulgent: 0, "Fire & smoke": 0, Fresh: 0, Bold: 0 };
  let dishes = 0, rare = 0, rareN = 0, spicyTangy = 0;
  for (const r of rows) {
    if (!r.dish_name) continue;
    dishes++;
    const m = tagDish(r.dish_name, null, null, ASIAN.test(r.cuisine ?? ""));
    const rt = Number(r.rating);
    const rw = Number.isFinite(rt) && rt > 0 ? rt / 5 : 0.6;
    for (const g of Object.keys(GROUPS) as Group[])
      for (const a of GROUPS[g]) w[g] += gradeOf(m, FA[a]) * rw;
    if (gradeOf(m, FA.spicy) === 2 || gradeOf(m, FA.tangy) === 2) spicyTangy++;
    if (r.place_count != null) { rareN++; if (r.place_count <= 3) rare++; }
  }
  const group = (Object.keys(w) as Group[]).sort((a, b) => w[b] - w[a])[0];
  if (w[group] <= 0) return null;

  // Explorer score A: five signals averaged, shrunk toward 0.5 for thin histories.
  const places = new Map<string, EaterRow>();
  let firsts = 0, expected = 0, visits = 0;
  for (const r of rows) {
    if (!r.restaurant_id) continue;
    visits++;
    const N = places.size;
    expected += N ? 0.6 * Math.pow(N, -0.21) : 1;
    if (!places.has(r.restaurant_id)) { firsts++; places.set(r.restaurant_id, r); }
  }
  const cuisines = new Set([...places.values()].map((r) => r.cuisine).filter(Boolean));
  const pts = [...places.values()].filter((r) => r.lat != null && r.lng != null).map((r) => [Number(r.lat), Number(r.lng)]);
  let radius = 0;
  if (pts.length) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const km = pts.map(([la, ln]) => Math.hypot((la - cx) * 111, (ln - cy) * 111 * Math.cos((cx * Math.PI) / 180))).sort((a, b) => a - b);
    radius = km[Math.floor(km.length / 2)];
  }
  const s = [
    Math.min(1, cuisines.size / Math.max(1, places.size) / 0.6),
    Math.min(1, firsts / Math.max(1, expected) / 2),
    rareN ? Math.min(1, rare / rareN / 0.5) : 0.5,
    dishes ? Math.min(1, spicyTangy / dishes / 0.3) : 0.5,
    Math.min(1, radius / 15),
  ];
  const raw = s.reduce((a, b) => a + b, 0) / s.length;
  const A = (visits * raw + 10 * 0.5) / (visits + 10);
  const explorer = A >= 0.5;
  return { ...TYPES[group][explorer ? 0 : 1], group, explorer };
}
