/**
 * Deterministic menu router - reads menus with no model in the loop.
 *
 *   node --env-file=.env.local scripts/route-menus.mjs --limit 20 --dry
 *   node --env-file=.env.local scripts/route-menus.mjs --concurrency 4
 *   node --env-file=.env.local scripts/route-menus.mjs --ids 1234,5678
 *   node --env-file=.env.local scripts/route-menus.mjs --ids <gated ids> --no-cache   (the noon re-run)
 *
 * For every restaurant in the extraction queue (the same predicate
 * `cut-batches.mjs` uses) that has a website, it fetches the site, works out
 * which ordering platform the restaurant is on, and reads the priced payload
 * that platform serves - the recipes in `probe/PLAYBOOK.md` section 9, run
 * mechanically instead of one agent at a time.
 *
 * ## What it writes, and what it deliberately does not
 *
 * TWO files per run:
 *
 *   menus/wip/router-<stamp>.json        agent result format, MENUS ONLY
 *   menus/wip/router-<stamp>.notes.json  one row per restaurant attempted
 *
 * The result file carries only restaurants where a real menu was read. That is
 * a deliberate asymmetry with an agent's result file, and it is the single most
 * important decision in here. An entry with `dishes: []` loads as a permanent
 * `not_found` and removes the restaurant from the project forever - and this
 * script's failures are overwhelmingly "no platform I know about", which is a
 * fact about the ROUTER, not about the restaurant. A model agent will crack
 * many of them. So a router failure must never write a verdict; it writes a
 * note, and the restaurant stays in the queue.
 *
 * The notes file is the useful output of a failed attempt: it says which
 * platform was detected and what stopped the read, so the next wave of agents
 * starts at the hard part instead of rediscovering the easy part.
 *
 * ## Rules it inherits from the playbook
 *
 * - Never construct a price. Every figure here is a field read out of a
 *   payload; nothing is divided, averaged, or inferred from a pattern.
 * - Clover COLO2 prices are integer cents, and a price of 0 means the item is
 *   priced by a required size choice - those are priced at the cheapest option
 *   across every REQUIRED group (including the $0.00 options, which is what
 *   makes a latte come out at $5.15 rather than $1.10), and the note says so.
 * - Fewer than 5 priced rows is not a menu. On Toast, Clover and order.online
 *   it is usually a closed-store gate rather than a small menu, and those are
 *   recorded as `gated` so a daylight re-run picks them up.
 * - The address in the payload is checked against the address on our record. A
 *   different street number is a different branch, and one branch's menu must
 *   never go under another branch's id.
 * - A MARKETPLACE is read last and labelled as one. DoorDash and Uber Eats sit
 *   at the bottom of the extractor list so they are only consulted when the
 *   restaurant's own platforms have nothing, their captures go through the
 *   same markup test as everything else, and the note on the entry says the
 *   prices are the platform's rather than the restaurant's.
 *
 * ## Caching
 *
 * Every response body is cached under the scratch directory keyed by a hash of
 * method+URL+body, so a re-run costs nothing and `--ids` re-runs are instant.
 * Delete the directory to force a refetch.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import vm from "node:vm";
import { neon } from "@neondatabase/serverless";

const execFileAsync = promisify(execFile);

/* ------------------------------------------------------------------ flags */

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const val = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 || i + 1 >= argv.length ? fallback : argv[i + 1];
};

const DRY = has("dry");
/* Skip the on-disk cache READ (writes still happen). See `get()`. */
const NO_CACHE = has("no-cache");
const LIMIT = val("limit") ? Number(val("limit")) : Infinity;
const IDS = val("ids") ? String(val("ids")).split(",").map((s) => s.trim()).filter(Boolean) : null;
const MIN_DISHES = val("min-dishes") ? Number(val("min-dishes")) : 5;
/* The machine is on marginal Wi-Fi and many simultaneous long-lived TLS
 * streams is exactly what it cannot hold - see RUNBOOK "Four agents, not
 * nine". Six is the hard ceiling regardless of what is asked for. */
const CONCURRENCY = Math.min(6, Math.max(1, Number(val("concurrency", "4")) || 4));

const SCRATCH = "C:/Users/CALVIN~1/AppData/Local/Temp/claude/router";
const CACHE_DIR = path.join(SCRATCH, "cache");
const WIP = "menus/wip";

const STAMP = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..*$/, "")
  .replace("T", "-");
/*
 * A dry run still writes its two files - it writes them to the scratch
 * directory instead of `menus/wip`. "Write nothing" means "put nothing in
 * front of the loader", and a dry run whose notes cannot be read is a dry run
 * that teaches nothing; the notes ARE the output of a test pass.
 */
const OUT_DIR = DRY ? SCRATCH : WIP;
const RESULT_FILE = `${OUT_DIR}/router-${STAMP}.json`;
const NOTES_FILE = `${OUT_DIR}/router-${STAMP}.notes.json`;

/* Two real desktop Chrome strings. The second exists only to retry a 403 -
 * Toast's 403 to a bare curl was, for weeks, the entire obstacle, and it looks
 * identical to "the data is not in the HTML". */
const UA_PRIMARY =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const UA_FALLBACK =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const TIMEOUT_MS = 15_000;

/*
 * The four headers a real address-bar navigation sends and an XHR does not.
 *
 * Uber Eats answers a plain desktop-UA curl for a store page with 404, and the
 * SAME request carrying these returns 200 with the whole catalog
 * (`ubereats.com/store/cortez-mexican-food/...`, 91 priced rows). DoorDash's
 * Cloudflare edge treats them the same way when it is in a challenging mood.
 * Nothing here is a lie about the client: this IS a top-level document fetch.
 */
const NAVIGATION_HEADERS = {
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-Dest": "document",
  "Upgrade-Insecure-Requests": "1",
};

/* --------------------------------------------------------------- http layer */

await mkdir(CACHE_DIR, { recursive: true });

const cacheKey = (method, url, body) =>
  createHash("sha256").update(`${method} ${url} ${body ?? ""}`).digest("hex");

/**
 * The same request through curl, whose TLS handshake a lot of edges accept
 * where Node's is refused. Body goes to a file so a large page never has to
 * fit in a pipe buffer.
 */
async function curlGet(url, method, body, extraHeaders) {
  const tmp = path.join(CACHE_DIR, `curl-${randomUUID()}.tmp`);
  const args = [
    "-s",
    "-L",
    "--max-time",
    String(Math.round(TIMEOUT_MS / 1000)),
    "--compressed",
    "-A",
    UA_PRIMARY,
    "-H",
    "Accept-Language: en-US,en;q=0.9",
    "-o",
    tmp,
    "-w",
    "%{http_code} %{url_effective}",
  ];
  for (const [k, v] of Object.entries(extraHeaders ?? {})) args.push("-H", `${k}: ${v}`);
  if (method === "POST") {
    args.push("-X", "POST");
    /* `-d '{}'` matters on NetWaiter: a bodyless POST returns 411. */
    args.push("-d", body ?? "{}");
  }
  args.push(url);
  try {
    const { stdout } = await execFileAsync("curl", args, { maxBuffer: 1 << 20 });
    const [code, finalUrl] = String(stdout).trim().split(/\s+/);
    let text = "";
    try {
      text = await readFile(tmp, "utf8");
    } catch {
      text = "";
    }
    return {
      ok: true,
      status: Number(code) || 0,
      finalUrl: finalUrl || url,
      body: text.length > 6_000_000 ? text.slice(0, 6_000_000) : text,
      via: "curl",
    };
  } catch {
    return null;
  } finally {
    await rm(tmp, { force: true }).catch(() => {});
  }
}

/**
 * Fetch with a desktop UA, redirects followed, a 15s ceiling, one 403 retry
 * under a different UA, and an on-disk cache.
 *
 * Never throws. A failure is a value (`{ ok: false, error }`) because every
 * caller wants to record it and carry on rather than lose the restaurant.
 */
async function get(url, opts = {}) {
  const method = opts.method ?? "GET";
  const body = opts.body ?? null;
  const key = cacheKey(method, url, body);
  const file = path.join(CACHE_DIR, `${key}.json`);

  /*
   * `--no-cache` exists for the gated re-run. A closed-store gate is a fact
   * about the HOUR the payload was fetched, and the cache has no TTL, so
   * re-running `--ids` on a gated restaurant at noon would otherwise hand
   * back the 3am payload and re-confirm the same closure forever. The fresh
   * body still overwrites the cache entry, so the next plain run sees it.
   */
  if (!NO_CACHE) {
    try {
      const cached = JSON.parse(await readFile(file, "utf8"));
      return cached;
    } catch {
      /* not cached yet */
    }
  }

  const attempt = async (ua) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        body,
        redirect: "follow",
        signal: ctrl.signal,
        headers: {
          "User-Agent": ua,
          Accept:
            opts.accept ??
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...(opts.headers ?? {}),
        },
      });
      const text = await res.text();
      return {
        ok: true,
        status: res.status,
        finalUrl: res.url || url,
        body: text.length > 6_000_000 ? text.slice(0, 6_000_000) : text,
      };
    } finally {
      clearTimeout(timer);
    }
  };

  let out;
  try {
    out = await attempt(UA_PRIMARY);
    /* A block recorded once is a fact about one request, not about the host. */
    if (out.status === 403) {
      try {
        const second = await attempt(UA_FALLBACK);
        if (second.status !== 403) out = second;
      } catch {
        /* keep the 403 */
      }
    }
  } catch (err) {
    /* Node's own message for a dead host is the useless "fetch failed"; the
     * cause carries the actual DNS or TLS failure, which is what a person
     * reading the notes needs. */
    const cause = err?.cause?.message ? ` (${err.cause.message})` : "";
    out = {
      ok: false,
      status: 0,
      finalUrl: url,
      body: "",
      error: `${String(err?.message ?? err)}${cause}`.slice(0, 140),
    };
  }

  /*
   * WHEN NODE IS REFUSED AND CURL IS NOT, THE UA WAS NEVER THE PROBLEM.
   *
   * `order.toasttab.com` returns 403 to `fetch` under every header set worth
   * trying - a bare UA, a full Chrome header block with sec-ch-ua and
   * Sec-Fetch-*, `Accept: *​/*` - and 200 with the whole `__OO_STATE__` payload
   * to `curl` carrying the SAME user agent. What differs is the TLS handshake:
   * Node's OpenSSL cipher order fingerprints as Node no matter what is written
   * in the headers, and Toast's edge blocks on the fingerprint.
   *
   * That is worth stating plainly because the playbook's rule - "try a browser
   * user-agent on any host that 403s you" - reads as sufficient and is not,
   * from Node. A UA retry that fails does NOT mean the host is bot-walled; it
   * may only mean the client is. So a 403 or a transport error is retried
   * through curl before anything is recorded, and Toast, the single most
   * common platform in this corpus, comes back.
   *
   * This is still no browser. curl is a different HTTP client, not a renderer.
   */
  if (!out.ok || out.status === 403 || out.status === 0) {
    const viaCurl = await curlGet(url, method, body, opts.headers ?? {});
    if (viaCurl && viaCurl.status > 0 && viaCurl.status !== 403) out = viaCurl;
  }

  /*
   * A CLOUDFLARE INTERSTITIAL IS A 200, and that is why the status test above
   * never catches it. `order.online` and `www.doordash.com` both answer Node's
   * fetch with "Just a moment..." and 200, and hand curl - same URL, same
   * headers, same second - the whole store page. Three restaurants read fine
   * by hand were being written off as bot-walled on exactly this.
   *
   * Only worth a retry when the first answer came from fetch; curl's own
   * challenge page is the end of the line.
   */
  if (out.ok && out.status < 400 && out.via !== "curl" && botWall(out)) {
    const viaCurl = await curlGet(url, method, body, opts.headers ?? {});
    if (viaCurl && viaCurl.status > 0 && viaCurl.status < 400 && !botWall(viaCurl)) out = viaCurl;
  }

  /* A transport failure is not cached. `EAI_AGAIN` on this machine's Wi-Fi is a
   * transient DNS answer, not a fact about the host, and caching it would bake
   * the flake into every later run. */
  if (out.status !== 0) await writeFile(file, JSON.stringify(out), "utf8").catch(() => {});
  return out;
}

/* --------------------------------------------------------- parsing helpers */

/**
 * Balance braces from an opening `{`.
 *
 * Matching to a closing token instead is how the `__OO_STATE__` parser once
 * silently returned truncated menus that looked like small ones.
 */
function sliceObject(s, from) {
  if (from < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(from, i + 1);
    }
  }
  return null;
}

/** The same, for an array opening at `[`. */
function sliceArray(s, from) {
  if (from < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return s.slice(from, i + 1);
    }
  }
  return null;
}

/*
 * Named entities, not just the five everyone remembers.
 *
 * Pho Lucky's menu came out as "C&Agrave; PH&Ecirc; MUỐI" - the page
 * double-encodes its Vietnamese, so the accented characters arrive as HTML4
 * named entities rather than as UTF-8. Decoding only `&amp;` and friends left
 * dish names that no diner would recognise, in a corpus where the dish name is
 * the thing people search.
 */
const NAMED = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "'", lsquo: "'",
  ldquo: '"', rdquo: '"', ndash: "–", mdash: "—", hellip: "…", deg: "°",
  agrave: "à", aacute: "á", acirc: "â", atilde: "ã", auml: "ä", aring: "å",
  egrave: "è", eacute: "é", ecirc: "ê", euml: "ë",
  igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
  ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ouml: "ö",
  ugrave: "ù", uacute: "ú", ucirc: "û", uuml: "ü",
  ntilde: "ñ", ccedil: "ç", yacute: "ý",
};

const decodeEntities = (s) =>
  String(s ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([A-Za-z]+);/g, (whole, word) => {
      const lower = word.toLowerCase();
      if (!(lower in NAMED)) return whole;
      const ch = NAMED[lower];
      /* `&Agrave;` is the capital of `&agrave;` - the entity name's case is
       * the letter's case for every accented entity in this table. Test the
       * character with toUpperCase rather than against `[a-z]`, which "à" is
       * not in: that ASCII test silently lower-cased every accent it decoded. */
      return /^[A-Z]/.test(word) && ch.toUpperCase() !== ch ? ch.toUpperCase() : ch;
    });

