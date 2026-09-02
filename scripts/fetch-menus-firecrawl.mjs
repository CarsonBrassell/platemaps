/**
 * Extracts menus through Firecrawl instead of a browser and an agent.
 *
 *   node --env-file=.env.local scripts/fetch-menus-firecrawl.mjs --limit 5 --dry
 *   node --env-file=.env.local scripts/fetch-menus-firecrawl.mjs --limit 40 --max-credits 250
 *   node --env-file=.env.local scripts/fetch-menus-firecrawl.mjs --refetch --ids 164,88,197
 *
 * ## Why this exists alongside the agent batches
 *
 * The Chrome batches work — 96 menus, 66/66 verified exact — but every page
 * they read passes through a model's context, so throughput is capped by the
 * session token budget rather than by anything about the task. Roughly 60-80
 * menus a day, and a batch that dies mid-run costs its whole allowance.
 *
 * Firecrawl moves both halves off that budget. Retrieval happens on their
 * infrastructure, and `formats: [{ type: "json", schema }]` runs the extraction
 * there too, so a menu arrives already shaped like our Dish rows. This script
 * is a loop over HTTP calls: it consumes Firecrawl credits and no model tokens
 * at all, which means it can run over hundreds of restaurants unattended.
 *
 * That is the whole argument for it. It is not more accurate than the agents —
 * `--refetch --ids` exists so that claim can be measured against restaurants
 * whose menus an agent already read.
 *
 * ## Credits (checked against the pricing page 2026-09-02)
 *
 *   /scrape                 1 credit per page
 *   + `json` format        +4 credits per page  → 5 for an extraction scrape
 *   /search                 2 credits
 *
 * The header used to claim a scrape cost 1 credit flat, which understated a
 * restaurant by 4x. The counter below is the budget, not the estimate: it is
 * incremented at the call site, printed after every restaurant, and
 * `--max-credits` stops the run mid-queue rather than at a tidy boundary.
 *
 * ## Why the website is tried before /search
 *
 * A search costs 2 credits and returns, for a restaurant that has a website,
 * mostly SEO farms — the exact hosts `screen-menus.mjs` throws away. So when
 * `restaurants.website` is set the site itself is read first: one cheap
 * markdown+links scrape (1 credit) finds the real menu URL and the page's own
 * address text, and only the chosen candidate pays the 5-credit extraction.
 * Search is the fallback, not the opening move, and its results are filtered
 * through the same host rules the screen applies so we never spend 5 credits on
 * a source that is going to be quarantined on arrival.
 */

import { writeFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const API = "https://api.firecrawl.dev/v2";
const argv = process.argv.slice(2);

function numFlag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(argv[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}
function strFlag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
}

const LIMIT = numFlag("limit", 20);
const SKIP = numFlag("skip", 0);
/** Most extraction scrapes per restaurant before giving up. Each costs 5. */
const MAX_CANDIDATES = numFlag("candidates", 3);
/** Hard budget stop. The counter below is checked before every billed call. */
const MAX_CREDITS = numFlag("max-credits", 300);
const DRY_RUN = argv.includes("--dry");
/** Allow restaurants that already have a menu — for accuracy trials only. */
const REFETCH = argv.includes("--refetch");
const IDS = (strFlag("ids", "") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const OUT_PATH = strFlag("out", `menus/wip/firecrawl-${Date.now()}.json`);

/** Free-tier scrape/search limit is 10 requests a minute. Stay under it. */
const MIN_CALL_GAP_MS = numFlag("gap", 7000);

const apiKey = process.env.FIRECRAWL_API_KEY;
if (!apiKey) {
  console.error(
    "FIRECRAWL_API_KEY is not set.\n" +
      "Add it to .env.local and re-run with --env-file=.env.local:\n" +
      "  FIRECRAWL_API_KEY=fc-...",
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

/** Credits are the budget here, so every call that spends them is counted. */
let credits = 0;
let creditsThisRestaurant = 0;
/** Set when the API says the account is out of credits or needs to pay. */
let paymentStop = null;
/** Set when 429s persist through every backoff — a wait too long to sit out. */
let rateLimitStop = null;

function spend(n) {
  credits += n;
  creditsThisRestaurant += n;
}
function budgetLeft() {
  return MAX_CREDITS - credits;
}

let lastCallAt = 0;
async function throttle() {
  const wait = lastCallAt + MIN_CALL_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

/*
 * THE KEY IN .env.local DOES NOT AUTHENTICATE, and the way it fails is worth
 * writing down because it looks like three different problems.
 *
 * `Authorization: Bearer <key>` is what the docs show and what this script
 * sent. It returns a flat `401 Unauthorized: Invalid token` — the same thing a
 * revoked key returns, and the same thing a typo returns.
 *
 * Send `x-api-key` instead and the call SUCCEEDS, which reads like the docs
 * being wrong about the header. It is not: `x-api-key` is not recognised at
 * all, so the request is treated as ANONYMOUS and served by Firecrawl's
 * keyless free tier, which is capped per IP rather than per account. The tell
 * is any account-scoped endpoint — `/v2/team/credit-usage` answers "this
 * endpoint is not supported by the keyless free tier" for exactly the request
 * that scrapes fine.
 *
 * Sending BOTH headers fails: Bearer wins and 401s. So this sends only
 * `x-api-key`, and the run is anonymous. Scraping and json extraction both
 * work that way, but the daily ceiling is an undocumented per-IP one rather
 * than the account's 1,000 monthly credits, and nothing can read the balance.
 * Replace the key and this should go back to Bearer.
 */
async function firecrawl(path, body, attempt = 0) {
  await throttle();
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    /*
     * 402 is the account being out of credits, and it is the one error that
     * must not be retried or swallowed: every subsequent call fails the same
     * way, so a loop over 40 restaurants turns one clear signal into 40 noisy
     * ones. Recorded and re-raised, and the main loop stops on it.
     *
     * 429 is NOT that, and conflating the two cost a whole trial run. The
     * keyless tier's rate-limit body mentions signing up, which read as a
     * billing problem and aborted the queue eight restaurants early — when the
     * window in fact resets in minutes. It is a wait, not a wall: back off and
     * retry, and only give up after several attempts. No credit is charged for
     * a 429, so the counter is untouched here.
     */
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 90_000;
      if (attempt < 3) {
        console.log(`\n    rate-limited, waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/3)`);
        await new Promise((r) => setTimeout(r, waitMs));
        return firecrawl(path, body, attempt + 1);
      }
      rateLimitStop = text.slice(0, 200);
      throw new Error(`Firecrawl ${path} 429 after 3 retries: ${text.slice(0, 200)}`);
    }
    if (res.status === 402 || /insufficient|out of credits|payment required/i.test(text)) {
      paymentStop = `HTTP ${res.status}: ${text.slice(0, 200)}`;
    }
    throw new Error(`Firecrawl ${path} ${res.status}: ${text.slice(0, 240)}`);
  }
  return res.json();
}

/* ------------------------------------------------------------------ *
 * Host rules, mirrored from scripts/screen-menus.mjs.
 *
 * These are duplicated deliberately rather than imported: the screen is a
 * pure transform over finished files and this is a spender of credits, and
 * the point of having them here is to never PAY for a source the screen is
 * going to throw away. Keep them in step by hand; the screen stays
 * authoritative about what may load.
 * ------------------------------------------------------------------ */

const BARRED = [
  /(^|\.)yelp\.com$/i,
  /(^|\.)yelp\.[a-z.]+$/i,
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

const UNTRUSTED = [
  /(^|\.)menupedia\./i,
  /(^|\.)allmenus\.com$/i,
  /(^|\.)menupages\.com$/i,
  /(^|\.)sagemenu\.com$/i,
  /mojosalesandbranding\.com$/i,
  /(^|\.)menuswithprice\./i,
  /(^|\.)pricelisto\./i,
  /(^|\.)menuandprice/i,
  /(^|\.)restaurantguru\.com$/i,
  /(^|\.)beyondmenu\.com$/i,
  /(^|\.)zmenu\.com$/i,
  /(^|\.)menupix\.com$/i,
  /(^|\.)sirved\.com$/i,
  /(^|\.)restaurantji\.com$/i,
  /(^|\.)tripadvisor\./i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)opentable\.com$/i,
  /(^|\.)nextdoor\.com$/i,
  /(^|\.)mapquest\.com$/i,
];

/*
 * Delivery marketplaces. The screen allows some of these once an agent has run
 * the markup check by hand — but nothing here can run that check before paying
 * for the page, and the markup and cent-shape tests in the screen reject them
 * often enough that a marketplace scrape is a coin flip on 5 credits. Skipped
 * outright while credits are the constraint.
 */
const MARKETPLACE = [
  /(^|\.)doordash\.com$/i,
  /(^|\.)ubereats\.com$/i,
  /(^|\.)grubhub\.com$/i,
  /(^|\.)seamless\.com$/i,
  /(^|\.)postmates\.com$/i,
  /(^|\.)caviar\.com$/i,
  /(^|\.)slicelife\.com$/i,
];

/** Ordering platforms restaurants genuinely run their own storefront on. */
const PLATFORM = [
  /(^|\.)order\.online$/i,
  /(^|\.)toasttab\.com$/i,
  /(^|\.)toast\.site$/i,
  /(^|\.)chownow\.com$/i,
  /(^|\.)yourmenu\.com$/i,
  /(^|\.)popmenu\.com$/i,
  /(^|\.)singleplatform\.com$/i,
  /(^|\.)clover\.com$/i,
  /(^|\.)square(up)?\.(com|site)$/i,
  /(^|\.)spoton\.com$/i,
  /(^|\.)owner\.com$/i,
  /(^|\.)olo\.com$/i,
  /(^|\.)applova\.menu$/i,
  /(^|\.)business\.site$/i,
  /(^|\.)canva\.site$/i,
];

const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
};
const registrable = (h) => h.split(".").slice(-2).join(".");
const isBarred = (h) => BARRED.some((re) => re.test(h));
const isUntrusted = (h) => UNTRUSTED.some((re) => re.test(h));
const isMarketplace = (h) => MARKETPLACE.some((re) => re.test(h));
const isPlatform = (h) => PLATFORM.some((re) => re.test(h));
/** True when a URL is not worth a single credit. */
const worthless = (u) => {
  const h = hostOf(u);
  if (!h) return true;
  if (/\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|zip|mp4)(\?|$)/i.test(u)) return true;
  return isBarred(h) || isUntrusted(h) || isMarketplace(h);
};

/* ------------------------------------------------------------------ *
 * The extraction contract.
 * ------------------------------------------------------------------ */

/*
 * `found` is deliberately part of the schema rather than inferred from an empty
 * array: a page that isn't a menu at all and a restaurant with no dishes listed
 * are different outcomes, and only the model reading the page can tell them
 * apart.
 *
 * There is no cap on the dish array, and the cap that used to be here ("up to
 * 30 dishes ... prefer mains and signature items") was the single worst line in
 * this file. By this repo's rule a menu is the WHOLE priced menu — a capture
 * that keeps the mains and drops the sides is a representative sample, which
 * `screen-menus.mjs` quarantines by name and which the playbook calls out as
 * the thing this project most explicitly does not want. A 30-item ceiling on a
 * 260-item sushi list does not produce a smaller menu, it produces a wrong one.
 */
const MENU_SCHEMA = {
  type: "object",
  properties: {
    found: {
      type: "boolean",
      description: "True only if this page shows an actual food menu for this restaurant.",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description:
        "high: the restaurant's own site. medium: a reliable third party. low: partial, dated, or unsure it is the right location.",
    },
    pageAddress: {
      type: "string",
      description:
        "The street address printed anywhere on this page, exactly as written. Empty string if the page prints none. Never guess one.",
    },
    sectionsSeen: {
      type: "string",
      description:
        "Comma-separated list of every menu section heading on this page, in order.",
    },
    dishes: {
      type: "array",
      description:
        "EVERY priced item on the page, in menu order — mains, starters, sides, desserts and drinks alike. Do not summarise, sample or truncate: a partial menu is worse than none. If an item has no price, leave it out.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Dish name exactly as the menu writes it." },
          description: {
            type: "string",
            description:
              "The menu's own one-line description, trimmed to about 45 characters. Empty string if the menu gives none — do not invent one.",
          },
          price: {
            type: "string",
            description:
              'Formatted like "$12.00", copied from the page. Empty string if the menu lists no price for this item — never estimate, never carry a price over from a similar item.',
          },
          section: {
            type: "string",
            description: 'Menu section, e.g. "Tacos", "Starters", "Ramen".',
          },
        },
        required: ["name", "price", "section"],
      },
    },
  },
  required: ["found", "confidence", "dishes"],
};

