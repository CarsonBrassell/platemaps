# Menu throughput — session brief

**How to start a session on this:** open Claude Code in this repo and say
`Read probe/THROUGHPUT.md and run it.` Everything a fresh session needs is
here. It does not need the conversation that produced it.

## State at handoff, 2026-09-03 21:00

| | |
|---|---|
| menus | 4,676 |
| dishes | 343,068 |
| untried queue | 2,458 |
| **listed restaurants with a menu** | **3,057 of 4,327 = 71%** |

The last number is the one that matters: 8,564 rows exist but 2,364 are held
permit-only records nobody can see and 1,873 are live-but-unlisted awaiting
enrichment. **The finishable target is the 1,270 listed restaurants still
without a menu**, not the corpus total. Coverage by popularity: 93% of the
1000+ review tier, 86% of 500-999, 70% of 200-499, 27% of 50-199.

## Token discipline — READ THIS BEFORE SPAWNING ANYTHING

A coordinator session on 2026-09-03 reached a **716,000-token context** and was
re-sending all of it every turn: one 27-byte user question cost ~1.4M input
tokens. Measured breakdown of that context: 21.9% tool results, 22.8% thinking,
**17.8% the coordinator's own inline agent prompts**, 10.7% Bash inputs. Only
0.1% was actual user turns.

Rules that follow, all structural rather than "try to be terser":

1. **Never paste an agent brief inline.** `probe/AGENT-BRIEF.md` holds it. A
   spawn says only: which batch file, which result file, which scratch dir.
   ~40 tokens instead of ~2,566. This was the single largest controllable line
   item — 47 spawns cost 120,601 resident tokens and 33.2M lifetime re-reads.
2. **Cap agent reports at 300 words** and say why in the brief. The coordinator
   pays for every word forever.
3. **Redirect command output to a file and print only a tail or a count.** Never
   let a large result land in the transcript.
4. **Avoid background-command polling.** Those generate `queued_command`
   reminders — 39 of them cost 37,731 tokens in that session.
5. **Compact or restart at ~200k context, not 700k.** Nothing else reclaims what
   is already resident; behaviour changes only stop further growth. Restarting
   from this file costs ~50k and cuts every later turn by ~93%.

This is a standing job, not a one-off: it runs the extraction funnel below
until the queue is empty, cheapest tier first, spending nothing. The full plan
and its numbers are in the artifact
<https://claude.ai/code/artifact/94991ebc-330a-43a0-9970-d4680f8b82e2>;
`probe/CONTEXT-2026-09-02.md` §"Menu throughput plan" has the summary.

A separate session may be working on **coverage** (importing ~4,400 county
permits so the corpus reaches ~9,000 restaurants). That session owns
`scripts/verify-coverage.mjs`, `scripts/resolve-places.mjs`,
`scripts/import-deh.mjs`, `data/deh-*.json` and the `restaurants` table's
address/identity columns. This session does not touch those. As that import
lands, new restaurants simply appear in the queue here.

---

## Standing constraints

Copied from `RUNBOOK.md` §8, plus the rule Calvin set on 2026-09-02:

- **Spend nothing.** No paid tier of anything. Firecrawl runs on its free
  credits only (`--max-credits`, hard stop; never upgrade, never enter a card).
  Never run a Google or Yelp API script. Never run `scripts/fetch-menus.mjs`
  (bills the Anthropic API per token). Vision-via-API (tier T3) is parked
  until Calvin says otherwise — agents read menu images in their own context
  instead, as today.
- **Never commit to git.**
- **Never print raw secrets.** `.env.local` values never appear in output.
- `scripts/migrate.mjs` is append-only. This job should not need it.
- Prefer Edit/Write over PowerShell for file surgery — `Set-Content` corrupts
  em dashes on this machine.
- Agents may confirm a store location; they may not submit an age gate,
  login, email, or accept terms.
- Run `npx tsc --noEmit` before stopping and leave the tree compiling. The
  tree is shared with another session (`AGENTS.md`).