const collapse = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** ~45 characters, cut at a word boundary rather than mid-word. */
function trimDescription(s) {
  const t = collapse(decodeEntities(s));
  if (!t) return "";
  if (t.length <= 45) return t;
  const cut = t.slice(0, 45);
  const space = cut.lastIndexOf(" ");
  return (space > 20 ? cut.slice(0, space) : cut).trim();
}

const PRICE_RE = /^\$\d+(\.\d{2})?$/;

/** A number of dollars becomes `$12.00`. Nothing else may make a price. */
function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  const s = `$${v.toFixed(2)}`;
  return PRICE_RE.test(s) ? s : null;
}

/** A price already written as text ("$13.65", "$$13.65", "13.65"). */
function moneyFromText(text) {
  const m = String(text ?? "").match(/(\d+(?:\.\d{1,2})?)/);
  return m ? money(Number(m[1])) : null;
}

/** Every ld+json block on a page, flattened through `@graph` and arrays. */
function jsonLdNodes(html) {
  const out = [];
  for (const m of html.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let parsed;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const stack = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node)) {
        stack.push(...node);
        continue;
      }
      out.push(node);
      if (Array.isArray(node["@graph"])) stack.push(...node["@graph"]);
    }
  }
  return out;
}

const typeOf = (node) => [].concat(node?.["@type"] ?? []).map(String);

/**
 * schema.org Menu -> rows. Sections nest, and `offers` is sometimes an array of
 * portion offers - take the lowest and say how many there were; never average.
 *
 * `hasMenuSection` is sometimes an array wrapped in one more array -
 * `[[section0, section1, ...]]` - which DoorDash serves on every store page
 * (Robeks Chula Vista, 14 sections and 70 items). The old walk saw one entry
 * that was an Array, and an Array passes `typeof === "object"`, so it read
 * `.name` and `.hasMenuItem` off it, found undefined, and returned NOTHING for
 * a menu that was entirely present. Flatten before walking.
 */
function rowsFromSchemaMenu(menu, menuName = "") {
  const rows = [];
  let multiOffer = 0;
  const walk = (sections, trail) => {
    for (const section of [].concat(sections ?? []).flat(Infinity)) {
      if (!section || typeof section !== "object") continue;
      const name = collapse(decodeEntities(section.name));
      const path2 = name ? [...trail, name] : trail;
      for (const item of [].concat(section.hasMenuItem ?? [])) {
        if (!item || typeof item !== "object") continue;
        const offers = [].concat(item.offers ?? []).filter((o) => o && o.price != null);
        const prices = offers
          .map((o) => Number(String(o.price).replace(/[^0-9.]/g, "")))
          .filter((n) => Number.isFinite(n) && n > 0);
        if (!prices.length) continue;
        if (prices.length > 1) multiOffer++;
        rows.push({
          section: path2.join(" / ") || menuName,
          name: collapse(decodeEntities(item.name)),
          description: trimDescription(item.description),
          price: money(Math.min(...prices)),
        });
      }
      walk(section.hasMenuSection, path2);
    }
  };
  walk(menu?.hasMenuSection, menuName ? [menuName] : []);
  return { rows, multiOffer };
}

/** Absolute URLs for every href on a page. Malformed ones are skipped. */
function links(html, baseUrl) {
  const out = new Set();
  for (const m of html.matchAll(/(?:href|data-href|src)\s*=\s*["']([^"']+)["']/gi)) {
    const raw = decodeEntities(m[1]).trim();
    if (!raw || raw.startsWith("#") || /^(javascript|mailto|tel):/i.test(raw)) continue;
    try {
      out.add(new URL(raw, baseUrl).toString());
    } catch {
      /* a malformed href is not worth failing a restaurant over */
    }
  }
  /* Ordering links also arrive inside JSON blobs and inline scripts, escaped,
   * where no href attribute exists to match. */
  for (const m of html.matchAll(
    /https?:(?:\\\/\\\/|\/\/)[A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?/g,
  )) {
    const raw = m[0].replace(/\\\//g, "/").replace(/\\u002F/gi, "/");
    try {
      out.add(new URL(raw).toString());
    } catch {
      /* ignore */
    }
  }
  return [...out];
}

const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
};

/** The street number a comparison actually turns on. */
const streetNumber = (addr) => {
  const m = String(addr ?? "").trim().match(/^(\d+)/);
  return m ? m[1] : null;
};

/**
 * Any street-looking address line in a payload, escaped or not.
 *
 * Clover buries the merchant address inside an escaped RSC string, so a key
 * lookup misses it - grep the text for the shape instead.
 */
function addressInText(text) {
  const patterns = [
    /\\?"address1\\?"\s*:\s*\\?"([^"\\]{4,80})/i,
    /\\?"street\\?"\s*:\s*\\?"([^"\\]{4,80})/i,
    /\\?"streetAddress\\?"\s*:\s*\\?"([^"\\]{4,80})/i,
    /\\?"address_line_1\\?"\s*:\s*\\?"([^"\\]{4,80})/i,
    /\\?"addressLine1\\?"\s*:\s*\\?"([^"\\]{4,80})/i,
    /\\?"printableAddress\\?"\s*:\s*\\?"([^"\\]{4,80})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && streetNumber(m[1])) return collapse(m[1]);
  }
  return null;
}

/** The city and state a payload claims, escaped or not. */
function placeInText(text) {
  const grab = (keys) => {
    for (const k of keys) {
      const m = text.match(new RegExp(`\\\\?"${k}\\\\?"\\s*:\\s*\\\\?"([^"\\\\]{2,40})`, "i"));
      if (m) return collapse(m[1]);
    }
    return null;
  };
  return {
    city: grab(["city", "addressLocality", "locality", "town"]),
    state: grab(["state", "addressRegion", "stateCode", "province"]),
  };
}

/** Tokens of four characters or more, which is what a name comparison turns on. */
function nameTokens(name) {
  const norm = String(name ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ");
  return norm.split(/\s+/).filter((w) => w.length >= 4);
}

/**
 * Do these two names plausibly describe the same business?
 *
 * One shared four-character word. Deliberately loose - "a name mismatch is not
 * automatically wrong", and Kalentanos Colimas Mexican Food really is Colimas
 * Mexican - so this is only ever consulted when nothing better is available.
 */
function namesOverlap(ours, theirs) {
  if (!theirs) return false;
  const a = nameTokens(ours);
  const b = String(theirs).toLowerCase().replace(/[^a-z0-9]/g, "");
  return a.some((w) => b.includes(w));
}

/** Cloudflare / Datadome / generic bot wall, from the body rather than a guess. */
function botWall(res) {
  if (!res?.ok) return null;
  const b = res.body ?? "";
  if (/Just a moment\.\.\./i.test(b) || /cf-browser-verification|_?cf_chl_opt/i.test(b))
    return "Cloudflare challenge";
  /*
   * `cdn-cgi/challenge-platform` ON ITS OWN IS NOT A WALL. Cloudflare bootstraps
   * an invisible Turnstile script into ordinary pages, and a successful
   * 386KB DoorDash store page carrying the whole catalog contains that string
   * exactly once - which is how Robeks Chula Vista, readable by hand at that
   * same minute, came back "Cloudflare challenge". A real interstitial is a
   * few kilobytes and nothing else; size is the difference.
   */
  if (/cdn-cgi\/challenge-platform/i.test(b) && b.length < 60_000) return "Cloudflare challenge";
  if (/datadome|geo\.captcha-delivery\.com/i.test(b)) return "DataDome";
  if (res.status === 403) return "403 to two desktop UAs and to curl";
  if (res.status === 429) return "429 rate limited";
  return null;
}

/* ------------------------------------------------------------- dish hygiene */

/**
 * Normalise, drop anything without a real price, and drop the exact triple
 * duplicate the screen would drop anyway.
 */
function cleanRows(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows ?? []) {
    const name = collapse(decodeEntities(r?.name));
    if (!name || name.length > 120) continue;
    const price = typeof r?.price === "string" && PRICE_RE.test(r.price) ? r.price : null;
    if (!price) continue;
    const section = collapse(decodeEntities(r?.section)).slice(0, 90);
    const key = `${name.toLowerCase()}|${price}|${section.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, description: trimDescription(r?.description), price, section });
  }
  return out;
}

/* ---------------------------------------------- the screen, run in advance */

/*
 * `scripts/screen-menus.mjs` is the arbiter and stays the arbiter. These are
 * the three of its tests the router can run on its own output, so that it
 * stops filing captures it can already predict will be quarantined.
 *
 * Running them here rather than only downstream matters because of what a
 * quarantine costs: the entry writes no ledger row, so the restaurant
 * re-queues and the next wave of model agents pays to rediscover the same
 * marked-up storefront. A note saying "this platform bakes a 4% fee into every
 * price" is worth more than a withheld capture, and it is free.
 *
 * The thresholds are copied from the screen deliberately, including the parts
 * that look odd - whole-dollar prices excluded from the markup ratio (a round
 * price divides onto another round price for free, which is how a dive bar's
 * happy-hour board scored 5 of 8), distinct-price gating (six distinct prices
 * cannot support a conclusion about a multiplier), and both arithmetics of the
 * same fee (`base * 1.04` and `base / 0.96`, which is x1.0416 and which
 * testing 1.04 alone misses entirely).
 */
const BARRED_HOSTS = [
  /(^|\.)yelp\.com$/i,
  /(^|\.)locallya\.com$/i,
  /(^|\.)placejoys\.com$/i,
  /(^|\.)bestcafes\.online$/i,
  /(^|\.)weeblyte\.com$/i,
  /(^|\.)gotoeat\.net$/i,
  /(^|\.)foodjoyy\.com$/i,
  /(^|\.)cafes-guide\.com$/i,
  /(^|\.)poi\.place$/i,
  /(^|\.)edan\.io$/i,
  /\.top$/i,
];

const UNTRUSTED_HOSTS = [
  /(^|\.)menupedia\./i,
  /(^|\.)allmenus\.com$/i,
  /(^|\.)menuswithprice\./i,
  /(^|\.)pricelisto\./i,
  /(^|\.)menuandprice/i,
  /(^|\.)restaurantguru\.com$/i,
  /(^|\.)beyondmenu\.com$/i,
  /(^|\.)menupages\.com$/i,
  /(^|\.)sagemenu\./i,
];

function screenWouldReject(dishes, host) {
  if (BARRED_HOSTS.some((re) => re.test(host))) return `barred source host (${host})`;
  if (UNTRUSTED_HOSTS.some((re) => re.test(host))) return `untrusted aggregator (${host})`;

  const all = dishes
    .map((d) => parseFloat(String(d.price).replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);

  /* A doubled catalog: the same dish and price under differently-named
   * sections. Withheld rather than deduped - if the catalog is doubled we do
   * not know which copy is current. */
  const pairKeys = dishes.map((d) => `${d.name.toLowerCase()}|${d.price}`);
  const pairDupes = pairKeys.length - new Set(pairKeys).size;
  if (dishes.length >= 20 && pairDupes / dishes.length > 0.3)
    return `catalog looks doubled: ${pairDupes} of ${dishes.length} rows repeat by name and price across differently-named sections`;

  const MULTIPLIERS = [1.04, 1.05, 1.08, 1.1, 1.15, 1.2, 1.25, 25 / 24, 100 / 97, 100 / 95, 100 / 90];

  const values = all.filter((n) => Math.round(n * 100) % 100 !== 0);
  const distinct = new Set(values.map((n) => n.toFixed(2))).size;
  if (values.length >= 12 && distinct >= 12) {
    for (const m of MULTIPLIERS) {
      const hits = values.filter((n) => {
        const v = n / m;
        return Math.abs(v - Math.round(v)) < 0.011;
      }).length;
      if (hits / values.length > 0.6)
        return `markup or platform fee: ${hits}/${values.length} prices divide by ${m.toFixed(4)} onto round dollars`;
    }
  }

  /* Real menus price on .00/.25/.50/.75/.95/.99. A surcharged catalog scatters
   * its cents, and only dividing makes them look human again. */
  const ENDINGS = new Set([0, 25, 50, 75, 95, 99]);
  const onEnding = (arr) => arr.filter((n) => ENDINGS.has(Math.round(n * 100) % 100)).length / arr.length;
  if (all.length >= 20) {
    const published = onEnding(all);
    if (published < 0.2) {
      for (const m of [1.03, 1.035, ...MULTIPLIERS]) {
        const divided = onEnding(all.map((n) => Math.round((n / m) * 100) / 100));
        if (divided > 0.6 && divided > published + 0.4)
          return (
            `prices are not shaped like a menu: ${(100 * published).toFixed(0)}% of ${all.length} land on a ` +
            `conventional ending as published and ${(100 * divided).toFixed(0)}% do after dividing by ${m.toFixed(4)} - ` +
            `a fee is baked into every price`
          );
      }
    }
  }
  return null;
}

/* ================================================================ platforms */
/*
 * Each extractor takes the site context and returns
 *   { rows, sourceUrl, address, notes[], partial? }
 * or null when this platform is not actually present after all. Detection is
 * cheap and wrong sometimes; the extractor is the thing that decides.
 */

/* ----------------------------------------------------------------- Toast */

function toastLinks(all) {
  return all.filter((u) => {
    const h = hostOf(u);
    return h === "toasttab.com" || h.endsWith(".toasttab.com");
  });
}

function parseOoState(html) {
  const at = html.indexOf("__OO_STATE__");
  if (at === -1) return null;
  const raw = sliceObject(html, html.indexOf("{", at));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function extractToast(ctx) {
  let metadataOnly = null;
  const candidates = [];
  for (const u of toastLinks(ctx.allLinks)) {
    const url = new URL(u);
    /* A Toast link arrives in several shapes; the ordering app is the one that
     * carries the payload, and the slug is the first path segment. */
    const seg = url.pathname.split("/").filter(Boolean)[0];
    if (!seg || /^(local|resources|company|about|restaurants|blog|pos)$/i.test(seg)) continue;
    candidates.push(u.split("?")[0]);
    candidates.push(`https://order.toasttab.com/online/${seg}`);
  }
  const tried = new Set();
  for (const url of candidates.slice(0, 8)) {
    if (tried.has(url)) continue;
    tried.add(url);
    const res = await get(url);
    if (!res.ok || res.status >= 400) continue;
    const state = parseOoState(res.body);
    if (!state) continue;

    const menus = Object.entries(state).filter(([k]) => k.startsWith("Menu:"));
    /*
     * Toast deployments differ, and this is the difference the playbook warns
     * about: some embed the whole catalog in `__OO_STATE__` and some ship only
     * restaurant metadata and fetch the items client-side. Rosemonts Cafe is
     * the second kind - a 28KB page with a valid state object and no `Menu:`
     * entry in it. That is not "no platform detected", and mislabelling it
     * would send the next wave hunting for a Toast link that is already found.
     */
    if (!menus.length) {
      metadataOnly = res.finalUrl;
      continue;
    }

    const rq = state.ROOT_QUERY ?? {};
    const rk = Object.keys(rq).find((k) => k.startsWith("restaurantV2("));
    const location = rk ? rq[rk]?.location : null;
    const address = collapse(location?.address1) || addressInText(res.body);
    const place = { city: collapse(location?.city) || null, state: collapse(location?.state) || null };
    const payloadName = rk ? collapse(rq[rk]?.name) : null;

    const rows = [];
    let outOfStock = 0;
    const multipleMenus = menus.length > 1;
    for (const [, menu] of menus) {
      const menuName = collapse(decodeEntities(menu?.name));
      const walkGroups = (groups, trail) => {
        for (const g of groups ?? []) {
          const gname = collapse(decodeEntities(g?.name));
          const path2 = gname ? [...trail, gname] : trail;
          for (const item of g?.items ?? []) {
            if (item?.outOfStock === true) {
              outOfStock++;
              continue;
            }
            const prices = [].concat(item?.prices ?? []).filter((n) => Number.isFinite(n) && n > 0);
            if (!prices.length) continue;
            rows.push({
              section: path2.join(" / "),
              name: item?.name,
              description: item?.description,
              price: money(Math.min(...prices)),
            });
          }
          walkGroups(g?.groups, path2);
        }
      };
      walkGroups(menu?.groups, multipleMenus && menuName ? [menuName] : []);
    }

    const notes = [];
    if (outOfStock) notes.push(`${outOfStock} Toast items marked out of stock were skipped`);

    /*
     * TOAST TIME-GATES DAYPARTS, and this is nastier than a closed store.
     *
     * Its `paginatedMenuItems` query carries `respectAvailability: true`, so
     * the payload holds only what is being served right now. Farmhouse 78 came
     * back as 64 coherent items across LUNCH TO-GO and COLD DRINKS - a
     * complete-looking menu that is one daypart of three, with Breakfast
     * (Fri-Sun 8-11) and Supper (Fri-Sat from 5) simply absent. The screen
     * already holds that restaurant by id for exactly this, discovered by hand
     * on 2026-08-29; nothing downstream can detect it, because a lunch menu
     * looks like a menu.
     *
     * The flag is in the payload, so the router can at least SAY so. Two
     * signals are recorded: the flag itself, and whether the menus this
     * deployment returned are named after a daypart - which is what turns the
     * risk from theoretical into probable.
     */
    const respectsAvailability = Object.keys(rq).some(
      (k) => k.startsWith("paginatedMenuItems") && /"respectAvailability":true/.test(k),
    );
    const menuNames = menus.map(([, m]) => collapse(decodeEntities(m?.name))).filter(Boolean);
    const daypart = menuNames.filter((n) => /breakfast|brunch|lunch|dinner|supper|late night|happy hour/i.test(n));
    if (respectsAvailability) {
      const at = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
      notes.push(
        `Toast served this catalog with respectAvailability=true at ${at} PT, so it holds only what was ` +
          `being served then` +
          (daypart.length
            ? `; the menus returned are daypart-named (${daypart.join(", ")}), so other dayparts are probably missing`
            : ""),
      );
    }

    return {
      rows,
      sourceUrl: res.finalUrl,
      address,
      place,
      payloadName,
      notes,
      gateable: true,
      /* A daypart-named menu under a respectAvailability read is a partial
       * capture wearing the shape of a whole one. Hand it back rather than
       * file it - the restaurant re-queues and a daylight or evening wave
       * gets the rest. */
      dayparted: respectsAvailability && daypart.length > 0,
    };
  }
  if (metadataOnly)
    return {
      needsBrowser:
        `Toast storefront whose __OO_STATE__ carries restaurant metadata only - the catalog is fetched ` +
        `client-side on this deployment (${metadataOnly})`,
    };
  return null;
}

