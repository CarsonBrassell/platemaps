/*
 * `--via maps` for find-websites.mjs.
 *
 * The organic-search path has already been run to the end of its free tier:
 * 2,400 cached responses, and 1,230 restaurants for which Google's top ten
 * organic results contain nothing the picker will vouch for. Those are not
 * rows waiting to be queried - they are rows that have been asked and
 * answered. Re-running `--via search` on them buys nothing at any budget.
 *
 * Google Maps holds a different fact. A business listing carries a `website`
 * field that the business itself claims, so there is no picking to do: the
 * question stops being "which of these ten results is the restaurant's site"
 * and becomes "is this listing the restaurant". A five-row probe over rows
 * the search path had given up on returned a website for four of them.
 *
 * So this mode keeps every guard the search path has - the ledger, the
 * cache-before-parse rule, the never-overwrite UPDATE, the host bans - and
 * replaces only the picker, with a match test. The two modes cache under
 * different filenames and both bill the same ledger, because they bill the
 * same account.
 */
import fs from "fs";

const P = "scripts/find-websites.mjs";
let t = fs.readFileSync(P, "utf8");

if (t.includes("pickFromMaps")) {
  console.log("REFUSING: already patched");
  process.exit(1);
}

function sub(from, to, label) {
  const n = t.split(from).length - 1;
  if (n !== 1) {
    console.log(`REFUSING: ${label} - expected 1 occurrence, found ${n}`);
    process.exit(1);
  }
  t = t.replace(from, to);
  console.log("  ok: " + label);
}

/* 1. The flag, and the endpoint it selects. */
sub(
  `const CACHE_DIR = "data/serper-cache";`,
  `/*
 * Which Serper endpoint answers the question. "search" is Google's organic
 * results and needs the picker below to guess which one is the restaurant;
 * "maps" is the business listing, which states its own website and needs only
 * to be confirmed as the right business.
 */
const VIA = String(value("via", "search") || "search");
if (!["search", "maps"].includes(VIA)) {
  console.error(\`--via must be "search" or "maps" (got "\${VIA}")\`);
  process.exit(1);
}

const CACHE_DIR = "data/serper-cache";`,
  "via flag",
);

sub(
  `const ENDPOINT = "https://google.serper.dev/search";`,
  `const ENDPOINT =
  VIA === "maps"
    ? "https://google.serper.dev/maps"
    : "https://google.serper.dev/search";

/*
 * The two modes must never read each other's cache. A search response and a
 * maps response for the same restaurant are different shapes answering
 * different questions, and a maps run that found a search response sitting in
 * the cache would report the row as free to re-parse and then parse nothing.
 */
const cacheName = (id) => (VIA === "maps" ? \`maps_\${id}\` : String(id));`,
  "endpoint and cache name",
);

/* 2. The cache index has to be built off the same naming. */
sub(
  `const cached = new Set(
  (await readdir(CACHE_DIR).catch(() => []))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5)),
);`,
  `const cached = new Set(
  (await readdir(CACHE_DIR).catch(() => []))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    /* Only this mode's own responses count as cached. */
    .filter((n) => (VIA === "maps" ? n.startsWith("maps_") : !n.startsWith("maps_")))
    .map((n) => (VIA === "maps" ? n.slice(5) : n)),
);`,
  "cache index",
);

