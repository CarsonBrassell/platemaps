/*
 * Rebuilds a browser feed from rows the 2026-09-06 pass wrote off as
 * `fetch-failed`.
 *
 * WHY THIS EXISTS. That pass recorded 441 listed gap rows as
 * ERR_NAME_NOT_RESOLVED and I reported them to Calvin as dead websites.
 * They are not. A direct dns.lookup on the 40 highest-review "dead" domains
 * resolved 38 of them - Mama Kat's, Rubio's, Sammy's, Parakeet Cafe,
 * jimbos.com. What actually happened is that several browser passes ran at
 * once (the supervisor, the absorb loop, and 20 orphaned Chromium processes
 * from the hung run), and Chromium's resolver gave up under the load. The
 * error is ours, and 441 rows were written off for it.
 *
 * So: resolve every host in Node FIRST, keep only the ones that answer, and
 * hand those back to the browser as `needs-browser`. A host that still fails
 * to resolve here, single-threaded and unhurried, is genuinely gone and is
 * left out - that is the only honest way to keep calling a domain dead.
 *
 * Run ONE browser pass at a time against this feed. Running it beside another
 * pass is what produced the bad data in the first place.
 *
 * Reads probe/fetch-failed-classes.json (written by the classifier) - no DB.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { promises as dns } from "node:dns";

const { dead = [], ssl = [], slow = [] } = JSON.parse(
  readFileSync("probe/fetch-failed-classes.json", "utf8"),
);

const LIMIT = process.argv.includes("--limit")
  ? Number(process.argv[process.argv.indexOf("--limit") + 1])
  : 0;

const candidates = [...dead, ...ssl, ...slow];
const feed = [];
const unresolved = [];

for (const r of candidates) {
  let host;
  try {
    host = new URL(r.website).hostname;
  } catch {
    unresolved.push({ ...r, why: "unparseable website" });
    continue;
  }
  try {
    await dns.lookup(host);
  } catch (e) {
    unresolved.push({ ...r, why: `${host}: ${e.code ?? e.message}` });
    continue;
  }
  feed.push({
    restaurantId: String(r.id),
    name: r.name,
    website: r.website,
    platform: null,
    outcome: "needs-browser",
    detail:
      "retry by mk-retry-feed - the 2026-09-06 pass logged a network failure " +
      "on this row, but the host resolves cleanly on a quiet connection",
  });
  if (LIMIT && feed.length >= LIMIT) break;
}

feed.sort(() => 0); // preserve review-count order from the classifier
const tag = `retry-${Date.now().toString(36)}`;
writeFileSync(`menus/wip/${tag}.notes.json`, JSON.stringify(feed, null, 2));
writeFileSync("probe/genuinely-unresolvable.json", JSON.stringify(unresolved, null, 2));
console.log(
  `${candidates.length} fetch-failed rows; ${feed.length} resolve and are worth retrying, ` +
    `${unresolved.length} genuinely do not resolve`,
);
console.log(`wrote menus/wip/${tag}.notes.json`);
