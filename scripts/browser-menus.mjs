/**
 * Browser pass over the router's `needs-browser` pile - one local Chromium,
 * one restaurant at a time.
 *
 *   node --env-file=.env.local scripts/browser-menus.mjs --from menus/wip/router-20260902-225304.notes.json --dry --limit 3
 *   node --env-file=.env.local scripts/browser-menus.mjs --from menus/wip/router-<stamp>.notes.json --limit 8
 *   node --env-file=.env.local scripts/browser-menus.mjs --from <notes> --ids 3517,3592 --headed
 *
 * `scripts/route-menus.mjs` reads a menu with curl when the catalog is in the
 * served bytes. 148 rows of its last run were not: Square Online, order.online
 * brand pages, Toast deployments that fetch their catalog client-side,
 * MealKeyWay, SpotOn, Paytronix. Those storefronts assemble the menu with
 * JavaScript, or refuse to say which branch they are until a store is picked.
 * This script drives them in a real browser, records every response, and reads
 * the priced payload out of the network traffic.
 *
 * ## What it must never do
 *
 * - **Never touch the shared browser pane.** It launches its own headless
 *   Chromium through Playwright. The pane is Calvin's; a script that navigates
 *   it steals the window out from under a person.
 * - **Never construct a price.** Every figure is a field read out of a captured
 *   payload or a string read off the rendered DOM. Nothing is divided,
 *   averaged, marked up or inferred from a pattern. The one thing this script
 *   decides for itself is which UNIT a numeric field is written in (dollars or
 *   minor units), and it decides that from the values at that JSON path taken
 *   together - see `resolveUnits`. Reading `1250` as `$12.50` is reading a
 *   representation; turning `$12.50` into `$13.00` would be constructing.
 * - **Never submit an age gate, a login, an email, a birthdate, or terms.** A
 *   store pick is not personal data and is allowed (RUNBOOK section 8). Anything
 *   that asks who the visitor IS is not. When one of those blocks the menu the
 *   outcome is `gate-personal` and the restaurant moves on untouched.
 * - **Never write an entry for a failure.** Same asymmetry as the router, for
 *   the same reason: an entry with `dishes: []` loads as a permanent
 *   `not_found` and removes the restaurant from the project forever, and a
 *   browser failure is a fact about this script, not about the restaurant.
 *   Failures write a notes row; the restaurant stays in the queue.
 *
 * ## The output that matters is `curlReproducible`
 *
 * The browser is expensive and serial. Its real product is a recipe: when the
 * request that carried the menu turns out to work with no cookies and no
 * per-session token, that platform can be promoted into the router and every
 * other branch on it becomes free. So each menu-bearing response is REPLAYED
 * with a bare curl - no cookie jar, no referer, no session - and
 * `curlReproducible` records whether the replay came back with the same
 * catalog. `curlNote` carries the request shape to write into PLAYBOOK.md
 * section 9.
 *
 * ## Chains first
 *
 * `--chains-first` is on by default: the list is sorted by how many rows in
 * `restaurants` share the same normalised name. The needs-browser pile is
 * mostly store-pick storefronts belonging to chains, and one cracked storefront
 * plus `share-chain-menus.mjs` fills every branch.
 *
 * The dish-hygiene and screen-prediction helpers below are COPIED from
 * `scripts/route-menus.mjs` rather than imported: that module opens a Neon
 * connection and runs its whole queue at import time, so importing it would run
 * a router pass. Keep the two copies in step - route-menus.mjs is the original.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { neon } from "@neondatabase/serverless";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);

/* ------------------------------------------------------------------ flags */

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const val = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 || i + 1 >= argv.length ? fallback : argv[i + 1];
};

const FROM = val("from");
const DRY = has("dry");
const HEADED = has("headed");
const LIMIT = val("limit") ? Number(val("limit")) : Infinity;
const IDS = val("ids") ? String(val("ids")).split(",").map((s) => s.trim()).filter(Boolean) : null;
const MIN_DISHES = val("min-dishes") ? Number(val("min-dishes")) : 5;
/* On by default. `--no-chains-first` restores notes-file order, which is
 * review-count order and is what you want when chasing one restaurant. */
const CHAINS_FIRST = !has("no-chains-first");

const SCRATCH = "C:/Users/Calvin  Lensink/AppData/Local/Temp/claude/browser-menus";
const WIP = "menus/wip";

const STAMP = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
const OUT_DIR = DRY ? SCRATCH : WIP;
const RESULT_FILE = `${OUT_DIR}/browser-${STAMP}.json`;
const NOTES_FILE = `${OUT_DIR}/browser-${STAMP}.notes.json`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const PAGE_MS = 30_000;
/* A storefront that fetches its catalog client-side needs a beat after load
 * before the catalog request has even been made, let alone answered. */
const SETTLE_MS = 6_000;
const MAX_BODY = 12 * 1024 * 1024;

if (!FROM) {
  console.error("Usage: node --env-file=.env.local scripts/browser-menus.mjs --from menus/wip/router-<stamp>.notes.json");
  process.exit(1);
}

/* ------------------------------------- helpers copied from route-menus.mjs */
/* Keep in step with the originals; see the header note on why not imported. */

const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "\u2013", mdash: "\u2014",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d", hellip: "\u2026", eacute: "\u00e9",
  egrave: "\u00e8", agrave: "\u00e0", ccedil: "\u00e7", ntilde: "\u00f1", uuml: "\u00fc", ouml: "\u00f6",
  auml: "\u00e4", iacute: "\u00ed", oacute: "\u00f3", uacute: "\u00fa", aacute: "\u00e1", deg: "\u00b0",
};