/* --------------------------------------------------- DoorDash / order.online */

function ddLinks(all) {
  return all.filter((u) => {
    const h = hostOf(u);
    if (h === "order.online" || h.endsWith(".order.online")) return true;
    return (h === "doordash.com" || h.endsWith(".doordash.com")) && /\/store\//.test(u);
  });
}

/**
 * The RSC flight payload, which is where the complete per-category menu lives
 * even when the DOM renders a "Most Ordered" carousel and a closed banner.
 */
function rowsFromDoorDashRsc(html) {
  const text = html.includes('\\"__typename\\":\\"MenuPageItemList\\"')
    ? html.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
    : html;
  const rows = [];
  let expected = 0;
  /* Lazy `.*?`, never a `[^"]*` character class: the flight payload writes
   * `&` and friends inside names and descriptions, and after the escaped
   * copy is unescaped a category name can carry a quote of its own, at which
   * point the character class stops early and the catalogued item count comes
   * out too small - which makes a COMPLETE read look like a partial one and
   * hands the restaurant back for no reason. */
  const marker = '"__typename":"MenuPageItemList"';
  for (let at = text.indexOf(marker); at !== -1; at = text.indexOf(marker, at + 1)) {
    const start = text.lastIndexOf("{", at);
    const raw = sliceObject(text, start);
    if (!raw) continue;
    let list;
    try {
      list = JSON.parse(raw);
    } catch {
      continue;
    }
    const section = collapse(decodeEntities(list?.name));
    /* "Most Ordered" repeats dishes from their real sections - the same
     * carousel this pipeline drops everywhere else. */
    if (!section || /^most ordered$/i.test(section) || list?.id === "popular-items") continue;
    for (const item of list?.items ?? []) {
      const price = moneyFromText(item?.displayPrice);
      if (!price) continue;
      rows.push({
        section,
        name: item?.name,
        description: item?.description,
        price,
      });
    }
  }
  /* The menu book lists every category with its item count, which is the only
   * way to tell a complete RSC read from a slice of one. */
  for (const m of text.matchAll(
    /"__typename":"MenuBookCategory","id":"(-?\d+)","name":(".*?"),"numItems":(\d+)/g,
  )) {
    if (m[1] === "-1") continue;
    expected += Number(m[3]);
  }
  return { rows, expected };
}