- **Never end a turn with nothing running** unless the queue is empty. Report
  *and* spawn in the same turn.

## Read first

1. `probe/RUNBOOK.md` — the agent loop, screening and loading, salvaging dead
   agents, batch cutting, the agent brief. Every rule was learned by getting
   it wrong.
2. `probe/STATE.md` — coverage, what the queue is made of, the browser-only
   backlog, open items.
3. `probe/PLAYBOOK.md` §9 — the per-platform curl recipes. This is what the
   router automates.
4. `scripts/screen-menus.mjs` header — what the screen enforces. Every tier
   below feeds the same screen; nothing loads without passing it.

## The funnel

Each restaurant enters at the top and drops through until something produces
a menu that passes the screen.

| Tier | What | Cost | Status on 2026-09-02 |
|---|---|---|---|
| T0 | `share-chain-menus.mjs` — branch inherits nearest sibling's menu | $0 | exists |
| W | `scripts/find-websites.mjs` — Serper search fills `restaurants.website` for rows that have none | $0 (2,500 free queries, one-time) | **to build**, spec in appendix; needs `SERPER_API_KEY` from Calvin |
| T1 | `scripts/route-menus.mjs` — detect ordering platform from the website, run the existing extractor, no model | $0 | being built (an Opus agent, 2026-09-02 evening) |
| T1b | `scripts/browser-menus.mjs` — local Playwright for the `needs-browser` list (store-pick storefronts, JS-only sites) | $0 | **built and proven**: 14 filed of 60 attempted (23%), no model tokens. Run it on the `needs-browser` + `gated` pile from every router notes file |
| T2 | `scripts/fetch-menus-firecrawl.mjs` — Firecrawl JSON extraction for own-site HTML menus | free credits only | **parked on economics, not on safety.** Key works, guards are good, and it is still not worth running — see below |
| T3 | vision on PDF/image menus via the API | cents | **parked — costs money** |
| T4 | agent waves, judgment cases only | usage | running, `RUNBOOK.md` §1 |
| T5 | API run of the tail via Message Batches | money | **parked** |

### Measured on 2026-09-02, same corpus, same day

Every tier was run against the same queue in one session, so these are
comparable rather than remembered.

| tier | tried | menus | hit rate | wall clock | cost |
|---|---|---|---|---|---|
| T1 router | 1,265 | 111 | 8.8% | ~20 min | zero tokens |
| T1b browser | 60 | 14 | 23% | ~40 min | zero tokens |
| T4 agents, WITH the router's note in the batch | 40 | 22 | 55% | ~50 min | ~1.1M tokens |
| T4 agents, without it | 30 | 1 | 3% | ~45 min | ~0.7M tokens |
| T2 Firecrawl | 24 | 2 clean | 8% | ~20 min | 342 credits |

Three things follow, and they are the whole argument for the funnel:

**The router is ~340x faster per restaurant than an agent and costs nothing.**
It only cracks the platforms someone has already reverse-engineered, which is
why promoting a recipe into it is the highest-value work available: it moves
restaurants from the 3-week tier to the 20-minute one permanently.

**Handing agents the router's note is what changed their yield**, from 1 menu
per 30 restaurants to 22 per 40. Same model, same rules. They stopped spending
context discovering the platform and started at the hard part. Never cut a
batch without joining the notes — `cut-batches.mjs` does this for you.

**T2 costs ~171 credits per menu that survives the screen**, so the free 1,000
buys about six. Worse, both menus it produced were restaurants agents had
already done better, and loading them SHRANK two menus (114→113, 64→56) before
the loss was caught and reverted. The diagnosis is in its own failure shape: 19
of its 24 misses were sites whose menus are not in the fetched HTML at all.
That is T1b's work, not a tuning problem, and no budget converts it. Its guards
(price-coverage floor, section-coverage floor, never-shrink, multi-page merge)
are genuinely good and caught three fragments that would have permanently
dequeued restaurants with hundreds of dishes — keep them, keep the tier parked.