const decodeEntities = (s) =>
  String(s ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([A-Za-z]+);/g, (whole, word) => {
      const lower = word.toLowerCase();
      if (!(lower in NAMED)) return whole;
      const ch = NAMED[lower];
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

/**
 * Balance braces from an opening `{`. Matching to a closing token instead is
 * how the router's `__OO_STATE__` parser once returned truncated menus that
 * looked like small ones.
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
 * Every `123 Something St, City, ST` line printed on a rendered page.
 *
 * The payload check below only works when there IS a payload. A DOM read has
 * no `address1` field to compare, and the browser pass follows links onto
 * other hosts, which is exactly when a branch swap happens: the first real run
 * of this script followed a Square Online link to `cvpasadena.square.site` and
 * was about to file a PASADENA menu under a San Diego record. The footer of
 * that page says where it is; this reads it.
 */
function addressesInPageText(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(
    /(\d{2,6})\s+[^,\n]{3,44},\s*([A-Za-z][A-Za-z .'-]{2,25}),\s*([A-Z]{2})\b/g,
  )) {
    out.push({ number: m[1], city: collapse(m[2]), state: m[3] });
  }
  return out;
}

/** Any street-looking address line in a payload, escaped or not. */
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

const BARRED_HOSTS = [
  /(^|\.)yelp\.com$/i, /(^|\.)locallya\.com$/i, /(^|\.)placejoys\.com$/i, /(^|\.)bestcafes\.online$/i,
  /(^|\.)weeblyte\.com$/i, /(^|\.)gotoeat\.net$/i, /(^|\.)foodjoyy\.com$/i, /(^|\.)cafes-guide\.com$/i,
  /(^|\.)poi\.place$/i, /(^|\.)edan\.io$/i, /\.top$/i,
];

const UNTRUSTED_HOSTS = [
  /(^|\.)menupedia\./i, /(^|\.)allmenus\.com$/i, /(^|\.)menuswithprice\./i, /(^|\.)pricelisto\./i,
  /(^|\.)menuandprice/i, /(^|\.)restaurantguru\.com$/i, /(^|\.)beyondmenu\.com$/i,
  /(^|\.)menupages\.com$/i, /(^|\.)sagemenu\./i,
];

/** The three tests of `scripts/screen-menus.mjs` that can be run in advance. */
function screenWouldReject(dishes, host) {
  if (BARRED_HOSTS.some((re) => re.test(host))) return `barred source host (${host})`;
  if (UNTRUSTED_HOSTS.some((re) => re.test(host))) return `untrusted aggregator (${host})`;

  const all = dishes
    .map((d) => parseFloat(String(d.price).replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);

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

/* ---------------------------------------------------- reading a JSON catalog */

const NAME_KEYS = ["name", "title", "itemName", "item_name", "displayName", "display_name", "label", "productName", "product_name"];
const DESC_KEYS = ["description", "desc", "itemDescription", "item_description", "subtitle", "shortDescription", "caption"];
const SECTION_KEYS = ["name", "title", "categoryName", "category_name", "menuName", "menu_name", "groupName", "sectionName"];
/* Keys whose value is a list of things that might be menu items. Only used to
 * carry a section name down; every object is inspected regardless. */
const CHILD_KEYS = /^(items|entries|products|menuItems|menu_items|dishes|children|options|elements|foods|objects|data|list|results|records|variations|modifiers|categories|sections|groups|menus|itemGroups|item_groups|menuGroups|subCategories|hasMenuSection|hasMenuItem|hasMenuElement|menuSection)$/i;

/* `offers` and `priceSpecification` are schema.org: an Olo location page ships
 * a full `Menu` graph in a ld+json tag, which is a priced catalog in the served
 * HTML and therefore a router recipe rather than a browser one. */
const PRICE_KEYS = /^(price|prices|basePrice|base_price|defaultPrice|default_price|unitPrice|unit_price|amount|value|cost|itemPrice|item_price|menuItemPrice|priceMoney|price_money|minPrice|min_price|startingPrice|priceRange|displayPrice|display_price|formattedPrice|formatted_price|priceText|price_text|priceInCents|price_in_cents|amountCents|amount_cents|priceCents|price_cents|amountMicros|offers|priceSpecification)$/i;

const MINOR_KEY = /cents|micros|minor/i;
const CURRENCY_KEY = /^(currency|currencyCode|currency_code|currencyUnit|iso_currency)$/i;

/**
 * A price candidate lifted off one object.
 *
 * Returns `{ unit, value, pathKey }` where `unit` is one of
 *   'text'    - a string with a currency figure in it; read verbatim
 *   'minor'   - definitely minor units, because the payload says so (a
 *               `{amount, currency}` money object, or a `*Cents` key)
 *   'num'     - a bare number whose unit the payload does not state. Left
 *               undecided here and settled per JSON path by `resolveUnits`.
 * and never invents a figure.
 */
function priceIn(obj, pathPrefix) {
  for (const [k, v] of Object.entries(obj)) {
    if (!PRICE_KEYS.test(k)) continue;
    const pathKey = `${pathPrefix}.${k}`;

    if (typeof v === "string") {
      if (!/\d/.test(v)) continue;
      /* "$12.00 - $18.00" is a range, not a price. Refuse it rather than
       * silently taking one end. */
      if ((v.match(/\d+(\.\d+)?/g) ?? []).length > 1 && /[-\u2013to]/i.test(v)) continue;
      return { unit: "text", value: v, pathKey };
    }
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      return { unit: MINOR_KEY.test(k) ? "minor" : "num", value: v, pathKey };
    }
    if (v && typeof v === "object") {
      /* A money object: `{amount: 1250, currency: "USD"}`, or schema.org's
       * `offers: {price: "29.95", priceCurrency: "USD"}`. When the amount is
       * written as a STRING the payload has already chosen a unit and printed
       * it, so it is read verbatim; a numeric amount beside a currency field is
       * the payload declaring minor units. */
      const inner = Object.entries(Array.isArray(v) ? (v[0] ?? {}) : v);
      const text = inner.find(([ik, iv]) => /^(amount|value|price|units)$/i.test(ik) && typeof iv === "string" && /\d/.test(iv));
      if (text) {
        /* A string with no decimal point has not chosen a unit after all
         * ("1250" beside `currency` is cents) - hand it to `resolveUnits`. */
        const bare = text[1].trim();
        if (/^\d+$/.test(bare)) return { unit: "num", value: Number(bare), pathKey: `${pathKey}.${text[0]}` };
        return { unit: "text", value: bare, pathKey: `${pathKey}.${text[0]}` };
      }
      const amount = inner.find(([ik, iv]) => /^(amount|value|price|units)$/i.test(ik) && typeof iv === "number" && iv > 0);
      if (!amount) continue;
      const hasCurrency = inner.some(([ik]) => CURRENCY_KEY.test(ik));
      const minor = hasCurrency || MINOR_KEY.test(amount[0]) || MINOR_KEY.test(k);
      return { unit: minor ? "minor" : "num", value: amount[1], pathKey: `${pathKey}.${amount[0]}` };
    }
  }
  return null;
}

const strAt = (obj, keys) => {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim() && v.trim().length <= 200) return v;
  }
  return null;
};

/**
 * Walk a decoded JSON payload and pull out every `{name, price}` pair it
 * carries, remembering the JSON path each price came from.
 */
function candidatesFrom(root) {
  const out = [];
  const seen = new Set();
  const walk = (node, pathPrefix, section, depth) => {
    if (!node || typeof node !== "object" || depth > 14 || out.length > 20_000) return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const child of node) walk(child, pathPrefix, section, depth + 1);
      return;
    }

    const name = strAt(node, NAME_KEYS);
    const price = priceIn(node, pathPrefix);
    if (name && price) {
      out.push({
        name,
        description: strAt(node, DESC_KEYS) ?? "",
        section: section ?? "",
        unit: price.unit,
        value: price.value,
        pathKey: price.pathKey,
      });
    }

    /* This object names a group if it holds a list of children; its name
     * becomes the section for everything under it. */
    const ownSection = strAt(node, SECTION_KEYS);
    for (const [k, v] of Object.entries(node)) {
      if (!v || typeof v !== "object") continue;
      const isGroup = Array.isArray(v) && CHILD_KEYS.test(k);
      walk(v, `${pathPrefix}.${k}`, isGroup && ownSection && !price ? ownSection : section, depth + 1);
    }
  };
  walk(root, "$", null, 0);
  return out;
}

