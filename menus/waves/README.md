# Wave queues for cloud extraction

This directory is a **data pipe between cloud agents and the local machine**. It
is not part of the app and nothing in `src/` reads it.

## Why it exists

Menu extraction takes about an hour per wave; screening and loading take about
ninety seconds. The expensive part needs only a browser, and the cheap part
needs the database — so they can be split, and only the cheap part has to wait
for someone to be at the machine.

Cloud agents cannot reach Neon: `.env.local` is gitignored, so `DATABASE_URL`
does not exist in a cloud checkout. That is why the work is *pre-cut* here
rather than queried at run time. It is also why results come back as committed
files rather than database rows.

## Shape

```
menus/waves/wave-001/group-1.json … group-4.json     the work, 12 restaurants each
menus/waves/wave-001/result-1.json … result-4.json   what a cloud agent produced
```

**A wave is unclaimed if it has no `result-*.json`.** That is the whole
coordination protocol — no lock, no state file, no queue service. A cloud agent
takes the lowest-numbered unclaimed wave. Two agents racing the same wave would
duplicate work, which costs tokens and corrupts nothing, so it is not worth
machinery to prevent.

## Staleness is expected and harmless

These queues are a snapshot. By the time wave-009 runs, some of its restaurants
may already have menus from a locally-run wave. Re-extracting one wastes an
agent's time and nothing else: `load-menus.mjs` upserts, and `screen-menus.mjs`
applies the same rules either way.

Regenerate when the list drifts too far, using the query in this directory's
sibling scripts — order by `existing_dishes > 0`, then `review_count`, skipping
anything with a `menu_lookups` row.

## Loading what comes back

```bash
git fetch origin menu-extraction-output
git checkout origin/menu-extraction-output -- menus/waves
node scripts/screen-menus.mjs menus/waves/wave-*/result-*.json
node --env-file=.env.local scripts/load-menus.mjs menus/wip/clean.json
node --env-file=.env.local scripts/share-chain-menus.mjs
node --env-file=.env.local scripts/defer-blocked.mjs
```

`screen-menus.mjs` is the gate, exactly as for a local wave. **Nothing a cloud
agent produces is trusted more than anything a local one produces** - same
ladder, same markup tests, same quarantine.