async function extractDoorDash(ctx) {
  const found = ddLinks(ctx.allLinks);
  let challenged = null;
  const attempts = [];
  for (const url of found.slice(0, 4)) {
    attempts.push(url.split("?")[0]);
    /* `page-service.doordash.com` is the same store page from the origin
     * behind the CDN, and it has answered on nights when `www` returned 403
     * to everything. Same path, same payload. */
    if (/(^|\.)doordash\.com$/i.test(hostOf(url)))
      attempts.push(url.split("?")[0].replace(/\/\/(www\.)?doordash\.com\//i, "//page-service.doordash.com/"));
  }
  for (const url of [...new Set(attempts)].slice(0, 6)) {
    const res = await get(url, { headers: NAVIGATION_HEADERS });
    const wall = botWall(res);
    if (wall) {
      challenged ??= `${wall} at ${url}`;
      continue;
    }
    if (!res.ok || res.status >= 400) continue;

    /* Marketplace store pages ship a server-side schema.org Menu. Iterate the
     * blocks by @type - the order is not fixed. */
    const nodes = jsonLdNodes(res.body);
    const menu = nodes.find((n) => typeOf(n).includes("Menu"));
    const restaurant = nodes.find((n) => typeOf(n).some((t) => /Restaurant|FoodEstablishment/i.test(t)));
    const address =
      collapse(restaurant?.address?.streetAddress) || addressInText(res.body) || null;
    const place = {
      city: collapse(restaurant?.address?.addressLocality) || placeInText(res.body).city,
      state: collapse(restaurant?.address?.addressRegion) || placeInText(res.body).state,
    };
    const payloadName = collapse(restaurant?.name) || null;

    if (menu) {
      const got = rowsFromSchemaMenu(menu);
      const multiOffer = got.multiOffer;
      /* "Most Ordered" is the carousel, and every one of its rows is a second
       * copy of a dish that is also in its real section - 12 of Robeks Chula
       * Vista's 70. The RSC reader has always dropped it; the JSON-LD reader
       * only started seeing rows at all once the doubly-nested
       * `hasMenuSection` was flattened, and inherited the same duty. */
      const rows = got.rows.filter((r) => !/^(most ordered|picked for you)$/i.test(collapse(r.section)));
      if (rows.length) {
        const notes = ["read from the DoorDash schema.org Menu block"];
        if (multiOffer) notes.push(`${multiOffer} items had several size offers, recorded at the lowest`);
        return { rows, sourceUrl: res.finalUrl, address, place, payloadName, notes, gateable: true };
      }
    }

    const { rows, expected } = rowsFromDoorDashRsc(res.body);
    if (rows.length) {
      const notes = ["read from the Next.js RSC flight payload, not the rendered DOM"];
      let partial = false;
      if (expected && rows.length < expected * 0.6) {
        partial = true;
        notes.push(`RSC carried ${rows.length} of ${expected} catalogued items`);
      }
      return { rows, sourceUrl: res.finalUrl, address, place, payloadName, notes, partial, gateable: true };
    }
  }
  /*
   * `order.online/business/<slug>` is the BRAND landing page, not a store, and
   * a brand with several locations carries no catalog and no per-store links -
   * Silverlake Ramen's is 450KB of shell with neither an RSC menu payload nor
   * a single `/store/` href. Picking the San Diego location is a click, which
   * is the definition of the browser-only case, and saying which link needs
   * the click is what makes it a one-page-load job for whoever has one.
   */
  /* A challenge is not an absence. Say which it was, so the next wave does not
   * spend a page load rediscovering that the catalog is right there. */
  if (challenged) return { needsBrowser: `DoorDash bot challenge, not a missing menu: ${challenged}` };
  if (found.length)
    return {
      needsBrowser:
        `DoorDash/order.online link with no server-rendered catalog - ` +
        (found.some((u) => /\/business\//.test(u))
          ? `a multi-location business landing page needing a store pick (${found[0]})`
          : `no JSON-LD Menu and no RSC payload at ${found[0]}`),
    };
  return null;
}

/* ---------------------------------------------------------------- Uber Eats */

/*
 * An Uber Eats store page, which is a MARKETPLACE source and is treated as one:
 * it sits last in the ladder, its capture goes through the same markup test
 * every delivery page does, and the note says where the prices came from.
 *
 * Three things had to be true at once before this worked, and each on its own
 * looks like "no data here":
 *
 * 1. A plain desktop-UA curl gets 404. The four NAVIGATION_HEADERS turn the
 *    same URL into a 200 - a 404 from this host is a bot verdict, not a
 *    missing store.
 * 2. The JSON-LD carries only Restaurant, FAQPage and BreadcrumbList. There is
 *    no schema.org Menu at all; the catalog is in `__REACT_QUERY_STATE__`.
 * 3. That script's content writes every structural quote as the six literal
 *    characters backslash-u-0-0-2-2 - and its backslashes as `%5C`, which is what makes a
 *    naive `\uXXXX` decode produce `%5C"` in the middle of a string and fail to
 *    parse two kilobytes in, inside the SEO FAQ blob. Both substitutions have
 *    to be undone, in that order. Cortez Mexican Food is the page that showed
 *    all three.
 */
function reactQueryState(html) {
  const at = html.indexOf("__REACT_QUERY_STATE__");
  if (at === -1) return null;
  const start = html.indexOf(">", at) + 1;
  const end = html.indexOf("</script>", start);
  if (start <= 0 || end === -1) return null;
  const decoded = html
    .slice(start, end)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%5C/g, "\\");
  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * The price on an Uber Eats catalog item.
 *
 * `price` is integer cents where the deployment ships it. Where it does not -
 * Cortez Mexican Food has no numeric price field on any of its 91 items - the
 * figure is in the accessibility label, published as "$8.59". That is still a
 * field read out of the payload, and it is only accepted when the whole label
 * IS a price, so a rating or a calorie count can never be mistaken for one.
 */
function uberEatsPrice(item) {
  if (Number.isInteger(item?.price) && item.price > 0) return money(item.price / 100);
  for (const text of [item?.priceTagline?.text, item?.labelPrimary?.accessibilityText]) {
    const m = String(text ?? "").trim().match(/^\$(\d+(?:\.\d{2})?)$/);
    if (m) return money(Number(m[1]));
  }
  return null;
}

async function extractUberEats(ctx) {
  const stores = ctx.allLinks.filter(
    (u) => /(^|\.)ubereats\.com$/i.test(hostOf(u)) && /\/store\//.test(u),
  );
  if (!stores.length) return null;

  let challenged = null;
  for (const url of [...new Set(stores.map((u) => u.split("?")[0]))].slice(0, 3)) {
    const res = await get(url, { headers: NAVIGATION_HEADERS });
    const wall = botWall(res);
    /* One agent saw this host 307 from this network on the same night it
     * answered here. A challenge is `blocked`, never absence. */
    if (wall || res.status === 307) {
      challenged ??= `${wall ?? `HTTP ${res.status}`} at ${url}`;
      continue;
    }
    if (!res.ok || res.status >= 400) continue;
    const state = reactQueryState(res.body);
    if (!state) continue;

    const rows = [];
    let store = null;
    let soldOut = 0;
    const walk = (node, depth) => {
      if (!node || typeof node !== "object" || depth > 40) return;
      if (Array.isArray(node)) {
        for (const n of node) walk(n, depth + 1);
        return;
      }
      if (!store && node.title && node.location?.streetAddress) store = node;
      if (node.catalogSectionsMap && typeof node.catalogSectionsMap === "object") {
        for (const list of Object.values(node.catalogSectionsMap)) {
          for (const section of list ?? []) {
            const payload = section?.payload?.standardItemsPayload;
            if (!payload) continue;
            const name = collapse(decodeEntities(payload.title?.text));
            for (const item of payload.catalogItems ?? []) {
              if (item?.isSoldOut === true) {
                soldOut++;
                continue;
              }
              const price = uberEatsPrice(item);
              if (!price) continue;
              rows.push({ section: name, name: item?.title, description: item?.itemDescription, price });
            }
          }
        }
      }
      for (const v of Object.values(node)) walk(v, depth + 1);
    };
    walk(state, 0);
    if (!rows.length) continue;

    const notes = [
      "read from the Uber Eats __REACT_QUERY_STATE__ catalog - a MARKETPLACE listing, so these are the " +
        "prices Uber Eats publishes rather than the restaurant's own",
    ];
    if (soldOut) notes.push(`${soldOut} items marked sold out were skipped`);
    return {
      rows,
      sourceUrl: res.finalUrl,
      address: collapse(store?.location?.streetAddress) || null,
      place: {
        city: collapse(store?.location?.city) || null,
        state: collapse(store?.location?.region) || null,
      },
      payloadName: collapse(store?.title) || null,
      notes,
      gateable: true,
    };
  }
  if (challenged) return { needsBrowser: `Uber Eats bot challenge, not a missing menu: ${challenged}` };
  return { needsBrowser: `Uber Eats store page with no readable __REACT_QUERY_STATE__ (${stores[0]})` };
}

/* ---------------------------------------------------------------- Clover */

/**
 * The Next.js flight payload, reassembled the way the browser reassembles it.
 *
 * The page ships its data as a run of `self.__next_f.push([1,"<chunk>"])`
 * calls whose second argument is a JSON STRING. Parsing that argument with
 * JSON.parse is the only correct way to unescape it, and the difference from
 * a blind `\"` -> `"` regex is not cosmetic: the regex leaves every OTHER
 * escape as literal text, so MuMu Sushi's roll descriptions came out as
 * "In - Spicy Crab Meat & Cucumber \nTop - Avocado" with the two characters
 * backslash-n printed in the middle, on 36 of 65 descriptions there and 13 of
 * 41 at Harmony Cuisine 2b1. Worse, a description containing an embedded
 * quote - "Flat Bread" - closes the string early and truncates the item.
 */
function flightPayload(html) {
  const chunks = [];
  const marker = "self.__next_f.push(";
  for (let at = html.indexOf(marker); at !== -1; at = html.indexOf(marker, at + 1)) {
    const raw = sliceArray(html, html.indexOf("[", at));
    if (!raw) continue;
    let call;
    try {
      call = JSON.parse(raw);
    } catch {
      continue;
    }
    if (Array.isArray(call) && typeof call[1] === "string") chunks.push(call[1]);
  }
  return chunks.join("");
}

/** `<slug>.cloveronline.com` (COLO2) menu payload. Prices are integer cents. */
function parseColo2(text) {
  const findMenu = (s) => {
    const marker = '"menu":{"categories"';
    for (let at = s.indexOf(marker); at !== -1; at = s.indexOf(marker, at + 1)) {
      const raw = sliceObject(s, s.indexOf("{", at));
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.categories && parsed.items) return parsed;
      } catch {
        /* the escaped copy read as plain, or the reverse - keep looking */
      }
    }
    return null;
  };
  /* Flight chunks first; the two regex passes stay as the fallback for a
   * deployment that serves the blob some other way. */
  return findMenu(text) ?? findMenu(flightPayload(text)) ?? findMenu(text.replace(/\\"/g, '"'));
}

function rowsFromColo2(menu) {
  const items = Array.isArray(menu.items)
    ? Object.fromEntries(menu.items.map((i) => [i.id, i]))
    : (menu.items ?? {});
  const categories = Object.values(menu.categories ?? {}).sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  const groups = Array.isArray(menu.modifierGroups)
    ? menu.modifierGroups
    : Object.values(menu.modifierGroups ?? {});
  const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
  const modifiers = Array.isArray(menu.modifiers) ? menu.modifiers : Object.values(menu.modifiers ?? {});
  const byGroup = {};
  for (const m of modifiers) (byGroup[m.groupId] ??= []).push(m);

  /*
   * The cheapest configuration a customer can actually order: for EVERY
   * required group, the cheapest option in it, summed. The $0.00 options have
   * to be included when taking each group's minimum - skipping them priced a
   * latte at $1.10, the cheapest "Half Caf" choice, instead of its real $5.15.
   */
  const startingPrice = (item) => {
    let total = 0;
    let priced = false;
    const labels = [];
    for (const gid of item.modifierGroupIds ?? []) {
      const group = groupById[gid];
      if (!group || (group.minRequired ?? 0) < 1) continue;
      const options = (byGroup[gid] ?? []).filter((m) => Number.isInteger(m.price));
      if (!options.length) continue;
      const cheapest = options.reduce((a, b) => (b.price < a.price ? b : a));
      total += cheapest.price;
      if (cheapest.price > 0) {
        priced = true;
        labels.push(cheapest.name);
      }
    }
    return priced ? { cents: total, label: labels.join(", ") } : null;
  };

  const rows = [];
  let sizePriced = 0;
  let dropped = 0;
  const seen = new Set();
  for (const category of categories) {
    for (const id of category.items ?? []) {
      const item = items[id];
      if (!item || item.available === false) continue;
      let cents = item.price;
      let suffix = "";
      if (!Number.isInteger(cents) || cents <= 0) {
        const fallback = startingPrice(item);
        if (!fallback) {
          dropped++;
          continue;
        }
        cents = fallback.cents;
        suffix = fallback.label ? ` (${fallback.label})` : "";
        sizePriced++;
      }
      const key = `${category.name} ${item.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        section: category.name,
        name: `${collapse(item.name)}${suffix}`,
        description: item.description,
        price: money(cents / 100),
      });
    }
  }
  return { rows, sizePriced, dropped };
}

async function extractClover(ctx) {
  const notes = [];

  /* 1. Clover's own hosted storefront, reached either directly or through the
   *    clover.com slug redirect - which also tells you which product it is
   *    before you fetch anything. */
  const coloDirect = ctx.allLinks.filter((u) => /\.cloveronline\.com/i.test(hostOf(u)));
  const slugLinks = ctx.allLinks.filter((u) => /(^|\.)clover\.com$/i.test(hostOf(u)) && /\/online-ordering\//.test(u));

  const storefronts = new Set(coloDirect.map((u) => `https://${hostOf(u)}/menu/all`));
  for (const u of slugLinks.slice(0, 3)) {
    const slug = new URL(u).pathname.split("/").filter(Boolean).pop();
    if (!slug) continue;
    const redirect = await get(
      `https://www.clover.com/olov2service/v2/merchants/redirect?slug=${encodeURIComponent(slug)}`,
      { accept: "application/json" },
    );
    if (!redirect.ok || redirect.status >= 400) continue;
    if (/"coloV2Enabled"\s*:\s*true/i.test(redirect.body)) {
      const m = redirect.body.match(/https?:\\?\/\\?\/([a-z0-9-]+\.cloveronline\.com)/i);
      storefronts.add(`https://${m ? m[1] : `${slug}.cloveronline.com`}/menu/all`);
    } else if (/"coloV2Enabled"\s*:\s*false/i.test(redirect.body)) {
      return { needsBrowser: `Clover COLO1 (${slug}) - the older app has no server-rendered payload` };
    }
  }

  for (const url of [...storefronts].slice(0, 3)) {
    const res = await get(url);
    if (!res.ok || res.status >= 400) continue;
    const menu = parseColo2(res.body);
    if (!menu) continue;
    const { rows, sizePriced, dropped } = rowsFromColo2(menu);
    if (sizePriced)
      notes.push(
        `${sizePriced} Clover items carry no list price and are recorded at their cheapest REQUIRED option (smallest size)`,
      );
    if (dropped) notes.push(`${dropped} Clover items had no price and no required group and were dropped`);
    return {
      rows,
      sourceUrl: res.finalUrl,
      address: addressInText(res.body),
      place: placeInText(res.body),
      notes,
      gateable: true,
    };
  }

  /* 2. The WordPress `moo-clover` plugin, on the restaurant's own domain. It
   *    answers even when the storefront says ordering is closed.
   *
   *    `<location>.smartonlineorder.com` is the same plugin under a reseller's
   *    domain, and its pages never print the plugin's name - Royal Sweets and
   *    Poki Bowl were both filed as "no known platform" while `/wp-json` was
   *    answering the whole catalog. Match the host as well as the markup. */
  const smartOnlineOrder = /(^|\.)smartonlineorder\.com$/i.test(hostOf(ctx.homeUrl));
  if (smartOnlineOrder || /moo-clover|moo_clover/i.test(ctx.homeBody)) {
    const origin = new URL(ctx.homeUrl).origin;
    const cats = await get(`${origin}/wp-json/moo-clover/v1/categories`, { accept: "application/json" });
    if (cats.ok && cats.status < 400) {
      let list;
      try {
        list = JSON.parse(cats.body);
      } catch {
        list = null;
      }
      const entries = Array.isArray(list) ? list : Object.values(list ?? {});
      const rows = [];
      for (const cat of entries.slice(0, 40)) {
        const uuid = cat?.uuid ?? cat?.id;
        if (!uuid) continue;
        const items = await get(`${origin}/wp-json/moo-clover/v1/categories/${uuid}/items`, {
          accept: "application/json",
        });
        if (!items.ok || items.status >= 400) continue;
        let parsed;
        try {
          parsed = JSON.parse(items.body);
        } catch {
          continue;
        }
        /* Two shapes from the same endpoint: a bare array of items, or the
         * category object with the items nested under `items`. The reseller
         * builds answer the second way, and `Object.values` on that object
         * yields the category's own strings, which price as nothing at all -
         * a silent zero-row read that looked like "no platform". */
        const list2 = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.items)
            ? parsed.items
            : Object.values(parsed ?? {});
        for (const item of list2) {
          if (!item || typeof item !== "object") continue;
          if (item.available === false || item.forcedOutOfStock === true) continue;
          /* The plugin reports Clover's own integer cents, sometimes as a
           * string of digits ("1200" is $12.00). Anything else is dollars. */
          const price = Number.isInteger(item.price)
            ? money(item.price / 100)
            : /^\d+$/.test(String(item.price))
              ? money(Number(item.price) / 100)
              : money(item.price);
          if (!price) continue;
          /* `PER_UNIT` with a unit name is a price per pound, not per plate -
           * Royal Sweets prices most of its pastry by weight. Say so in the
           * name rather than publishing $12.00 as if it were a dish. */
          const perUnit =
            item.price_type === "PER_UNIT" && collapse(item.unit_name)
              ? ` (per ${collapse(item.unit_name)})`
              : "";
          rows.push({
            section: cat?.name,
            name: `${collapse(item.name)}${perUnit}`,
            description: item.description,
            price,
          });
        }
      }
      if (rows.length) {
        notes.push(
          smartOnlineOrder
            ? "read from the moo-clover REST path on the smartonlineorder.com storefront - the same Clover WordPress plugin"
            : "read from the WordPress moo-clover REST path on the restaurant's own domain",
        );
        return { rows, sourceUrl: `${origin}/wp-json/moo-clover/v1/categories`, address: null, notes, gateable: true };
      }
    }
  }
  return null;
}

/* --------------------------------------------------------------- ChowNow */

async function extractChowNow(ctx) {
  const ids = new Set();
  for (const u of ctx.allLinks) {
    const m = u.match(/direct\.chownow\.com\/order\/[^/]+\/locations\/(\d+)/i);
    if (m) ids.add(m[1]);
  }
  for (const m of ctx.homeBody.matchAll(/direct\.chownow\.com\\?\/order\\?\/[^/\\"]+\\?\/locations\\?\/(\d+)/gi))
    ids.add(m[1]);

  /* `order.chownow.com/order/<n>` is a DIFFERENT id space and has returned
   * restaurants in other states twice. Not usable. */
  const wrongSpace = ctx.allLinks.some((u) => /order\.chownow\.com\/order\/\d+/i.test(u));

  if (!ids.size) {
    if (wrongSpace || /chownow/i.test(ctx.homeBody))
      return { needsBrowser: "ChowNow embed without a direct.chownow.com location id" };
    return null;
  }

  for (const id of [...ids].slice(0, 3)) {
    const meta = await get(`https://api.chownow.com/api/restaurant/${id}`, { accept: "application/json" });
    if (!meta.ok || meta.status >= 400) continue;
    const stamp = meta.body.match(/"next_available_time"\s*:\s*"(\d+)"/)?.[1];
    const address = addressInText(meta.body);
    if (!stamp) {
      return {
        rows: [],
        sourceUrl: `https://api.chownow.com/api/restaurant/${id}`,
        address,
        notes: ["ChowNow published no next_available_time, which means the store is closed rather than unreadable"],
        gateable: true,
      };
    }
    const res = await get(`https://api.chownow.com/api/restaurant/${id}/menu/${stamp}`, {
      accept: "application/json",
    });
    if (!res.ok || res.status >= 400) continue;
    let data;
    try {
      data = JSON.parse(res.body);
    } catch {
      continue;
    }
    const rows = [];
    for (const category of data?.menu_categories ?? []) {
      if (/^popular items$/i.test(collapse(category?.name))) continue;
      for (const item of category?.items ?? []) {
        const price = money(item?.price);
        if (!price) continue;
        const size = collapse(item?.size);
        const suffix = size && !/^regular$/i.test(size) ? ` (${size})` : "";
        rows.push({
          section: category?.name,
          name: `${collapse(item?.name)}${suffix}`,
          description: item?.description,
          price,
        });
      }
    }
    return {
      rows,
      sourceUrl: `https://api.chownow.com/api/restaurant/${id}/menu/${stamp}`,
      address,
      place: placeInText(meta.body),
      notes: ["ChowNow public API, versioned by the restaurant's own next_available_time"],
      gateable: true,
    };
  }
  return null;
}

/* --------------------------------------------------------------- Popmenu */

function isPopmenu(html) {
  return /__POPMENU_APOLLO_STATE__|popmenu\.com|popmenu-cdn|data-popmenu/i.test(html);
}

async function extractPopmenu(ctx) {
  const origin = new URL(ctx.homeUrl).origin;
  const pages = new Set();
  const landing = await get(`${origin}/menu`);
  const bodies = [ctx.homeBody, landing.ok ? landing.body : ""];
  for (const body of bodies) {
    for (const m of body.matchAll(/"(\/menus\/[A-Za-z0-9/_?=&%-]+)"/g)) pages.add(m[1]);
    for (const m of body.matchAll(/href=["'](\/menus\/[A-Za-z0-9/_?=&%-]+)["']/gi)) pages.add(m[1]);
  }

  const wanted = [...pages]
    /* Catering is an adjunct, not the restaurant's menu. */
    .filter((p) => !/catering|gift|merch/i.test(p))
    .slice(0, 10);

  const rows = [];
  const read = [];
  let multiOffer = 0;
  let address = null;
  let place = { city: null, state: null };
  let payloadName = null;
  for (const p of wanted) {
    const res = await get(`${origin}${p}`);
    if (!res.ok || res.status >= 400) continue;
    const nodes = jsonLdNodes(res.body);
    if (!address) {
      const restaurant = nodes.find((n) => typeOf(n).some((t) => /Restaurant|FoodEstablishment/i.test(t)));
      address = collapse(restaurant?.address?.streetAddress) || null;
      if (restaurant) {
        place = {
          city: collapse(restaurant.address?.addressLocality) || null,
          state: collapse(restaurant.address?.addressRegion) || null,
        };
        payloadName = collapse(restaurant.name) || null;
      }
    }
    for (const menu of nodes.filter((n) => typeOf(n).includes("Menu"))) {
      /* One page is one daypart, and Sogno di Vino's Arancini is $17.95 at
       * lunch and $18.95 at dinner - without the menu-name prefix those read
       * as a duplicate rather than as two real prices. */
      const menuName = collapse(decodeEntities(menu?.name)) || collapse(p.split("/").pop());
      const got = rowsFromSchemaMenu(menu, menuName);
      multiOffer += got.multiOffer;
      rows.push(...got.rows);
    }
    if (rows.length) read.push(`${origin}${p}`);
  }
  if (!rows.length) return null;
  const notes = [`read ${read.length} Popmenu menu page(s); sections carry their menu's name`];
  if (multiOffer) notes.push(`${multiOffer} items had several size offers, recorded at the lowest`);
  return { rows, sourceUrl: read[0], address, place, payloadName, notes };
}

/* ---------------------------------------------------------------- Menufy */

const MENUFY_KEY = "U3BlZWR5RGVzZXJ0VG9ydG9pc2U=";

async function extractMenufy(ctx) {
  const ids = new Set();
  const grab = (body) => {
    for (const m of body.matchAll(/location_menufy_id\\?"?\s*[:=]\s*\\?"?(\d+)/gi)) ids.add(m[1]);
  };
  grab(ctx.homeBody);

  if (!ids.size) {
    const site = ctx.allLinks.find((u) => /\.menufy\.com$/i.test(hostOf(u)));
    if (site) {
      const res = await get(`https://${hostOf(site)}/`);
      if (res.ok) grab(res.body);
    }
  }
  if (!ids.size) return null;

  for (const id of [...ids].slice(0, 2)) {
    const res = await get(
      `https://api.menufy.com/v1/locations/${id}/categories/all?api_key=${MENUFY_KEY}`,
      { accept: "application/json" },
    );
    if (!res.ok || res.status >= 400) continue;
    let data;
    try {
      data = JSON.parse(res.body);
    } catch {
      continue;
    }
    const categories = data?.categories ?? [];
    if (!categories.length) continue;

    const rows = [];
    let upgrades = 0;
    for (const category of [...categories].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))) {
      if (category?.isDeleted || category?.isActive === false) continue;
      for (const item of category?.items ?? []) {
        if (item?.isDeleted || item?.isActive === false) continue;
        const price = money(item?.itemPrice);
        if (!price) continue;
        if (item?.itemPriceHasUpgrades) upgrades++;
        rows.push({ section: category?.name, name: item?.name, description: item?.description, price });
      }
    }
    const loc = await get(`https://api.menufy.com/v1/locations/${id}?api_key=${MENUFY_KEY}`, {
      accept: "application/json",
    });
    const notes = [];
    if (upgrades)
      notes.push(`${upgrades} Menufy items are base prices that size or option choices add to`);
    return {
      rows,
      sourceUrl: `https://api.menufy.com/v1/locations/${id}/categories/all`,
      address: loc.ok ? addressInText(loc.body) : null,
      place: loc.ok ? placeInText(loc.body) : { city: null, state: null },
      notes,
    };
  }
  return null;
}

/* ------------------------------------------------------------- NetWaiter */

async function extractNetWaiter(ctx) {
  const store = ctx.allLinks.find((u) => /\.netwaiter\.com$/i.test(hostOf(u)));
  if (!store) return null;
  const host = hostOf(store);
  const root = await get(`https://${host}/`);
  /* The city segment comes out of the redirect the root performs. */
  let city = null;
  try {
    city = new URL(root.finalUrl).pathname.split("/").filter(Boolean)[0] ?? null;
  } catch {
    city = null;
  }
  if (!city) return { needsBrowser: `NetWaiter ${host} did not redirect to a city path` };

  /* `-d '{}'` matters: a bodyless POST returns 411, which reads like a block
   * and is not one. */
  const res = await get(`https://${host}/${city}/menu/GetMenu`, {
    method: "POST",
    body: "{}",
    accept: "application/json",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok || res.status >= 400) return null;
  let data;
  try {
    data = JSON.parse(res.body);
  } catch {
    return null;
  }

  const rows = [];
  const walk = (groups, trail) => {
    for (const group of groups ?? []) {
      const name = collapse(String(group?.Name ?? "").replace(/[\u200b-\u200f\u00ad\u2060]/g, ""));
      const path2 = name ? [...trail, name] : trail;
      for (const item of group?.Items ?? []) {
        const text = collapse(item?.PriceText);
        let price = /^\d+(\.\d{1,2})?$/.test(text) ? money(Number(text)) : null;
        if (!price && typeof item?.MinPrice === "number") price = money(item.MinPrice);
        if (!price) continue;
        rows.push({ section: path2.join(" / "), name: item?.Name, description: item?.Description, price });
      }
      walk(group?.Groups, path2);
    }
  };
  walk(data?.Groups, []);

  const notes = [];
  if (!rows.length)
    notes.push(
      "NetWaiter GetMenu returned no groups - that storefront carries an About page only, and a browser sees the same nothing",
    );
  return { rows, sourceUrl: `https://${host}/${city}/menu/GetMenu`, address: null, notes };
}

/* ----------------------------------------------------------------- Slice */

async function extractSlice(ctx) {
  const bodies = [{ url: ctx.homeUrl, body: ctx.homeBody }];
  const sliceLink = ctx.allLinks.find((u) => /slicelife\.com/i.test(hostOf(u)) && /\/restaurants\//.test(u));
  if (sliceLink) {
    const res = await get(sliceLink.split("?")[0]);
    if (res.ok && res.status < 400) bodies.push({ url: res.finalUrl, body: res.body });
  }

  for (const { url, body } of bodies) {
    /* The embedding on a restaurant's own domain: products carry `price` as a
     * "$13.99" string. */
    const at = body.indexOf('"menuRequest"');
    if (at !== -1) {
      const raw = sliceObject(body, body.indexOf("{", body.indexOf('"data"', at)));
      if (raw) {
        try {
          const data = JSON.parse(raw);
          const rows = [];
          for (const cat of data?.categories ?? []) {
            for (const product of cat?.products ?? []) {
              const price = moneyFromText(product?.price);
              if (!price) continue;
              rows.push({ section: cat?.name, name: product?.name, description: product?.description, price });
            }
          }
          if (rows.length)
            return {
              rows,
              sourceUrl: url,
              address: addressInText(body),
              place: placeInText(body),
              ownDomain: hostOf(url) === hostOf(ctx.homeUrl),
              notes: ["read from the served menuRequest blob"],
            };
        } catch {
          /* fall through to the other embeddings */
        }
      }
    }

    /*
     * Only a page that actually IS Slice gets read as Slice. Without this the
     * branch claimed every schema.org Menu it saw, and the notes file reported
     * Nekter Juice Bar and Epic Wings - neither of which has anything to do
     * with Slice - as Slice captures. The rows were right and the label was
     * wrong, which is the kind of error that misdirects the next wave.
     */
    if (!/slicelife|__SLICE_REDUX_STATE__|slice-app/i.test(body)) continue;
    const nodes = jsonLdNodes(body);
    const menu = nodes.find((n) => typeOf(n).includes("Menu"));
    if (menu) {
      const { rows } = rowsFromSchemaMenu(menu);
      if (rows.length)
        return {
          rows,
          sourceUrl: url,
          address: addressInText(body),
          place: placeInText(body),
          notes: ["read from Slice's schema.org Menu"],
        };
    }
  }
  if (ctx.allLinks.some((u) => /slicelife\.com/i.test(hostOf(u))))
    return { needsBrowser: "Slice storefront with neither __SLICE_REDUX_STATE__, a menuRequest blob nor JSON-LD" };
  return null;
}

/* ------------------------------------------------------------- Kwickmenu */

/*
 * `<slug>.kwickmenu.com` embeds its whole POS in two plain JS object literals,
 * `var Cats={...}` and `var Iids={...}`. No API call, no render.
 *
 * THE ONE THING THAT MATTERS HERE IS WHICH ITEMS TO TAKE. Pho Lucky's page
 * carries 630 items and 49 categories - because the same catalog is repeated
 * once per SALES CHANNEL, and the channel is on the category as `pmenu`:
 * LOCAL (the in-store register), KIOS (the kiosk), NOTUSER, and - this is the
 * one that would have been a disaster - `zzDoordash`, a full copy at DoorDash
 * marketplace prices. Taking every priced row gives a quadrupled catalog with
 * four different prices for the same dish and a delivery markup mixed in.
 *
 * `item_online: "1"` is the online storefront's own menu, and it is exactly
 * that: 87 items at Pho Lucky and 127 at Melody Karaoke, both of which
 * reproduce the hand-checked browser captures row for row, price for price.
 * The item names arrive double-encoded (`C&Agrave; PH&Ecirc; MU?I`), which is
 * the case `decodeEntities` grew its accented-entity table for.
 */
function parseKwickVar(html, name) {
  const at = html.search(new RegExp(`var\\s+${name}\\s*=`));
  if (at === -1) return null;
  const raw = sliceObject(html, html.indexOf("{", at));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function extractKwickmenu(ctx) {
  const bodies = [{ url: ctx.homeUrl, body: ctx.homeBody }];
  if (!/kwickmenu/i.test(ctx.homeBody)) {
    const link = ctx.allLinks.find((u) => /(^|\.)kwickmenu\.com$/i.test(hostOf(u)));
    if (!link) return null;
    const res = await get(`https://${hostOf(link)}/`);
    if (!res.ok || res.status >= 400) return null;
    bodies.push({ url: res.finalUrl, body: res.body });
  }

  for (const { url, body } of bodies) {
    const cats = parseKwickVar(body, "Cats");
    const items = parseKwickVar(body, "Iids");
    if (!cats || !items) continue;

    const rows = [];
    let soldOut = 0;
    for (const item of Object.values(items)) {
      /*
       * THE CHANNEL FILTER. Not an availability flag - a channel selector.
       *
       * Kwickmenu ships the catalog once per sales channel, and Pho Lucky
       * (pholuckysandiego.kwickmenu.com) is the restaurant that showed it:
       * 630 items across 49 categories, which is the same ~130-dish menu
       * repeated four times under `Cats[].pmenu` = LOCAL, KIOS, NOTUSER and
       * `zzDoordash` - the last one a complete copy at DoorDash marketplace
       * prices. Dropping this line publishes a quadrupled catalog carrying
       * four prices per dish with a delivery markup among them, filed as the
       * restaurant's own first-party menu, and NOTHING downstream catches it:
       * the screen's doubled-catalog test keys on name AND price, and the
       * four copies disagree on price, so every row looks distinct.
       *
       * `item_online: "1"` is the storefront's own online menu and nothing
       * else - 87 rows at Pho Lucky, 127 at Melody Karaoke, both matching the
       * hand-checked captures exactly.
       */
      if (item?.item_online !== "1") continue;
      if (item.item_soldout === "1") {
        soldOut++;
        continue;
      }
      const price = money(Number(item.price));
      if (!price) continue;
      rows.push({
        section: cats[item.category_id]?.category,
        name: item.name,
        description: item.description,
        price,
      });
    }
    if (!rows.length) continue;

    /* `var storeAddress='9326 Mira Mesa Blvd,San Diego,CA 92126'` - the branch,
     * out of the same payload as the prices. */
    const store = body.match(/var\s+storeAddress\s*=\s*'([^']{6,120})'/);
    const parts = store ? store[1].split(",").map((s) => collapse(s)) : [];
    const notes = ["read from the kwickmenu Cats/Iids blobs, item_online=1 only (the storefront's own menu)"];
    if (soldOut) notes.push(`${soldOut} items marked sold out were skipped`);
    return {
      rows,
      sourceUrl: url,
      address: parts[0] && streetNumber(parts[0]) ? parts[0] : null,
      place: { city: parts[1] ?? null, state: (parts[2] ?? "").split(/\s+/)[0] || null },
      notes,
    };
  }
  return null;
}

/* ------------------------------------------------------------- SpotHopper */

/*
 * SpotHopper builds the restaurant's own website, and its food-menu page
 * server-renders EVERY tab at once - each daypart as a
 * `<div class="menu_<id> food-menu-grid">`, hidden with `display:none` until
 * its tab is clicked. That is why a browser saw three menus at Offshore Tavern
 * and a fetch of the same URL sees all of them.
 *
 * The markup is read rather than paired: name, price and description each sit
 * inside the SAME `food-item-holder` element, so a price can only ever be
 * attached to the dish it was published with. This is the structure the
 * plain-HTML reader does not have and the reason that one is a detector.
 *
 * Not the `tmt.spotapps.co/ordering-menu` widget, which evaluates cleanly out
 * of `window.__NUXT__` but carries only what is orderable online - 34 items at
 * Offshore Tavern against the 72 its own menu page prints. It is the fallback,
 * and it says so, for a site whose page ships the tabs empty.
 */
function rowsFromSpotHopperGrid(html) {
  const rows = [];
  /* Tab labels: `<a class="food-menu-nav-item menu_228050_link ..."><span>Main Menu</span></a>` */
  const tabs = {};
  for (const m of html.matchAll(
    /class="[^"]*menu_(\d+)_link[^"]*"[^>]*>\s*<span>([\s\S]{0,80}?)<\/span>/gi,
  ))
    tabs[m[1]] = collapse(decodeEntities(m[2]));

  const starts = [...html.matchAll(/<div class="menu_(\d+) food-menu-grid"/gi)];
  for (let i = 0; i < starts.length; i++) {
    const id = starts[i][1];
    const from = starts[i].index;
    const to = i + 1 < starts.length ? starts[i + 1].index : html.length;
    const block = html.slice(from, to);
    const menuName = tabs[id] ?? "";

    /* Headings and item holders, in document order, so a holder is filed
     * under the heading it was printed beneath and never under another. Cut
     * the block at the markers rather than matching a bounded window: a
     * holder carrying a lazy-loaded photo runs to several kilobytes, and a
     * length-capped regex silently drops exactly those items. */
    const marks = [];
    for (const m of block.matchAll(/<h2[^>]*>/gi)) marks.push({ at: m.index, kind: "h2", end: m.index + m[0].length });
    for (const m of block.matchAll(/<div class="food-item-holder"/gi)) marks.push({ at: m.index, kind: "item" });
    marks.sort((a, b) => a.at - b.at);

    let section = "";
    for (let k = 0; k < marks.length; k++) {
      const stop = k + 1 < marks.length ? marks[k + 1].at : block.length;
      if (marks[k].kind === "h2") {
        const close = block.indexOf("</h2>", marks[k].end);
        if (close !== -1 && close < stop + 200)
          section = collapse(decodeEntities(block.slice(marks[k].end, close).replace(/<[^>]*>/g, " ")));
        continue;
      }
      const holder = block.slice(marks[k].at, stop);
      const name = holder.match(/class="food-item-title"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const price = holder.match(/class="food-price"[^>]*>([\s\S]*?)<\/div>/i);
      if (!name || !price) continue;
      const strip = (s) => decodeEntities(String(s).replace(/<[^>]*>/g, " "));
      const value = moneyFromText(collapse(strip(price[1])));
      if (!value) continue;
      const description = holder.match(/class="food-item-description"[^>]*>([\s\S]*?)<\/div>/i);
      rows.push({
        section: [menuName, section].filter(Boolean).join(" / "),
        name: collapse(strip(name[1])),
        description: description ? strip(description[1]) : "",
        price: value,
      });
    }
  }
  return rows;
}

async function extractSpotHopper(ctx) {
  if (!/spotapps\.co|spothopper/i.test(ctx.homeBody) && !ctx.allLinks.some((u) => /spotapps\.co$/i.test(hostOf(u))))
    return null;

  const pages = [{ url: ctx.homeUrl, body: ctx.homeBody }, ...ctx.menuPages];
  /* SpotHopper names the menu page after the branch, not `/menu` -
   * `/san-diego-bay-park-offshore-tavern-and-grill-food-menu` - so the page
   * has to be found by its own link rather than guessed. */
  const named = ctx.allLinks
    .filter((u) => /-(food|drink|dessert|brunch|lunch|dinner)-menu\/?$/i.test(u) || /\/(food|drink)-menu\/?$/i.test(u))
    .slice(0, 4);
  for (const url of named) {
    if (pages.some((p) => p.url === url)) continue;
    const res = await get(url);
    if (res.ok && res.status < 400) pages.push({ url: res.finalUrl, body: res.body });
  }

  let best = { rows: [], url: null, body: "" };
  for (const { url, body } of pages) {
    const rows = rowsFromSpotHopperGrid(body);
    if (rows.length > best.rows.length) best = { rows, url, body };
  }

  const spotIds = new Set();
  for (const { body } of pages) for (const m of body.matchAll(/var\s+spot_id\s*=\s*(\d+)/g)) spotIds.add(m[1]);

  if (best.rows.length) {
    const payloadName = best.body.match(/var\s+name\s*=\s*"([^"]{2,80})"/);
    return {
      rows: best.rows,
      sourceUrl: best.url,
      address: null,
      payloadName: payloadName ? collapse(payloadName[1]) : null,
      /* The site IS the restaurant's, and SpotHopper prints no address on the
       * menu page, so identity falls to the name test the way every other
       * own-domain read does. */
      ownDomain: true,
      notes: [
        `read from the SpotHopper food-menu grids served on the restaurant's own site (${
          [...new Set(best.rows.map((r) => r.section.split(" / ")[0]).filter(Boolean))].length || 1
        } menu tab(s), all in one page load)`,
      ],
    };
  }

  /*
   * Fallback: the ordering widget's Nuxt payload.
   *
   * No `spot_id` at all means this is not a SpotHopper site - a page can link
   * `static.spotapps.co` for one stock photo - so hand the restaurant back to
   * the ladder rather than claiming it and blocking every reader below.
   */
  if (!spotIds.size) return null;
  if (spotIds.size > 1)
    return {
      needsBrowser: `SpotHopper site whose menu grids are empty and which exposes ${spotIds.size} spot ids, so a location has to be picked (${ctx.homeUrl})`,
    };
  const [spotId] = [...spotIds];
  const res = await get(`https://tmt.spotapps.co/ordering-menu/?spot_id=${spotId}`);
  if (!res.ok || res.status >= 400)
    return { needsBrowser: `SpotHopper ordering widget for spot ${spotId} returned HTTP ${res.status}` };
  const at = res.body.indexOf("__NUXT__");
  if (at === -1) return { needsBrowser: `SpotHopper ordering widget for spot ${spotId} carried no __NUXT__ payload` };
  const expr = res.body.slice(res.body.indexOf("=", at) + 1, res.body.indexOf("</script>", at)).trim().replace(/;\s*$/, "");
  let data;
  try {
    /* A minified IIFE, so it has to be evaluated - in a context with nothing
     * in it, on a string that came off the wire, with a hard time limit. */
    data = vm.runInContext(`(${expr})`, vm.createContext(Object.create(null)), { timeout: 3000 });
  } catch {
    return { needsBrowser: `SpotHopper __NUXT__ payload for spot ${spotId} did not evaluate` };
  }
  const spot = data?.data?.[0];
  if (!spot?.menus) return { needsBrowser: `SpotHopper __NUXT__ payload for spot ${spotId} carried no menus` };

  const rows = [];
  let unpriced = 0;
  for (const menu of spot.menus) {
    const menuName = collapse(decodeEntities(menu?.name));
    for (const section of menu?.food_menu_sections ?? []) {
      const sectionName = collapse(decodeEntities(section?.name));
      for (const item of section?.food_menu_items ?? []) {
        if (item?.in_stock === false) continue;
        const price = money(Number(item?.cents) / 100);
        if (!price) {
          /* `cents: 0` means the sizes are written into the prose ("Small
           * $11.50 | Large $14.50"). Reading a price out of a sentence is
           * pairing by regex, which is the one thing this file will not do. */
          unpriced++;
          continue;
        }
        const size = collapse(item?.size);
        rows.push({
          section: [menuName, sectionName].filter(Boolean).join(" / "),
          name: `${collapse(decodeEntities(item?.name))}${size ? ` (${size})` : ""}`,
          description: item?.description,
          price,
        });
      }
    }
  }
  if (!rows.length) return { needsBrowser: `SpotHopper spot ${spotId} published no priced items` };
  const notes = [
    "read from the SpotHopper ordering widget's __NUXT__ payload - this is the ORDERABLE menu, which is " +
      "usually a subset of what the site's own menu page prints",
  ];
  if (unpriced) notes.push(`${unpriced} items carry cents:0 and price by size in their description; they were dropped`);
  return {
    rows,
    sourceUrl: `https://tmt.spotapps.co/ordering-menu/?spot_id=${spotId}`,
    address: null,
    payloadName: collapse(spot.spot_name) || null,
    ownDomain: true,
    notes,
  };
}

/* ------------------------------------------------------- Owner.com / Olo */

async function extractOwner(ctx) {
  const origin = new URL(ctx.homeUrl).origin;
  const res = await get(`${origin}/menu`);
  if (!res.ok || res.status >= 400) return null;
  const nodes = jsonLdNodes(res.body);
  const menus = nodes.filter((n) => typeOf(n).includes("Menu"));
  if (!menus.length) return null;
  const rows = [];
  for (const menu of menus) rows.push(...rowsFromSchemaMenu(menu).rows);
  if (!rows.length) return null;
  const restaurant = nodes.find((n) => typeOf(n).some((t) => /Restaurant|FoodEstablishment/i.test(t)));
  return {
    rows,
    sourceUrl: res.finalUrl,
    address: collapse(restaurant?.address?.streetAddress) || null,
    place: {
      city: collapse(restaurant?.address?.addressLocality) || null,
      state: collapse(restaurant?.address?.addressRegion) || null,
    },
    payloadName: collapse(restaurant?.name) || null,
    ownDomain: true,
    notes: ["read from the Owner.com server-side schema.org graph at /menu"],
  };
}

/*
 * The BRAND LOCATION PAGE, which is the shape most Olo chains actually publish.
 *
 * `location.<brand>.com/us/<state>/<city>/<store>` is a per-branch microsite
 * that serves a complete schema.org `Menu` graph in an ld+json tag, next to a
 * `Restaurant` block carrying that branch's street address - everything the
 * identity check wants, in the first page load, to a plain curl. All five San
 * Diego Epic Wings branches read this way (46 priced rows at Palm Promenade,
 * 47 at Chula Vista), and every one of them was filed `needs-browser` before,
 * because the page also links `<brand>catering.olo.com` and the Olo branch saw
 * that host, found no merchant id, and concluded a store pick was needed.
 *
 * So this is tried FIRST, on the pages already in hand. The ordering endpoint
 * below stays where it is for the deployments that expose a merchant id.
 */
function oloLocationMenu(ctx) {
  const pages = [{ url: ctx.homeUrl, body: ctx.homeBody }, ...ctx.menuPages];
  for (const { url, body } of pages) {
    const nodes = jsonLdNodes(body);
    const menus = nodes.filter((n) => typeOf(n).includes("Menu"));
    if (!menus.length) continue;
    const rows = [];
    let multiOffer = 0;
    for (const menu of menus) {
      const got = rowsFromSchemaMenu(menu, collapse(decodeEntities(menu?.name)));
      multiOffer += got.multiOffer;
      rows.push(...got.rows);
    }
    if (!rows.length) continue;
    const restaurant = nodes.find((n) => typeOf(n).some((t) => /Restaurant|FoodEstablishment/i.test(t)));
    const notes = ["read from the schema.org Menu on the Olo brand location page"];
    if (multiOffer) notes.push(`${multiOffer} items had several size offers, recorded at the lowest`);
    return {
      rows,
      sourceUrl: url,
      address: collapse(restaurant?.address?.streetAddress) || null,
      place: {
        city: collapse(restaurant?.address?.addressLocality) || null,
        state: collapse(restaurant?.address?.addressRegion) || null,
      },
      /* The Restaurant node names the BRANCH ("Palm Promenade"), not the
       * business, so the name test would fail on a good capture. It never
       * runs here: this page always carries the branch's street address. */
      payloadName: collapse(restaurant?.name) || null,
      notes,
    };
  }
  return null;
}

async function extractOlo(ctx) {
  const ids = new Set();
  for (const m of ctx.homeBody.matchAll(/oloservice\/v1\/merchants\/(\d+)/gi)) ids.add(m[1]);
  for (const u of ctx.allLinks) {
    const m = u.match(/oloservice\/v1\/merchants\/(\d+)/i);
    if (m) ids.add(m[1]);
  }
  const onOlo =
    ctx.allLinks.some((u) => /(^|\.)olo\.com$/i.test(hostOf(u))) || /olo\.com|olocdn/i.test(ctx.homeBody);
  if (onOlo) {
    const located = oloLocationMenu(ctx);
    if (located) return located;
  }
  if (!ids.size) {
    if (onOlo)
      return { needsBrowser: "Olo storefront with no merchant id and no location-page menu graph (needs a store pick)" };
    return null;
  }
  for (const id of [...ids].slice(0, 2)) {
    const origin = new URL(ctx.homeUrl).origin;
    const res = await get(`${origin}/oloservice/v1/merchants/${id}/menu`, { accept: "application/json" });
    if (!res.ok || res.status >= 400) continue;
    let data;
    try {
      data = JSON.parse(res.body);
    } catch {
      continue;
    }
    const rows = [];
    for (const cat of data?.categories ?? []) {
      for (const product of cat?.products ?? []) {
        const price = money(product?.cost ?? product?.baseprice ?? product?.price);
        if (!price) continue;
        rows.push({ section: cat?.name, name: product?.name, description: product?.description, price });
      }
    }
    if (rows.length)
      return {
        rows,
        sourceUrl: `${origin}/oloservice/v1/merchants/${id}/menu`,
        address: null,
        notes: ["read from the Olo merchant menu endpoint"],
        gateable: true,
      };
  }
  return null;
}

/* --------------------------------------------------------------- Shopify */

async function extractShopify(ctx) {
  const origin = new URL(ctx.homeUrl).origin;
  const res = await get(`${origin}/products.json?limit=250`, { accept: "application/json" });
  if (!res.ok || res.status >= 400) return null;
  let data;
  try {
    data = JSON.parse(res.body);
  } catch {
    return null;
  }
  const rows = [];
  for (const product of data?.products ?? []) {
    const variants = product?.variants ?? [];
    for (const v of variants) {
      const price = money(v?.price);
      if (!price) continue;
      const title = collapse(v?.title);
      const suffix = title && !/^default title$/i.test(title) ? ` (${title})` : "";
      rows.push({
        section: collapse(product?.product_type) || "Shop",
        name: `${collapse(product?.title)}${suffix}`,
        description: trimDescription(String(product?.body_html ?? "").replace(/<[^>]*>/g, " ")),
        price,
      });
    }
  }
  if (!rows.length) return null;

  /*
   * `/products.json` finds what a site SELLS ONLINE, and for a coffee roaster
   * that is bags of beans, mugs and t-shirts - not the drinks menu.
   *
   * Steady State Coffee Roasters is the case: 95 priced rows, 76 of them
   * roasted coffee in three bag sizes, plus Swag and Brewing Equipment. Filing
   * that as the restaurant's menu would be worse than filing nothing, because
   * a loaded menu stops the restaurant re-queueing and the actual drinks list
   * would never be looked for again.
   *
   * So merchandise is dropped outright, and a catalog that is still mostly
   * retail after that is handed back rather than filed.
   */
  const RETAIL = /swag|merch|apparel|equipment|gift ?card|subscription|brewing|accessor|book|glassware|bag of/i;
  const menuish = rows.filter((r) => !RETAIL.test(r.section) && !RETAIL.test(r.name));
  const retailShare = 1 - menuish.length / rows.length;
  const beans = rows.filter((r) => /coffee|bean|roast|tea|blend/i.test(r.section)).length / rows.length;
  if (retailShare > 0.3 || beans > 0.5) {
    return {
      retail: `Shopify /products.json is a retail catalog here (${rows.length} products, ${(100 * beans).toFixed(0)}% packaged coffee/tea, ${(100 * retailShare).toFixed(0)}% merchandise) - it is what the site ships, not what the counter serves`,
    };
  }
  return {
    rows: menuish,
    sourceUrl: `${origin}/products.json`,
    address: null,
    notes: ["read from the Shopify /products.json catalog - this is what the site sells online"],
  };
}

/* -------------------------------------------------------------------- Wix */

function rowsFromWix(html) {
  /* Wix renders each menu item as a pair of data-hook spans in document order.
   * Pairing them positionally is the only structure the markup offers, so a
   * price is only accepted when its name immediately precedes it. */
  const tokens = [];
  for (const m of html.matchAll(
    /data-hook=["'](item\.(?:name|price|description))["'][^>]*>([\s\S]{0,400}?)<\/(?:span|div|h\d|p)>/gi,
  )) {
    tokens.push({ kind: m[1].split(".")[1], text: collapse(decodeEntities(m[2].replace(/<[^>]*>/g, " "))) });
  }
  const rows = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== "name") continue;
    let description = "";
    let price = null;
    for (let j = i + 1; j < Math.min(i + 4, tokens.length); j++) {
      if (tokens[j].kind === "name") break;
      if (tokens[j].kind === "description") description = tokens[j].text;
      if (tokens[j].kind === "price") {
        price = moneyFromText(tokens[j].text);
        break;
      }
    }
    if (price && tokens[i].text) rows.push({ section: "Menu", name: tokens[i].text, description, price });
  }
  return rows;
}

async function extractWix(ctx) {
  const candidates = [{ url: ctx.homeUrl, body: ctx.homeBody }, ...ctx.menuPages];
  const rows = [];
  let sourceUrl = null;
  for (const { url, body } of candidates) {
    const got = rowsFromWix(body);
    if (got.length > rows.length) {
      rows.length = 0;
      rows.push(...got);
      sourceUrl = url;
    }
  }
  if (!rows.length) return null;
  return {
    rows,
    sourceUrl,
    address: null,
    notes: ["read from Wix item.name / item.price data-hooks in document order"],
  };
}

/* --------------------------------------- plain HTML menu (Squarespace etc.) */

/*
 * Words that sit in front of a price and are not a dish.
 *
 * This list is the whole difference between a menu and a shop. Pointed at
 * darkhorsecoffeeroasters.com the first version of this reader returned ten
 * rows all named "from", plus "Add to cart" and "Quick View" - a Squarespace
 * STORE where every product tile prints `from $20.99`, and the price sits at
 * the end of a line whose only other word is the qualifier. Every row was a
 * real price on the page and not one of them was a dish.
 */
const PRICE_QUALIFIER =
  /^(from|only|starting(\s+at)?|price[sd]?|each|now|sale|was|regular|add to cart|quick view|buy now|shop now|select options|read more|view|total|subtotal|per|plus)$/i;

/** A page that sells things rather than serving them. */
const SHOP_PAGE = /add to cart|quick view|shopping cart|\/products\/|checkout/i;

/**
 * A menu printed as plain HTML: a name and a price on the same visual line.
 *
 * This reads what the page prints; it never pairs a price with a name from
 * somewhere else on the page. A line qualifies only when the price sits at the
 * END of it behind a real name, which is how a printed menu is set. Anything
 * looser starts inventing pairs, and a wrong pair is worse than no capture.
 */
function rowsFromPlainHtml(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|td|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const lines = decodeEntities(text)
    .split("\n")
    .map((l) => collapse(l))
    .filter(Boolean);

  const rows = [];
  let section = "Menu";
  for (const line of lines) {
    if (line.length > 160) continue;
    /* An all-caps or title-cased line with no price is a section heading. */
    if (!/\$\s?\d/.test(line)) {
      if (line.length <= 40 && /^[A-Z][A-Za-z'&., -]+$/.test(line) && line.split(" ").length <= 5) section = line;
      continue;
    }
    const m = line.match(/^(.{2,80}?)\s*[.\u2026\s-]*\$\s?(\d+(?:\.\d{2})?)\s*$/);
    if (!m) continue;
    const name = collapse(m[1]).replace(/[.\u2026-]+$/, "").trim();
    if (!name || name.length < 3 || !/[A-Za-z]{2}/.test(name)) continue;
    if (/\$/.test(name)) continue;
    if (PRICE_QUALIFIER.test(name)) continue;
    /* A one-word name is a dish ("Churros") only if it is a real word rather
     * than a fragment of layout. */
    if (!name.includes(" ") && name.length < 5) continue;
    const price = money(Number(m[2]));
    if (!price) continue;
    rows.push({ section, name, description: "", price });
  }
  return rows;
}

/*
 * Only pages that ANNOUNCE themselves as a menu are read this way.
 *
 * Restricting to menu-shaped paths, rather than trying the homepage as well,
 * is what stops the reader wandering into a Squarespace store. It costs the
 * one-page restaurant site that prints its menu on `/` and has no `/menu` -
 * a real loss, and the cheaper of the two errors by a wide margin, because a
 * wrong capture is loaded and believed while a missing one re-queues.
 */
const MENU_PATH = /\/(menus?|food|drinks?|dinner|lunch|breakfast|brunch|bar|wine|order|online-ordering|order-online)(\/|$)/i;

/**
 * A priced menu printed as plain HTML is DETECTED here and handed back, never
 * read.
 *
 * This began as an extractor and had to be demoted, which is worth recording
 * because the output looked fine until it was read line by line. On
 * `atspacebar.com/menu` it returned seventeen rows, six of them the same
 * "Egg & Cheese Add: Bacon, Turkey or Ham" at $4.00 filed under six different
 * section names, and two more whose names began with a comma. Every price was
 * real and on the page; almost every PAIRING was wrong, because a designed
 * HTML menu puts the name, the description and the price in separate elements
 * and the reading order is whatever the layout happened to be.
 *
 * That is the exact failure the runbook calls the most expensive one here -
 * plausible wrong pairs, indistinguishable downstream from read ones. A
 * line-based reader cannot tell a modifier line from a dish line, and no
 * amount of tightening the regex changes that. So the router says what it
 * found and where, and a model pairs them.
 */
async function detectPlainHtmlMenu(ctx) {
  let best = { count: 0, url: null };
  for (const { url, body } of ctx.menuPages) {
    let pathname;
    try {
      pathname = new URL(url).pathname;
    } catch {
      continue;
    }
    if (!MENU_PATH.test(pathname)) continue;
    if (SHOP_PAGE.test(body)) continue;
    const count = rowsFromPlainHtml(body).length;
    if (count > best.count) best = { count, url };
  }
  if (best.count < 8) return null;
  return {
    needsBrowser:
      `priced menu printed as plain HTML at ${best.url} (~${best.count} priced lines) - no machine-readable ` +
      `payload, so names and prices must be paired by a reader, not by a regex`,
  };
}

/* ------------------------------------------- schema.org Menu on its own site */

async function extractOwnJsonLd(ctx) {
  const candidates = [{ url: ctx.homeUrl, body: ctx.homeBody }, ...ctx.menuPages];
  let best = { rows: [], url: null, address: null, multiOffer: 0, place: { city: null, state: null }, payloadName: null };
  for (const { url, body } of candidates) {
    const nodes = jsonLdNodes(body);
    const menus = nodes.filter((n) => typeOf(n).includes("Menu"));
    /* A Restaurant node can carry `hasMenu` inline rather than as its own
     * block - iterate by @type, never by index. */
    for (const n of nodes) {
      for (const m of [].concat(n?.hasMenu ?? [])) {
        if (m && typeof m === "object" && m.hasMenuSection) menus.push(m);
      }
    }
    if (!menus.length) continue;
    const rows = [];
    let multiOffer = 0;
    for (const menu of menus) {
      const got = rowsFromSchemaMenu(menu, collapse(decodeEntities(menu?.name)));
      multiOffer += got.multiOffer;
      rows.push(...got.rows);
    }
    const restaurant = nodes.find((n) => typeOf(n).some((t) => /Restaurant|FoodEstablishment/i.test(t)));
    if (rows.length > best.rows.length)
      best = {
        rows,
        url,
        address: collapse(restaurant?.address?.streetAddress) || null,
        multiOffer,
        place: {
          city: collapse(restaurant?.address?.addressLocality) || null,
          state: collapse(restaurant?.address?.addressRegion) || null,
        },
        payloadName: collapse(restaurant?.name) || null,
      };
  }
  if (!best.rows.length) return null;
  const notes = ["read from schema.org Menu JSON-LD on the restaurant's own page"];
  if (best.multiOffer) notes.push(`${best.multiOffer} items had several size offers, recorded at the lowest`);
  return {
    rows: best.rows,
    sourceUrl: best.url,
    address: best.address,
    place: best.place,
    payloadName: best.payloadName,
    /* An own-domain read has no platform vouching for it, so the identity
     * check has to be able to fall back to the name. */
    ownDomain: true,
    notes,
  };
}

/* -------------------------------------------------------- needs-a-browser */

/**
 * Platforms nobody has cracked from a plain fetch. Detected and recorded, not
 * attempted - every name here is a guess until someone curls it, which is why
 * the note names the platform rather than saying "blocked".
 */
const BROWSER_ONLY = [
  [/\.square\.site$/i, "Square Online storefront"],
  [/(^|\.)hungerrush\.com$/i, "HungerRush"],
  [/(^|\.)poppinpay\.com$/i, "PoppinPay"],
  [/(^|\.)mealkeyway\.com$/i, "MealKeyWay"],
  [/(^|\.)paytronix\.com$/i, "Paytronix"],
  [/(^|\.)olo\.com$/i, "Olo SPA needing a store pick"],
  [/(^|\.)agilysys\.com$/i, "Agilysys"],
  [/(^|\.)spoton\.com$/i, "SpotOn"],
  [/(^|\.)ordereze\.com$/i, "Ordereze"],
  [/(^|\.)menudrive\.com$/i, "MenuDrive"],
];

/*
 * Some of these platforms leave no host to match on, because the restaurant
 * runs them under its own domain - Square Online is the common one here, and
 * `portalcoffeesd.com` is entirely Square Online with no `.square.site`
 * anywhere in the page. The markup is the tell instead.
 */
const BROWSER_ONLY_MARKUP = [
  [/square-online-feature-flags|squareMerchantId|square-online-published-catalog/i, "Square Online (own domain)"],
  [/hungerrush|hrpos/i, "HungerRush"],
  [/poppinpay/i, "PoppinPay"],
  [/mealkeyway/i, "MealKeyWay"],
  [/paytronix/i, "Paytronix"],
  [/gloriafood/i, "GloriaFood widget"],
  [/menusifu/i, "MenuSifu"],
  [/spoton\.com|spotonordering/i, "SpotOn"],
];

function browserOnlyIn(allLinks, html) {
  for (const u of allLinks) {
    const h = hostOf(u);
    for (const [re, label] of BROWSER_ONLY) if (re.test(h)) return label;
  }
  for (const [re, label] of BROWSER_ONLY_MARKUP) if (re.test(html)) return label;
  return null;
}

/* =================================================================== router */

/** Detection order is the source ladder: the restaurant's own platforms first. */
const EXTRACTORS = [
  ["toast", extractToast],
  ["clover", extractClover],
  ["chownow", extractChowNow],
  ["menufy", extractMenufy],
  ["netwaiter", extractNetWaiter],
  ["popmenu", async (ctx) => (isPopmenu(ctx.homeBody) ? extractPopmenu(ctx) : null)],
  ["slice", extractSlice],
  ["kwickmenu", extractKwickmenu],
  ["spothopper", extractSpotHopper],
  ["owner", async (ctx) => (/owner\.com|ownerapp/i.test(ctx.homeBody) ? extractOwner(ctx) : null)],
  ["olo", extractOlo],
  ["own-jsonld", extractOwnJsonLd],
  ["shopify", async (ctx) => (/cdn\.shopify\.com|Shopify\.(shop|theme)/i.test(ctx.homeBody) ? extractShopify(ctx) : null)],
  ["wix", async (ctx) => (/Wix\.com Website Builder|static\.parastorage\.com|wix-code/i.test(ctx.homeBody) ? extractWix(ctx) : null)],
  ["order.online", extractDoorDash],
  /* Last of the readers, and deliberately: Uber Eats is a marketplace, so it
   * is only ever consulted when the restaurant's own platforms have nothing. */
  ["ubereats", extractUberEats],
  ["plain-html", detectPlainHtmlMenu],
];

/** Which platforms hide their catalog behind store-open status. */
const TIME_GATED = new Set(["toast", "clover", "order.online", "olo", "chownow", "ubereats"]);

const SUB_PAGES = ["/menu", "/menus", "/order", "/online-ordering", "/order-online", "/food"];

async function loadContext(website) {
  const starts = [];
  try {
    starts.push(new URL(website).toString());
  } catch {
    try {
      starts.push(new URL(`https://${website}`).toString());
    } catch {
      return { error: "unparseable website" };
    }
  }
  /* A listed `http://` that fails is often live on https. */
  const first = starts[0];
  if (first.startsWith("http://")) starts.push(first.replace(/^http:/, "https:"));

  let home = null;
  for (const url of starts) {
    const res = await get(url);
    if (res.ok && res.status < 400 && res.body) {
      home = res;
      break;
    }
    if (!home) home = res;
  }
  if (!home?.ok) return { error: home?.error ?? "fetch failed" };
  if (home.status >= 400) {
    const wall = botWall(home);
    return { error: wall ?? `HTTP ${home.status}` , wall };
  }

  const homeUrl = home.finalUrl;
  const homeBody = home.body;
  const allLinks = links(homeBody, homeUrl);

  /* Fetch the ordering sub-pages too. They are where a restaurant's own menu
   * markup and its ordering link usually live, and the homepage often carries
   * neither. */
  const menuPages = [];
  const origin = new URL(homeUrl).origin;
  const linked = new Set(
    allLinks
      .filter((u) => new URL(u).origin === origin && /\/(menus?|order|online-ordering|order-online)(\/|$)/i.test(u))
      .slice(0, 4),
  );
  for (const p of SUB_PAGES) linked.add(`${origin}${p}`);
  for (const url of [...linked].slice(0, 7)) {
    const res = await get(url);
    if (!res.ok || res.status >= 400 || !res.body) continue;
    menuPages.push({ url: res.finalUrl, body: res.body });
    for (const l of links(res.body, res.finalUrl)) allLinks.push(l);
  }

  return { homeUrl, homeBody, menuPages, allLinks: [...new Set(allLinks)], wall: botWall(home) };
}

/* ------------------------------------------------------------- the run loop */

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local.");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const queue = IDS
  ? await sql.query(
      `SELECT id, name, address, website, review_count FROM restaurants
        WHERE id = ANY($1::text[]) AND website IS NOT NULL
        ORDER BY review_count DESC NULLS LAST`,
      [IDS],
    )
  : await sql.query(
      `SELECT r.id, r.name, r.address, r.website, r.review_count
         FROM restaurants r
        WHERE r.hold_reason IS NULL
          AND r.website IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM menu_lookups m WHERE m.restaurant_id = r.id)
        ORDER BY r.review_count DESC NULLS LAST`,
    );

/*
 * Every city and neighbourhood the corpus covers - which is San Diego County,
 * and is therefore also the answer to "is this payload even in the right
 * part of the world". Read from the table rather than hardcoded so it cannot
 * drift away from what the corpus actually holds.
 */
const KNOWN_CITIES = new Set();
for (const row of await sql.query(
  `SELECT DISTINCT city, neighborhood FROM restaurants WHERE city IS NOT NULL OR neighborhood IS NOT NULL`,
)) {
  for (const v of [row.city, row.neighborhood]) if (v) KNOWN_CITIES.add(String(v).trim().toLowerCase());
}

const work = queue.slice(0, Number.isFinite(LIMIT) ? LIMIT : queue.length);
console.log(
  `queue ${queue.length} with a website; routing ${work.length}` +
    `${DRY ? " (dry - nothing will be written)" : ""} at concurrency ${CONCURRENCY}\n`,
);

const results = [];
const notes = [];
const tally = new Map();

/*
 * The outcome vocabulary, which is also the tally's column order.
 *
 * `screened-out` is one more than the brief asked for, and it earns its place:
 * a capture that `screen-menus.mjs` would quarantine for a platform fee or a
 * doubled catalog is neither "too few" nor "gated", and calling it either
 * would send the next wave looking for the wrong thing. The detail names which
 * test fired and what the multiplier was.
 */
const COLUMNS = [
  "attempted",
  "filed",
  "too-few",
  "gated",
  "wrong-branch",
  "needs-browser",
  "no-platform",
  "fetch-failed",
  "screened-out",
];

const bump = (platform, outcome) => {
  const key = platform ?? "none";
  const row = tally.get(key) ?? Object.fromEntries(COLUMNS.map((c) => [c, 0]));
  row.attempted++;
  if (outcome in row) row[outcome]++;
  tally.set(key, row);
};

/* Writes are serialised through one promise chain: four workers finish at
 * arbitrary moments and the file has to be a whole valid JSON document after
 * every one of them, so a crash costs one restaurant and not the run. */
let writeChain = Promise.resolve();
function persist() {
  writeChain = writeChain.then(async () => {
    await writeFile(RESULT_FILE, JSON.stringify(results, null, 2), "utf8");
    await writeFile(NOTES_FILE, JSON.stringify(notes, null, 2), "utf8");
  });
  return writeChain;
}

let done = 0;

async function route(r) {
  const id = String(r.id);
  const record = (platform, outcome, detail) => {
    notes.push({ restaurantId: id, name: r.name, website: r.website, platform: platform ?? null, outcome, detail });
    bump(platform, outcome);
  };

  const ctx = await loadContext(r.website);
  if (ctx.error) {
    if (ctx.wall) record(null, "needs-browser", `${ctx.wall} on ${r.website}`);
    else record(null, "fetch-failed", `${ctx.error} (${r.website})`);
    return;
  }

  /*
   * `restaurants.website` is a claim, not a fact. Some listed domains 301 into
   * directory farms and some are parked for sale, and both look like an
   * ordinary site that simply has no menu on it. Naming what actually happened
   * is the whole value of the notes file.
   */
  const homeHost = hostOf(ctx.homeUrl);
  if (BARRED_HOSTS.some((re) => re.test(homeHost))) {
    record(null, "no-platform", `listed website redirects to the barred directory farm ${homeHost}`);
    return;
  }
  if (/hugedomains\.com|sedoparking|afternic\.com|dan\.com|domain_profile/i.test(ctx.homeUrl)) {
    record(null, "no-platform", `listed website is a parked domain for sale (${ctx.homeUrl})`);
    return;
  }

  let platform = null;
  let got = null;
  for (const [name, fn] of EXTRACTORS) {
    let out;
    try {
      out = await fn(ctx);
    } catch (err) {
      record(name, "fetch-failed", `extractor threw: ${String(err?.message ?? err).slice(0, 120)}`);
      return;
    }
    if (!out) continue;
    platform = name;
    if (out.needsBrowser) {
      record(name, "needs-browser", out.needsBrowser);
      return;
    }
    if (out.retail) {
      record(name, "screened-out", out.retail);
      return;
    }
    got = out;
    break;
  }

  if (!got) {
    const browserOnly = browserOnlyIn(ctx.allLinks, ctx.homeBody);
    if (browserOnly) record(browserOnly, "needs-browser", `${browserOnly} detected; no fetchable payload`);
    else record(null, "no-platform", `no known platform on ${ctx.homeUrl}`);
    return;
  }

  const dishes = cleanRows(got.rows);
  const extras = [...(got.notes ?? [])];

  /*
   * IDENTITY, IN THREE FALLING-BACK TESTS. One branch's menu must never go
   * under another branch's id, and the payloads differ in what they will tell
   * you about themselves.
   *
   * 1. The street number, which is decisive when both sides have one.
   * 2. The city and state. This exists because of Cafe 86: Toast reported its
   *    address1 as "Country Club Drive" with no number at all, so test 1
   *    abstained, and both San Diego Cafe 86 records were filed with the CHINO
   *    HILLS branch's menu. The payload said "Chino Hills" in the next field.
   * 3. The name, and only when the payload offered no location whatsoever.
   *    `theburritofactory.shop` redirects to `koreanrestaurantlynchburg.com`,
   *    whose JSON-LD served 76 Indonesian dishes with no address anywhere -
   *    a hijacked domain, indistinguishable from a good capture by every other
   *    test here, and obvious the moment the name is compared to the host.
   *
   * Test 3 is deliberately confined to own-domain reads. On a real ordering
   * platform a name mismatch is routine and means nothing - Chauncey's
   * storefront is "Chauncey's Pizza & Bar", Ginger's is upstairs at barleymash
   * and shares its Toast account - and it is the address that settles those.
   */
  const ours = streetNumber(r.address);
  const theirs = streetNumber(got.address);
  if (ours && theirs && ours !== theirs) {
    record(platform, "wrong-branch", `payload address "${got.address}" vs our "${r.address}"`);
    return;
  }

  const payloadCity = collapse(got.place?.city);
  const payloadState = collapse(got.place?.state);
  if (payloadState && /^(CA|California)$/i.test(payloadState) === false) {
    record(platform, "wrong-branch", `payload is in ${payloadState}, not California (${got.sourceUrl})`);
    return;
  }
  if (!theirs && payloadCity && !KNOWN_CITIES.has(payloadCity.toLowerCase())) {
    record(
      platform,
      "wrong-branch",
      `payload city "${payloadCity}" is not a city in this corpus - a different branch of the same brand (${got.sourceUrl})`,
    );
    return;
  }

  if (!theirs && !payloadCity) {
    if (got.ownDomain && !namesOverlap(r.name, hostOf(got.sourceUrl)) && !namesOverlap(r.name, got.payloadName)) {
      record(
        platform,
        "wrong-branch",
        `no address in payload and nothing ties ${got.sourceUrl}` +
          `${got.payloadName ? ` ("${got.payloadName}")` : ""} to "${r.name}" - likely a hijacked or misfiled website`,
      );
      return;
    }
    extras.push("address unverified in payload");
  } else if (!theirs) {
    extras.push(`address unverified in payload; city "${payloadCity}" matched`);
  }

  /* A closed store and a small menu look identical from the outside, so on the
   * platforms that gate by store status, a handful of rows is a time gate
   * rather than a verdict. */
  if (dishes.length < 5 && (got.gateable || TIME_GATED.has(platform))) {
    record(
      platform,
      "gated",
      `only ${dishes.length} priced items from ${got.sourceUrl} at ${new Date().toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles" })} PT - possible time gate, re-run in daylight`,
    );
    return;
  }
  if (dishes.length < MIN_DISHES) {
    record(platform, "too-few", `${dishes.length} priced items from ${got.sourceUrl}${got.partial ? " (partial payload)" : ""}`);
    return;
  }
  if (got.partial) {
    record(platform, "too-few", `partial payload: ${dishes.length} rows but the catalog lists more - ${got.sourceUrl}`);
    return;
  }
  if (got.dayparted) {
    record(
      platform,
      "gated",
      `${dishes.length} priced items, but the payload is daypart-filtered (respectAvailability) - this is one ` +
        `serving period of several, not the whole menu. Re-read inside the other windows. ${got.sourceUrl}`,
    );
    return;
  }

  /* The screen would reject this, and a quarantined entry costs the next wave
   * a queue slot to rediscover the same fee. Say what it is instead. */
  const rejection = screenWouldReject(dishes, hostOf(got.sourceUrl));
  if (rejection) {
    record(platform, "screened-out", `${rejection} - ${got.sourceUrl}`);
    return;
  }

  results.push({
    restaurantId: id,
    name: r.name,
    sourceUrl: got.sourceUrl,
    confidence: "high",
    notes: `read deterministically by scripts/route-menus.mjs from the ${platform} payload. ${extras.join("; ")}`.trim(),
    dishes,
  });
  record(platform, "filed", `${dishes.length} dishes from ${got.sourceUrl}`);
}

async function worker(queueRef) {
  for (;;) {
    const r = queueRef.shift();
    if (!r) return;
    try {
      await route(r);
    } catch (err) {
      notes.push({
        restaurantId: String(r.id),
        name: r.name,
        website: r.website,
        platform: null,
        outcome: "fetch-failed",
        detail: `router threw: ${String(err?.message ?? err).slice(0, 140)}`,
      });
      bump(null, "fetch-failed");
    }
    /* Read the counter before awaiting: another worker will have moved it on
     * by the time the write settles, and two lines printing the same number is
     * exactly the kind of small lie that makes a long run hard to follow. */
    const n = ++done;
    const last = notes[notes.length - 1];
    await persist();
    console.log(
      `[${String(n).padStart(4)}/${work.length}] ${last.outcome.padEnd(13)} ${(last.platform ?? "-").padEnd(12)} ${r.name}`,
    );
  }
}

const pending = [...work];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(pending)));
await persist();
await writeChain;

/* ------------------------------------------------------------------ report */

const rowsOut = [...tally.entries()].sort((a, b) => b[1].attempted - a[1].attempted);
const width = Math.max(12, ...rowsOut.map(([k]) => k.length));

const cell = (s) => String(s).padStart(14);
console.log(`\n${"platform".padEnd(width)}${COLUMNS.map(cell).join("")}`);
for (const [k, v] of rowsOut) {
  console.log(`${k.padEnd(width)}${COLUMNS.map((c) => cell(v[c] ?? 0)).join("")}`);
}
const totals = Object.fromEntries(COLUMNS.map((c) => [c, rowsOut.reduce((s, [, v]) => s + (v[c] ?? 0), 0)]));
console.log(`${"TOTAL".padEnd(width)}${COLUMNS.map((c) => cell(totals[c])).join("")}`);

const dishTotal = results.reduce((s, e) => s + e.dishes.length, 0);
console.log(
  `\n${results.length} menus, ${dishTotal} dishes` +
    (DRY ? " (dry run - written to the scratch dir, not menus/wip)" : "") +
    `\nwrote ${RESULT_FILE}\nwrote ${NOTES_FILE}`,
);
