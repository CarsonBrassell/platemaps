/**
 * Finds each restaurant's real menu and extracts it into src/data/dishes.ts.
 *
 *   ANTHROPIC_API_KEY=... node --env-file=.env.local scripts/fetch-menus.mjs --limit 3 --dry
 *   ANTHROPIC_API_KEY=... node --env-file=.env.local scripts/fetch-menus.mjs
 *
 * There is no menu API — not Yelp, not Google Places, not Foursquare — so the
 * menu has to be found and read off the open web. Rather than building a
 * scraper per restaurant website (menus are variously HTML, PDFs, flat images
 * and JS widgets), this hands the job to Claude with the server-side
 * web_search and web_fetch tools: search runs on Anthropic's infrastructure,
 * the page is fetched there, and only the extracted result comes back. No
 * scraping code, no headless browser, no per-site parsing to maintain.
 *
 * COST: this bills the Anthropic API per token. It is NOT covered by a Claude
 * subscription. Run with --limit first and read the reported usage before
 * turning it loose on the whole list.
 *
 * ACCURACY: menus go stale and extraction is imperfect. Every dish carries the
 * page it came from so a wrong one can be traced, and --dry prints without
 * writing so the output can be read before it lands.
 */

import { readFile, writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { restaurants as allRestaurants } from "../src/data/restaurants.ts";
import { dishesByRestaurant as existingMenus } from "../src/data/dishes.ts";

const DISHES_PATH = new URL("../src/data/dishes.ts", import.meta.url);

const DRY_RUN = process.argv.includes("--dry");
const limitFlag = process.argv.indexOf("--limit");
const LIMIT = limitFlag !== -1 ? Number(process.argv[limitFlag + 1]) : Infinity;

/**
 * Re-extract menus for restaurants that already have one. Off by default.
 *
 * Without this the script walked `restaurants.slice(0, LIMIT)` — always the
 * same prefix — so a second `--limit 50` re-bought the first fifty menus and
 * never reached the fifty-first. At 36 restaurants that was a rounding error.
 * At 682, where nobody is fetching the whole corpus in one run, it meant the
 * script could not make progress at any price.
 *
 * Menus do go stale, so refetching has to stay possible; it just isn't what
 * you want by default when most of the corpus has no menu at all.
 */
const REFETCH = process.argv.includes("--refetch");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY is not set.\n" +
      "This script bills the Anthropic API per token and is NOT covered by a\n" +
      "Claude subscription. Add the key to .env.local and re-run with\n" +
      "--env-file=.env.local, starting with --limit 5 --dry.",
  );
  process.exit(1);
}

const client = new Anthropic();

const MenuSchema = z.object({
  found: z
    .boolean()
    .describe("True only if you located an actual menu for this exact restaurant."),
  sourceUrl: z
    .string()
    .describe("URL the menu was read from, or empty string if not found."),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "high: official site menu. medium: a reliable third party. low: partial, dated, or you are unsure it is the right location.",
    ),
  dishes: z
    .array(
      z.object({
        name: z.string().describe("Dish name exactly as written on the menu."),
        description: z
          .string()
          .describe(
            "The menu's own one-line description of what is in the dish, trimmed to " +
              "about 45 characters. Empty string if the menu gives none — do not invent one.",
          ),
        price: z.string().describe('Formatted like "$12.00". Empty string if unlisted.'),
        section: z
          .string()
          .describe('Menu section, e.g. "Tacos", "Starters", "Draft Beer".'),
      }),
    )
    .describe("Up to 30 dishes. Prefer mains and signatures over sides and drinks."),
});

/** Pull id/name/neighborhood out of the generated restaurants array. */
/**
 * Which restaurants this run should spend money on.
 *
 * The list is imported rather than regex-scraped out of the source file — Node
 * strips the types, so the array arrives as data and a formatting change can't
 * quietly halve the corpus the way a pattern miss would.
 */
function restaurantsToFetch() {
  const wanted = REFETCH
    ? allRestaurants
    : allRestaurants.filter((r) => !(existingMenus[r.id]?.length > 0));
  return wanted.slice(0, LIMIT);
}