**Whenever you load a file that was extracted a while ago, re-check dish counts
first.** A never-shrink guard inside an extractor reads the count when the run
STARTS; anything loaded in between makes that stale.

**First thing every session:** check what exists.

```
ls scripts/route-menus.mjs scripts/fetch-menus-firecrawl.mjs
ls menus/wip/router-* menus/wip/firecrawl-*
node --env-file=.env.local scripts/menus-todo.mjs
```

If `scripts/route-menus.mjs` is missing, the agent that was building it has
not finished or failed. Do not build a second one blind: check
`probe/CONTEXT-2026-09-02.md` for a later note, and if nothing says it
landed, build it to the spec at the bottom of this file.

## The website gap, and why it comes first

The router, Firecrawl and Jina all start from `restaurants.website`. Today
663 of the 1,178 queued rows have one. The ~4,400 restaurants arriving from
the county permit import have **none** — the permit list carries no website,
and under the no-spend rule Google enrichment fills websites at 1,000 rows a
month. Left alone, the router would be starved for months and agents would
burn usage finding sites in their own context.

Serper (Google results as an API) closes that in about an hour:
2,500 free queries on signup, one-time, no card. That is the first thing to
build once the key exists. Until it does, the router runs on the rows that
have a website and the agents take the rest — say so in the report rather
than letting it look like a throughput problem.

**The key landed 2026-09-02 and `scripts/find-websites.mjs` is running.** Two
lessons from its first 350 live queries, both of which cost a cleanup:

- **A website that is not the restaurant's is worse than no website**, because
  the router, Firecrawl and every agent will faithfully go and read it. 33 of
  the first 159 picks were news articles, Eater venue pages, TikTok, Waze, a
  gift-card page, and directory farms. Two separate agents wasted time on farm
  domains before they were purged.
- **Directory farms mint a subdomain per restaurant**, so a name-in-the-host
  test passes on `the-cliffs-cafe.hey-restaurants.com`. Test the registrable
  domain only. There is a second shape too: a cheap-TLD *brand twin*
  (`laplayatacoshop.shop`) that 301s to a farm on another domain
  (`mappway.com`) and prints no prices. 18 of those were already in the table
  from earlier enrichment. The reliable test is the redirect, not the TLD — a
  taco shop really can live on a `.shop` domain, and several do.

`scratchpad/purge-brandtwin.cjs` re-runs the brand-twin check over the whole
table; it only nulls a site that leaves its own registrable domain AND shows
no prices.

**Accounts are Calvin's to create.** Never sign up for a service, never enter
a card. The keys this job can use, all in `.env.local`:

| Key | Service | Free allowance | Hard rule |
|---|---|---|---|
| `SERPER_API_KEY` | serper.dev | 2,500 queries, one-time | the script stops at 2,400 and never buys a pack |
| `JINA_API_KEY` | jina.ai Reader | 10M tokens, 500 req/min | optional; retrieval only, never extraction |
| `FIRECRAWL_API_KEY` | firecrawl.dev | ~1,000 credits | parked (see T2) |

## The loop

Run this until `menus-todo.mjs` reports an empty untried queue.

### 0. Website discovery (W) — once per import, then as new rows arrive

```
node --env-file=.env.local scripts/find-websites.mjs --dry      # shows the plan and the query count
node --env-file=.env.local scripts/find-websites.mjs --max-queries 2400
```

Skip if `SERPER_API_KEY` is absent; note it in the report as the blocker.

### 1. Router pass (T1) — nightly, and once around noon

```
node --env-file=.env.local scripts/route-menus.mjs
node scripts/screen-menus.mjs menus/wip/router-<timestamp>.json
node --env-file=.env.local scripts/load-menus.mjs menus/wip/clean.json
```

- The router writes two files: the result file and a `.notes.json` saying,
  per restaurant, which platform it found and why it did not file. **Keep the
  notes file** — step 3 hands it to the agents.
