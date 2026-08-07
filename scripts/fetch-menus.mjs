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

const DATA_PATH = new URL("../src/data/restaurants.ts", import.meta.url);
const DISHES_PATH = new URL("../src/data/dishes.ts", import.meta.url);

const DRY_RUN = process.argv.includes("--dry");
const limitFlag = process.argv.indexOf("--limit");
const LIMIT = limitFlag !== -1 ? Number(process.argv[limitFlag + 1]) : Infinity;

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
        price: z.string().describe('Formatted like "$12.00". Empty string if unlisted.'),
        section: z
          .string()
          .describe('Menu section, e.g. "Tacos", "Starters", "Draft Beer".'),
      }),
    )
    .describe("Up to 30 dishes. Prefer mains and signatures over sides and drinks."),
});

/** Pull id/name/neighborhood out of the generated restaurants array. */
async function loadRestaurants() {
  const src = await readFile(DATA_PATH, "utf8");
  const out = [];
  for (const block of src.matchAll(/\{\s*\n\s*id:\s*"([^"]+)"[\s\S]*?\n\s*\},/g)) {
    const [text, id] = block;
    const name = text.match(/name:\s*"([^"]+)"/)?.[1];
    const neighborhood = text.match(/neighborhood:\s*"([^"]+)"/)?.[1];
    const cuisine = text.match(/cuisine:\s*"([^"]+)"/)?.[1];
    if (name) out.push({ id, name, neighborhood, cuisine });
  }
  return out;
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

const restaurants = (await loadRestaurants()).slice(0, LIMIT);
console.log(`Extracting menus for ${restaurants.length} restaurants...\n`);

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

// Opus 5 list pricing, for a rough read on what a full run would cost.
const cost = (inputTokens / 1e6) * 5 + (outputTokens / 1e6) * 25;
console.log(
  `\n${results.length}/${restaurants.length} menus found.` +
    `\nTokens: ${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out` +
    `\nApprox model cost: $${cost.toFixed(2)} (excludes web search tool usage)`,
);

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

const body = results
  .map(({ restaurant, menu }) => {
    const dishes = menu.dishes
      .map((dish, i) => {
        const fields = [
          `id: ${JSON.stringify(`${restaurant.id}-${i + 1}`)}`,
          `name: ${JSON.stringify(dish.name)}`,
          `price: ${JSON.stringify(dish.price || "—")}`,
          `section: ${JSON.stringify(dish.section)}`,
          `yesVotes: 0`,
          `noVotes: 0`,
        ];
        return `    { ${fields.join(", ")} },`;
      })
      .join("\n");
    return `  ${JSON.stringify(restaurant.id)}: [\n${dishes}\n  ],`;
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
console.log(`\nWrote ${results.length} menus to src/data/dishes.ts`);
