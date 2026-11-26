// Read-only: Calvin's eater type. SELECT only.
import { neon } from "@neondatabase/serverless";
import { tagDish, gradeOf, FA } from "./flavor.ts";
const sql = neon(process.env.DATABASE_URL);
const UID = "940561ca-05c8-4010-b8a9-f397235378b9";
const rows = await sql`SELECT p.dish_name, p.rating, p.rating_kind, p.created_at, p.restaurant_id, p.restaurant_lat lat, p.restaurant_lng lng,
  r.cuisine, d.place_count FROM posts p LEFT JOIN restaurants r ON r.id=p.restaurant_id
  LEFT JOIN dish_names d ON d.name = p.dish_name_folded WHERE p.user_id=${UID} ORDER BY p.created_at`;
const ASIAN = /japan|korea|chin|thai|vietnam|asian|sushi|ramen|taiwan|filipin|indones|malay|dim sum|pho/i;
const G = { Indulgent: ["sweet","creamy","crispy"], "Fire & smoke": ["smoky","charred"], Fresh: ["fruity","tangy"], Bold: ["spicy","sweetheat","umami"] };
const w = Object.fromEntries(Object.keys(G).map(k => [k, 0]));
let tagged = 0, dishes = 0, rare = 0, rareN = 0, spicyTangy = 0;
for (const r of rows) {
  if (!r.dish_name) continue; dishes++;
  const m = tagDish(r.dish_name, null, null, ASIAN.test(r.cuisine ?? ""));
  const rt = Number(r.rating); const rw = Number.isFinite(rt) && rt > 0 ? rt / 5 : 0.6; // unrated = neutral-ish
  let any = false;
  for (const [g, attrs] of Object.entries(G)) for (const a of attrs) { const gr = gradeOf(m, FA[a]); if (gr) { w[g] += gr * rw; any = true; } }
  if (any) tagged++;
  if (gradeOf(m, FA.spicy) === 2 || gradeOf(m, FA.tangy) === 2) spicyTangy++;
  if (r.place_count != null) { rareN++; if (r.place_count <= 3) rare++; }
}
// A signals
const places = new Map(); let firsts = 0, expected = 0;
for (const r of rows) { if (!r.restaurant_id) continue; const N = places.size; expected += N ? 0.6 * Math.pow(N, -0.21) : 1; if (!places.has(r.restaurant_id)) { firsts++; places.set(r.restaurant_id, r); } }
const visits = rows.filter(r => r.restaurant_id).length;
const cuisines = new Set([...places.values()].map(r => r.cuisine).filter(Boolean));
const pts = [...places.values()].filter(r => r.lat && r.lng);
const cx = pts.reduce((s, r) => s + +r.lat, 0) / pts.length, cy = pts.reduce((s, r) => s + +r.lng, 0) / pts.length;
const km = pts.map(r => Math.hypot((+r.lat - cx) * 111, (+r.lng - cy) * 111 * Math.cos(cx * Math.PI / 180))).sort((a, b) => a - b);
const radius = km[Math.floor(km.length / 2)] ?? 0;
const s = {
  breadth: Math.min(1, cuisines.size / Math.max(1, places.size) / 0.6),
  newVsExpected: Math.min(1, (firsts / Math.max(1, expected)) / 2),
  rareDish: rareN ? Math.min(1, (rare / rareN) / 0.5) : 0.5,
  spicyTangy: dishes ? Math.min(1, (spicyTangy / dishes) / 0.3) : 0.5,
  radius: Math.min(1, radius / 15),
};
const raw = Object.values(s).reduce((a, b) => a + b, 0) / 5;
const K = 10, A = (visits * raw + K * 0.5) / (visits + K);
const tot = Object.values(w).reduce((a, b) => a + b, 0);
const group = Object.entries(w).sort((a, b) => b[1] - a[1])[0][0];
const TYPES = { Indulgent: ["The Enthusiast", "The Nurturer"], "Fire & smoke": ["The Investigator", "The Devotee"], Fresh: ["The Individualist", "The Purist"], Bold: ["The Challenger", "The Loyalist"] };
console.log({ posts: rows.length, dishes, tagged, places: places.size, cuisines: cuisines.size, firsts, visits, radiusKm: +radius.toFixed(1) });
console.log("groups %:", Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round(100 * v / tot)])));
console.log("A signals:", Object.fromEntries(Object.entries(s).map(([k, v]) => [k, +v.toFixed(2)])), "raw", raw.toFixed(2), "A", A.toFixed(2));
console.log("TYPE:", TYPES[group][A >= 0.5 ? 0 : 1], `(${group}, ${A >= 0.5 ? "Explorer" : "Regular"})`);