- The noon run is not optional. Toast, Clover and `order.online` storefronts
  return a handful of items while the store is closed (the "closed-store
  gate"). A 3am run re-confirms the same six closures every night and an
  agent spends twenty minutes rediscovering each.
- **Re-run gated ids with `--no-cache`, or you re-read the 3am payload.** The
  response cache has no TTL, so `--ids <gated>` alone hands back the very
  bytes that produced the gate verdict and re-confirms it forever. On
  2026-09-03 a `--no-cache` pass over 100 Toast ids that were sitting in
  `needs-browser`/`gated` filed 11 menus and 1,251 dishes for nothing.
- **A `needs-browser` Toast row is often just a daypart gate wearing a
  different label.** The browser pass filed 22 Toast storefronts and reported
  all 22 as curl-reproducible with no cookies and no auth — because it happened
  to open them in a serving window. The fix is another `--no-cache` router pass
  at a different hour, not a browser. Only the metadata-only deployments (an
  `__OO_STATE__` with no `Menu:` entries) genuinely need one.
- Read the screen's quarantine reasons. A systematic one (a barred host the
  router filed, a markup shape on one platform) is a router bug: fix it and
  re-run those ids with `--ids`, do not hand them to agents.

### 2. Firecrawl pass (T2) — while free credits last

```
node --env-file=.env.local scripts/fetch-menus-firecrawl.mjs --max-credits 200
node scripts/screen-menus.mjs menus/wip/firecrawl-<timestamp>.json
node --env-file=.env.local scripts/load-menus.mjs menus/wip/clean.json
```

- Only after the accuracy trial has been read. The trial compared Firecrawl's
  output against 15 menus we already trust; its verdict is in
  `probe/CONTEXT-2026-09-02.md` (look for "Firecrawl trial") or in the
  scratch dir it names. If the verdict is "not accurate enough", skip this
  tier and say so in the report.
- Free tier is ~1,000 credits a month; a restaurant costs 7–17. When the API
  reports credits exhausted, stop and note the date. Do not upgrade.

### 2b. Browser pass (T1b) — daytime, for the `needs-browser` outcomes

```
node --env-file=.env.local scripts/browser-menus.mjs --from menus/wip/router-<timestamp>.notes.json
node scripts/screen-menus.mjs menus/wip/browser-<timestamp>.json
node --env-file=.env.local scripts/load-menus.mjs menus/wip/clean.json
```

- Takes only rows the router marked `needs-browser` or `gated`, one at a
  time, in its own Chromium — never the shared browser pane.
- **Chains first.** The needs-browser list is mostly store-pick storefronts
  belonging to chains (Taco Bell, Pizza Hut, Popeyes, Dairy Queen, Coffee
  Bean). One cracked storefront plus `share-chain-menus.mjs` fills every
  branch. Sort the list by branch count descending.
- What it learns is a recipe: when a storefront's network call turns out to
  be reproducible with curl, write it into `PLAYBOOK.md` §9 and move that
  platform into the router. The browser is for discovery and for the
  storefronts that genuinely need a store pick.

### 3. Chain share (T0) — after every load

```
node --env-file=.env.local scripts/share-chain-menus.mjs
```

### 4. Agent waves (T4) — the rest, continuously

Follow `RUNBOOK.md` §1 exactly (cut batches with `cut-batches.mjs`, four
agents, `model: sonnet`, replace each on completion), with two additions:

- **Put the router's note in every work item.** Before cutting, join
  `menus/wip/router-*.notes.json` to the queue by `restaurantId` and include
  `platform`, `outcome` and `detail` in the batch file. The brief must say:
  *"The router already tried the platform named in your item; do not repeat
  that, start from its note."* This is what makes the usage cap buy two to
  three times as many menus.
