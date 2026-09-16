# Performance and scale plan (written 2026-09-14)

Measured from Calvin's PC against production Neon (us-east-1). In-region on
Vercel the latencies are lower, but the byte counts and row counts are what
scale, and those are exact.

```
call (as the app makes it)              ms     rows      KB
getRestaurants()                      1145     9065    3521   <- the problem
getAllRestaurantAspectTallies()        896     9065     414   (r x posts join)
getAllRestaurantPlateScores()          255       19       1   (24 posts today)
session lookup                          84        1       0
discover feed (30d window)              87       24       1
dishes for one restaurant               95       22       7
raw select * on listed restaurants    1120     9065    9422   (17 of ~40 cols are read)
posts 24 | users 54 | sessions 55 | dishes 547,149 | db 306 MB
```

## What breaks first, in order

1. **The in-memory corpus (`loadCorpus` in src/lib/discover.ts).** Every
   Vercel function instance pulls all 9,065 listed rows, 17 columns (3.5 MB,
   1.1 s from here) plus two full aggregates over `posts` (0.9 s), and keeps it for 60 s in
   module memory. Instances do not share memory: under load Vercel runs many
   instances, each re-reading 3.5 MB every minute. The home page (`/`) is
   fully dynamic and awaits this, so the unlucky request per instance per
   minute pays the whole read. It also fails on a second axis: adding a second
   city doubles the read regardless of traffic.
   Fix: (a) select only the columns discover uses; (b) put the corpus in a
   shared cache (`unstable_cache` / `'use cache'` with a 60 s revalidate, which
   is the Vercel Data Cache and is shared across instances); (c) longer term,
   precompute a compact corpus JSON to Blob on a cron and have instances read
   that.

2. **Aggregates over `posts` with no indexes on `posts`.** There is no index
   on posts(created_at), posts(user_id) or posts(restaurant_id). Plate scores
   and aspect tallies GROUP BY the entire table on every corpus load; the feed
   query filters by created_at and joins three whole-table subquery counts
   (post_upvotes, post_downvotes, comments) before applying LIMIT. Free at 24
   posts, a sequential scan per feed load at 100k.
   Fix now: migration adding the three indexes plus post_upvotes(post_id)
   etc. are already there. Fix later: per-restaurant score columns updated on
   write in castVote/createPost, so the corpus load never touches `posts`.

3. **Whole-corpus payload to the browser.** No caller uses the bare
   `/api/restaurants` any more (all eight use `?fields=map`, `?fields=index`
   or `?q=`), but `?fields=map` (feed map on both surfaces) and
   `?fields=index` (both composers, account settings) still return every one
   of the 9,065 listed rows as a projection. The route's own comment measured
   2.8 MB for the full shape at 4,053 rows; the projections are smaller but
   grow with every city added. Edge cache (60 s) saves the server, not the
   phone on cellular.
   Fix: viewport-bounded query for the map (index on (lat, lng), or
   `earthdistance`), and a `?q=` typeahead for the pickers so they never
   hold the corpus.

4. **Session = two round trips per authenticated request** (sessions, then
   users). Every API route calls getCurrentUser. Join them into one query;
   do it together with security finding #8 (hash the token) since both touch
   the same rows.

5. **Feed hydration is 11 parallel queries per page** (hydratePosts). Fine
   while Neon is idle, but each is an HTTP round trip and they multiply by
   concurrent readers. Collapse the comment-vote queries into one and the
   my-vote queries into one; consider counter columns on posts.

6. **Neon compute settings.** Cannot see from here. Before any launch push:
   turn off scale-to-zero (or raise idle timeout), set autoscaling max CU
   above the minimum, enable pg_stat_statements. Cold compute adds ~0.5 s to
   the first request after idle.

7. **No measurement at all.** No analytics, no speed insights, no error
   tracking in package.json. "Things drastically change" will be invisible.
   Add @vercel/speed-insights and @vercel/analytics (two lines in layout.tsx),
   and run a load test against a preview deployment (autocannon or k6 on
   `/`, `/feed`, `/restaurant/[id]`, `/api/restaurants`) so "prepared" is a
   p95 number, not a feeling.

