/**
 * Google search for extraction agents, via Serper (key in .env.local).
 *
 *   node --env-file=.env.local scripts/serper.mjs "Ken Sushi Carmel Valley menu"
 *   node --env-file=.env.local scripts/serper.mjs "…" --num 5
 *   node --env-file=.env.local scripts/serper.mjs "…" --maps      # Google Maps result (website, address)
 *
 * Prints one compact line per result: rank, link, title, snippet (trimmed).
 * Never prints the key. Costs one Serper credit per call, so search with a
 * specific query (name + neighborhood + "menu") rather than probing broadly.
 */
const args = process.argv.slice(2);
const KEY = process.env.SERPER_API_KEY || "";
if (!KEY) { console.error("SERPER_API_KEY is not set. Run with --env-file=.env.local"); process.exit(1); }
const maps = args.includes("--maps");
const num = args.includes("--num") ? Number(args[args.indexOf("--num") + 1]) : 8;
const q = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--num").join(" ").trim();
if (!q) { console.error("usage: serper.mjs \"query\" [--num N] [--maps]"); process.exit(1); }

const res = await fetch(maps ? "https://google.serper.dev/maps" : "https://google.serper.dev/search", {
  method: "POST",
  headers: { "X-API-KEY": KEY, "Content-Type": "application/json" },
  body: JSON.stringify(maps ? { q, gl: "us", hl: "en" } : { q, num, gl: "us", hl: "en" }),
});
if (!res.ok) { console.error(`serper ${res.status}`); process.exit(2); }
const data = await res.json();
const clip = (s, n) => (s || "").replace(/\s+/g, " ").slice(0, n);
if (maps) {
  for (const [i, p] of (data.places || []).slice(0, num).entries())
    console.log(`${i + 1}. ${p.title} | ${p.address || ""} | ${p.website || "(no website)"} | ${p.rating ?? ""} (${p.ratingCount ?? 0})`);
} else {
  for (const [i, r] of (data.organic || []).slice(0, num).entries())
    console.log(`${i + 1}. ${r.link}\n   ${clip(r.title, 90)} — ${clip(r.snippet, 160)}`);
}