/**
 * Settle the unit of every bare numeric price path, from the values at that
 * path taken together. This is the only inference in the script and it decides
 * a REPRESENTATION, never a figure.
 *
 *   - any fractional value at the path  -> the path is written in dollars
 *     (a payload does not write 1250.5 cents)
 *   - all integers, median >= 100       -> minor units; $1.00-and-up menus do
 *     not price every item at a whole hundred dollars
 *   - all integers, median < 100        -> dollars, a whole-dollar menu
 */
function resolveUnits(cands) {
  const byPath = new Map();
  for (const c of cands) {
    if (c.unit !== "num") continue;
    if (!byPath.has(c.pathKey)) byPath.set(c.pathKey, []);
    byPath.get(c.pathKey).push(c.value);
  }
  const unitFor = new Map();
  for (const [p, vals] of byPath) {
    const fractional = vals.some((v) => Math.abs(v - Math.round(v)) > 1e-9);
    if (fractional) {
      unitFor.set(p, "dollars");
      continue;
    }
    const sorted = [...vals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    unitFor.set(p, median >= 100 ? "minor" : "dollars");
  }
  return unitFor;
}

/**
 * Every JSON root a response body carries, whatever wrapper it arrived in.
 *
 * Three wrappers, because the needs-browser pile uses all three: a plain JSON
 * API answer; an RSC / Flight stream, which is a sequence of `N:{...}` lines
 * each of which is read on its own and never stitched to its neighbour; and an
 * HTML document that embeds its catalog in a script tag or a global. Square
 * Online is the last of those - the router calls it "no fetchable payload"
 * because the catalog is inside the page rather than behind an API.
 */
function parseRoots(body) {
  const roots = [];
  try {
    roots.push(JSON.parse(body));
    return roots;
  } catch { /* not a bare JSON document */ }

  for (const m of body.matchAll(/^[0-9a-f]+:(?:[A-Z]\[)?(\{[\s\S]*?\}|\[[\s\S]*?\])\s*$/gm)) {
    try { roots.push(JSON.parse(m[1])); } catch { /* a partial chunk */ }
  }
  if (roots.length) return roots;

  if (!/<script|<html/i.test(body)) return roots;

  for (const m of body.matchAll(
    /<script[^>]+type=["'](?:application\/json|application\/ld\+json)["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try { roots.push(JSON.parse(m[1].trim())); } catch { /* not valid on its own */ }
  }

  /* A global assignment whose name suggests a preloaded catalog. The brace
   * balancer, not a lazy regex - a truncated object reads as a small menu. */
  const ASSIGN =
    /(?:window|self|globalThis)\.(?:__)?[A-Za-z_$][\w$]*(?:DATA|STATE|CONFIG|PRELOAD|APOLLO|STORE|MENU|ITEMS|CATALOG|SITE|PAGE|PROPS)[\w$]*(?:__)?\s*=\s*\{/gi;
  for (const m of body.matchAll(ASSIGN)) {
    const slice = sliceObject(body, body.indexOf("{", m.index));
    if (!slice || slice.length < 200) continue;
    try { roots.push(JSON.parse(slice)); } catch { /* it is JS, not JSON */ }
  }
  return roots;
}

/** Candidates -> priced rows, with nothing constructed. */
function rowsFromCandidates(cands) {
  const unitFor = resolveUnits(cands);
  const rows = [];
  for (const c of cands) {
    let price = null;
    if (c.unit === "text") price = moneyFromText(c.value);
    else if (c.unit === "minor") price = money(c.value / 100);
    else price = unitFor.get(c.pathKey) === "minor" ? money(c.value / 100) : money(c.value);
    if (!price) continue;
    rows.push({ name: c.name, description: c.description, price, section: c.section });
  }
  return rows;
}

/* ------------------------------------------------ reading the rendered DOM */

/*
 * The fallback, and only ever the fallback: a JSON catalog says what a field
 * MEANS and the DOM only says what it looks like. Runs in the page, pairs each
 * element whose own text is exactly a price with the nearest ancestor that also
 * holds a name, and takes the section from the nearest preceding heading.
 */
function domScrape() {
  const PRICE = /^\s*\$\s?(\d{1,4}(?:\.\d{2})?)\s*$/;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length > 0) continue;
    const txt = (el.textContent || "").trim();
    const m = txt.match(PRICE);
    if (!m) continue;
    let box = el;
    let name = "";
    let desc = "";
    for (let i = 0; i < 5 && box; i++) {
      box = box.parentElement;
      if (!box) break;
      const parts = [];
      for (const kid of box.querySelectorAll("*")) {
        if (kid.children.length > 0) continue;
        const t = (kid.textContent || "").trim();
        if (!t || PRICE.test(t) || t.length > 200) continue;
        parts.push(t);
      }
      if (parts.length) {
        name = parts[0];
        desc = parts.slice(1).filter((p) => p.length > 12).join(" ");
        break;
      }
    }
    if (!name || name.length < 2 || name.length > 120) continue;
    let section = "";
    let probe = el;
    outer: while (probe) {
      let sib = probe.previousElementSibling;
      while (sib) {
        const h = sib.matches("h1,h2,h3,h4") ? sib : sib.querySelector("h1,h2,h3,h4");
        if (h && (h.textContent || "").trim()) {
          section = (h.textContent || "").trim();
          break outer;
        }
        sib = sib.previousElementSibling;
      }
      probe = probe.parentElement;
    }
    /* `m[1]` is the figure printed on the page. `toFixed(2)` normalises "$12"
     * to "$12.00" so it passes PRICE_RE - it does not change the number. */
    out.push({ name, description: desc, price: "$" + Number(m[1]).toFixed(2), section: section.slice(0, 90) });
  }
  return out;
}

/* ------------------------------------------------------ gates and pickers */

/*
 * What is on this page that stops a menu being read, and is it a store pick
 * (allowed) or a question about who the visitor is (never answered)?
 */
function gateProbe() {
  const text = (document.body ? document.body.innerText : "").slice(0, 20000);
  const personal =
    !!document.querySelector("input[type=password]") ||
    /date of birth|birthdate|birth date|are you (?:21|18)|21 or older|18 or older|verify your age|enter your age/i.test(text) ||
    /sign in to (?:view|see|continue|order)|log in to (?:view|see|continue|order)|create an account to/i.test(text) ||
    /accept (?:the )?(?:terms|cookies) to (?:continue|view)/i.test(text);
  const picker =
    /(?:choose|select|pick|find) (?:a |your |the )?(?:location|store|restaurant|branch)/i.test(text) ||
    /enter (?:your )?(?:address|zip|postal)/i.test(text) ||
    /\b(?:order|delivery) (?:from|to)\b.{0,40}\baddress\b/i.test(text);
  const prices = (text.match(/\$\s?\d/g) || []).length;
  return { personal, picker, prices, chars: text.length };
}

/**
 * Pick a store, by street number first and ZIP second. Both are facts about
 * the RESTAURANT, not about a person; RUNBOOK section 8 allows this and allows
 * nothing else to be typed into a form.
 */
async function pickStore(page, r, log) {
  const num = streetNumber(r.address);
  const zip = String(r.address ?? "").match(/\b(9\d{4})\b/)?.[1] ?? null;

  /* 1. A list of branches already on the page. */
  if (num) {
    for (const sel of ["a", "button", "[role=button]", "li"]) {
      const hit = page.locator(sel, { hasText: new RegExp(`\\b${num}\\b`) }).first();
      if ((await hit.count()) > 0) {
        try {
          await hit.click({ timeout: 5_000 });
          log(`store picked by street number ${num}`);
          await page.waitForTimeout(SETTLE_MS);
          return `clicked a branch matching street number ${num}`;
        } catch { /* covered by an overlay; fall through to the search box */ }
      }
    }
  }

  /* 1b. A branch list rendered as links, where the street number is in the
   * href rather than in the text. Matching on the number and nothing else is
   * what keeps this from picking a neighbouring branch. */
  if (num) {
    let href = null;
    try {
      href = await page.evaluate(
        (n) =>
          [...document.querySelectorAll("a[href]")]
            .map((a) => a.href)
            .find((h) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(h)) ?? null,
        num,
      );
    } catch { /* no anchors to read */ }
    if (href) {
      try {
        await page.goto(href, { waitUntil: "domcontentloaded", timeout: PAGE_MS });
        await page.waitForTimeout(SETTLE_MS);
        log(`store picked by street number ${num} in the link`);
        return `opened the branch link carrying street number ${num}`;
      } catch { /* fall through to the search box */ }
    }
  }

  /* 2. A search box. Address, then ZIP - never anything else. */
  const box = page
    .locator(
      "input[placeholder*='address' i], input[placeholder*='zip' i], input[placeholder*='postal' i], " +
        "input[placeholder*='location' i], input[name*='address' i], input[name*='zip' i], " +
        "input[aria-label*='address' i], input[aria-label*='zip' i]",
    )
    .first();
  if ((await box.count()) > 0) {
    const typed = zip ?? collapse(r.address);
    if (!typed) return null;
    try {
      await box.click({ timeout: 5_000 });
      await box.fill(typed, { timeout: 5_000 });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(SETTLE_MS);
      if (num) {
        const hit = page.locator("a,button,li", { hasText: new RegExp(`\\b${num}\\b`) }).first();
        if ((await hit.count()) > 0) {
          await hit.click({ timeout: 5_000 });
          await page.waitForTimeout(SETTLE_MS);
        }
      }
      log(`store searched by ${zip ? "ZIP" : "address"}`);
      return `typed ${zip ? `ZIP ${zip}` : "the record's street address"} into the store search`;
    } catch { /* the picker is not one we know how to drive */ }
  }
  return null;
}

/**
 * When the landing page is a brand page rather than a storefront, the menu is
 * one link away and the link names the branch. Follows at most one, and only a
 * same-host link that scores on the street number, the city, or an unambiguous
 * "menu" word - never a search result and never an outbound link.
 */
async function followMenuLink(page, r, log) {
  const num = streetNumber(r.address);
  const here = page.url();
  const host = hostOf(here);
  let anchors = [];
  try {
    anchors = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")]
        .map((a) => ({ href: a.href, text: (a.textContent || "").trim().slice(0, 120) }))
        .slice(0, 600),
    );
  } catch {
    return null;
  }
  /* Same host, or an ordering platform the project already knows by name -
   * "Order online" on a restaurant's own site is nearly always an outbound
   * link to one of these, and that page is the menu. */
  const PLATFORM_HOSTS =
    /(^|\.)(square\.site|toasttab\.com|order\.online|doordash\.com|chownow\.com|clover\.com|cloveronline\.com|spotonorder\.com|spoton\.com|mealkeyway\.com|olo\.com|popmenu\.com|slicelife\.com|menufy\.com|owner\.com|ordering\.app|toasttab\.online)$/i;

  const scored = anchors
    .filter((h) => {
      if (!/^https?:/.test(h.href)) return false;
      if (h.href.split("#")[0] === here.split("#")[0]) return false;
      const hh = hostOf(h.href);
      return hh === host || PLATFORM_HOSTS.test(hh);
    })
    .map((h) => {
      let s = 0;
      if (num && (h.href.includes(num) || h.text.includes(num))) s += 5;
      if (PLATFORM_HOSTS.test(hostOf(h.href))) s += 4;
      if (r.city && new RegExp(String(r.city).replace(/\s+/g, "[-\\s]?"), "i").test(h.href)) s += 3;
      if (/\/(menus?|order|store|shop|locations?)(\/|$|\?)/i.test(h.href)) s += 2;
      if (/^(view )?menus?$|^order (now|online)$|^shop$/i.test(h.text)) s += 2;
      return { h, s };
    })
    .filter((x) => x.s >= 4)
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return null;
  try {
    await page.goto(scored[0].h.href, { waitUntil: "domcontentloaded", timeout: PAGE_MS });
    await page.waitForTimeout(SETTLE_MS);
    log(`followed the branch link ${scored[0].h.href}`);
    return `followed ${scored[0].h.href} from the landing page`;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------- curl replay test */

/*
 * Replay the menu request with nothing a session gives you - no cookies, no
 * referer, no auth header. If the catalog comes back anyway, this platform can
 * move into the router and stop costing a browser launch per branch.
 */
async function curlReplays(cap, sampleNames) {
  const args = [
    "-sS", "-o", "-", "-w", "\\n__STATUS__%{http_code}", "--max-time", "25",
    "--compressed", "-A", UA, "-H", "Accept: application/json,text/html,text/plain,*/*",
  ];
  if (cap.method !== "GET") args.push("-X", cap.method);
  if (cap.postData) {
    args.push("--data-binary", cap.postData);
    const ct = cap.reqContentType ?? "application/json";
    args.push("-H", `Content-Type: ${ct}`);
  }
  args.push(cap.url);
  try {
    const { stdout } = await execFileAsync("curl", args, { maxBuffer: 64 * 1024 * 1024, timeout: 30_000 });
    const status = Number(stdout.match(/__STATUS__(\d+)\s*$/)?.[1] ?? 0);
    const body = stdout.replace(/\n__STATUS__\d+\s*$/, "");
    if (status < 200 || status >= 300) return { ok: false, note: `curl replay returned HTTP ${status}` };
    const hits = sampleNames.filter((n) => body.includes(n)).length;
    if (hits >= Math.max(2, Math.ceil(sampleNames.length * 0.5)))
      return { ok: true, note: `curl replay (no cookies, no auth) returned ${hits}/${sampleNames.length} sampled dish names` };
    return { ok: false, note: `curl replay returned HTTP 200 but only ${hits}/${sampleNames.length} sampled dish names - the catalog is session-bound` };
  } catch (err) {
    return { ok: false, note: `curl replay failed: ${String(err?.message ?? err).slice(0, 120)}` };
  }
}

/* ---------------------------------------------------------- the run loop */

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local.");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const noteRows = JSON.parse(await readFile(FROM, "utf8"));
const wanted = noteRows.filter(
  (n) => (n.outcome === "needs-browser" || n.outcome === "gated") && (!IDS || IDS.includes(String(n.restaurantId))),
);
const ids = [...new Set(wanted.map((n) => String(n.restaurantId)))];
if (ids.length === 0) {
  console.error(`no needs-browser or gated rows in ${FROM}${IDS ? " matching --ids" : ""}`);
  process.exit(1);
}

const records = await sql.query(
  `SELECT id, name, address, city, website FROM restaurants WHERE id = ANY($1::text[])`,
  [ids],
);
const byId = new Map(records.map((r) => [String(r.id), r]));

/* How many branches share this name - the chain weight `--chains-first` sorts
 * on, and the same normalisation `share-chain-menus.mjs` groups by. */
const normalise = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const chainSize = new Map();
for (const row of await sql.query(`SELECT name FROM restaurants`)) {
  const k = normalise(row.name);
  chainSize.set(k, (chainSize.get(k) ?? 0) + 1);
}

/*
 * Every city and neighbourhood the corpus covers - read from the table so it
 * cannot drift away from what the corpus actually holds. This is the answer to
 * "is the storefront I ended up on even in the right part of the world".
 */
const KNOWN_CITIES = new Set();
for (const row of await sql.query(
  `SELECT DISTINCT city, neighborhood FROM restaurants WHERE city IS NOT NULL OR neighborhood IS NOT NULL`,
)) {
  for (const v of [row.city, row.neighborhood]) if (v) KNOWN_CITIES.add(String(v).trim().toLowerCase());
}

/**
 * Where to open. The notes row's `detail` often names the platform URL the
 * router got as far as - `order.online/business/...`, the Toast storefront -
 * and that is a much better starting point than the brand's home page.
 */
const platformUrlIn = (detail) => {
  const urls = String(detail ?? "").match(/https?:\/\/[^\s)"'<>]+/g) ?? [];
  const useful = urls.filter((u) => !/^https?:\/\/order\.online\/?$/i.test(u));
  return useful.length ? useful[useful.length - 1].replace(/[.,]$/, "") : null;
};

let work = wanted
  .map((n) => {
    const rec = byId.get(String(n.restaurantId));
    if (!rec) return null;
    return {
      id: String(n.restaurantId),
      name: rec.name,
      address: rec.address,
      city: rec.city,
      platform: n.platform ?? null,
      routerDetail: n.detail ?? "",
      target: platformUrlIn(n.detail) ?? rec.website ?? n.website,
      chain: chainSize.get(normalise(rec.name)) ?? 1,
    };
  })
  .filter((w) => w && w.target);

if (CHAINS_FIRST) work.sort((a, b) => b.chain - a.chain);
work = work.slice(0, Number.isFinite(LIMIT) ? LIMIT : work.length);

await mkdir(OUT_DIR, { recursive: true });
await mkdir(SCRATCH, { recursive: true });

console.log(
  `${wanted.length} needs-browser/gated rows in ${FROM}; opening ${work.length}` +
    `${DRY ? " (dry - files go to the scratch dir)" : ""}${CHAINS_FIRST ? ", chains first" : ""}\n`,
);

const results = [];
const notes = [];

async function persist() {
  await writeFile(RESULT_FILE, JSON.stringify(results, null, 2), "utf8");
  await writeFile(NOTES_FILE, JSON.stringify(notes, null, 2), "utf8");
}

const browser = await chromium.launch({ headless: !HEADED });

/** One restaurant: one context, one page, one verdict. */
async function visit(r) {
  const dir = path.join(SCRATCH, r.id);
  await mkdir(dir, { recursive: true });

  const trail = [];
  const log = (s) => trail.push(s);

  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });
  context.setDefaultTimeout(PAGE_MS);
  const page = await context.newPage();

  /* Every response, with enough of the request to say later whether curl could
   * have made it on its own. */
  const captures = [];
  const index = [];
  page.on("response", async (res) => {
    const req = res.request();
    const url = res.url();
    const ct = String(res.headers()["content-type"] ?? "");
    index.push({ url, status: res.status(), contentType: ct, method: req.method() });
    if (!/json|text\/x-component|javascript|graphql|text\/plain|text\/html/i.test(ct)) return;
    if (/\.(png|jpe?g|gif|webp|svg|woff2?|css)(\?|$)/i.test(url)) return;
    let body;
    try {
      const buf = await res.body();
      if (!buf || buf.length > MAX_BODY || buf.length < 40) return;
      body = buf.toString("utf8");
    } catch {
      return;
    }
    if (!/\$?\d/.test(body)) return;
    let headers = {};
    try {
      headers = await req.allHeaders();
    } catch { /* the request is gone; the shape below just degrades */ }
    captures.push({
      url,
      method: req.method(),
      status: res.status(),
      contentType: ct,
      reqContentType: headers["content-type"] ?? null,
      postData: req.postData() ?? null,
      sentCookie: Boolean(headers["cookie"]),
      sentAuth: Boolean(headers["authorization"] || headers["x-csrf-token"] || headers["x-session-token"]),
      body,
    });
  });

  const finish = async (outcome, detail, extra = {}) => {
    await writeFile(path.join(dir, "responses.index.json"), JSON.stringify(index, null, 2), "utf8");
    await context.close();
    return {
      restaurantId: r.id,
      name: r.name,
      platform: r.platform,
      outcome,
      detail: [detail, ...trail].filter(Boolean).join("; "),
      menuResponses: extra.menuResponses ?? [],
      curlReproducible: extra.curlReproducible ?? "unknown",
      curlNote: extra.curlNote ?? "",
    };
  };

  try {
    await page.goto(r.target, { waitUntil: "domcontentloaded", timeout: PAGE_MS });
  } catch (err) {
    return finish("fetch-failed", `page.goto failed on ${r.target}: ${String(err?.message ?? err).slice(0, 120)}`);
  }
  await page.waitForTimeout(SETTLE_MS);

  let gate;
  try {
    gate = await page.evaluate(gateProbe);
  } catch {
    gate = { personal: false, picker: false, prices: 0, chars: 0 };
  }

  /* A store pick is tried when the page offers one, whether or not prices are
   * already visible - a brand landing page shows prices for no branch at all. */
  let pickNote = null;
  /* Did we end up on a host the restaurant's own record never named? That is
   * the case where an unverified read is dangerous rather than merely thin. */
  let crossHost = false;
  if (gate.picker || gate.prices < 5) {
    try {
      pickNote = await pickStore(page, r, log);
    } catch (err) {
      log(`store pick threw: ${String(err?.message ?? err).slice(0, 80)}`);
    }
    await page.waitForTimeout(2_000);
  }
  if (pickNote) log(pickNote);

  /*
   * Still nothing priced? The menu is probably one branch link away. Follow it
   * ONLY when the page is genuinely priceless, and come straight back if the
   * link led somewhere worse - the first run of this script followed Epic
   * Wings' Olo page to a catering site and threw away 39 real dishes.
   */
  if (!pickNote) {
    let before = gate;
    try {
      before = await page.evaluate(gateProbe);
    } catch { /* keep the earlier reading */ }
    if (before.prices < 3) {
      const from = page.url();
      let followed = null;
      try {
        followed = await followMenuLink(page, r, log);
      } catch { /* the link went nowhere useful */ }
      if (followed) {
        let after = { prices: 0 };
        try {
          after = await page.evaluate(gateProbe);
        } catch { /* treat an unreadable page as worse */ }
        if (after.prices <= before.prices) {
          log(`the followed link had no more prices than ${from}; went back`);
          try {
            await page.goto(from, { waitUntil: "domcontentloaded", timeout: PAGE_MS });
            await page.waitForTimeout(SETTLE_MS);
          } catch { /* the original is gone; carry on with what is loaded */ }
        } else {
          pickNote = followed;
          crossHost = hostOf(page.url()) !== hostOf(from);
        }
      }
    }
  }

  /* Lazy catalogs render on scroll. Three passes down the page is enough for
   * every storefront seen so far, and costs six seconds. */
  for (let i = 0; i < 3; i++) {
    try {
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(1_200);
    } catch { break; }
  }

  await writeFile(path.join(dir, "responses.index.json"), JSON.stringify(index, null, 2), "utf8");

  /*
   * PAYLOAD FIRST. Group the captures by URL with the query stripped, because
   * a per-category API answers the same call many times and one category is
   * not a menu; the group is.
   */
  /* The rendered document joins the pile as one more capture. On Square Online
   * the catalog is a global inside the page, so the served HTML is the payload
   * - and the curl replay below is then exactly the question worth answering:
   * does the SERVED html carry it, or only the rendered one? */
  const pool = [...captures];
  try {
    pool.push({
      url: page.url(),
      method: "GET",
      status: 200,
      contentType: "text/html (rendered)",
      reqContentType: null,
      postData: null,
      sentCookie: false,
      sentAuth: false,
      rendered: true,
      body: await page.content(),
    });
  } catch { /* the page closed under us */ }

  const groups = new Map();
  for (const cap of pool) {
    const cands = [];
    for (const root of parseRoots(cap.body)) cands.push(...candidatesFrom(root));
    if (!cands.length) continue;
    const key = `${cap.rendered ? "rendered:" : ""}${cap.url.split("?")[0]}`;
    if (!groups.has(key)) groups.set(key, { key, caps: [], cands: [] });
    const g = groups.get(key);
    g.caps.push(cap);
    g.cands.push(...cands);
  }

  let best = null;
  for (const g of groups.values()) {
    const rows = cleanRows(rowsFromCandidates(g.cands));
    if (!best || rows.length > best.rows.length) best = { ...g, rows };
  }

  let dishes = best?.rows ?? [];
  let sourceUrl = best?.caps?.[0]?.url ?? page.url();
  let menuResponses = best ? [...new Set(best.caps.map((c) => c.url))].slice(0, 8) : [];
  let readFromDom = false;

  /* Save the bodies that mattered, so a price can be checked against the thing
   * it was read out of. */
  for (const cap of (best?.caps ?? []).slice(0, 12)) {
    const stem = createHash("sha1").update(cap.url).digest("hex").slice(0, 12);
    await writeFile(path.join(dir, `${stem}.json`), cap.body, "utf8");
    await writeFile(
      path.join(dir, `${stem}.request.json`),
      JSON.stringify({ url: cap.url, method: cap.method, status: cap.status, contentType: cap.contentType, reqContentType: cap.reqContentType, postData: cap.postData, sentCookie: cap.sentCookie, sentAuth: cap.sentAuth }, null, 2),
      "utf8",
    );
  }

  if (dishes.length < MIN_DISHES) {
    let domRows = [];
    try {
      domRows = await page.evaluate(domScrape);
    } catch { /* the page is gone or hostile; the notes row says so below */ }
    const cleaned = cleanRows(domRows);
    if (cleaned.length > dishes.length) {
      dishes = cleaned;
      sourceUrl = page.url();
      menuResponses = [];
      readFromDom = true;
      await writeFile(path.join(dir, "dom.html"), await page.content(), "utf8");
      log("read off the rendered DOM - no response carried a priced catalog");
    }
  }

  const localTime = new Date().toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles" });

  if (dishes.length === 0) {
    if (gate.personal)
      return finish("gate-personal", `an age gate, login or terms wall blocks the menu on ${page.url()} - not answered`);
    if (gate.picker)
      return finish("needs-browser", `store picker on ${page.url()} that this script could not drive${pickNote ? ` (tried: ${pickNote})` : ""}`);
    return finish("needs-browser", `no priced payload and no priced DOM on ${page.url()} after ${captures.length} JSON responses`);
  }

  /*
   * IDENTITY. One branch's menu must never be filed under another branch's id,
   * and the browser reaches more ways of being on the wrong branch than the
   * router does - it follows links onto other hosts and it reads pages that
   * carry no payload at all. Two tests, in falling order of decisiveness.
   */
  const ours = streetNumber(r.address);
  const payloadAddress = (best?.caps ?? []).map((c) => addressInText(c.body)).find(Boolean) ?? null;
  const theirs = streetNumber(payloadAddress);
  if (ours && theirs && ours !== theirs)
    return finish("wrong-branch", `payload address "${payloadAddress}" vs our "${r.address}" - not filed`, { menuResponses });

  let pageText = "";
  try {
    pageText = await page.evaluate(() => (document.body ? document.body.innerText : "").slice(0, 60000));
  } catch { /* the page is gone; the printed-address test simply abstains */ }
  const printed = addressesInPageText(pageText);
  const ourCity = collapse(r.city);
  const cityOnPage = Boolean(
    ourCity && new RegExp(`\\b${ourCity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(pageText),
  );
  let identityNote = payloadAddress ? `payload address "${payloadAddress}" matched` : "address unverified in payload";
  let unverifiedCrossHost = crossHost && !payloadAddress ? "nothing on the page names an address" : null;
  if (printed.length) {
    const mine = ours && printed.some((p) => p.number === ours);
    if (mine) {
      identityNote = `street number ${ours} printed on the page`;
      unverifiedCrossHost = null;
    } else {
      const states = new Set(printed.map((p) => p.state.toUpperCase()));
      const cities = printed.map((p) => p.city.toLowerCase());
      if (!states.has("CA"))
        return finish(
          "wrong-branch",
          `the page prints only ${[...states].join("/")} addresses, not California (${page.url()}) - not filed`,
          { menuResponses },
        );
      if (!cities.some((c) => KNOWN_CITIES.has(c)))
        return finish(
          "wrong-branch",
          `the page prints ${[...new Set(cities)].join(", ")}, none of which is a city in this corpus - ` +
            `a different branch of the same brand (${page.url()}) - not filed`,
          { menuResponses },
        );
      identityNote = `page prints a corpus city (${[...new Set(cities)].filter((c) => KNOWN_CITIES.has(c)).join(", ")}); street number unconfirmed`;
      if (crossHost) unverifiedCrossHost = "the page prints an address, but not this branch's street number";
    }
  } else if (cityOnPage && !crossHost) {
    identityNote = `no address on the page, but it names ${ourCity}`;
  } else if (crossHost) {
    unverifiedCrossHost = cityOnPage
      ? `the page names ${ourCity}, but it names every other branch's city too - a location list is not an address`
      : "nothing on the page names an address or this city";
  }

  /*
   * The dangerous shape, and the one that DID file a Pasadena menu under a San
   * Diego record twice while this script was being built: a link took us onto
   * another host, and nothing decisive on the page we landed on says which
   * branch it is. `cvpasadena.square.site` passed a city test because Copa
   * Vida's Square site lists all of its locations in a switcher, San Diego
   * included. Only a street number or a payload address settles a cross-host
   * read; a model agent can read the page and tell, so hand it back rather than
   * guess. Never file on the strength of the link alone.
   */
  if (unverifiedCrossHost)
    return finish(
      "needs-browser",
      `${dishes.length} priced items on ${page.url()}, reached by following a link off ${hostOf(r.target)}, but ` +
        `${unverifiedCrossHost} - an agent must confirm this is ${r.name}, ${r.address}. Not filed`,
      { menuResponses },
    );

  if (dishes.length < MIN_DISHES)
    return finish(
      "gated",
      `only ${dishes.length} priced items from ${sourceUrl} at ${localTime} PT - a closed store looks exactly like a small menu, so re-run in daylight`,
      { menuResponses },
    );

  const rejection = screenWouldReject(dishes, hostOf(sourceUrl));
  if (rejection) return finish("screened-out", `${rejection} - ${sourceUrl}`, { menuResponses });

  /* The finding: can the router do this without a browser? */
  const sample = dishes.slice(0, 6).map((d) => d.name);
  /* A DOM read still has a URL, and "does the SERVED html carry these dish
   * names" is the same question with the same answer shape - so it gets the
   * same replay rather than a shrug. */
  const cap = readFromDom
    ? { url: page.url(), method: "GET", postData: null, reqContentType: null, sentCookie: false, sentAuth: false }
    : best.caps[0];
  const replay = await curlReplays(cap, sample);
  const curlReproducible = replay.ok;
  const curlNote =
    `${cap.method} ${cap.url.split("?")[0]}${cap.postData ? ` with a ${cap.reqContentType ?? "json"} body` : ""}; ` +
    `${readFromDom ? "the menu was read off the rendered DOM, so this asks whether the served HTML carries it. " : ""}` +
    `browser sent cookie=${cap.sentCookie} auth=${cap.sentAuth}. ${replay.note}` +
    (cap.postData ? ` Body: ${cap.postData.slice(0, 300)}` : "");

  results.push({
    restaurantId: r.id,
    name: r.name,
    sourceUrl,
    confidence: "high",
    notes:
      `read by scripts/browser-menus.mjs in a local Chromium from the ${r.platform ?? "unknown"} storefront, ` +
      `${readFromDom ? "off the rendered DOM" : `out of the ${new URL(sourceUrl).pathname} response`}` +
      `${pickNote ? `; ${pickNote}` : ""}; ${identityNote}`,
    dishes,
  });

  return finish("filed", `${dishes.length} dishes from ${sourceUrl}`, { menuResponses, curlReproducible, curlNote });
}

let done = 0;
for (const r of work) {
  let row;
  try {
    row = await visit(r);
  } catch (err) {
    row = {
      restaurantId: r.id,
      name: r.name,
      platform: r.platform,
      outcome: "fetch-failed",
      detail: `browser pass threw: ${String(err?.message ?? err).slice(0, 160)}`,
      menuResponses: [],
      curlReproducible: "unknown",
      curlNote: "",
    };
  }
  notes.push(row);
  await persist();
  console.log(
    `[${String(++done).padStart(3)}/${work.length}] ${row.outcome.padEnd(14)} ${(row.platform ?? "-").padEnd(26)} ` +
      `curl=${String(row.curlReproducible).padEnd(7)} ${r.name}`,
  );
}

await browser.close();
await persist();

/* ------------------------------------------------------------------ report */

const tally = new Map();
for (const n of notes) {
  const k = n.platform ?? "none";
  const row = tally.get(k) ?? { attempted: 0, filed: 0, reproducible: 0 };
  row.attempted++;
  if (n.outcome === "filed") row.filed++;
  if (n.curlReproducible === true) row.reproducible++;
  tally.set(k, row);
}
const width = Math.max(12, ...[...tally.keys()].map((k) => k.length));
console.log(`\n${"platform".padEnd(width)}${"attempted".padStart(12)}${"filed".padStart(8)}${"curl-ok".padStart(9)}`);
for (const [k, v] of [...tally].sort((a, b) => b[1].attempted - a[1].attempted))
  console.log(`${k.padEnd(width)}${String(v.attempted).padStart(12)}${String(v.filed).padStart(8)}${String(v.reproducible).padStart(9)}`);

console.log(
  `\n${results.length} menus filed of ${notes.length} attempted` +
    `\nwrote ${RESULT_FILE}\nwrote ${NOTES_FILE}\nbodies under ${SCRATCH}`,
);