/* 3. The query. Maps wants the plain name, not a quoted phrase. */
sub(
  `function pathDepth(pathname) {`,
  `/*
 * Maps matches a business, not a document, so the quoting that helps organic
 * search hurts here - a quoted phrase asks Maps for an exact string and a
 * listing spelled even slightly differently drops out of the results.
 */
function buildMapsQuery(row) {
  const street = streetOnly(row.address);
  const city = String(row.city || "").trim();
  const parts = [String(row.name || "").trim()];
  if (street) parts.push(street);
  if (city && !new RegExp(\`\\\\b\${city.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&")}\\\\b\`, "i").test(street)) {
    parts.push(city);
  }
  parts.push("CA");
  return parts.filter(Boolean).join(" ");
}

/*
 * Confirm the listing is the restaurant, then take it at its word.
 *
 * Two independent facts have to agree before a website is accepted, because
 * Maps answers a query with the businesses NEAR the address as readily as the
 * one AT it: the street number, which is the cheapest proof of the right
 * building, and a shared identifying word, which is the cheapest proof of the
 * right business. A listing that has both is this restaurant. One that has
 * only the name is a different branch of the same chain; one that has only
 * the number is the shop next door.
 *
 * The exception is a listing whose title carries every identifying word the
 * record has. That is a name matched in full rather than in part, and it is
 * how a restaurant that has moved, or whose stored address has a suite number
 * Maps writes differently, still resolves.
 *
 * The host bans still apply. A business is perfectly capable of listing a
 * farm domain or a hijacked host as its website, and the fact that it claimed
 * the URL itself does not make the URL safe to fetch.
 */
function pickFromMaps(row, payload) {
  const places = Array.isArray(payload?.places) ? payload.places : [];
  const candidates = [];
  const tokens = identifying(row.name);
  const wantNumber = streetNumber(row.address);

  for (const place of places.slice(0, 5)) {
    const title = String(place?.title || "");
    const address = String(place?.address || "");
    const shared = overlap(tokens, title);
    const sameNumber = Boolean(wantNumber) && streetNumber(address) === wantNumber;
    const fullName = tokens.size > 0 && shared === tokens.size;
    const raw = String(place?.website || "");

    const entry = { title, address, url: raw, shared, sameNumber, fullName };
    candidates.push(entry);

    if (!raw) continue;
    if (!(fullName || (sameNumber && shared > 0))) continue;

    const url = canonical(raw);
    const host = hostOf(url);
    if (!host) continue;
    if (hits(BARRED, host) || hits(UNTRUSTED, host)) {
      entry.rejected = "barred or untrusted host";
      continue;
    }
    if (FARM_DOMAIN.test(registrable(host))) {
      entry.rejected = "farm domain";
      continue;
    }

    return {
      chosen: url,
      rule: "maps",
      reason: fullName
        ? \`Maps listing "\${title}" matches the full name and states this website\`
        : \`Maps listing "\${title}" matches the name and the street number, and states this website\`,
      candidates,
    };
  }

  return {
    chosen: null,
    rule: null,
    reason: places.length
      ? "no Maps listing both matched this restaurant and carried a website"
      : "Maps returned no listings",
    candidates,
  };
}

function pathDepth(pathname) {`,
  "maps query and picker",
);

/* 4. The request body differs; `num` is a search-only knob. */
sub(
  `      // \`num\` is never above 10: Serper bills one credit per ten results.
      body: JSON.stringify({ q: query, num: 10 }),`,
  `      /*
       * \`num\` is never above 10: Serper bills one credit per ten results.
       * The maps endpoint takes no \`num\` at all and bills one per call.
       */
      body: JSON.stringify(
        VIA === "maps" ? { q: query, gl: "us", hl: "en" } : { q: query, num: 10 },
      ),`,
  "request body",
);

/* 5. The loop: this mode's query, this mode's cache file, this mode's picker. */
sub(
  `  const query = buildQuery(row);`,
  `  const query = VIA === "maps" ? buildMapsQuery(row) : buildQuery(row);`,
  "loop query",
);
sub(
  `    payload = JSON.parse(await readFile(\`\${CACHE_DIR}/\${id}.json\`, "utf8").catch(() => "null"));`,
  `    payload = JSON.parse(
      await readFile(\`\${CACHE_DIR}/\${cacheName(id)}.json\`, "utf8").catch(() => "null"),
    );`,
  "cache read",
);
sub(
  `    await writeFile(\`\${CACHE_DIR}/\${id}.json\`, JSON.stringify(payload, null, 1), "utf8");`,
  `    await writeFile(
      \`\${CACHE_DIR}/\${cacheName(id)}.json\`,
      JSON.stringify(payload, null, 1),
      "utf8",
    );`,
  "cache write",
);
sub(
  `      \`\${JSON.stringify({ id, ts: new Date().toISOString(), query })}\\n\`,`,
  `      \`\${JSON.stringify({ id, ts: new Date().toISOString(), via: VIA, query })}\\n\`,`,
  "ledger line",
);
sub(
  `  const { chosen, rule, reason, candidates } = pick(row, payload);`,
  `  const { chosen, rule, reason, candidates } =
    VIA === "maps" ? pickFromMaps(row, payload) : pick(row, payload);`,
  "picker call",
);
sub(
  `    source: "serper",
    website_source: "serper",`,
  `    source: VIA === "maps" ? "serper-maps" : "serper",
    website_source: VIA === "maps" ? "serper-maps" : "serper",`,
  "note provenance",
);

/* 6. The dry-run plan prints the query this mode would actually send. */
sub(
  `  for (const r of plan.slice(0, 20)) console.log(\`  \${r.id}  \${buildQuery(r)}\`);`,
  `  for (const r of plan.slice(0, 20))
    console.log(\`  \${r.id}  \${VIA === "maps" ? buildMapsQuery(r) : buildQuery(r)}\`);`,
  "dry plan",
);

/* 7. Say which endpoint is running, since the counts mean different things. */
sub(
  `  \`\${all.length} restaurants have no website; this run looks at \${rows.length}\` +`,
  `  \`[--via \${VIA}] \${all.length} restaurants have no website; this run looks at \${rows.length}\` +`,
  "header line",
);

fs.writeFileSync(P, t);
console.log("patched: --via maps");