function extractionPrompt(r) {
  return [
    `This page should show the menu for "${r.name}", a ${r.cuisine || "restaurant"} in`,
    `${r.neighborhood || "San Diego"}, San Diego, California, at ${r.address || "an unknown address"}.`,
    ``,
    `Be strict about identity. San Diego has chains and similarly named restaurants —`,
    `one earlier extraction nearly attached a Houston seafood chain's menu to a San`,
    `Diego restaurant of the same name. If this page is for a different business, or a`,
    `different branch of the same chain, set found to false rather than guessing.`,
    `A missing menu is fine. A wrong one is not.`,
    ``,
    `Capture the COMPLETE priced menu, every section and every item, not a selection.`,
    `Copy dish names and prices exactly as written. Never invent, estimate or`,
    `carry over a price. If a price is unreadable, leave the price empty.`,
  ].join("\n");
}

/* ------------------------------------------------------------------ *
 * Firecrawl calls.
 * ------------------------------------------------------------------ */

/** Cheap read of a page: markdown + outbound links, no extraction. 1 credit. */
async function discover(url) {
  const result = await firecrawl("/scrape", {
    url,
    onlyMainContent: false,
    formats: ["markdown", "links"],
    timeout: 45000,
  });
  spend(1);
  return {
    markdown: String(result.data?.markdown ?? ""),
    links: Array.isArray(result.data?.links) ? result.data.links : [],
    finalUrl: result.data?.metadata?.sourceURL ?? url,
  };
}

