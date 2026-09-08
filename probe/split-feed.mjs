/* Slices a notes feed into fixed-size chunk files so a supervisor can run them
 * one at a time under `timeout`. Unlike mk-noplatform-feed there is nothing to
 * recompute between chunks here - the retry set is a fixed list - so slicing it
 * up front is simpler and cannot hand back a row twice. */
import { readFileSync, writeFileSync } from "node:fs";
const [, , file, sizeArg] = process.argv;
const size = Number(sizeArg || 50);
const rows = JSON.parse(readFileSync(file, "utf8"));
let n = 0;
for (let i = 0; i < rows.length; i += size) {
  n += 1;
  writeFileSync(
    `menus/wip/retrychunk-${String(n).padStart(2, "0")}.notes.json`,
    JSON.stringify(rows.slice(i, i + size), null, 2),
  );
}
console.log(`${rows.length} rows -> ${n} chunks of ${size}`);
