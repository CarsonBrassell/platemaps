/**
 * Extracts menus through Firecrawl instead of a browser and an agent.
 *
 *   node --env-file=.env.local scripts/fetch-menus-firecrawl.mjs --limit 5 --dry
 *   node --env-file=.env.local scripts/fetch-menus-firecrawl.mjs --limit 40
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
 * it is untested against them, which is what --limit and --dry are for.
 *
 * ## Credits
 *
 * Search costs 2 credits per 10 results; scrape costs 1 per page. A restaurant
 * therefore costs 3 credits if the first candidate URL is the menu, more if it
 * takes two or three tries. The free tier is 1,000 credits a month, so expect
 * somewhere between 200 and 330 restaurants per month — measure with --limit 5
 * before believing any of that.
 */

import { writeFile, readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const API = "https://api.firecrawl.dev/v2";

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const LIMIT = flag("limit", 20);
const SKIP = flag("skip", 0);
/** Most candidate URLs to scrape per restaurant before giving up. */
const MAX_CANDIDATES = flag("candidates", 3);
const DRY_RUN = process.argv.includes("--dry");

const outFlag = process.argv.indexOf("--out");
const OUT_PATH =
  outFlag !== -1 ? process.argv[outFlag + 1] : `menus/firecrawl-${Date.now()}.json`;

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

async function firecrawl(path, body) {
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
    throw new Error(`Firecrawl ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

/*
 * The extraction contract, mirroring the schema the agent batches work to so
 * both paths produce menus the same loader can read and the same audit can
 * judge. `found` is deliberately part of the schema rather than inferred from
 * an empty array: a page that isn't a menu at all and a restaurant with no
 * dishes listed are different outcomes, and only the model reading the page
 * can tell them apart.
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
    dishes: {
      type: "array",
      description:
        "Up to 30 dishes. Prefer mains and signature items over sides, drinks and kids' menus.",
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
            description: 'Formatted like "$12.00". Empty string if the menu lists no price.',
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
    `This page should show the menu for "${r.name}", a ${r.cuisine} restaurant in`,
    `${r.neighborhood}, San Diego, California.`,
    ``,
    `Be strict about identity. San Diego has chains and similarly named restaurants —`,
    `one earlier extraction nearly attached a Houston seafood chain's menu to a San`,
    `Diego restaurant of the same name. If this page is for a different business, or a`,
    `different branch of the same chain, set found to false rather than guessing.`,
    `A missing menu is fine. A wrong one is not.`,
    ``,
    `Copy dish names and prices exactly as written. Never invent a price.`,
  ].join("\n");
}

/** Candidate menu URLs, best first. Costs 2 credits. */
async function findMenuUrls(r) {
  const query = `${r.name} ${r.neighborhood} San Diego menu prices`;
  const result = await firecrawl("/search", { query, limit: 8 });
  credits += 2;

  const results = result.data?.web ?? result.data ?? [];
  const urls = results.map((x) => x.url).filter(Boolean);

  // A page whose path mentions the menu is far likelier to be one, and trying
  // it first is what keeps the credit cost near the 3-per-restaurant floor.
  const looksLikeMenu = (u) => /menu|order|food/i.test(u);
  return [...urls.filter(looksLikeMenu), ...urls.filter((u) => !looksLikeMenu(u))];
}

/** Reads one page into structured dishes. Costs 1 credit. */
async function scrapeMenu(url, r) {
  const result = await firecrawl("/scrape", {
    url,
    onlyMainContent: true,
    formats: [{ type: "json", schema: MENU_SCHEMA, prompt: extractionPrompt(r) }],
  });
  credits += 1;
  return result.data?.json ?? null;
}

const targets = await sql`
  SELECT r.id, r.name, r.cuisine, r.neighborhood
  FROM restaurants r
  WHERE NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id)
    AND NOT EXISTS (SELECT 1 FROM menu_lookups m WHERE m.restaurant_id = r.id)
  ORDER BY r.review_count DESC NULLS LAST, r.id
  LIMIT ${LIMIT} OFFSET ${SKIP}
`;

console.log(`${targets.length} restaurants to attempt.\n`);

const results = [];

for (const r of targets) {
  process.stdout.write(`  ${r.name} ... `);
  try {
    const urls = await findMenuUrls(r);
    let menu = null;
    let sourceUrl = null;

    for (const url of urls.slice(0, MAX_CANDIDATES)) {
      const candidate = await scrapeMenu(url, r);
      // A "menu" of two dishes is a fragment of a page, not a small restaurant.
      // Genuinely tiny menus exist, but they are rarer than bad extractions.
      if (candidate?.found && candidate.dishes?.length >= 4) {
        menu = candidate;
        sourceUrl = url;
        break;
      }
    }

    if (!menu) {
      console.log(`no menu found (${credits} credits so far)`);
      results.push({ restaurantId: r.id, name: r.name, sourceUrl: "", confidence: "low", dishes: [] });
      continue;
    }

    console.log(`${menu.dishes.length} dishes, ${menu.confidence}`);
    results.push({
      restaurantId: r.id,
      name: r.name,
      sourceUrl,
      confidence: menu.confidence,
      dishes: menu.dishes.slice(0, 30),
    });
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
  }

  // Written after every restaurant, not at the end. An agent batch was killed
  // mid-run and lost twenty-two extractions that way; this costs one file write.
  if (!DRY_RUN) await writeFile(OUT_PATH, JSON.stringify(results, null, 2), "utf8");
}

const found = results.filter((r) => r.dishes.length > 0);
const withPrices = found.filter((r) => r.dishes.some((d) => d.price));

console.log(
  `\n${found.length}/${targets.length} menus found, ${withPrices.length} with prices.` +
    `\n${credits} credits used — ${(credits / Math.max(1, targets.length)).toFixed(1)} per restaurant.` +
    `\nAt that rate 1,000 credits covers about ${Math.floor(1000 / Math.max(1, credits / Math.max(1, targets.length)))} restaurants.`,
);

if (DRY_RUN) {
  console.log("\nDry run — nothing written.");
  for (const r of found.slice(0, 3)) {
    console.log(`\n--- ${r.name} (${r.confidence}) ${r.sourceUrl}`);
    for (const d of r.dishes.slice(0, 6)) {
      console.log(`    ${d.section.padEnd(16)} ${d.name} ${d.price}`);
    }
  }
} else {
  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`Review it, then: npm run menus:load -- ${OUT_PATH} --dry`);
}