- **Route by outcome, not by id.** `gated` → the noon router run, never an
  overnight agent. `needs-browser` → an agent, in daylight, one at a time
  (the browser pane is shared). `fetch-failed` on a dead host (parked domain,
  res-menu.net outage) → park for a week (`scripts/defer-blocked.mjs`),
  do not re-queue nightly. `no-platform` with a website → agent. No website
  at all → agent, lowest priority, and note in the report how many there are.

Priority order within the queue: `review_count DESC`. The most-reviewed
missing restaurants are the ones visitors will search for.

### 5. Report, then spawn

Every report to Calvin carries: menus loaded this session by tier (router /
firecrawl / chain / agents), queue remaining, screen quarantine count and the
top three reasons, credits spent, and anything that blocked a whole tier. Then
spawn the next wave in the same turn.

Re-measure with:

```
cd "C:/Users/Calvin  Lensink/Documents/platemaps"
node --env-file=.env.local -e "const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);(async()=>{const [a]=await sql\`SELECT count(DISTINCT restaurant_id)::int n FROM dishes\`;const [b]=await sql\`SELECT count(*)::int n FROM dishes\`;const [q]=await sql\`SELECT count(*)::int n FROM restaurants r WHERE r.hold_reason IS NULL AND NOT EXISTS(SELECT 1 FROM dishes d WHERE d.restaurant_id=r.id) AND NOT EXISTS(SELECT 1 FROM menu_lookups m WHERE m.restaurant_id=r.id)\`;const t=await sql\`SELECT confidence, count(*)::int n FROM menu_lookups WHERE status='found' GROUP BY 1 ORDER BY 2 DESC\`;console.log('menus',a.n,'dishes',b.n,'queue',q.n);console.table(t);})();"
```

## Keeping the docs honest

When a platform is cracked, a tier is measured, or a rule changes, write it
down where the next session will look: `PLAYBOOK.md` §9 for a recipe,
`STATE.md` for numbers and backlog, this file for the loop itself. Append a
dated note to `probe/CONTEXT-2026-09-02.md` (or start
`probe/CONTEXT-<date>.md`) at the end of every session saying what ran, what
loaded, and what is in flight.

---

## Appendix: spec for `scripts/route-menus.mjs` (only if it does not exist)

For every restaurant in the extraction queue (same predicate as
`cut-batches.mjs`: `hold_reason IS NULL`, no `dishes`, no `menu_lookups` row)
that has a `website`:

1. Fetch the homepage with a desktop Chrome user agent, follow redirects, 15s
   timeout; also try `/menu`, `/order`, `/online-ordering` when the homepage
   has no ordering link. Retry a 403 once with a different UA.
2. Detect the platform from links, hosts and markup — the `PLAYBOOK.md` §9
   table is the list: Toast (`window.__OO_STATE__`), DoorDash marketplace
   JSON-LD and `order.online` RSC, Clover REST (`/wp-json/moo-clover/v1/`) and
   COLO2 (`<slug>.cloveronline.com/menu/all`, use the `olov2service` redirect
   to tell them apart), ChowNow (location id → `api.chownow.com` with
   `next_available_time`), Popmenu (per-menu pages, JSON-LD), Menufy
   (`location_menufy_id` → `api.menufy.com`), NetWaiter (`POST GetMenu`,
   body `{}`), Slice, Owner.com, Olo, Shopify `/products.json`, Wix
   `data-hook` spans, Squarespace `/menu`, and schema.org `Menu` JSON-LD on
   the restaurant's own page (iterate blocks by `@type`). Square Online,
   HungerRush, PoppinPay, MealKeyWay, Paytronix, store-pick SPAs and
   Cloudflare/Datadome walls: record `needs-browser`, do not attempt.
3. Run the matching extractor — port or import `probe/extract_*.js`. Prices
   as `$12.00` (`/^\$\d+(\.\d{2})?$/`). Clover COLO2 prices are integer cents;
   a 0 means size-priced: cheapest option across REQUIRED modifier groups,
   including $0.00 options, and say so in the note.
4. Identity: if the payload carries an address, compare the street number to
   the record; mismatch → `wrong-branch`, do not file.