/** Reads one page into structured dishes. 1 + 4 = 5 credits. */
async function scrapeMenu(url, r) {
  const result = await firecrawl("/scrape", {
    url,
    onlyMainContent: true,
    formats: ["markdown", { type: "json", schema: MENU_SCHEMA, prompt: extractionPrompt(r) }],
    timeout: 90000,
  });
  spend(5);
  return {
    json: result.data?.json ?? null,
    markdown: String(result.data?.markdown ?? ""),
  };
}

/** Candidate menu URLs from the open web. 2 credits. */
async function searchMenuUrls(r) {
  const query = `${r.name} ${r.neighborhood || "San Diego"} San Diego menu prices`;
  const result = await firecrawl("/search", { query, limit: 8 });
  spend(2);
  const results = result.data?.web ?? result.data ?? [];
  const urls = (Array.isArray(results) ? results : []).map((x) => x.url).filter(Boolean);
  const usable = urls.filter((u) => !worthless(u));
  const looksLikeMenu = (u) => /menu|order|food/i.test(u);
  return [...usable.filter(looksLikeMenu), ...usable.filter((u) => !looksLikeMenu(u))];
}

/* ------------------------------------------------------------------ *
 * Identity and price checks. These cost nothing.
 * ------------------------------------------------------------------ */

/*
 * The address check the playbook asks for on every restaurant, run on text we
 * have already paid for.
 *
 * It is deliberately asymmetric. Finding our street number anywhere on the page
 * is a pass; finding NO address at all is also a pass, because plenty of menu
 * pages print no address and absence of evidence is not a mismatch. Only a page
 * that prints street addresses, none of which are ours, is a failure — that is
 * the Kaito-in-Bronxville and Tandoor-across-town shape, and it is the one this
 * can actually catch.
 */
const STREET_SUFFIX =
  /\b(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|way|ln|lane|pl|place|ct|court|hwy|highway|pkwy|parkway|circle|cir|ter|terrace|broadway)\b/i;

