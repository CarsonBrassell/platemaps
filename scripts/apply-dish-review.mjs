/**
 * apply-dish-review.mjs — writes the decisions made in a dish-review file.
 *
 *   node --env-file=.env.local scripts/apply-dish-review.mjs                    # newest file, dry run
 *   node --env-file=.env.local scripts/apply-dish-review.mjs probe/dish-review-2026-09-09.md
 *   node --env-file=.env.local scripts/apply-dish-review.mjs --apply            # write
 *
 * The only thing that turns a typed dish name into a menu row. scripts/dish-review.mjs
 * proposes, a reviewer edits the `decision:` lines, and this applies them.
 *
 * Three decisions:
 *
 * - **promote** — insert a row into `dishes` for this restaurant, and re-point
 *   every post that used one of the item's spellings at the chosen name.
 * - **alias** — re-point the posts and insert nothing. The dish was already on
 *   the menu; somebody just spelled it differently.
 * - **reject** — write nothing but the decision, so the queue stops proposing it.
 *
 * ## What it refuses to do
 *
 * Nothing here deletes or rewrites a menu. A promote is an INSERT and an
 * `UPDATE posts SET dish_name` keyed by restaurant and fold; there is no
 * statement in this file that can shrink a restaurant's dish list, which is the
 * failure mode worth designing against — a pass that rebuilt a menu and came up
 * empty would retire the restaurant.
 *
 * It also refuses the whole run on a single unparseable or invalid item, the way
 * apply-cuisine-decisions.mjs does. A half-applied review is worse than an
 * unapplied one: the file is the record of what was decided, and applying
 * eleven of twelve items leaves nothing saying which one was skipped.
 *
 * Dry run by default, and it prints the plan item by item. `--apply` snapshots
 * the affected restaurants to probe/snapshots/ and then writes.
 */

import fs from "node:fs";
import path from "node:path";
import { sql } from "./sql-client.mjs";
import { foldDishName } from "../src/lib/dishNameMatch.ts";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const SNAP_DIR = "probe/snapshots";
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/* Community dishes get their own section, and that is the whole of how they are
   presented differently. `dishes.section` is already the grouping key in every
   surface that renders a menu — FullMenu groups by it, DishPicker groups by it —
   so a promoted dish announces where it came from on the restaurant page and in
   the composer without a type change or a line of UI. The `source` column is the
   machine-readable half, and exists so a menu re-extraction's DELETE can skip
   these rows. */
const COMMUNITY_SECTION = "Added by diners";

/* The price to write when the posts do not agree on one. Same placeholder
   load-menus.mjs uses for a dish whose price the menu page did not give, so
   `bandFor` in data/priceBands.ts already knows to skip it rather than reading
   it as a number. */
const NO_PRICE = "—";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local.");
  process.exit(1);
}

/* --- Which file ----------------------------------------------------------- */

const named = argv.find((a) => !a.startsWith("--"));
let file = named;
if (!file) {
  const candidates = fs.existsSync("probe")
    ? fs
        .readdirSync("probe")
        .filter((f) => /^dish-review-\d{4}-\d{2}-\d{2}\.md$/.test(f))
        .sort()
    : [];
  if (candidates.length === 0) {
    console.error(
      "No probe/dish-review-<date>.md to apply. Run scripts/dish-review.mjs first.",
    );
    process.exit(1);
  }
  file = path.join("probe", candidates[candidates.length - 1]);
}
if (!fs.existsSync(file)) {
  console.error(`No such file: ${file}`);
  process.exit(1);
}

/* --- Parse ---------------------------------------------------------------- */

const VALID = new Set(["promote", "alias", "reject"]);

/* The item header dish-review.mjs writes, carrying the restaurant and every
   spelling in the cluster. Decisions are recorded per spelling rather than per
   cluster, because clusters grow as posts arrive and an id derived from one
   would not survive to the next run. */
const ITEM_RE =
  /^<!--\s*item\s+n=(\d+)\s+r=(\S+)\s+bucket=(\S+)\s+folds=(.+?)\s*-->$/;

const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
const items = [];
const bad = [];
let current = null;