async function extractMenu(restaurant) {
  const prompt = [
    `Find the current menu for "${restaurant.name}", a ${restaurant.cuisine} restaurant`,
    `in ${restaurant.neighborhood}, San Diego, California.`,
    ``,
    `Search for its official website first and read the menu from there. Fall back to a`,
    `reliable third party only if the official site has no readable menu.`,
    ``,
    `Be strict about identity: San Diego has chains and similarly named places. If you`,
    `cannot confirm the menu belongs to this specific restaurant at this location, set`,
    `found to false rather than guessing. A missing menu is fine; a wrong one is not.`,
  ].join("\n");

  let response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: zodOutputFormat(MenuSchema),
    },
    tools: [
      { type: "web_search_20260209", name: "web_search", max_uses: 6 },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
    ],
    messages: [{ role: "user", content: prompt }],
  });

  // Server-side tool loops pause at their iteration cap; resend to continue.
  let guard = 0;
  const history = [{ role: "user", content: prompt }];
  while (response.stop_reason === "pause_turn" && guard++ < 4) {
    history.push({ role: "assistant", content: response.content });
    response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(MenuSchema) },
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 6 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
      ],
      messages: history,
    });
  }

  if (response.stop_reason === "refusal") {
    return { menu: null, usage: response.usage, reason: "refused" };
  }

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  try {
    return { menu: MenuSchema.parse(JSON.parse(text)), usage: response.usage };
  } catch {
    return { menu: null, usage: response.usage, reason: "unparseable response" };
  }
}

const restaurants = restaurantsToFetch();
const haveMenus = Object.keys(existingMenus).length;

console.log(
  `${allRestaurants.length} restaurants, ${haveMenus} with a menu, ` +
    `${allRestaurants.length - haveMenus} without.`,
);
console.log(
  REFETCH
    ? `Re-extracting ${restaurants.length} (--refetch).\n`
    : `Extracting ${restaurants.length} that have no menu yet.\n`,
);

