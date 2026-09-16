# Audit report - 2026-09-15

Ran 474 min, 60 agent sessions, 283 raw findings, 0 sessions without a report, about $46.99 in API terms (subscription-billed runs show $0).
Model sonnet, 2 in parallel, surface both.

## Tonight
- 13 sessions, 54 raw findings, 11 new backlog items, 43 items re-confirmed.
- Top five things to fix, most damaging first:
  1. Client-side navigation is fundamentally broken — clicks and typing update the URL but never re-render results, now confirmed 19 times across Discover filters, cuisine pills, search suggestions, and dish results.
  2. Search has no relevance ranking — literal name matches, cuisine-tag noise, and plain substring scans bury or replace the restaurant/dish actually being searched for (23 confirmations, spanning breakfast/cod/chocolate/pizza/tacos queries).
  3. No leaderboard, no map, and no profile post history exist anywhere in the app, despite the product's own points/tier system implying all three.
  4. The onboarding tour blocks content, its CTA does nothing, and it never remembers being dismissed — the single most-reported friction point tonight (15 confirmations).
  5. Forgot-password is a dead end on both known failure modes: some sessions see zero feedback, others see it hang on "Sending…" forever.
- No new problems surfaced with account creation/login mechanics themselves, core post/dish browsing on desktop, or the plate-score rating math itself — everything found tonight was about search ranking, client-side routing, and missing screens/data, not the scoring model.

The full ranked list is in [BACKLOG.md](BACKLOG.md). Raw session reports are in findings/.

## Search oracle (measured, not opinion)

| check | n | pass rate (delta vs last) |
|---|---|---|
| name-exact | 120 | 97% |
| name-lower | 120 | 87% |
| name-drop-word | 104 | 97% |
| name-swap | 111 | 63% |
| name-typo | 119 | 75% |
| name-transpose | 118 | 75% |
| suggest-prefix | 102 | 75% |
| abbrev | 70 | 17% |
| dish | 84 | 71% |
| name-the | 24 | 79% |
| cuisine-precision | 96 | 91% |
| cuisine-over-dish | 96 | 95% |
| cuisine-nearby | 112 | 71% |
| neighborhood | 25 | 100% |

Worst failures are in findings/oracle-2026-09-14T21-34-41.md.

## Sessions

| scenario | runs | findings | cost |
|---|---|---|---|
| design-pass | 5 | 32 | $4.25 |
| search-cuisine-word | 6 | 29 | $3.67 |
| feed-read | 5 | 27 | $3.82 |
| search-dish | 6 | 27 | $5.52 |
| profile-and-leaderboard | 6 | 25 | $3.54 |
| search-known-place | 4 | 23 | $3.89 |
| restaurant-page | 4 | 22 | $2.93 |
| discover-browse | 4 | 19 | $3.51 |
| first-open | 4 | 18 | $2.48 |
| local-knowledge | 2 | 12 | $1.33 |
| auth-edges | 3 | 11 | $2.15 |
| perf-pass | 2 | 10 | $1.32 |
| map-use | 3 | 9 | $1.43 |
| search-nickname | 2 | 8 | $1.18 |
| search-neighborhood | 2 | 6 | $1.57 |
| keyboard-pass | 2 | 5 | $1.18 |