for (const [i, raw] of lines.entries()) {
  const line = raw.trim();
  const header = line.match(ITEM_RE);
  if (header) {
    current = {
      line: i + 1,
      n: Number(header[1]),
      restaurantId: header[2],
      bucket: header[3],
      folds: header[4].split("|").map((f) => f.trim()).filter(Boolean),
      decision: null,
      name: null,
      fence: "before",
    };
    if (items.some((it) => it.n === current.n)) {
      bad.push(`${file}:${i + 1} repeats item n=${current.n} — a forged or pasted header`);
    }
    items.push(current);
    continue;
  }
  if (!current) continue;
  /* dish-review.mjs writes exactly one fenced block after each header, holding
     `decision:` and `name:`. Only that block is read: everything else in the
     item is quoted post text, which users wrote, and a `decision:` line that a
     dish name smuggled in must not count (CLAUDE-SECURITY 2026-09-23 F1/F4). */
  if (line === "```") {
    if (current.fence === "before") current.fence = "inside";
    else if (current.fence === "inside") current.fence = "after";
    continue;
  }
  if (current.fence !== "inside") continue;
  /* First occurrence wins. A reviewer who wants to change a decision edits the
     line; a second `decision:` further down the item would be ambiguous, and
     silently taking the last one is how a stale edit gets applied. */
  const decision = line.match(/^decision:\s*(.*)$/);
  if (decision && current.decision === null) current.decision = decision[1].trim();
  const name = line.match(/^name:\s*(.*)$/);
  if (name && current.name === null) current.name = name[1].trim();
}

if (items.length === 0) {
  console.error(`${file} has no item headers. Was it written by dish-review.mjs?`);
  process.exit(1);
}

for (const item of items) {
  const where = `${file}:${item.line} (item ${item.n})`;
  if (item.decision === null) {
    bad.push(`${where} has no decision: line`);
    continue;
  }
  if (item.decision === "") continue; // Deliberately left for another day.
  if (!VALID.has(item.decision)) {
    bad.push(`${where} unknown decision "${item.decision}" — promote, alias, reject or blank`);
    continue;
  }
  if (item.folds.length === 0) bad.push(`${where} has no folds=`);
  if (item.decision !== "reject" && !item.name) {
    bad.push(`${where} ${item.decision} needs a name: line`);
  }
  if (item.name && foldDishName(item.name) === "") {
    bad.push(`${where} name "${item.name}" folds to nothing`);
  }
}

const todo = items.filter((i) => i.decision && VALID.has(i.decision));
const skipped = items.length - todo.length;

if (bad.length) {
  console.error(`Refusing to run. ${bad.length} bad item(s) in ${file}:`);
  for (const b of bad.slice(0, 40)) console.error("  " + b);
  process.exit(1);
}

/* The rest of the run, as a function purely so the two "nothing more to do"
   paths can `return`. They used to call process.exit(0), which on Windows aborts
   the process with a libuv assertion while the driver still holds a handle —
   `!(handle->flags & UV_HANDLE_CLOSING)`, exit code 127, so a clean dry run read
   as a crash. retire-untrusted-menus.mjs and index-dish-names.mjs carry the same
   note: let the driver close first, which means not exiting out from under it. */