if (restaurants.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

const results = [];
let inputTokens = 0;
let outputTokens = 0;

for (const restaurant of restaurants) {
  process.stdout.write(`  ${restaurant.name} ... `);
  try {
    const { menu, usage, reason } = await extractMenu(restaurant);
    inputTokens += usage?.input_tokens ?? 0;
    outputTokens += usage?.output_tokens ?? 0;

    if (!menu?.found || menu.dishes.length === 0) {
      console.log(`no menu (${reason ?? "not found"})`);
      continue;
    }
    console.log(`${menu.dishes.length} dishes, ${menu.confidence} confidence`);
    results.push({ restaurant, menu });
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
  }
}

/*
 * What this cost, and what the rest of the corpus would.
 *
 * The per-restaurant figure is the one that matters — this script exists to be
 * run with a small `--limit` first, and a total is useless for extrapolating
 * unless you divide it yourself. Both numbers exclude the web search and fetch
 * tools, which are billed per use on top and, at up to six of each per
 * restaurant, are plausibly the larger half of the bill.
 */
const OPUS_INPUT_PER_MTOK = 5;
const OPUS_OUTPUT_PER_MTOK = 25;

const cost = (inputTokens / 1e6) * OPUS_INPUT_PER_MTOK + (outputTokens / 1e6) * OPUS_OUTPUT_PER_MTOK;
const perRestaurant = cost / restaurants.length;
const remaining = allRestaurants.length - haveMenus - results.length;

console.log(
  `\n${results.length}/${restaurants.length} menus found.` +
    `\nTokens: ${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out` +
    `\nModel cost: $${cost.toFixed(2)} for this run, ` +
    `$${perRestaurant.toFixed(3)} per restaurant attempted.`,
);
if (remaining > 0) {
  console.log(
    `Extrapolated: ~$${(perRestaurant * remaining).toFixed(2)} to attempt the ` +
      `remaining ${remaining} restaurants.`,
  );
}
console.log("Both figures EXCLUDE web search and web fetch tool billing.");

for (const { restaurant, menu } of results) {
  console.log(`\n--- ${restaurant.name} (${menu.confidence}) ${menu.sourceUrl}`);
  for (const dish of menu.dishes.slice(0, 8)) {
    console.log(`    ${dish.section.padEnd(18)} ${dish.name} ${dish.price}`);
  }
  if (menu.dishes.length > 8) console.log(`    ... ${menu.dishes.length - 8} more`);
}

if (DRY_RUN) {
  console.log("\nDry run — dishes.ts untouched.");
  process.exit(0);
}

if (results.length === 0) {
  console.log("\nNothing found; leaving dishes.ts alone.");
  process.exit(0);
}

/*
 * Replace only the dish map, preserving the type declarations and helpers
 * around it — the same mistake that truncated restaurants.ts on the first run.
 */
const current = await readFile(DISHES_PATH, "utf8");
const mapStart = current.indexOf("export const dishesByRestaurant");
if (mapStart === -1) {
  console.error("Could not find `export const dishesByRestaurant` — aborting.");
  process.exit(1);
}
const mapEnd = current.indexOf("\n};", mapStart);
if (mapEnd === -1) {
  console.error("Could not find the end of the dish map — aborting.");
  process.exit(1);
}

/*
 * Merge into what's already on file, don't replace it.
 *
 * This used to write only `results` — the menus from this run — over the whole
 * map. That was survivable when one run covered the entire corpus. It is not
 * survivable now: at 682 restaurants every run is partial by necessity, so a
 * replace would delete every menu bought by every previous run. Running
 * `--limit 50` four times would have left fifty menus and a large bill.
 *
 * Vote counts ride along with the dishes they belong to, so a refetch of one
 * restaurant cannot reset another's.
 */
const merged = { ...existingMenus };
for (const { restaurant, menu } of results) {
  merged[restaurant.id] = menu.dishes.map((dish, i) => ({
    id: `${restaurant.id}-${i + 1}`,
    name: dish.name,
    ...(dish.description ? { description: dish.description } : {}),
    price: dish.price || "—",
    section: dish.section,
    yesVotes: 0,
    noVotes: 0,
  }));
}

// Ordered by restaurant id so the file's diff stays readable as it grows,
// rather than reordering itself according to whatever this run happened to
// fetch. Numeric where the ids are numeric, which they are.
const orderedIds = Object.keys(merged).sort((a, b) => {
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b);
});

const body = orderedIds
  .map((restaurantId) => {
    const dishes = merged[restaurantId]
      .map((dish) => {
        const fields = [
          `id: ${JSON.stringify(dish.id)}`,
          `name: ${JSON.stringify(dish.name)}`,
          // Optional in the type — leave the key off entirely rather than
          // writing an empty string the UI would have to test for.
          ...(dish.description ? [`description: ${JSON.stringify(dish.description)}`] : []),
          `price: ${JSON.stringify(dish.price || "—")}`,
          `section: ${JSON.stringify(dish.section)}`,
          `yesVotes: ${dish.yesVotes ?? 0}`,
          `noVotes: ${dish.noVotes ?? 0}`,
        ];
        return `    { ${fields.join(", ")} },`;
      })
      .join("\n");
    return `  ${JSON.stringify(restaurantId)}: [\n${dishes}\n  ],`;
  })
  .join("\n");

const next =
  current.slice(0, mapStart) +
  `// Generated by scripts/fetch-menus.mjs. Menus are read off each restaurant's\n` +
  `// own site by Claude; they go stale, so re-run periodically. Vote counts start\n` +
  `// at zero because no one has voted on these dishes yet.\n` +
  `export const dishesByRestaurant: Record<string, Dish[]> = {\n${body}\n};` +
  current.slice(mapEnd + "\n};".length);

await writeFile(DISHES_PATH, next, "utf8");
console.log(
  `\nWrote ${results.length} new menus into src/data/dishes.ts ` +
    `(${orderedIds.length} menus on file now).`,
);
console.log("Run `npm run restaurants:import` to load them into Postgres.");
