import { readFileSync } from "node:fs";
const file = process.argv[2];
const html = readFileSync(file, "utf8");
const m = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
console.log(m ? m[1].slice(0, 3000) : "none");
