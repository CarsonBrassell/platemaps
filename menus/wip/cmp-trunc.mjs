import fs from "fs";
const dir = "C:/Users/CALVIN~1/AppData/Local/Temp/claude/router";
const f = fs.readdirSync(dir).filter((x) => x.includes("210354") && !x.includes("notes"))[0];
const out = JSON.parse(fs.readFileSync(dir + "/" + f, "utf8"));
const rows = Array.isArray(out) ? out : out.entries || out.results || [];
const stored = new Map(
  JSON.parse(fs.readFileSync("menus/wip/truncated-79.json", "utf8")).map((t) => [String(t.restaurantId), t]),
);
let gain = 0, regress = [];
for (const e of rows) {
  const id = String(e.restaurantId ?? e.id);
  const n = (e.dishes || e.rows || []).length;
  const s = stored.get(id);
  const was = s ? s.dishes : "?";
  const secs = new Set((e.dishes || e.rows || []).map((d) => d.section));
  const mark = typeof was === "number" ? (n > was ? "GAIN +" + (n - was) : n === was ? "same" : "REGRESSION -" + (was - n)) : "";
  if (typeof was === "number") { if (n > was) gain += n - was; else if (n < was) regress.push(id + " " + e.name); }
  console.log(`${id.padEnd(5)} ${String(e.name).slice(0, 34).padEnd(35)} ${String(was).padStart(4)} -> ${String(n).padStart(4)}  ${secs.size} sections  ${mark}`);
}
console.log(`\nnet gain ${gain} dishes; regressions: ${regress.length ? regress.join(", ") : "none"}`);