async function run() {
  if (todo.length === 0) {
    console.log(`${file}: ${items.length} items, none decided. Nothing to do.`);
    return;
  }

  /* --- Check against the database ----------------------------------------- */

  const restaurantIds = [...new Set(todo.map((i) => i.restaurantId))];

  const restaurants = await sql.query(
    `SELECT id, name, hold_reason, lat, lng FROM restaurants WHERE id = ANY($1)`,
    [restaurantIds],
  );
  const restaurantById = new Map(restaurants.map((r) => [r.id, r]));

  const menuRows = await sql.query(
    `SELECT restaurant_id, id, name, name_folded, section, source, sort_order
       FROM dishes WHERE restaurant_id = ANY($1)`,
    [restaurantIds],
  );
  const menuByRestaurant = new Map();
  for (const row of menuRows) {
    const list = menuByRestaurant.get(row.restaurant_id);
    if (list) list.push(row);
    else menuByRestaurant.set(row.restaurant_id, [row]);
  }

  /* The posts each item will re-point, read now rather than carried in the file.
     Fresher by design: a post written since the queue was generated but spelled
     the same way is part of the same decision, and leaving it pointing at the old
     spelling would split one plate's ratings across two names. */
  const affectedPosts = await sql.query(
    `SELECT id, restaurant_id, dish_name, dish_name_folded AS folded
       FROM posts
      WHERE restaurant_id = ANY($1) AND dish_name_folded = ANY($2)`,
    [restaurantIds, [...new Set(todo.flatMap((i) => i.folds))]],
  );

  const problems = [];
  for (const item of todo) {
    const where = `item ${item.n} (${item.name ?? item.folds[0]})`;
    const restaurant = restaurantById.get(item.restaurantId);
    if (!restaurant) {
      problems.push(`${where}: restaurant ${item.restaurantId} is not in the table`);
      continue;
    }
    /* The listing gate is `hold_reason IS NULL` plus coordinates. A held
       restaurant should not be growing a menu from posts — and if it came off the
       list since the queue was written, that is worth seeing rather than working
       around. */
    if (restaurant.hold_reason) {
      problems.push(
        `${where}: ${restaurant.name} is held (${restaurant.hold_reason}) — ` +
          `re-run dish-review.mjs, it filters these out`,
      );
      continue;
    }

    const menu = menuByRestaurant.get(item.restaurantId) ?? [];
    item.restaurantName = restaurant.name;
    item.posts = affectedPosts.filter(
      (p) => p.restaurant_id === item.restaurantId && item.folds.includes(p.folded),
    );
    /* Every spelling the header names has to be a post at that restaurant. A
       header is text in a file, and one pointing at folds that were never in
       the queue for this restaurant is not a decision anybody reviewed. */
    const orphanFolds = item.folds.filter((f) => !item.posts.some((p) => p.folded === f));
    if (orphanFolds.length) {
      problems.push(
        `${where}: no posts at ${restaurant.name} spelled ${orphanFolds.map((f) => `"${f}"`).join(", ")} — ` +
          `re-run dish-review.mjs`,
      );
      continue;
    }

    if (item.decision === "alias") {
      /* An alias points at a spelling the menu actually uses, and that is checked
         rather than trusted: pointing posts at a name no dish row carries would
         leave the plate's ratings grouped under a name nothing renders. */
      const target = menu.find((d) => d.name_folded === foldDishName(item.name));
      if (!target) {
        problems.push(
          `${where}: alias target "${item.name}" is not a dish at ${restaurant.name}. ` +
            `Use promote to add it, or fix the name.`,
        );
        continue;
      }
      item.target = target;
    }

    if (item.decision === "promote") {
      const folded = foldDishName(item.name);
      const clash = menu.find((d) => d.name_folded === folded);
      if (clash) {
        /* Already there — almost always a reviewer correcting a cluster into a
           dish the menu turned out to list. Downgraded to an alias rather than
           refused, because that is plainly what was meant, and inserting would
           have hit the id the existing row holds. */
        item.decision = "alias";
        item.target = clash;
        item.downgraded = true;
        continue;
      }
      /* Positional ids (`<rid>-<n>`) belong to extraction; a promoted dish takes
         `<rid>-c-<slug>` so a re-extraction writing the whole positional range
         cannot land on one. Derived from the fold, so re-applying the same
         decision is an upsert onto the same row rather than a second dish. */
      item.dishId = `${item.restaurantId}-c-${folded.replace(/ /g, "-").slice(0, 60)}`;
      item.folded = folded;
      item.sortOrder = menu.reduce((max, d) => Math.max(max, d.sort_order ?? 0), 0) + 1;

      /* The price the posts agree on, if they agree. A plate people reported at
         the same price is worth carrying onto the row; a disagreement is not worth
         guessing at, and `—` is what the menu loader writes when a page gave no
         price. */
      const prices = {};
      for (const post of item.posts) {
        const p = (post.price ?? "").trim();
        if (p) prices[p] = (prices[p] ?? 0) + 1;
      }
      const ranked = Object.entries(prices).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      item.price = ranked.length === 1 || (ranked[0] && ranked[0][1] > (ranked[1]?.[1] ?? 0))
        ? ranked[0][0]
        : NO_PRICE;
    }
  }

  if (problems.length) {
    console.error(`Refusing to run. ${problems.length} item(s) cannot be applied:`);
    for (const p of problems.slice(0, 40)) console.error("  " + p);
    process.exit(1);
  }

  /* --- The plan ----------------------------------------------------------- */

  const promotes = todo.filter((i) => i.decision === "promote");
  const aliases = todo.filter((i) => i.decision === "alias");
  const rejects = todo.filter((i) => i.decision === "reject");

  console.log(`${file}`);
  console.log(
    `  ${todo.length} decided, ${skipped} left blank, ` +
      `across ${restaurantIds.length} restaurants`,
  );
  console.log("");

  for (const item of promotes) {
    console.log(
      `  promote  ${item.restaurantName} · "${item.name}" ` +
        `(${item.price}) — ${item.posts.length} posts re-pointed`,
    );
    console.log(`           new dish ${item.dishId} in "${COMMUNITY_SECTION}"`);
  }
  for (const item of aliases) {
    console.log(
      `  alias    ${item.restaurantName} · → "${item.target.name}" ` +
        `(${item.target.id}) — ${item.posts.length} posts re-pointed` +
        (item.downgraded ? "  [promote downgraded: already on the menu]" : ""),
    );
  }
  for (const item of rejects) {
    console.log(`  reject   ${item.restaurantName} · ${item.folds.join(", ")}`);
  }

  const postsTouched = promotes.concat(aliases).reduce((n, i) => n + i.posts.length, 0);
  console.log("");
  console.log(
    `  ${promotes.length} dishes added, ${aliases.length} aliased, ` +
      `${rejects.length} rejected, ${postsTouched} posts re-pointed`,
  );

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write.");
    return;
  }

  /* --- Snapshot, then write ----------------------------------------------- */

  fs.mkdirSync(SNAP_DIR, { recursive: true });
  const snapPath = path.join(SNAP_DIR, `dish-review-${STAMP}.json`);
  fs.writeFileSync(
    snapPath,
    JSON.stringify(
      {
        file,
        appliedAt: new Date().toISOString(),
        /* hold_reason and the coordinates first, because those are what decide
           whether a restaurant is listed at all, and a bulk write near the dish
           table is exactly when you want the before picture of the listing gate. */
        restaurants: restaurants.map((r) => ({
          id: r.id,
          name: r.name,
          hold_reason: r.hold_reason,
          lat: r.lat,
          lng: r.lng,
          dishes: (menuByRestaurant.get(r.id) ?? []).map((d) => ({
            id: d.id,
            name: d.name,
            section: d.section,
            source: d.source,
          })),
        })),
        posts: affectedPosts.map((p) => ({
          id: p.id,
          restaurant_id: p.restaurant_id,
          dish_name: p.dish_name,
        })),
        decisions: todo.map((i) => ({
          n: i.n,
          restaurantId: i.restaurantId,
          decision: i.decision,
          name: i.name,
          folds: i.folds,
          dishId: i.dishId ?? i.target?.id ?? null,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nSnapshot: ${snapPath}`);

  let dishesAdded = 0;
  let postsRepointed = 0;
  let decisionsWritten = 0;

  for (const item of todo) {
    if (item.decision === "promote") {
      await sql.query(
        `INSERT INTO dishes
           (id, restaurant_id, name, description, price, section,
            yes_votes, no_votes, sort_order, source)
         VALUES ($1, $2, $3, NULL, $4, $5, 0, 0, $6, 'community')
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           price = EXCLUDED.price,
           section = EXCLUDED.section,
           source = 'community'`,
        [item.dishId, item.restaurantId, item.name, item.price, COMMUNITY_SECTION, item.sortOrder],
      );
      dishesAdded += 1;
    }

    const canonical = item.decision === "alias" ? item.target.name : item.name;
    if (item.decision !== "reject") {
      /* Keyed by restaurant AND fold, and `dish_name_folded` is generated, so this
         cannot reach a post at another restaurant or one spelled differently. The
         posts whose spelling is already the canonical one are excluded rather than
         rewritten to themselves. */
      const updated = await sql.query(
        `UPDATE posts SET dish_name = $1
          WHERE restaurant_id = $2
            AND dish_name_folded = ANY($3)
            AND dish_name IS DISTINCT FROM $1
          RETURNING id`,
        [canonical, item.restaurantId, item.folds],
      );
      postsRepointed += updated.length;
    }

    /* One row per spelling, not per cluster. See the ITEM_RE note above. */
    for (const fold of item.folds) {
      await sql.query(
        `INSERT INTO dish_review_decisions
           (restaurant_id, name_folded, decision, canonical_name, dish_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (restaurant_id, name_folded) DO UPDATE SET
           decision = EXCLUDED.decision,
           canonical_name = EXCLUDED.canonical_name,
           dish_id = EXCLUDED.dish_id,
           decided_at = now()`,
        [
          item.restaurantId,
          fold,
          item.decision,
          item.decision === "reject" ? null : canonical,
          item.dishId ?? item.target?.id ?? null,
        ],
      );
      decisionsWritten += 1;
    }
  }

  console.log(
    `Done. ${dishesAdded} dishes added, ${postsRepointed} posts re-pointed, ` +
      `${decisionsWritten} decisions recorded.`,
  );
  if (dishesAdded > 0) {
    /* The new dishes are on their restaurants' pages already — every menu surface
       reads `dishes` directly. What they are not yet is *searchable*: the dropdown
       reads the materialised `dish_names` vocabulary, which is rebuilt rather than
       written through. menus:load calls this at the end of its run for the same
       reason; it is left as a command here rather than spawned, because this
       script otherwise touches nothing it did not snapshot. */
    console.log("\nRun `npm run dishes:index` to make the new dishes searchable.");
  }
}

await run();
await sql.end?.();