5. Fewer than 5 priced items from a Toast/Clover/`order.online` payload →
   `gated`, do not file. Fewer than 5 priced items from anywhere → `too-few`.
6. Write `menus/wip/router-<timestamp>.json` in the agent result format
   (match an existing `menus/wip/result-*.json`), rewriting the whole file
   after every restaurant, and `menus/wip/router-<timestamp>.notes.json` with
   `{restaurantId, name, website, platform, outcome, detail}` for every
   restaurant attempted. Outcomes: `filed | too-few | gated | wrong-branch |
   needs-browser | no-platform | fetch-failed`.
7. Flags: `--limit`, `--ids`, `--dry`, `--concurrency` (default 4, never above
   6 — the Wi-Fi is marginal), `--min-dishes` (default 5). Cache every fetched
   body by URL hash under the scratch dir so re-runs are free. Print a running
   tally by platform and outcome.
8. Never construct a price. Never file a dish without a price seen in a
   payload.

Test with `--limit 20 --dry`, spot-check three filed menus (five prices each)
against the live payload, then run the full queue and screen it.

## Appendix: spec for `scripts/find-websites.mjs`

For every restaurant with `hold_reason IS NULL` and `website IS NULL` (or
empty), most-reviewed first:

1. One Serper query: `"<name>" <street address> <city> CA`, 10 results
   (one credit; never ask for more than 10). Cache every response under
   `data/serper-cache/<restaurant id>.json` first; a cached row is never
   re-queried. Keep a ledger `data/serper-calls.jsonl`; refuse to start if
   ledger count + `--max-queries` would exceed 2,400.
2. Pick the website: skip marketplaces, aggregators and directories (mirror
   the barred/untrusted lists in `screen-menus.mjs`, plus yelp, tripadvisor,
   facebook, instagram, google, mapquest, doordash, ubereats, grubhub,
   postmates, seamless), skip anything whose title or snippet does not share
   an identifying word with the restaurant name (use `nameTokens` from
   `verify-coverage.mjs`), and prefer a result whose snippet carries the
   street number. An ordering-platform storefront (toasttab, cloveronline,
   chownow, popmenu, menufy, netwaiter, slicelife, square.site) counts as a
   website — it is what the router wants.
3. Write `website` only where the row has none; never overwrite. Write
   `website_source = 'serper'` in the notes file, not the table (no
   migration). Print: queried / found / no-confident-result / skipped, and a
   sample of 20 (name → chosen URL) for the report.
4. Flags: `--dry`, `--limit`, `--ids`, `--max-queries` (default 0).

## Appendix: spec for `scripts/browser-menus.mjs`

Playwright (dev dependency; `npx playwright install chromium` once). Input:
a router notes file; takes rows with outcome `needs-browser` or `gated`.

1. Sequential, one Chromium context per restaurant, desktop viewport,
   realistic UA, 30s per page. Record every network response (URL, status,
   content-type) and save JSON/RSC bodies to the scratch dir.
2. Open the storefront. If a store picker appears, select by the record's
   street address or ZIP (allowed: RUNBOOK §8 — a store pick is not
   personal data). Never submit an age gate, login, email, or accept terms;
   if one blocks the menu, record `gate-personal` and move on.
3. Read prices from the captured responses first (a JSON catalog beats the
   DOM every time); fall back to the rendered DOM only when no response
   carried prices. Same rules as the router: `$12.00` format, ≥5 priced
   items, address check when the payload carries one, closed-store gate
   detection (a catalog that collapses to a handful of items).
4. Output `menus/wip/browser-<timestamp>.json` in the agent result format,
   written after every restaurant, plus a notes file with the platform, the
   responses that carried the menu, and whether the call looked
   reproducible with curl (no cookies, no per-session token). Those are the
   platforms to promote into the router.
5. Flags: `--from <notes file>`, `--ids`, `--limit`, `--dry`, `--headed`
   (for watching one storefront by hand).
