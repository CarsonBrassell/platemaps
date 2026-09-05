# Overnight run — morning status

**Coverage 5,042 / 8,564 (58.9%). 371,421 dishes.**
496 restaurants resolved in the last 24h: 431 menus found, 86 retired as
not_found (65 of the found ones landed just before midnight).

The run survived two session rate limits. The zero-token router/browser loop
kept producing straight through both, since it never touches the API.

## Four decisions waiting on you

1. **Serper ($50 pack).** The free tier is exhausted. Of the restaurants still
   queued, ~57% have no website on file at all — the free router now returns
   0 menus per pass because it has nothing to route, not because it failed.
   Every website Serper finds converts paid agent work into free router work.

2. **16 blocked-but-retired restaurants** (`menus/wip/blocked-but-retired.json`,
   already on your phone). An agent called them blocked, but they carry a
   permanent not_found row. Delete those rows and re-queue, or leave them?

3. **Marketplace pricing — 420 of 5,026 menus (8.4%) carry DoorDash/UberEats/
   Grubhub prices, not wall prices.** The screen catches uniform markups and
   quarantines them, but per-item variable markup is undetectable. Options:
   leave as-is with a source label, stop filing marketplace-only, or tag them
   for re-extraction later.

4. **The pipeline has no `partial` field.** A menu that prices only side
   sections loads as a complete menu. I have been blocking partials by hand
   (Hanu Korean BBQ would have gone on the map selling only drinks and
   desserts). A structured field would make that automatic — I did not add one
   unattended because it changes the schema.

## What I changed while you slept

- `scripts/resume-night.sh`: the screen step was missing `--env-file=.env.local`,
  so the brand-twin check ran degraded on all 71 screens. Cost was one wrongly
  withheld menu (San Luis Mexican Food, recovered). Also added the missing
  retry-load that had been silently dropping whole browser batches.
- `probe/AGENT-BRIEF.md`, evidence-based additions only: DoorDash duplicate
  JSON-LD and its second `@type:"Menu"` shape; EatStreet, Slice, MenuStar
  recipes; prompt-injection rule; never-merge-two-listings; not_found requires
  high confidence; names-without-prices is blocked not retired; partials are
  blocked; write result files incrementally; `cafegroundup.com` hijacked.

## Two things I got wrong and fixed

- I retired 3 restaurants while trying to protect them — blanking `dishes` on an
  entry does NOT withdraw it, it loads as a permanent not_found. Snapshotted,
  deleted the rows, restored. Withdrawals now filter the entry out entirely.
- I overstated the recoverable-retirement pool three times (several hundred ->
  53 -> 16). 16 is the grounded number.

## Housekeeping

Two loop instances are running (started 12:56 and 13:58). They are free and
share the screen lock so nothing is corrupted, but they duplicate browser passes
and have cut batches nobody is working. Worth killing one when you are at the
keyboard — I left both rather than strand a lock directory mid-pass.