function addressVerdict(pageText, recordAddress) {
  const ours = String(recordAddress ?? "").match(/^\s*(\d{1,6})\b/)?.[1];
  if (!ours) return { ok: true, note: "" };
  const text = String(pageText ?? "");
  if (!text.trim()) return { ok: true, note: "" };

  // Every "<number> <words> <street suffix>" run on the page.
  const found = [];
  const re = /\b(\d{1,6})\s+([A-Za-z0-9.'#-]+(?:\s+[A-Za-z0-9.'#-]+){0,4})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (STREET_SUFFIX.test(m[2])) found.push(m[1]);
  }
  if (found.length === 0) return { ok: true, note: "" };
  if (found.includes(ours)) return { ok: true, note: `address ${ours} confirmed on page` };
  // A page listing many branches is a chain locator, not a wrong restaurant —
  // but ours is not among them, so this page is still not this restaurant's.
  return {
    ok: false,
    note:
      `address mismatch: page prints street number(s) ${[...new Set(found)].slice(0, 6).join(", ")}, ` +
      `record says ${ours}`,
  };
}

/*
 * Prices are normalised, never repaired. A row whose price does not parse is
 * dropped: "Market Price", "MP", "call for pricing" and a bare dash all answer
 * nothing, and inventing a figure for them is the one unrecoverable mistake in
 * this pipeline. The screen drops them too; doing it here keeps the filed dish
 * count honest so `--max-credits` and the ≥5 floor are measured against real
 * prices rather than placeholders.
 */
function normalisePrice(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/(\d{1,4}(?:,\d{3})*)(?:\.(\d{1,2}))?/);
  if (!m) return null;
  const dollars = Number(m[1].replace(/,/g, ""));
  const cents = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  if (!Number.isFinite(dollars) || !Number.isFinite(cents)) return null;
  const value = dollars + cents / 100;
  if (!(value > 0) || value > 5000) return null;
  return `$${value.toFixed(2)}`;
}

function cleanDishes(dishes) {
  const out = [];
  for (const d of Array.isArray(dishes) ? dishes : []) {
    const name = String(d?.name ?? "").trim();
    if (!name) continue;
    const price = normalisePrice(d?.price);
    if (!price) continue;
    out.push({
      name,
      description: String(d?.description ?? "").trim(),
      price,
      section: String(d?.section ?? "").trim() || "Menu",
    });
  }
  return out;
}

/** Below this a "menu" is a fragment of a page, not a small restaurant. */
const MIN_DISHES = 5;

/*
 * DOES THIS PAGE ACTUALLY CONTAIN THESE PRICES?
 *
 * This is the most important check in the file and it was added because the
 * first trial produced exactly the failure the whole project is built to
 * prevent. Mona Lisa's `/menu` 301s to a homepage that prints NO prices
 * anywhere — dish names appear only in review quotes and photo captions.
 * Firecrawl returned `found: true`, `confidence: "high"`, and seven dishes with
 * prices: Margherita Pizza $15.00 against the $25.00 an agent read, Lasagna
 * $14.00 against $22.00, plus "Pasta Special" and "Spicy Sandwich Special",
 * which are caption text. Every number was invented, and every downstream test
 * passed it: the count is plausible, the sections are plausible, the host is
 * the restaurant's own domain, and the cent-endings look like a menu because a
 * model generating prices generates menu-shaped ones.
 *
 * Nothing in `screen-menus.mjs` can catch this. Its whole armoury — markup
 * ratios, cent-ending shape, section shape, host trust — assumes the numbers
 * were READ from somewhere. Fabricated ones defeat all of it by construction,
 * which is the same reason the screen quarantines agents who divide out a
 * markup: a plausible number and a true one are indistinguishable downstream.
 *
 * The check is nearly free, because the extraction scrape already returns the
 * page's markdown alongside the json. If the prices are on the page, they are
 * in that text. So: take the price-shaped tokens out of the markdown, and
 * require most of the reported prices to be among them. A page with no price
 * tokens at all cannot have been the source of any price, whatever the model
 * says about it.
 *
 * The threshold is deliberately loose. `onlyMainContent` trims real content, a
 * PDF or image menu legitimately yields no markdown, and prices behind a
 * modifier modal are genuinely absent from the first render — so this is set to
 * catch wholesale invention, not to audit individual rows.
 */
const MIN_PRICES_ON_PAGE = 0.5;

