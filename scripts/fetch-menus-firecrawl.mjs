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
 *
 * ## What the 2026-09-02 accuracy trial changed
 *
 * Twenty trusted menus, 225 credits: 9 found, 11 blocked, 747 of 750 prices
 * matching an agent's reading exactly, nothing fabricated, and the grounding
 * check never firing once. Accuracy was not the problem. COMPLETENESS was.
 *
 * Three of the nine finds were fragments filed as whole menus at
 * `confidence: high` — Bamboo House 9 dishes against 299 already in the
 * database, San Luis Rey Bakery 16 against 291, O Sushi 10 against 223 — and
 * every guard in this file passed them, because each fragment was a TRUTHFUL
 * reading of the page it was handed. Grounding said 9/9, 16/16, 10/10. The
 * schema's "capture EVERYTHING on the page" instruction was satisfied in full
 * by a homepage teaser (`goldenbamboohouse.com/`, sections "Chef Picks, Visit
 * Bamboo House") or by one category page of many (`sanluisreybakery.com/food/
 * tacos`, section "Tacos to Try"). Nothing downstream could tell a complete
 * menu from a complete page.
 *
 * That is a different failure from fabrication and it needs different guards. A
 * fragment is not a small menu, it is a wrong one: a diner reading nine dishes
 * concludes the restaurant serves nine dishes. By this repo's rule it is worse
 * than filing nothing, because filing is what REMOVES the restaurant from the
 * queue, and nobody ever comes back for the other 290.
 *
 * Four guards were added. Three of them cost nothing:
 *
 *   1. A COVERAGE FLOOR over the page's own markdown — free, the markdown was
 *      already paid for as part of the extraction scrape.
 *   2. NEVER SHRINK — a refetch may not file fewer dishes than the restaurant
 *      already has. Free; the count rides along on the target query.
 *   3. MULTI-PAGE MERGE — the actual fix for all three fragments, which were
 *      single pages of menus that lived on several. This one spends credits,
 *      and is why a per-restaurant cap now exists.
 *   4. SKIPPING WHAT THIS TIER CANNOT SERVE — PDF menus, and pages the router
 *      already proved need a browser. Free, and it stops the four PDF-menu
 *      restaurants in the trial from burning 16 credits each on doomed guesses.
 *
 * Each is commented at its own definition with the case that produced it.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
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

/*
 * Per-restaurant ceiling, introduced with the multi-page merge below.
 *
 * Before that merge the worst case was self-limiting: one discovery scrape plus
 * MAX_CANDIDATES extractions, 16 credits. Reading a menu that spans several
 * pages can cost four times that, and a single site with a sprawling menu
 * navigation could quietly eat a tenth of the run's whole budget.
 *
 * 36 is not arbitrary. The common winning shape is discover (1) + the first
 * candidate extracts (5) = 6, and a full four-page fan-out on top of that is
 * 4 x (1 discover + 5 extract) = 24, for 30. A restaurant whose menu was found
 * on the SECOND candidate has spent 11, and 11 + 24 = 35 — so 36 keeps that
 * case inside the cap too. A third-candidate winner needing a four-page
 * fan-out would be 40, over the cap, and gets blocked instead: a site that
 * hides its menu three guesses deep AND spreads it over five pages is exactly
 * the pathological case worth handing to a browser tier rather than paying for.
 */
const MAX_CREDITS_PER_RESTAURANT = numFlag("max-per-restaurant", 36);

const DRY_RUN = argv.includes("--dry");
/*
 * Router outcomes are always consulted, but `no-platform` is the one outcome
 * this tier should NOT treat as a rejection. The router looks for known
 * ordering platforms and JSON endpoints; "no platform" means only that a site
 * serves its menu as its own HTML, which is precisely what a Firecrawl scrape
 * is for. Default is therefore to take those rows. This flag narrows the run to
 * restaurants the router positively handed over, for a targeted pass.
 */
const ROUTER_TRIED_ONLY = argv.includes("--router-tried-only");
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
 * `Authorization: Bearer <key>` — the header the docs specify, and the only
 * one this sends. Verified against the key now in `.env.local` on 2026-09-02:
 * `GET /v2/team/credit-usage` returns 200 with the account's remaining
 * balance, which is the endpoint that proves the request is account-scoped
 * rather than anonymous.
 *
 * The history is worth keeping, because the failure looked like three
 * different problems. The PREVIOUS key 401'd on Bearer with a flat
 * `Unauthorized: Invalid token` — indistinguishable from a typo or a revoked
 * key. Sending `x-api-key` instead made scrapes SUCCEED, which read like the
 * docs being wrong about the header. They were not: `x-api-key` is not
 * recognised at all, so the request was treated as ANONYMOUS and served by
 * Firecrawl's keyless free tier, capped per IP rather than per account.
 * `/v2/team/credit-usage` was the tell — it answered "this endpoint is not
 * supported by the keyless free tier" for exactly the request that scraped
 * fine, and the whole first trial ran on an undocumented per-IP ceiling with
 * no readable balance. If Bearer ever 401s again the key is dead: get a new
 * one. Do not "fix" it by falling back to `x-api-key`, which silently buys an
 * anonymous run instead of an authenticated one. (Sending both headers fails:
 * Bearer wins and 401s.)
 */
async function firecrawl(path, body, attempt = 0) {
  await throttle();
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
 * CHANGE 4a — PDF menus belong to a tier that can read PDFs.
 *
 * All four PDF-menu restaurants in the trial cost 16 credits each and filed
 * nothing, and the reason is structural rather than bad luck. `MENU_PATH`
 * below matches a menu WORD in a path segment, and a link like
 * `/uploads/2024/dinner-menu.pdf` ends in a filename, not a segment it can
 * match — so the real menu was invisible to candidate selection every time.
 * What remained was the guess list (`/menu`, `/menus`, `/food`, `/order`),
 * which on those sites 404s or redirects home, so the script paid 5 credits a
 * go for three pages that could not contain a menu. 15 wasted credits per
 * restaurant, entirely predictably.
 *
 * A json extraction cannot read a PDF anyway. Detecting the shape and stopping
 * is strictly better than detecting it and trying: no extraction credit is
 * spent, and the restaurant is filed `blocked`, which re-queues it for the tier
 * that can actually open one.
 * ------------------------------------------------------------------ */

const isPdfUrl = (u) => {
  try {
    return /\.pdf$/i.test(new URL(u, "https://x.invalid").pathname);
  } catch {
    return /\.pdf(\?|#|$)/i.test(String(u ?? ""));
  }
};

/** A PDF that is plausibly the menu, rather than a nutrition sheet or a lease. */
const isPdfMenuLink = (u) =>
  isPdfUrl(u) && /(menu|lunch|dinner|brunch|breakfast|drink|dessert|food|wine|bar)/i.test(String(u));

/* ------------------------------------------------------------------ *
 * CHANGE 4b — the router already knows which sites defeat a plain scrape.
 *
 * `route-menus.mjs` writes a notes file per pass recording, per restaurant,
 * what it found. Four of its outcomes settle the question before this script
 * spends anything:
 *
 *   filed          the router already produced a menu — loading it twice is
 *                  the one way to create duplicate dishes, so never re-fetch.
 *   needs-browser  the menu renders through JavaScript the router could not
 *                  execute. Firecrawl's scrape is the same kind of fetch; it
 *                  will return the same empty shell, for 6+ credits.
 *   gated          age gate, cookie wall, or Cloudflare. Same reasoning.
 *   no-platform    NOT a rejection — see ROUTER_TRIED_ONLY above. Taken by
 *                  default, because own-site HTML is this tier's whole purpose.
 *
 * Newest notes file wins per restaurant: the router has been re-run as its
 * platform list grew, and a later pass reflects better knowledge of the same
 * site. Files are read in filename order, which sorts chronologically because
 * the router stamps them `router-YYYYMMDD-HHMMSS.notes.json`, and later
 * entries simply overwrite earlier ones in the map.
 * ------------------------------------------------------------------ */

const ROUTER_SKIP_OUTCOMES = new Set(["needs-browser", "gated", "filed"]);

async function loadRouterNotes() {
  let names;
  try {
    names = (await readdir("menus/wip"))
      .filter((n) => /^router-.*\.notes\.json$/i.test(n))
      .sort();
  } catch {
    return { byId: new Map(), files: [] };
  }
  const byId = new Map();
  const files = [];
  for (const name of names) {
    let rows;
    try {
      rows = JSON.parse(await readFile(`menus/wip/${name}`, "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(rows)) continue;
    files.push(name);
    for (const row of rows) {
      const id = String(row?.restaurantId ?? "").trim();
      if (!id) continue;
      byId.set(id, { outcome: String(row?.outcome ?? ""), detail: String(row?.detail ?? ""), file: name });
    }
  }
  return { byId, files };
}

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

/*
 * Reads one page into structured dishes. 1 + 4 = 5 credits.
 *
 * `links` is requested alongside so the multi-page merge can see the menu
 * page's own navigation without paying for a second read of it. Billing is per
 * page plus 4 for the json format; markdown and links are shapes of the same
 * fetched page and add nothing to the bill.
 */
async function scrapeMenu(url, r) {
  const result = await firecrawl("/scrape", {
    url,
    onlyMainContent: true,
    formats: ["markdown", "links", { type: "json", schema: MENU_SCHEMA, prompt: extractionPrompt(r) }],
    timeout: 90000,
  });
  spend(5);
  return {
    json: result.data?.json ?? null,
    markdown: String(result.data?.markdown ?? ""),
    links: Array.isArray(result.data?.links) ? result.data.links : [],
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
 * CHANGE 1 — THE COVERAGE FLOOR. Did we take everything the page offered?
 *
 * `pricesAreOnThePage` above asks whether the prices we REPORTED exist on the
 * page. This asks the mirror-image question, which the trial proved is the one
 * that was going unasked: whether the prices ON THE PAGE all made it into what
 * we reported. Grounding catches invention. Coverage catches truncation, and
 * truncation is what actually shipped — 9/9 and 16/16 and 10/10 are perfect
 * grounding scores on pages whose menus ran to hundreds of items.
 *
 * It is free. The extraction scrape already returns the page's markdown
 * alongside the json, so both questions are answered from text we have paid
 * for exactly once.
 *
 * The counting is deliberately CONSERVATIVE, because every token this
 * over-counts is a real menu wrongly blocked. So a token counts only when it
 * sits on a line that also names something (a word of three or more letters
 * once the prices are stripped out), which drops bare figure columns, and the
 * obvious non-prices are excluded outright: phone numbers, years, percentages,
 * long prose paragraphs, image and raw-HTML lines, and anything over $500.
 * Occurrences are counted per line rather than per document — a menu repeats
 * "$12.00" across twenty dishes and those are twenty priced items, not one —
 * but a value repeated WITHIN one line (a strikethrough, a size table echoing
 * itself) counts once, which is what makes them distinct occurrences.
 * ------------------------------------------------------------------ */

/*
 * The comma branch requires an actual comma group, and the trailing `(?!\d)` is
 * load-bearing: written the obvious way round, `\d{1,3}` matched the first three
 * digits of "$2500.00" and the token was counted as $250 — inside the $500 sanity
 * ceiling, so a page of banquet packages read as a page of dish prices.
 */
const PRICE_TOKEN_RE =
  /\$\s?(?<d1>\d{1,3}(?:,\d{3})+|\d{1,4})(?:\.(?<c1>\d{2}))?(?!\d)|(?<![\d.,$])(?<d2>\d{1,3})\.(?<c2>\d{2})(?![\d%])/g;

const PHONE_RE = /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}|\b\d{3}[-.]\d{3}[-.]\d{4}\b/;

function countPriceTokens(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const seen = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    // A phone number and a street address are full of price-shaped digits.
    if (PHONE_RE.test(line)) continue;
    // Images and raw HTML carry dimensions and hex values, not menu prices.
    if (/^(?:!\[|<)/.test(line)) continue;
    // Prose mentioning a price is not a menu row. Menu rows are short.
    if (line.length > 220) continue;
    // The line has to NAME something once its prices are removed.
    const words = line.replace(/\$\s?[\d.,]+/g, " ").match(/[A-Za-z]{3,}/g) ?? [];
    if (words.length === 0) continue;
    for (const m of line.matchAll(PRICE_TOKEN_RE)) {
      const g = m.groups ?? {};
      const dollars = Number(String(g.d1 ?? g.d2 ?? "").replace(/,/g, ""));
      const cents = g.c1 ?? g.c2;
      if (!Number.isFinite(dollars)) continue;
      const value = dollars + (cents ? Number(cents) / 100 : 0);
      // Menu items are not free and are not four figures.
      if (!(value > 0) || value > 500) continue;
      seen.add(`${i}:${value.toFixed(2)}`);
    }
  }
  return seen.size;
}

/** Extracted dishes must account for at least this share of the page's prices. */
const MIN_COVERAGE = 0.7;

/*
 * Below this many tokens the ratio is too noisy to act on: one "$25 gift card"
 * in a footer swings a six-token page by seventeen points, and a false block
 * costs a real menu. The fragments this guard exists for are never small —
 * their pages carried hundreds of prices — so nothing is lost by declining to
 * judge the tiny ones.
 */
const MIN_TOKENS_TO_JUDGE_COVERAGE = 8;

function coverageVerdict(dishCount, markdown) {
  const tokens = countPriceTokens(markdown);
  if (tokens < MIN_TOKENS_TO_JUDGE_COVERAGE) {
    return { ok: true, tokens, share: 1, note: `${tokens} price tokens on the page — too few to judge coverage` };
  }
  const share = tokens ? dishCount / tokens : 1;
  return {
    ok: share >= MIN_COVERAGE,
    tokens,
    share,
    note:
      share >= MIN_COVERAGE
        ? `${dishCount} dishes cover ${Math.round(share * 100)}% of ${tokens} price tokens on the page`
        : `only ${dishCount} dishes for ${tokens} price tokens on the page (${Math.round(share * 100)}%, floor ${Math.round(MIN_COVERAGE * 100)}%)`,
  };
}

/* ------------------------------------------------------------------ *
 * CHANGE 1b — the same question asked of SECTIONS, for pages the price
 * counter cannot see.
 *
 * Added during the first hardened run, which caught its own live example.
 * FryYay filed 6 dishes, all in a section called "Featured", while the very
 * same extraction reported `sectionsSeen` as nineteen headings: Loaded Fries,
 * Chicken Sandwich, Chicken Wings, Loaded Corn Dogs, Milkshake and the rest.
 * The model looked straight at a nineteen-section menu, returned one section's
 * worth of it, and every guard passed: 6/6 prices verified verbatim, address
 * confirmed, own domain, `confidence: high`.
 *
 * The price coverage floor above could not help, and it was right not to. The
 * site renders its menu with JavaScript, so the markdown Firecrawl returned
 * carried six price tokens in total — the floor correctly declined to judge a
 * page with almost no prices on it rather than block on noise. But the model's
 * OWN section list is evidence the markdown does not contain, and it is
 * evidence we already pay for on every extraction.
 *
 * So: a page that announces N sections and yields dishes in almost none of them
 * has been read partially, whatever its price grounding says. Matching is
 * deliberately loose (case and punctuation folded, substring either way) so
 * "Chicken & Fries" and "Chicken and Fries" agree, because every fold makes a
 * false BLOCK less likely, and blocking a real menu is the expensive mistake.
 *
 * This is a different fragment shape from the one CHANGE 3 fixes, and both are
 * needed. Checked against the trial: it clears Olympic Cafe (7/7), Di Leone's
 * (13/16) and Carmel Sushi (21/21), and leaves the trial's three fragments to
 * the multi-page merge, since those pages honestly showed a single section.
 * ------------------------------------------------------------------ */

/** Fewer headings than this and the list is too short to mean anything. */
const MIN_SECTIONS_TO_JUDGE = 4;
/** Dishes must land in at least this share of the sections the page advertised. */
const MIN_SECTION_COVERAGE = 0.5;

/*
 * "&" and the word "and" are the same word to a menu and different strings to a
 * comparison, and a page whose nav says "Soups & Salads" above a heading that
 * reads "Soups and Salads" would otherwise score that section as uncaptured.
 * Both are dropped entirely, along with punctuation and case.
 */
const normSection = (s) =>
  String(s)
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function sectionCoverageVerdict(dishes, sectionsSeen) {
  const seen = [
    ...new Set(
      String(sectionsSeen ?? "")
        .split(",")
        .map(normSection)
        .filter(Boolean),
    ),
  ];
  if (seen.length < MIN_SECTIONS_TO_JUDGE) {
    return { ok: true, note: "" };
  }
  const have = [...new Set(dishes.map((d) => normSection(d.section)))];
  const hit = seen.filter((s) => have.some((h) => h === s || h.includes(s) || s.includes(h)));
  const share = hit.length / seen.length;
  if (share >= MIN_SECTION_COVERAGE) {
    return { ok: true, note: `dishes span ${hit.length}/${seen.length} of the sections the page lists` };
  }
  const missing = seen.filter((s) => !hit.includes(s)).slice(0, 6).join(", ");
  return {
    ok: false,
    note:
      `dishes land in only ${hit.length} of the ${seen.length} sections this page lists ` +
      `(${Math.round(share * 100)}%, floor ${Math.round(MIN_SECTION_COVERAGE * 100)}%); ` +
      `nothing captured from: ${missing}`,
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
  /* Collected, never scraped — see isPdfMenuLink and the pdf-only block below. */
  const pdfMenus = [];
  for (const link of discovery?.links ?? []) {
    const h = hostOf(link);
    if (!h) continue;
    if (isPdfUrl(link)) {
      if (isPdfMenuLink(link) && registrable(h) === home) pdfMenus.push(link);
      continue;
    }
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

  const candidates =
    priceHits >= 10
      ? [...root, ...onSite, ...onPlatform, ...guesses]
      : [...onSite, ...onPlatform, ...root, ...guesses];

  return {
    candidates,
    /*
     * The guess list and the root are always present, so `candidates.length`
     * says nothing about whether this site actually OFFERS an HTML menu. These
     * two do, and the pdf-only decision needs to distinguish "the site links to
     * its menu, as a PDF" from "the site links to no menu at all".
     */
    realMenuLinks: onSite.length + onPlatform.length,
    pdfMenus,
    priceHits,
  };
}

/* ------------------------------------------------------------------ *
 * CHANGE 3 — MENUS THAT SPAN SEVERAL PAGES.
 *
 * This is the guard that actually recovers the trial's three fragments,
 * because none of them were mistakes about the page: they were mistakes about
 * the menu being ONE page. Bamboo House's homepage really does list nine "Chef
 * Picks", San Luis Rey's `/food/tacos` really does list sixteen tacos, and a
 * model told to capture everything on the page did exactly that. The missing
 * 290 dishes were one link away the whole time.
 *
 * So after a page passes every other check, its own outbound links are read for
 * siblings — the nav strip that a menu page almost always carries — and up to
 * MAX_EXTRA_MENU_PAGES of them are merged in.
 *
 * Two things keep the cost sane. First, each sibling is opened with the
 * 1-credit markdown scrape, and only pages whose markdown carries at least
 * MIN_TOKENS_FOR_EXTRACTION price tokens go on to pay the 5-credit extraction:
 * a "Drinks" page that turns out to be a photo gallery costs 1 credit to rule
 * out instead of 5. Second, the whole fan-out is refused up front unless its
 * WORST case fits inside the per-restaurant cap, because a half-read multi-page
 * menu is the very fragment this change exists to prevent — better to block and
 * let a browser tier read all of it than to file four fifths of it.
 *
 * `catering` is excluded by name: catering pages price trays and per-head
 * packages, which are not dishes a diner orders, and they drag section names
 * and price bands sideways.
 * ------------------------------------------------------------------ */

const MAX_EXTRA_MENU_PAGES = numFlag("extra-pages", 4);
/** Below this a sibling page is not carrying a menu; do not pay to extract it. */
const MIN_TOKENS_FOR_EXTRACTION = 5;

const EXTRA_MENU_WORD = /(menus?|lunch|dinner|brunch|breakfast|drinks?|desserts?)/i;
const CATERING = /catering/i;

/*
 * A sibling under the same parent directory counts too, even when its own last
 * segment names no menu word. San Luis Rey is the case: the winning page was
 * `/food/tacos`, and its siblings are `/food/burritos`, `/food/tortas` and the
 * rest — paths that contain no menu word at all, but which are unmistakably the
 * same menu split by category. The parent segment has to be menu-ish itself
 * (MENU_WORD covers food/order/eat as well), which keeps this from sweeping in
 * `/about/team` on a site whose menu happens to live at `/about/menu`.
 */
function parentMenuPrefix(url) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    const parent = segments[segments.length - 2];
    return new RegExp(`^${MENU_WORD}$`, "i").test(parent)
      ? `/${segments.slice(0, -1).join("/")}/`
      : null;
  } catch {
    return null;
  }
}

function extraMenuPages(sourceUrl, links, visited) {
  const home = registrable(hostOf(sourceUrl));
  if (!home) return [];
  const prefix = parentMenuPrefix(sourceUrl);
  const seen = new Set(visited);
  const out = [];
  for (const link of links ?? []) {
    let clean;
    try {
      const parsed = new URL(link, sourceUrl);
      parsed.hash = "";
      clean = parsed.toString();
    } catch {
      continue;
    }
    if (seen.has(clean)) continue;
    const h = hostOf(clean);
    if (!h || registrable(h) !== home) continue;
    if (worthless(clean) || isPdfUrl(clean)) continue;
    let path;
    try {
      path = new URL(clean).pathname;
    } catch {
      continue;
    }
    if (CATERING.test(path)) continue;
    const named = EXTRA_MENU_WORD.test(path);
    const sibling = prefix != null && path.startsWith(prefix) && path.length > prefix.length;
    if (!named && !sibling) continue;
    seen.add(clean);
    out.push(clean);
  }
  // Shortest path first, so `/menu/lunch` is read before `/menu/lunch/extras`.
  out.sort((a, b) => a.length - b.length);
  return out.slice(0, MAX_EXTRA_MENU_PAGES);
}

/*
 * The label a merged section gets prefixed with. Taken from the URL rather than
 * the page, because it has to be stable and short: "Dinner - Appetizers" reads
 * as a menu, whereas the page's own <title> is usually the restaurant's name
 * repeated on every page, which would prefix every section identically and say
 * nothing. The " - " separator matches what is already in `menus/wip`.
 */
function menuPageLabel(url) {
  let segments = [];
  try {
    segments = new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return "Main";
  }
  const titled = (s) =>
    s
      .replace(/\.(html?|php|aspx?)$/i, "")
      .replace(/[-_+]+/g, " ")
      .trim()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase());
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const raw = titled(segments[i]);
    // Strip a bare "Menu"/"Menus" only when the segment says something else too.
    const stripped = raw.replace(/\bmenus?\b/gi, "").replace(/\s+/g, " ").trim();
    const label = stripped || raw;
    if (label) return label.slice(0, 40);
  }
  return "Main";
}

/*
 * Sections are prefixed only when more than one page contributed, so a
 * single-page menu is filed exactly as it was before this change. Dishes are
 * de-duplicated on name+price across pages: a site that lists "Carne Asada
 * $18.00" on both `/menu` and `/dinner` is showing one dish twice, while the
 * same dish at two prices is a genuine lunch/dinner pair and both are kept.
 */
function mergeMenuPages(pages) {
  const multi = pages.length > 1;
  const labels = new Map();
  const seen = new Set();
  const out = [];
  for (const page of pages) {
    let label = page.label || "Main";
    if (multi) {
      const n = (labels.get(label) ?? 0) + 1;
      labels.set(label, n);
      if (n > 1) label = `${label} ${n}`;
    }
    for (const d of page.dishes) {
      const key = `${d.name.toLowerCase()}|${d.price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(multi ? { ...d, section: `${label} - ${d.section}` } : d);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Target selection.
 * ------------------------------------------------------------------ */

/*
 * `dish_count` rides along for CHANGE 2 (never shrink). It is zero by
 * construction on the default queue, which selects only restaurants with no
 * dishes at all, and only ever meaningful under --refetch or --ids. The
 * subselect is written out in each query rather than shared: neon's tagged
 * template turns every interpolation into a bound PARAMETER, so a shared
 * fragment would arrive as a string literal in the column list, not as SQL.
 */

/*
 * The router and pdf filters below run in JavaScript, not SQL, so the query has
 * to over-fetch for `--limit` to keep meaning "restaurants to actually attempt"
 * rather than "rows to look at before throwing most away". The list is sliced
 * back to LIMIT after filtering.
 */
const FETCH_LIMIT = IDS.length > 0 ? LIMIT : LIMIT * 5 + 50;

let rows;
if (IDS.length > 0) {
  rows = await sql`
    SELECT r.id, r.name, r.cuisine, r.neighborhood, r.address, r.website, r.review_count,
           (SELECT count(*) FROM dishes d WHERE d.restaurant_id = r.id)::int AS dish_count
    FROM restaurants r
    WHERE r.id = ANY(${IDS})
    ORDER BY array_position(${IDS}::text[], r.id)
  `;
} else if (REFETCH) {
  rows = await sql`
    SELECT r.id, r.name, r.cuisine, r.neighborhood, r.address, r.website, r.review_count,
           (SELECT count(*) FROM dishes d WHERE d.restaurant_id = r.id)::int AS dish_count
    FROM restaurants r
    WHERE r.hold_reason IS NULL AND r.website IS NOT NULL
    ORDER BY r.review_count DESC NULLS LAST, r.id
    LIMIT ${FETCH_LIMIT} OFFSET ${SKIP}
  `;
} else {
  /*
   * The same predicate cut-batches.mjs uses, plus a website: a restaurant with
   * no site has nothing to try before /search, and search-first is where the
   * credits go to die.
   */
  rows = await sql`
    SELECT r.id, r.name, r.cuisine, r.neighborhood, r.address, r.website, r.review_count,
           (SELECT count(*) FROM dishes d WHERE d.restaurant_id = r.id)::int AS dish_count
    FROM restaurants r
    WHERE r.hold_reason IS NULL
      AND r.website IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM menu_lookups m WHERE m.restaurant_id = r.id)
    ORDER BY r.review_count DESC NULLS LAST, r.id
    LIMIT ${FETCH_LIMIT} OFFSET ${SKIP}
  `;
}

/* ------------------------------------------------------------------ *
 * CHANGE 4 applied — decide what not to pay for, before paying for anything.
 * ------------------------------------------------------------------ */

const router = await loadRouterNotes();
const skipped = { filed: 0, "needs-browser": 0, gated: 0, "no-platform": 0 };
const pdfSkips = [];
const kept = [];

for (const r of rows) {
  if (kept.length >= LIMIT) break;
  const note = router.byId.get(String(r.id));
  const outcome = note?.outcome ?? "";
  if (ROUTER_SKIP_OUTCOMES.has(outcome)) {
    skipped[outcome] += 1;
    continue;
  }
  if (outcome === "no-platform" && ROUTER_TRIED_ONLY) {
    skipped["no-platform"] += 1;
    continue;
  }
  // The website on record IS a PDF: nothing here can read it, at any price.
  if (r.website && isPdfUrl(r.website)) {
    pdfSkips.push({
      restaurantId: String(r.id),
      name: r.name,
      sourceUrl: "",
      confidence: "low",
      notes: `firecrawl json — 0 credits for this restaurant. website on record is ${r.website}`,
      dishes: [],
      blocked: "pdf-only, belongs to T3",
    });
    continue;
  }
  kept.push(r);
}

const targets = kept;

console.log(
  `${targets.length} restaurants to attempt. Budget ${MAX_CREDITS} credits ` +
    `(scrape 1, +4 for json extraction, search 2), ${MAX_CREDITS_PER_RESTAURANT} max per restaurant.`,
);
console.log(
  `Router notes: ${router.byId.size} restaurants across ${router.files.length} file(s) ` +
    `(${router.files.join(", ") || "none"}).`,
);
console.log(
  `Skipped before spending: ${skipped.filed} already filed by the router, ` +
    `${skipped["needs-browser"]} needs-browser, ${skipped.gated} gated, ` +
    `${skipped["no-platform"]} no-platform${ROUTER_TRIED_ONLY ? " (--router-tried-only)" : " (taken by default)"}, ` +
    `${pdfSkips.length} website is a PDF.\n`,
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
  const best = targets.length * 6;
  const worst = targets.length * MAX_CREDITS_PER_RESTAURANT;
  console.log(
    `\nBetween ~${best} credits (every site's first candidate is the whole menu on one page) and ` +
      `${worst} at the ${MAX_CREDITS_PER_RESTAURANT}-credit per-restaurant cap, which now includes a ` +
      `fan-out of up to ${MAX_EXTRA_MENU_PAGES} more menu pages (1 credit to peek, +5 only if the page ` +
      `carries ${MIN_TOKENS_FOR_EXTRACTION}+ price tokens).`,
  );
  console.log(
    `${pdfSkips.length} PDF-website restaurant(s) would be written straight to the output as ` +
      `blocked "pdf-only, belongs to T3". Nothing was written.`,
  );
  process.exit(0);
}

/* ------------------------------------------------------------------ *
 * The run.
 * ------------------------------------------------------------------ */

/*
 * The PDF-website skips are seeded into the output rather than merely counted:
 * `blocked` is what re-queues a restaurant, and a restaurant that is silently
 * dropped from the file looks, to everything downstream, like one that was
 * never in the queue. They cost nothing, so they are recorded and moved past.
 */
const results = [...pdfSkips];
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

  /** Room for `n` more credits, under BOTH the run budget and the per-restaurant cap. */
  const afford = (n) => budgetLeft() >= n && creditsThisRestaurant + n <= MAX_CREDITS_PER_RESTAURANT;

  try {
    let candidates = [];
    const site = r.website && !worthless(r.website) ? r.website : null;
    /** Set when the site offers a menu, in a format this tier cannot read. */
    let pdfOnly = null;

    if (site) {
      try {
        const d = await discover(site);
        const plan = siteCandidates(site, d);
        trail.push(`read ${hostOf(site)} for links (1 credit)`);
        /*
         * CHANGE 4b applied. The guess list and the root are ALWAYS in
         * `candidates`, so the question is not "did we find candidates" but
         * "did this site link to an HTML menu at all". When it linked to a
         * menu and every one was a PDF, three 5-credit extractions on `/menu`
         * guesses is money spent to rediscover that. The homepage carrying its
         * own prices is the one exception — then the menu IS readable here.
         */
        if (plan.realMenuLinks === 0 && plan.pdfMenus.length > 0 && plan.priceHits < 10) {
          pdfOnly = plan.pdfMenus.slice(0, 3);
        } else {
          candidates = plan.candidates;
        }
      } catch (err) {
        trail.push(`site ${hostOf(site)} unreadable (${String(err.message).slice(0, 60)})`);
      }
    } else if (r.website) {
      trail.push(`listed website ${hostOf(r.website)} is a barred or untrusted host — not fetched`);
    }

    if (candidates.length === 0 && !pdfOnly && budgetLeft() >= 7) {
      candidates = await searchMenuUrls(r);
      trail.push(`fell back to /search (2 credits), ${candidates.length} usable results`);
    }

    let menu = null;
    let sourceUrl = null;
    let pageText = "";
    let tried = 0;
    let blockedReason = null;

    for (const url of candidates) {
      if (tried >= MAX_CANDIDATES) break;
      if (!afford(5)) {
        trail.push(
          budgetLeft() < 5
            ? "budget exhausted mid-restaurant"
            : `per-restaurant cap reached (${creditsThisRestaurant}/${MAX_CREDITS_PER_RESTAURANT})`,
        );
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
      /*
       * CHANGE 1 applied, on the winning page. Unlike the checks above this one
       * does NOT fall through to the next candidate: a page that prints 300
       * prices and yielded 9 dishes is the right page read badly, and the next
       * candidate down the list is a worse page, not a better reading. Blocking
       * re-queues the restaurant for a tier that can read all of it.
       */
      const coverage = coverageVerdict(dishes.length, got.markdown);
      if (!coverage.ok) {
        trail.push(`${url}: BLOCKED on coverage, ${coverage.note}`);
        blockedReason = `coverage floor: ${coverage.note} at ${url}`;
        break;
      }
      /* CHANGE 1b applied — the FryYay shape: many sections seen, one returned. */
      const sectionCoverage = sectionCoverageVerdict(dishes, candidate?.sectionsSeen);
      if (!sectionCoverage.ok) {
        trail.push(`${url}: BLOCKED on section coverage, ${sectionCoverage.note}`);
        blockedReason = `coverage floor (sections): ${sectionCoverage.note} at ${url}`;
        break;
      }
      menu = { ...candidate, dishes };
      sourceUrl = url;
      pageText = [grounded.note, verdict.note, coverage.note, sectionCoverage.note]
        .filter(Boolean)
        .join("; ");

      /*
       * CHANGE 3 applied. The winning page's own links are read for sibling
       * menu pages, and the whole fan-out is refused unless its worst case fits
       * — a half-read multi-page menu is the exact fragment this prevents.
       */
      const visited = new Set([url, site, r.website].filter(Boolean));
      const extras = extraMenuPages(url, got.links, visited);
      const pages = [{ label: menuPageLabel(url), dishes }];

      if (extras.length > 0) {
        const worstCase = extras.length * 6;
        if (!afford(worstCase)) {
          trail.push(
            `menu spans ${extras.length + 1} pages; the fan-out needs up to ${worstCase} more credits ` +
              `and only ${Math.min(budgetLeft(), MAX_CREDITS_PER_RESTAURANT - creditsThisRestaurant)} are available`,
          );
          blockedReason =
            `menu spans ${extras.length + 1} pages and the per-restaurant credit cap ` +
            `(${MAX_CREDITS_PER_RESTAURANT}) would be exceeded — not filing a partial menu`;
          menu = null;
          break;
        }
        for (const extra of extras) {
          let peek;
          try {
            peek = await discover(extra);
          } catch (err) {
            trail.push(`extra ${extra} unreadable (${String(err.message).slice(0, 50)})`);
            if (paymentStop || rateLimitStop) break;
            continue;
          }
          const tokens = countPriceTokens(peek.markdown);
          if (tokens < MIN_TOKENS_FOR_EXTRACTION) {
            trail.push(`extra ${extra}: ${tokens} price tokens, not extracted (1 credit)`);
            continue;
          }
          let extraGot;
          try {
            extraGot = await scrapeMenu(extra, r);
          } catch (err) {
            trail.push(`extra ${extra} failed (${String(err.message).slice(0, 50)})`);
            if (paymentStop || rateLimitStop) break;
            continue;
          }
          const extraDishes = cleanDishes(extraGot.json?.dishes);
          if (!extraGot.json?.found || extraDishes.length === 0) {
            trail.push(`extra ${extra}: no priced dishes despite ${tokens} price tokens`);
            blockedReason = `${extra} shows ${tokens} price tokens but yielded no dishes — not filing a partial menu`;
            menu = null;
            break;
          }
          const extraGrounded = pricesAreOnThePage(extraDishes, extraGot.markdown);
          if (!extraGrounded.ok) {
            trail.push(`extra ${extra}: REJECTED, ${extraGrounded.note}`);
            blockedReason = `${extra}: ${extraGrounded.note}`;
            menu = null;
            break;
          }
          const extraCoverage = coverageVerdict(extraDishes.length, extraGot.markdown);
          if (!extraCoverage.ok) {
            trail.push(`extra ${extra}: BLOCKED on coverage, ${extraCoverage.note}`);
            blockedReason = `coverage floor: ${extraCoverage.note} at ${extra}`;
            menu = null;
            break;
          }
          const extraSections = sectionCoverageVerdict(extraDishes, extraGot.json?.sectionsSeen);
          if (!extraSections.ok) {
            trail.push(`extra ${extra}: BLOCKED on section coverage, ${extraSections.note}`);
            blockedReason = `coverage floor (sections): ${extraSections.note} at ${extra}`;
            menu = null;
            break;
          }
          pages.push({ label: menuPageLabel(extra), dishes: extraDishes });
          trail.push(`extra ${extra}: +${extraDishes.length} dishes, ${extraCoverage.note}`);
        }
      }

      if (menu) {
        const merged = mergeMenuPages(pages);
        if (pages.length > 1) {
          pageText += `; merged ${pages.length} menu pages into ${merged.length} dishes`;
        }
        menu.dishes = merged;
      }
      break;
    }

    /*
     * CHANGE 2 applied — NEVER SHRINK.
     *
     * Only reachable under --refetch or --ids, because the default queue takes
     * restaurants with no dishes at all. The trial is precisely why it exists:
     * three restaurants with 299, 291 and 223 hand-read dishes each came back
     * with 9, 16 and 10, at confidence "high", and nothing stopped that being
     * filed over the real thing. A menu that got smaller is never news about
     * the restaurant; it is news about the read.
     */
    const had = Number(r.dish_count ?? 0);
    if (menu && had > 0 && menu.dishes.length < had) {
      trail.push(`refuses to shrink ${had} dishes to ${menu.dishes.length}`);
      blockedReason =
        `would shrink an existing menu from ${had} dishes to ${menu.dishes.length} — ` +
        `refusing to file a smaller menu over a larger one`;
      menu = null;
    }

    if (pdfOnly) {
      /* CHANGE 4b applied — recorded, and no json credit was spent on it. */
      entry.blocked = "pdf-only, belongs to T3";
      entry.notes =
        `firecrawl json — ${creditsThisRestaurant} credits for this restaurant. ` +
        `site links ${pdfOnly.length} PDF menu(s) and no HTML menu: ${pdfOnly.join(", ").slice(0, 220)}. ` +
        trail.join("; ");
      console.log(`pdf-only (${creditsThisRestaurant}cr, ${credits} total)`);
    } else if (!menu && blockedReason) {
      entry.blocked = blockedReason;
      entry.notes =
        `firecrawl json — ${creditsThisRestaurant} credits for this restaurant. ` + trail.join("; ");
      console.log(`blocked: ${blockedReason.slice(0, 60)} (${creditsThisRestaurant}cr, ${credits} total)`);
    } else if (!menu) {
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

// The loop writes after every restaurant, but a run that attempted nothing (or
// stopped on its first budget check) still has pdf-only rows worth keeping.
await writeFile(OUT_PATH, JSON.stringify(results, null, 2), "utf8");

const filed = results.filter((e) => e.dishes.length > 0);
const blockedBy = (re) => results.filter((e) => re.test(String(e.blocked ?? ""))).length;
console.log(
  `\n${filed.length}/${attempted} menus filed, ${filed.reduce((s, e) => s + e.dishes.length, 0)} dishes.` +
    `\n${credits} credits used of ${MAX_CREDITS}` +
    (attempted ? ` — ${(credits / attempted).toFixed(1)} per restaurant.` : "."),
);
console.log(
  `Blocked: ${blockedBy(/^coverage floor:/)} by the price coverage floor, ` +
    `${blockedBy(/^coverage floor \(sections\)/)} by the section coverage floor, ` +
    `${blockedBy(/^pdf-only/)} pdf-only, ` +
    `${blockedBy(/credit cap would be exceeded|spans \d+ pages/)} by the multi-page credit cap, ` +
    `${blockedBy(/would shrink/)} refusing to shrink an existing menu, ` +
    `${blockedBy(/found no priced menu/)} no menu found.`,
);
console.log(
  `Skipped before spending (not in the output): ${skipped.filed} router-filed, ` +
    `${skipped["needs-browser"]} needs-browser, ${skipped.gated} gated, ${skipped["no-platform"]} no-platform.`,
);
console.log(`\nWrote ${OUT_PATH}`);
console.log(`Next: node scripts/screen-menus.mjs ${OUT_PATH}`);
if (paymentStop || rateLimitStop) process.exit(2);
