// Lists harvested "ok" rows with no extraction file yet, in agent-prompt form.
import fs from "node:fs";
const lines = fs.readFileSync("probe/menu-photos/manifest.jsonl","utf8").split("\n").slice(149).filter(Boolean).map(JSON.parse);
const last = new Map(); for (const j of lines) last.set(j.id, j);
for (const j of last.values()) if (j.status==="ok" && !fs.existsSync(`menus/wip/photos/${j.id}.json`)) console.log(`- ${j.id} ${j.name} — probe/menu-photos/img/${j.id}/ (1.jpg..${j.photos.length}.jpg)`);