function pricesAreOnThePage(dishes, markdown) {
  const text = String(markdown ?? "");
  const onPage = new Set();
  for (const m of text.matchAll(/\$\s*(\d{1,4}(?:,\d{3})*)(?:[.,](\d{2}))?/g)) {
    const v = Number(m[1].replace(/,/g, "")) + (m[2] ? Number(m[2]) / 100 : 0);
    if (v > 0) onPage.add(v.toFixed(2));
  }
  // Menus that print prices without a dollar sign (a column of "14.00").
  for (const m of text.matchAll(/(?:^|[\s(|>])(\d{1,3})\.(\d{2})(?![\d%])/g)) {
    onPage.add((Number(m[1]) + Number(m[2]) / 100).toFixed(2));
  }
  if (onPage.size === 0) {
    return { ok: false, share: 0, note: "the page carries no prices at all — every price is invented" };
  }
  const hits = dishes.filter((d) => onPage.has(d.price.slice(1))).length;
  const share = dishes.length ? hits / dishes.length : 0;
  return {
    ok: share >= MIN_PRICES_ON_PAGE,
    share,
    note:
      share >= MIN_PRICES_ON_PAGE
        ? `${hits}/${dishes.length} prices verified verbatim in the page text`
        : `only ${hits}/${dishes.length} of the reported prices appear anywhere in the page text`,
  };
}

/* ------------------------------------------------------------------ *
 * Candidate URLs from a restaurant's own website.
 * ------------------------------------------------------------------ */

/*
 * The keyword has to be a hyphen-delimited WORD in the path segment, not the
 * whole segment. Georges at the Cove keeps its menus at `/menu-lunch` and
 * `/menu-dinner`; an exact-segment test found neither, spent 15 credits on the
 * homepage and two 404s, and filed the restaurant as blocked. Requiring a whole
 * segment is also too loose in the other direction if written as a substring —
 * `/foodie-blog` and `/order-history` are not menus — so the word boundary is
 * the hyphen.
 */
const MENU_WORD = "(?:menus?|food|dinner|lunch|brunch|breakfast|drinks?|order|eat)";
const MENU_PATH = new RegExp(
  `(^|/)(?:[a-z0-9]+-)*${MENU_WORD}(?:-[a-z0-9]+)*(/|$|\\?|#)`,
  "i",
);

function siteCandidates(site, discovery) {
  const base = new URL(site);
  const home = registrable(hostOf(site));
  const seen = new Set();
  const push = (list, u) => {
    let clean;
    try {
      const parsed = new URL(u, base);
      parsed.hash = "";
      clean = parsed.toString();
    } catch {
      return;
    }
    if (seen.has(clean) || worthless(clean)) return;
    seen.add(clean);
    list.push(clean);
  };

  const onSite = [];
  const onPlatform = [];
  for (const link of discovery?.links ?? []) {
    const h = hostOf(link);
    if (!h) continue;
    if (registrable(h) === home) {
      if (MENU_PATH.test(link)) push(onSite, link);
    } else if (isPlatform(h)) {
      push(onPlatform, link);
    }
  }

  // Shortest path first: `/menu` beats `/menu/dinner/appetizers`.
  onSite.sort((a, b) => a.length - b.length);

  const guesses = [];
  for (const p of ["/menu", "/menus", "/food", "/order"]) push(guesses, new URL(p, base).toString());

  /*
   * A one-page site puts the menu on the root, and the discovery scrape already
   * shows which kind of site this is: count the prices in the markdown we were
   * just handed. Ten or more and the root goes first, which is the whole menu
   * for one credit less than finding it. Otherwise the root goes last, because
   * on a multi-page site it is a hero image and a phone number.
   */
  const priceHits = (discovery?.markdown ?? "").match(/\$\s?\d{1,3}(\.\d{2})?/g)?.length ?? 0;
  const root = [];
  push(root, discovery?.finalUrl ?? site);

  return priceHits >= 10
    ? [...root, ...onSite, ...onPlatform, ...guesses]
    : [...onSite, ...onPlatform, ...root, ...guesses];
}

/* ------------------------------------------------------------------ *
 * Target selection.
 * ------------------------------------------------------------------ */

let targets;
if (IDS.length > 0) {
  targets = await sql`
    SELECT r.id, r.name, r.cuisine, r.neighborhood, r.address, r.website, r.review_count
    FROM restaurants r
    WHERE r.id = ANY(${IDS})
    ORDER BY array_position(${IDS}::text[], r.id)
  `;
} else if (REFETCH) {
  targets = await sql`
    SELECT r.id, r.name, r.cuisine, r.neighborhood, r.address, r.website, r.review_count
    FROM restaurants r
    WHERE r.hold_reason IS NULL AND r.website IS NOT NULL
    ORDER BY r.review_count DESC NULLS LAST, r.id
    LIMIT ${LIMIT} OFFSET ${SKIP}
  `;
} else {
  /*
   * The same predicate cut-batches.mjs uses, plus a website: a restaurant with
   * no site has nothing to try before /search, and search-first is where the
   * credits go to die.
   */
  targets = await sql`
    SELECT r.id, r.name, r.cuisine, r.neighborhood, r.address, r.website, r.review_count
    FROM restaurants r
    WHERE r.hold_reason IS NULL
      AND r.website IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM menu_lookups m WHERE m.restaurant_id = r.id)
    ORDER BY r.review_count DESC NULLS LAST, r.id
    LIMIT ${LIMIT} OFFSET ${SKIP}
  `;
}

console.log(
  `${targets.length} restaurants to attempt. Budget ${MAX_CREDITS} credits ` +
    `(scrape 1, +4 for json extraction, search 2).\n`,
);

if (DRY_RUN) {
  console.log("Dry run — the plan, spending nothing:\n");
  for (const r of targets) {
    const site = r.website && !worthless(r.website) ? r.website : null;
    const path = site
      ? `site: ${site} -> discover (1) then up to ${MAX_CANDIDATES} extractions (5 each)`
      : `no usable website -> /search (2) then up to ${MAX_CANDIDATES} extractions (5 each)`;
    console.log(`  ${String(r.id).padStart(5)} ${String(r.name).slice(0, 34).padEnd(36)} ${path}`);
  }
  const best = targets.length * (6 + 0);
  const worst = targets.length * (2 + 5 * MAX_CANDIDATES);
  console.log(
    `\nBetween ~${best} credits (every site's first candidate is the menu) and ` +
      `${worst} if every one goes the long way. Nothing was written.`,
  );
  process.exit(0);
}

/* ------------------------------------------------------------------ *
 * The run.
 * ------------------------------------------------------------------ */

const results = [];
let attempted = 0;

for (const r of targets) {
  if (paymentStop || rateLimitStop) break;
  /*
   * The budget is checked before the restaurant, not after: a partial
   * restaurant costs the same credits as a whole one and files nothing.
   * 12 is the cheapest useful attempt (discover + two extractions).
   */
  if (budgetLeft() < 12) {
    console.log(`\nStopping: ${budgetLeft()} credits left of ${MAX_CREDITS}, not enough for another restaurant.`);
    break;
  }

  creditsThisRestaurant = 0;
  attempted += 1;
  process.stdout.write(`  ${r.id} ${String(r.name).slice(0, 34)} ... `);

  const entry = {
    restaurantId: String(r.id),
    name: r.name,
    sourceUrl: "",
    confidence: "low",
    notes: "",
    dishes: [],
  };
  const trail = [];

  try {
    let candidates = [];
    const site = r.website && !worthless(r.website) ? r.website : null;

    if (site) {
      try {
        const d = await discover(site);
        candidates = siteCandidates(site, d);
        trail.push(`read ${hostOf(site)} for links (1 credit)`);
      } catch (err) {
        trail.push(`site ${hostOf(site)} unreadable (${String(err.message).slice(0, 60)})`);
      }
    } else if (r.website) {
      trail.push(`listed website ${hostOf(r.website)} is a barred or untrusted host — not fetched`);
    }

    if (candidates.length === 0 && budgetLeft() >= 7) {
      candidates = await searchMenuUrls(r);
      trail.push(`fell back to /search (2 credits), ${candidates.length} usable results`);
    }

    let menu = null;
    let sourceUrl = null;
    let pageText = "";
    let tried = 0;

    for (const url of candidates) {
      if (tried >= MAX_CANDIDATES) break;
      if (budgetLeft() < 5) {
        trail.push("budget exhausted mid-restaurant");
        break;
      }
      tried += 1;
      let got;
      try {
        got = await scrapeMenu(url, r);
      } catch (err) {
        trail.push(`${url} failed (${String(err.message).slice(0, 70)})`);
        if (paymentStop || rateLimitStop) break;
        continue;
      }
      const candidate = got.json;
      const dishes = cleanDishes(candidate?.dishes);
      if (!candidate?.found) {
        trail.push(`${url}: not a menu for this restaurant`);
        continue;
      }
      if (dishes.length < MIN_DISHES) {
        trail.push(`${url}: only ${dishes.length} priced dishes`);
        continue;
      }
      const grounded = pricesAreOnThePage(dishes, got.markdown);
      if (!grounded.ok) {
        trail.push(`${url}: REJECTED, ${grounded.note}`);
        continue;
      }
      const text = `${got.markdown}\n${candidate?.pageAddress ?? ""}`;
      const verdict = addressVerdict(text, r.address);
      if (!verdict.ok) {
        trail.push(`${url}: ${verdict.note}`);
        continue;
      }
      menu = { ...candidate, dishes };
      sourceUrl = url;
      pageText = [grounded.note, verdict.note].filter(Boolean).join("; ");
      break;
    }

    if (!menu) {
      /*
       * A Firecrawl miss is NOT a not-found. A `not_found` ledger row is the
       * one result that permanently removes a restaurant from the queue, and
       * this script's evidence for absence is three URLs and no reasoning — far
       * weaker than the agent investigation that standard was written for. So
       * every miss is filed `blocked`, which quarantines and re-queues it.
       */
      entry.blocked = `firecrawl found no priced menu in ${tried} candidate page(s)`;
      entry.notes =
        `firecrawl json — ${creditsThisRestaurant} credits for this restaurant. ` +
        trail.join("; ");
      console.log(`no menu (${creditsThisRestaurant}cr, ${credits} total)`);
    } else {
      /*
       * Confidence is capped by the SOURCE, not taken from the model. Firecrawl
       * is reading one page and cannot know whether the host is the restaurant
       * or a mirror of it, so it says "high" for any tidy-looking menu. The
       * ladder is a property of where the page came from, which we do know.
       */
      const h = hostOf(sourceUrl);
      const ownSite = r.website && registrable(h) === registrable(hostOf(r.website));
      const ceiling = ownSite ? "high" : isPlatform(h) ? "medium" : "low";
      const rank = { low: 0, medium: 1, high: 2 };
      const claimed = ["low", "medium", "high"].includes(menu.confidence) ? menu.confidence : "low";
      entry.confidence = rank[claimed] < rank[ceiling] ? claimed : ceiling;
      entry.sourceUrl = sourceUrl;
      entry.dishes = menu.dishes;
      entry.notes =
        `firecrawl json — ${creditsThisRestaurant} credits for this restaurant. ` +
        `${menu.dishes.length} priced dishes from ${h}` +
        (ownSite ? " (the website on record)" : "") +
        (pageText ? `; ${pageText}` : "") +
        (menu.sectionsSeen ? `; sections: ${String(menu.sectionsSeen).slice(0, 300)}` : "") +
        `. ${trail.join("; ")}`;
      console.log(
        `${menu.dishes.length} dishes, ${entry.confidence} (${creditsThisRestaurant}cr, ${credits} total)`,
      );
    }
  } catch (err) {
    entry.blocked = `firecrawl error: ${String(err.message).slice(0, 160)}`;
    entry.notes = `firecrawl json — ${creditsThisRestaurant} credits for this restaurant. ${trail.join("; ")}`;
    console.log(`FAILED: ${String(err.message).slice(0, 90)} (${credits} total)`);
  }

  results.push(entry);

  // Written after every restaurant, not at the end. An agent batch was killed
  // mid-run and lost twenty-two extractions that way; this costs one file write.
  await writeFile(OUT_PATH, JSON.stringify(results, null, 2), "utf8");

  if (paymentStop) {
    console.error(`\nSTOPPING — Firecrawl reports a payment or credit problem:\n  ${paymentStop}`);
    break;
  }
  if (rateLimitStop) {
    console.error(`\nSTOPPING — rate limited past every backoff:\n  ${rateLimitStop}`);
    break;
  }
}

const filed = results.filter((e) => e.dishes.length > 0);
console.log(
  `\n${filed.length}/${attempted} menus filed, ${filed.reduce((s, e) => s + e.dishes.length, 0)} dishes.` +
    `\n${credits} credits used of ${MAX_CREDITS}` +
    (attempted ? ` — ${(credits / attempted).toFixed(1)} per restaurant.` : "."),
);
console.log(`\nWrote ${OUT_PATH}`);
console.log(`Next: node scripts/screen-menus.mjs ${OUT_PATH}`);
if (paymentStop || rateLimitStop) process.exit(2);
