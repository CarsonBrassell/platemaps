/**
 * Hands an extraction agent a page the ROUTER already fetched, instead of
 * fetching it again.
 *
 *   node scripts/cached-page.mjs https://example.com/menu            # print status + where the body is
 *   node scripts/cached-page.mjs https://example.com/menu --out x.html
 *   node scripts/cached-page.mjs --list                              # how many pages are cached
 *
 * ## Why this exists
 *
 * `route-menus.mjs` fetches every candidate URL for every restaurant in the
 * queue and caches the response body on disk, keyed by a hash of
 * method + URL + body. That cache held 13,617 pages on 2026-09-03 and every
 * extraction agent was ignoring it - each one re-curled pages the router had
 * downloaded hours earlier, paying the latency and, worse, paying to read the
 * result into a model's context a second time.
 *
 * The agent brief says never to pipe a large page into a tool result. This is
 * the other half of that rule: do not re-download one either. Check here
 * first; if the page is cached, you already have it and the file path is all
 * that crosses into your context.
 *
 * Prints, and never dumps the body:
 *
 *   HIT   200  412813 bytes  <path to the cached body>
 *   MISS  (not cached - fetch it yourself)
 *
 * A HIT with a 4xx/5xx status is still useful: it is the router's evidence
 * that the host refused it, so you can skip a retry that will also fail.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = "C:/Users/CALVIN~1/AppData/Local/Temp/claude/router/cache";

const argv = process.argv.slice(2);

if (argv.includes("--list")) {
  try {
    const files = (await readdir(CACHE_DIR)).filter((f) => f.endsWith(".json"));
    console.log(`${files.length} pages cached under ${CACHE_DIR}`);
  } catch {
    console.log("no router cache on this machine yet");
  }
  process.exit(0);
}

const url = argv.find((a) => !a.startsWith("--"));
if (!url) {
  console.error(
    "Usage: node scripts/cached-page.mjs <url> [--out <file>] [--method POST] [--body '<json>']",
  );
  process.exit(1);
}

const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 || i + 1 >= argv.length ? fallback : argv[i + 1];
};

const method = flag("method", "GET");
const body = flag("body", null);

/* Must stay byte-identical to `cacheKey` in route-menus.mjs. */
const key = createHash("sha256")
  .update(`${method} ${url} ${body ?? ""}`)
  .digest("hex");

const file = path.join(CACHE_DIR, `${key}.json`);

let entry;
try {
  entry = JSON.parse(await readFile(file, "utf8"));
} catch {
  console.log("MISS  (not cached - fetch it yourself)");
  process.exit(0);
}

const out = flag("out");
if (out) {
  await writeFile(out, entry.body ?? "", "utf8");
  console.log(
    `HIT   ${entry.status ?? "?"}  ${(entry.body ?? "").length} bytes  written to ${out}`,
  );
} else {
  console.log(
    `HIT   ${entry.status ?? "?"}  ${(entry.body ?? "").length} bytes  ${file}\n` +
      `      finalUrl: ${entry.finalUrl ?? url}\n` +
      `      re-run with --out <file> to write the body somewhere you can grep it`,
  );
}
