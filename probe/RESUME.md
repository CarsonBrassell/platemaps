# Resume pack

Read this and nothing else when a session starts or continues after
compaction. It is kept under 2K tokens on purpose. RUNBOOK, STATE, CONTEXT,
TRIAGE and FINDINGS are for humans and for `grep`; do not read them whole.

## Numbers

Run `npm run db:stats` (2 seconds, read-only) instead of trusting anything
written here. Last run 2026-09-05 03:45:

```
restaurants  total 11,151  held 2,454  live 8,697  listed 7,748
menus        with_menu 5,231 (60% of live)  listed_with_menu 4,037 (52% of listed)
todo         queue 4,309  not_found 697  listed_without_menu 3,711
dishes       385,165
by_source    osm 5,019  deh 3,790  sweep 979  gmap 694  yelp 675
```

`npm run db:stats -- --json` also writes `probe/stats.json` for scripts and
agent briefs to read. "Listed" is the only number a visitor experiences.

## Since 2026-09-05 (newest decisions, read these)

- **A rating is no longer required to be listed.** Calvin: "as long as there
  is a restaurant it should be on the site." `publish-check.mjs` gate is now
  `hold_reason IS NULL AND lat/lng present`. Do not put the rating back.
- **Search ignores apostrophes** on both server (`searchRestaurants` in
  `src/lib/db.ts`) and client (`foldSearchText` in `src/lib/discoverFilters.ts`).
  "clems station" must find "Clem's Station". Keep both in step.
- **Google Maps discovery exists:** `scripts/discover-serper.mjs`
  (`--fetch`, `--report`, `--import [--dry]`). It found The Other Side Bar and
  Grill, which was in none of OSM/DEH/Yelp, and imported 694 `gmap:` rows.
  Re-running is safe (skips what we have). After an import always run
  `exclude-chains.mjs --apply` (no flag = dry run) then `publish-check.mjs`.
  Known gap: one Maps call returns ~20 places, so dense cells (downtown,
  North Park, Convoy, Hillcrest) were only partly seen. A page-2/3 pass over
  full cells would close it; offered, not yet asked for.
- The 694 gmap rows have no menus and are not in the w5 batches; cut them into
  a later wave. 194 of them have no cuisine (Google typed them "Restaurant").
- `serper.mjs` **is allowed** for agents and the coordinator. Google Places
  and Yelp API scripts stay forbidden.
- Restaurant pages are `/restaurant/<id>`; there is no slug column.
- Still open, not acted on: holding the ~1,000 unverified rows (785 DEH
  permit-only + 220 OSM pins) with a "not yet verified" reason. Calvin has
  not said yes.

## Which terminal am I

- **Ask terminal:** questions, numbers, decisions. Never spawn agents here.
  Answer with `db:stats` or a `grep`, then the user runs `/clear`.
- **Wave terminal:** runs extraction. Do not answer questions here beyond a
  one-line progress figure; every round trip here re-sends the whole context.

## The loop (wave terminal only)

```
node --env-file=.env.local scripts/cut-batches.mjs --size 10 --count 25 --prefix <name>
# spawn 4 agents, model: sonnet, brief = probe/AGENT-BRIEF.md, one batch each
node scripts/screen-menus.mjs menus/wip/result-NN.json
cp menus/wip/clean.json menus/wip/ready-NN.json
node --env-file=.env.local scripts/load-menus.mjs menus/wip/ready-NN.json
```

- Wave state on 2026-09-05: w5-01..w5-25 are cut. w4-24, w4-25, w5-01, w5-02
  were in flight; next spawn is the lowest w5-NN with no `result-w5-NN.json`.
- Four agents max. On each completion: screen, copy, load, spawn a replacement
  in the same turn. Never end a turn with zero agents running unless the queue
  is 0 or Calvin says stop.
- Read every report: `not_found` is permanent and only for confirmed closed /
  replaced / not a food business. "No prices published" (theme park, zoo,
  stadium, campus, airport), "no web presence", "likely closed" are `blocked`.
  Withdraw wrong ones: `node menus/wip/withdraw-many.mjs <file> <ids>`.
- `load-menus.mjs` refuses the whole file on a name mismatch. Fix the name in
  the ready file, or if the DB has an obvious typo, one UPDATE with WHERE id.
- In flight: `ls menus/wip/result-*.json`. A `menus/wip/.screen.lock` directory
  means night-run.sh or another session is screening; wait for it.
- Every few hours: `node --env-file=.env.local scripts/share-chain-menus.mjs`
  (background it, takes >3 min).
- Salvaging a dead agent, batch cutting rules, brief wording: `grep -n` the
  RUNBOOK section header (§3, §6, §7) and read only that section.

## Rules that must not break

- Never commit to git. Never run a Google Places or Yelp script. Never print
  secrets (mask `.env.local` values).
- Never DELETE from `restaurants`; set `hold_reason`. Before any bulk UPDATE,
  dump `id, listed, hold_reason` to `probe/` first and refuse any statement
  without WHERE. `publish-check.mjs` is a bulk UPDATE: snapshot first.
- Never load `quarantine.json`. Never screen twice between copy and load.
- Agents get `probe/AGENT-BRIEF.md` (and PLAYBOOK), never `FINDINGS.md` whole.
- Subagents run on Sonnet. Calvin oversees; agents do the work.
- Ad-hoc DB queries go in a file inside the repo (`probe/q.mjs`), run with
  `node --env-file=.env.local`, then delete. `restaurants.id` is TEXT: cast
  `::text` when joining `dishes.restaurant_id` / `menu_lookups.restaurant_id`.
- Screenshots go through Claude-in-Chrome, once at the end. Verify with curl
  or `read_page` while iterating. Dev server is usually already on :3000.
- Keep answers short: number first, no tables of caveats.
- Editing files from Bash: never put `\b` in a perl replacement (it becomes a
  backspace byte and the regex silently matches nothing). Use a node splice
  or the Edit tool.

## Where things live

- `probe/TOKEN-PLAN.md` — why this file exists and what it saved.
- `probe/STATE.md` — narrative snapshot, open items needing Calvin. Grep it.
- `probe/RUNBOOK.md` — full procedure. Grep it by section.
- `scripts/discover-serper.mjs` — Google Maps discovery; `data/serper-*.json`
  is its state; `probe/discover-venue-skips.txt` is what its filter dropped.
- `scripts/night-run.sh` — unattended router and browser tiers.
- Scheduled task `platemaps-menu-wave` — restarts waves every 2 hours while
  the app is open.