8. **Rate limits.** Only login and forgot are throttled (security finding
   #4). One script against /api/posts or /api/blob/upload is enough to pin the
   database. Folds into security Phase 2.

9. **Image optimisation cost, not speed.** `remotePatterns: "**"` means every
   restaurant photo goes through Vercel's optimizer, billed per unique source
   image; 9k restaurants is 9k source images per size. User photos are already
   client-cropped JPEGs on Blob, which is right. Consider serving restaurant
   photos `unoptimized` or copying them to Blob once.

10. **Bundle.** A 973 KB chunk (MapLibre) exists; it is dynamic-imported on the
    feed map. Whether the home page loads it eagerly needs `next build` and a
    look at the manifest; only a dev build exists locally. Lowest priority.

## Suggested order of work

Phase A (backend only, no visible change, one or two sessions):
  A1 migration: indexes on posts(created_at), posts(user_id), posts(restaurant_id).
  A2 trim getRestaurants columns (hours and photo fields are the bulk); re-measure the 3.5 MB.
  A3 loadCorpus -> shared cache with 60 s revalidate.
  A4 one-query session+user lookup.
  A5 speed insights + analytics; Neon settings + pg_stat_statements (Calvin).
Phase B (before launch push):
  B1 feed query: per-post counts instead of whole-table subqueries; collapse hydratePosts.
  B2 viewport-bounded map endpoint; pickers move to ?q= typeahead.
  B3 precomputed plate score / aspect columns on write.
  B4 rate limits on write routes (security Phase 2 #4).
  B5 load test on a preview URL; record p95s here.
Phase C: image cost policy, bundle audit after a production build.

Re-run the timing block with `probe/perf-probe.mts` (recreate from git
history of this file if deleted) after each Phase A step.

## Complete readiness checklist (added 2026-09-14, second pass)

Everything, by layer. Items marked (C) are Calvin's on a dashboard; the rest
are code. [x] marks what already exists.

### Database (Neon)
- [x] D1 indexes: posts(created_at), posts(user_id), posts(restaurant_id). DONE 2026-09-15 (+ post_saves(user_id), sessions(user_id)); restaurant_id was already covered by idx_posts_dish_folded.
- [~] D2 session lookup = one query (sessions JOIN users) DONE 2026-09-15 (getSessionUser); hash the token (security #8) still open.
- [ ] D3 counter columns on posts (upvotes, downvotes, comments) maintained on write,
      so the feed stops GROUP BY-ing three whole tables per page.
- [ ] D4 per-restaurant plate_score / aspect tally / review_count columns updated in
      castVote and createPost, so loadCorpus never aggregates `posts`.
- [ ] D5 geo index on restaurants(lat,lng) (earthdistance or PostGIS) for viewport queries.
- [x] D6 (C) DONE 2026-09-15 dashboard block. Neon: scale-to-zero off, autoscaling max CU raised, pg_stat_statements on,
      point-in-time-restore window confirmed.
- [ ] D7 scale test on a Neon branch: seed 100k posts / 10k users with scripts/simulate-activity.mjs,
      EXPLAIN ANALYZE the feed, corpus and restaurant-page queries.
- [ ] D8 read replica once reads dominate (Neon supports it; the HTTP driver just needs a second URL).
- [x] restaurants search (trigram), dishes, votes and comments are indexed.

### Server (Next on Vercel)
- [~] S1 (2026-09-15: shared stale-while-revalidate cache DONE; column trim skipped, hours is needed by open-now) loadCorpus: trim columns (hours + photo fields are the bulk of 3.5 MB), then a shared
      cache (`unstable_cache` / `'use cache'`, revalidate 60) so instances share one read.
- [ ] S2 later: cron writes a compact corpus JSON to Blob; instances read that, not Postgres.
- [x] S3 DONE 2026-09-15: `/` and `/m` static (revalidate 60), unfiltered page in the HTML,
      filters/nearby/"show more" fetch GET /api/restaurants/discover (`?shown=`) client-side via
      lib/useDiscoverQuery.ts. The URL reaches client code through components/QuerySync.tsx ->
      lib/queryString.ts, the ONE `useSearchParams` call: anywhere else it opts the tree out of
      the prerender (empty shell on /m, 500 on the restaurant page).
- [x] S4 DONE 2026-09-15: both restaurant pages ISR (revalidate 3600) over lib/restaurantPage.ts
      (unstable_cache tag `restaurant:<id>`, invalidated on post create/delete + account delete).
      Needs the empty `generateStaticParams` export or the segment is never cached. MISS 35 ms -> HIT 3 ms.
- [x] S5 DONE 2026-09-15: keyset cursor (`?cursor=`, `?limit=` 1..30) on /api/posts/discover and
      /friends, `nextCursor` in the body, "More" control on both feed screens; hydratePosts 11 -> 7 queries.
- [ ] S6 suggest endpoint and resolvePostRefs use loadCorpus too; they inherit S1.
- [x] S7 DONE 2026-09-15: lib/httpCache.ts `cachedJson` — public GETs s-maxage=60 + SWR 300 + weak
      ETag (If-None-Match -> 304); private GETs `private, no-cache` + Vary: Cookie + ETag.
- [ ] S8 pickers move from `?fields=index` (all 9,065 rows) to `?q=` typeahead.
- [ ] S9 map: viewport-bounded `?bbox=` endpoint (needs D5); bubble count capped per zoom.
- [ ] S10 rate limits in code (src/proxy.ts) if not on Vercel Pro; security #4.
- [ ] S11 security headers, /drafts excluded from production builds (security #5, #9).
- [ ] S12 blob upload: write 2-3 sizes at upload (sharp) so feed thumbnails are not the
      full capture; today every photo is stored at one size.
- [x] Neon HTTP driver (no connection-pool exhaustion), sql client isolated in one module.
- [x] /api/restaurants and /api/discover/suggest already edge-cached 60 s + SWR.

### Client / bundle
- [~] C1 (2026-09-15: build passes; chunk analysis not yet done) `next build` + bundle analysis; confirm the 973 KB MapLibre chunk is not in the
      home page's first load on either surface.
- [ ] C2 React Compiler (Next 16 supports it) to cut re-render cost on the phone feed.
- [ ] C3 next/image with `sizes` for restaurant photos; or `unoptimized` + a one-time copy
      to Blob to stop per-source-image billing (9k sources).
- [ ] C4 prefetch on Link for restaurant cards; instant back-navigation via router cache.
- [ ] C5 service worker / PWA caching for the phone shell (manifest.ts exists, no SW).
- [~] C6 (2026-09-15: PSI quota exhausted, curl TTFB baseline in probe/perf/baseline-2026-09-15.md; use Speed Insights field data instead) Lighthouse on /, /m, /feed, /m/feed, /restaurant/[id]; record scores here.
- [x] fonts via next/font (self-hosted, subset, preloaded).

### Map tiles
- [ ] T1 tiles come from tiles.openfreemap.org, a free public server with no SLA. Their
      outage = blank map. Before launch: self-host PMTiles (Protomaps) on Blob/R2 or pay
      a tile provider. Also check their fair-use terms against expected traffic.

### Infrastructure (Vercel)
- [ ] V1 (C) Functions region = iad1 to match Neon us-east-1.
- [ ] V2 (C) Fluid Compute on.
- [x] V3 (C) Speed Insights + Web Analytics enabled; packages added in layout.tsx 2026-09-15 (Calvin: confirm the Analytics tab shows data after deploy).
- [ ] V4 (C) Firewall rate-limit rules on write routes (Pro).
- [ ] V5 (C) Skew Protection on.
- [ ] V6 (C) Spend Management: hard limit + alert email, so a spike is a warning not a bill.
- [ ] V7 vercel.json cron for S2 and for any nightly precompute.
- [x] V8 (C) DONE 2026-09-15. confirm production DATABASE_URL is the pooled host; delete the 7 stale
      POSTGRES_*/PG* env lines (security sweep item).

### Observability
- [ ] O1 error tracking (Sentry or similar) on server + client with release tagging.
- [ ] O2 Neon slow-query review weekly from pg_stat_statements.
- [ ] O3 uptime monitor hitting /, /m and one API route every minute, alerting to phone.
- [ ] O4 Vercel log drain (or at least the Logs tab bookmarked) and alerts on 5xx rate.
- [ ] O5 a `probe/perf-probe.mts` re-run after each change; numbers appended to this file.

### Load testing and process
- [ ] L1 k6 or autocannon against a preview URL: 50 / 200 / 500 concurrent on /, /feed,
      /restaurant/[id], /api/posts/discover; targets p95 < 500 ms server, < 2.5 s LCP on phone.
- [ ] L2 run L1 against the D7 seeded branch, not the 24-post production data.
- [ ] L3 performance budget in CI: bundle size ceiling, Lighthouse CI on PRs.
- [ ] L4 incident runbook: enable Attack Challenge Mode, bump Neon CU, roll back a deploy,
      who to call. One page in probe/.
- [ ] L5 backups: Neon PITR is the DB backup; Blob has no versioning, so a nightly Blob
      listing + copy or accept the risk explicitly.
- [ ] L6 capacity math: cost at 1k / 10k / 100k monthly users across Vercel, Neon, Blob,
      image optimisation, tiles. One table in this file.

### iOS app (Capacitor)
- [ ] I1 the WKWebView loads the live site, so every server fix above applies. Consider
      caching the shell locally so a cold open does not wait on the network.
