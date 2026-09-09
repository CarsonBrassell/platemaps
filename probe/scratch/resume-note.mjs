import { readFileSync, writeFileSync } from "node:fs";
const p = "probe/RESUME.md"; let t = readFileSync(p, "utf8");
const nl = t.includes("\r\n") ? "\r\n" : "\n";
const note = [
"- **Handel's SDSU / College Area is missing (2026-09-08, open).** A friend of",
"  Calvin's reported it; confirmed. 5824 Montezuma Rd Ste 130 (Topaz building,",
"  opened May 2024, 619-269-4070, daily 11-11) has no row. Not in the DEH feed",
"  under that address, not in OSM, and Maps discovery cell 32.77,-117.07",
"  returned 20 \"restaurants\" with no ice cream shop. 14 other Handel's rows",
"  exist, 13 listed. Serper is at 0 credits (\"Not enough credits\"), so it",
"  cannot be pulled via discover-serper until Calvin tops up; then",
"  `--fetch --query \"ice cream\"` on that cell, or a hand-built entry in",
"  data/serper-discovered.json + `--import`. Also check row 2640 \"Cream\" at",
"  the same address (OSM 2018): likely closed, possibly the space Handel's took.",
"", ""].join(nl);
const re = /(## Since 2026-09-05[^\r\n]*\r?\n\r?\n)/;
if (!re.test(t)) { console.error("heading not found"); process.exit(1); }
t = t.replace(re, "$1" + note); writeFileSync(p, t); console.log("ok");
