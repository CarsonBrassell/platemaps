# Resume pack

Read this and nothing else when a session starts or continues after
compaction. It is kept under 2K tokens on purpose. RUNBOOK, STATE, CONTEXT,
TRIAGE and FINDINGS are for humans and for `grep`; do not read them whole.

## Numbers

Run `npm run db:stats` (2 seconds, read-only) instead of trusting anything
written here. Last run 2026-09-05 03:45:

```
restaurants  total 14,078  held 5,143  live 8,935  listed 8,935   (2026-09-05 19:10 PT; deep discovery pass +95 gmap, 74 listed)
menus        with_menu 5,231 (60% of live)  listed_with_menu 4,037 (52% of listed)
todo         queue 4,309  not_found 697  listed_without_menu 3,711
dishes       385,165
by_source    osm 5,019  sweep 3,804  deh 3,790  gmap 789  yelp 675
```

`npm run db:stats -- --json` also writes `probe/stats.json` for scripts and
agent briefs to read. "Listed" is the only number a visitor experiences.

## Security sweep (2026-09-08)

- Phase 1 (read-only audit) is DONE; report in probe/SECURITY-FINDINGS.md:
  1 CRITICAL (GET /api/posts/[id] returns private photo URLs anonymously,
  verified live), 2 HIGH (Neon password leaked twice and never rotated;
  same media gap in getProfilePosts), 9 MEDIUM (no rate limits beyond
  login+forgot, no security headers, /_next/image open proxy + sharp CVEs,
  plaintext session tokens, /drafts live, profile ignores blocks, probe/ and
  menus/ public), 9 LOW. Secrets are clean: nothing from .env.local is in git
  history or the client bundle. Neon password ROTATED 2026-09-09 (finding #2
  closed on the dashboard side; the leaks were into agent transcripts, never
  git). Phase 2 (fixes) is PAUSED 2026-09-09: Calvin has app fixes to land
  first. Nothing from Phase 2 is edited or committed. Resume plan: lead does
  #1+#3 (one media+block gate in hydratePosts), Sonnet agents take #4+#13-16
  (routes), #5+#6 (next.config), #9+#10+#18+#19 (pages/strays); then #8
  (session hashing, needs migration), then #7 (next upgrade) last. Still on
  Calvin: delete the 7 stale POSTGRES_*/PG* lines in .env.local (old
  password), check Vercel env, decide repo visibility (#11/#12).

- **Stage 3 / Phase 2 fixes CODE DONE 2026-09-15, committed on main, NOT PUSHED
  (push deploys).** Eleven commits, each named `security #N`. #1+#3: photo gate
  lives in `hydratePosts` (author, mutual friend, or photos_public; else
  `media: []`), `getPostById` returns null for blocked pairs. #4: new
  `src/lib/rateLimit.ts` (`limitOrReject`, Postgres table `rate_limit_hits`,
  fails open) on signup 5/h per IP, forgot 10/h per IP, upload 30/h, posts 20/h,
  comments 30/15m, votes/hearts/saves 120/15m, friend requests/reports 20/h,
  blocks 30/h, email 10/h (per user). #5: `headers()` in next.config.ts — HSTS
  includeSubDomains (no preload on purpose), nosniff, X-Frame DENY, referrer,
  permissions (camera/geolocation self), CSP enforced = `frame-ancestors 'none'`
  only; a full CSP is Report-Only and WILL log console violations for Next's
  inline hydration scripts (needs a nonce middleware before it can be enforced).
  #6: `**` remotePatterns wildcard removed; `RestaurantPhoto` is `unoptimized`
  (photos load straight from restaurant hosts); blob host allowlisted. #8:
  sessions store SHA-256 of the cookie token + `expires_at` (400 d, slid by
  /api/auth/me); a 36-char legacy row upgrades in place on first use. #9
  robots.ts + `drafts/layout.tsx` 404 in production. #10 profile pages honour
  blocks. #13 200-char cap. #14 every `req.json()` → 400. #15 dummy-hash
  compare + 72-byte cap on login. #16 comment votes honour blocks. #18 strays
  and 545 menus/wip logs untracked (.gitignore). #19 SIM_OWNER_EMAIL.
  **Deployed 2026-09-15** (commits 189d42f..747ad61 pushed to main, live in
  ~75s). `npm run db:migrate` ran AFTER the deploy: sessions now 55 hashed /
  0 legacy (nobody signed out). Production curl checks all pass: 7 headers,
  no x-powered-by, /drafts 404, /_next/image wikimedia 400, bad JSON 400,
  POST /api/posts 401, private post media [], robots disallows. Re-run
  probe/verify-stage3.sh against a local `next start` after future changes.
  **Regression guard (2026-09-15):** scripts/check-security.mjs runs as `prebuild`
  (rate limit on every mutating route unless allowlisted, try/catch on every
  req.json(), no wildcard remotePatterns, headers present, core invariants,
  `npm audit --omit=dev` high/critical). A regression fails the Vercel build;
  `SKIP_AUDIT=1` skips only the audit step. `npm run security:check` /
  `npm run security:verify`. Avatar POST got the missing 30/h limit.
  #7 done: next 16.2.12 → 16.3.5 (+eslint-config-next), bundled sharp 0.35.4;
  `npm audit fix` also took maplibre-gl 6.2.0 → 6.10.0 (XSS critical) and the
  static worker files were regenerated. `npm audit --omit=dev` = 0 vulns (one
  moderate dev-only uuid via @capacitor/cli left). PhoneFeedMapPanel mapRouter
  shim gained the new required `bfcacheId`. Build + `next start` smoke test:
  all verify-stage3.sh checks green (headers, 404 drafts, /_next/image 400,
  bad-JSON 400, 401 no cookie, private media [], signup 429 + Retry-After).
  Still Calvin: #11/#12 (repo visibility, untrack probe/), #17 .env.local prune,
  Vercel env check, Blob sweep for orphaned uploads (not done, #4 note).

## Since 2026-09-05 (newest decisions, read these)

- **Nearby redesigned as a filter chip, not a sort (2026-09-22, uncommitted,
  web + phone).** The first pass added Nearby as a third Discover sort
  segment; Calvin didn't like it. Reverted: `FeedSort` is back to
  `"trending" | "new"` two segments, `FeedSortSwitch` restored via
  `git checkout` (its whole diff was the Nearby segment). Nearby is now
  `NearbyChip` ("📍 5 mi"), a separate `aria-pressed` toggle beside the
  switch in the same row — filters whichever order is already selected down
  to posts within `NEARBY_RADIUS_MI` (5), rather than replacing it. State is
  `nearbyOn`, component state in `/feed` and `PhoneFeedScreen`, default
  false, deliberately **not in the URL** — switching New/Trending leaves it
  on. Coords still only ride a POST body to /api/posts/discover, never the
  URL, never cached; `getDiscoverFeed` applies the radius `WHERE` whenever
  `here` is non-null, for both sorts. GET (no coords) always returns the
  unfiltered page. Checked against the DB: downtown SD both sorts 11 posts,
  max 4.35 mi, 0 over-radius; LA both sorts 0; no-coords returns the full 29;
  paging (new+coords, limit 5) 3 pages, 11 unique, 0 duplicates. **No
  screenshot yet** — Calvin said he'd verify visually himself.
  **Restyled to "radar pulse" (2026-09-22, uncommitted).** No more chip fill:
  off is a bare outline pin (`--pm-grey-text`), on is a filled `--pm-orange`
  pin with two `--pm-orange` rings pulsing outward (`.nearby-radar-ring` in
  globals.css) plus the "5 mi" label; `prefers-reduced-motion` swaps the
  pulse for one static faint ring. Behavior/props unchanged.

- **Meals (multi-plate posts) built 2026-09-20 (uncommitted, migrated, web + phone).**
  One post can hold up to 6 plates. **Collage = overlay labels (2026-09-22; white "mini post"
  strips and a Bodoni Moda trial both dropped):** brick columns edge to edge,
  each plate's name (Fraunces) + peach % · price (mono) on a short dark
  shadow at the photo's foot; bigger text on columns >=160 units. % uses the feed's
  pct-heat paint at 15/17px. Each tile links to its dish (resolvePostRefs now
  resolves course dishIds) or the restaurant. Ellie's plates got Lazy Dog
  Mission Valley menu prices $17.50 / $19.95 (snapshot
  probe/snapshot-ellie-prices-2026-09-22.json; undo = set price NULL). Best-rated plate is the
  hero/widest column. Band heights are solved at module load to keep the
  most-cropped photo as whole as possible (2→90% … 6→75%). Profile tiles show
  a split-square `MealThumb` (ProfileShelves) and `PlateDetailSheet` draws
  the full collage. Under the collage a meal card shows only the caption
  and the restaurant — no dish line, no big % RATING, no price (the tiles
  carry them; isMeal gates in both cards + the sheet). Mockups: scratchpad gen8.mjs. Each course is its **own
  `posts` row** (`meal_id` → hero id, `course_index` 1..5, id `<hero>-cN`,
  empty text, rating_kind dish, no self-upvote) so dish ratings / plate score
  / dish sheet count every plate with no other change; feeds, leaderboard,
  profile and activity filter `meal_id IS NULL`, `hydratePosts` attaches
  `courses`, votes/comments/saves/points live on the hero only, delete
  cascades and blob-deletes course photos. Pieces: `scripts/migrate.mjs`
  (meal_id, course_index, idx_posts_meal), `src/lib/db.ts`,
  `src/app/api/posts/route.ts` (`courses[]`, MAX_COURSES 5),
  `src/components/feed/MealCollage.tsx` (templates 1–6),
  `src/components/post/MealPlates.tsx` (banked chips + "Add another plate",
  assembleMeal / uploadMealPhotos / coursesPayload), both composers
  (`/post`, `/m/post`: "Add another plate" on the rate step banks the plate
  and loops back to photo → dish, skipping "where"; hero = first plate
  entered). Verified by Chrome screenshot on /feed and /m/feed with a seeded
  test meal `meal-demo-1` (+ `-c1..-c3`) on Calvin's account. **Deleted
  2026-09-22**; rows in `probe/snapshot-meal-demo-1*.json`.
  **First real meal (2026-09-22):** Elliefelber's two Lazy Dog posts merged —
  hero `85513cd7…` (crispy rice 95), course `a3440e08…` (Tex mex salad 88,
  course_index 1). Salad's own 3 upvotes/1 heart/2 aspect votes and caption
  "Delectable" stay in the DB but no longer show. Undo: set its meal_id NULL,
  course_index 0 (snapshot `probe/snapshot-ellie-meal-2026-09-22.json`).
  Pre-existing lint error unrelated to this: `RankRing.tsx:103`
  react-hooks/refs. Not yet exercised: posting a real meal through the
  composer end to end (needs photos) — do that once on the phone build.

- **Hits ranking (2026-09-22, uncommitted).** Rated plates show in THE HITS
  from one rating; off-menu rated plates (`offMenu`, lib/ratedPlates.ts) are
  listed but always rank below every rated menu plate (`topPlates`). An
  off-menu plate with repeat ratings gets reviewed and added to the menu.
  `probe/hits-order.mjs <id>` shows which rated plates match the menu.

- **iOS push notifications built 2026-09-20 (uncommitted, needs Mac + Apple portal to go live).**
  Direct APNs over HTTP/2 with a .p8 key, no Firebase, no SDK. Pieces:
  `src/lib/push.ts` (sender: ES256 JWT, dead-token cleanup, never throws),
  `src/lib/notify.ts` (the four events + copy: comment on your plate, reply to
  you, heart, friend request sent/accepted — no votes, no points), wired with
  `after()` in the comments, heart, friends/request and friends/respond routes;
  `POST|DELETE /api/push/devices` (rate-limited, hex token check);
  `push_devices` table (migrated, empty) keyed by token and **bound to the
  session row with ON DELETE CASCADE**, so logout / sign-out-others / expiry
  drop the token with no client call. Client: `src/lib/pushClient.ts`
  (dynamic-imports the Capacitor plugin; no-op in a browser tab),
  `PushRegistration` mounted in `/m` layout (registers on sign-in, asks once,
  routes a tapped push to its `/m/...` url), "Push notifications" row in the
  shared SettingsLedger (On/Off in the app; text-only on web; "denied" points
  at iOS Settings), and `/m/feed?post=<id>` opens that plate's comments.
  iOS: `@capacitor/push-notifications@8.1.2` installed, Podfile updated,
  AppDelegate forwards the token, `App.entitlements` (aps-environment) added
  and referenced from both pbxproj configs, `plugins.PushNotifications.
  presentationOptions` in capacitor.config.ts.
  **Calvin's steps to switch it on:** (1) Mac: `cd ios/App && pod install`,
  open in Xcode, confirm Push Notifications shows under Signing & Capabilities
  (the entitlement file is there; Xcode may need the App ID's Push capability
  enabled in the portal — Identifiers → com.platemapsapp.ios → Push
  Notifications). (2) Portal → Keys → new key with APNs ticked → download the
  .p8 once, note Key ID. (3) Vercel env: `APNS_TEAM_ID` (93Q75H5U7Z),
  `APNS_KEY_ID`, `APNS_AUTH_KEY` (whole .p8 contents), optional
  `APNS_BUNDLE_ID` (defaults com.platemapsapp.ios) and `APNS_ENVIRONMENT`
  (production default; "sandbox" only for an Xcode-run debug build), then
  redeploy. Unset = push silently off, nothing else breaks. Web push
  (service worker + VAPID) is deliberately not built.

- **Restaurant comment threads show their photos, 2026-09-14 (uncommitted).**
  `RestaurantComments.tsx` read `text`, `rating` and `dishName` off `/api/posts`
  but never `media`, so a plate shot arrived under the restaurant as prose only
  while the feed card and the dish sheet drew the picture. `Post` there now
  carries `media` and each row renders up to 3 images with DishPosts' treatment
  (lone photo 4:3, two or three as squares). Gating is unchanged: `getPosts`
  already returns `[]` for a post whose author hasn't opted into public photos.
  One component, so `/restaurant/[id]` and `/m/restaurant/[id]` both get it;
  verified in Chrome on both at Phil's BBQ (362). tsc + eslint clean.

- **Performance plan written 2026-09-14, nothing implemented yet.** probe/PERF-PLAN.md:
  measured the corpus load at 3.5 MB + 1.1 s per instance per minute (9,065 listed rows), no indexes on `posts`, whole-corpus /api/restaurants to the browser,
  two-query sessions, no analytics. Phase A (indexes, trim columns, shared cache,
  one-query session, speed insights) is the agreed-on-paper first step; waiting on
  Calvin to say go. Second pass added a complete by-layer checklist (D/S/C/T/V/O/L/I ids)
  to the same file; map tiles come from openfreemap.org with no SLA (T1).
  Calvin-side dashboard steps with click paths: probe/LAUNCH-CHECKLIST.md (V/N/K/T/M/B ids).
  **Free dashboard block DONE 2026-09-15 (Calvin, no spend):** Vercel env vars trimmed to
  DATABASE_URL (pooler host) + BLOB_READ_WRITE_TOKEN + BLOB_STORE_ID + BLOB_WEBHOOK_PUBLIC_KEY
  (POSTGRES_*/PG*/NEON_*/DATABASE_URL_UNPOOLED deleted); .env.local trimmed the same way.
  Function region should be iad1 (Neon is us-east-1). Neon: Launch plan (via Vercel
  marketplace), compute 0.25-2 CU autoscale, scale-to-zero ON at 300 s (kept on purpose,
  always-on would add ~$19/mo), pg_stat_statements 1.11 installed on main. Neon MCP
  connector works. Vercel MCP connector sees the team but lists 0 projects / 404 on
  get_project: known connector bug (anthropics/claude-code#93777, open), NOT a Calvin-side
  auth problem; do Vercel work via click paths or the Vercel CLI. Stale user-config MCP
  entry `vercel` still to remove (`claude mcp remove vercel`). Still open on Calvin's side:
  Analytics tab enabled, MAPTILER_KEY, Sentry DSN, Better Stack monitor, Blob backup
  decision, Neon data-transfer number. Calvin said "go" 2026-09-15; Stage 2 repo prep done, see next bullet
  (clean tree, baseline, Neon branch sweep, posts indexes, speed-insights + analytics pkgs).
  **Stage 2 / Phase A code DONE 2026-09-15 (no spend):** four indexes created on Neon main
  and recorded in scripts/migrate.mjs (idx_posts_created, idx_posts_user,
  idx_post_saves_user, idx_sessions_user). Session lookup is one query (`getSessionUser`
  = sessions JOIN users) behind getCurrentUser and /api/auth/me. hydratePosts went from 11
  queries to 7 (UNION ALL vote sums); checked against direct SQL on the live discover
  feed: 0 mismatches over 23 posts / 11 comments. loadCorpus is stale-while-revalidate:
  <60 s fresh, <10 min stale is served at once while one background refresh runs under
  `after()`; `unstable_cache` was rejected (Vercel Data Cache caps entries at 2 MB, the
  corpus is 3.5 MB). Column trim skipped: `hours` is 1.78 MB of the 2.5 MB selected and
  the open-now filter needs it. @vercel/speed-insights + @vercel/analytics mounted in
  src/app/layout.tsx. eslint now ignores menus/ and .claude/. Neon branch "sweep"
  (br-falling-resonance-au0htvot, no compute) is the pre-migration snapshot; delete it
  once the indexes have lived a few days. Baseline TTFBs (before this shipped) are in
  probe/perf/baseline-2026-09-15.md; Lighthouse skipped (PSI quota), Speed Insights field
  data replaces it. After deploy (iad1 live): /restaurant 0.22-0.31 s (was 0.33-1.10), map MISS 0.49 s (was 2.02), / and /m still ~1 s (Phase B S3). Pre-existing lint error src/components/RankRing.tsx:103 untouched.
  Calvin side still: Vercel function region -> iad1 (V1, biggest remaining win), confirm
  the Analytics tab shows data, `claude mcp remove vercel`. Code side next: Phase B (S3
  static home shell, S4 restaurant page cache, S5 cursor pagination, S7 ETag), then
  security Stage 3 (hash session tokens, headers, rate limits).
  **Phase B DONE 2026-09-15 (S3, S4, S5, S7; no spend; built + verified on `next start`,
  not yet deployed — push to main deploys it).** S3: `/` and `/m` are static (`revalidate
  = 60`, x-nextjs-cache HIT); the unfiltered page is in the HTML and every filter/nearby/
  "show more" change is a client fetch of GET /api/restaurants/discover (`?shown=` pages,
  PAGE_SIZE 24, MAX_SHOWN 240; POST still carries coords) through lib/useDiscoverQuery.ts.
  S4: `/restaurant/[id]` and `/m/restaurant/[id]` are ISR (`revalidate = 3600`) over
  `getRestaurantPageData` in lib/restaurantPage.ts (unstable_cache tagged
  `restaurant:<id>`; post create/delete and account delete call
  `invalidateRestaurantPage`). Verified MISS 35 ms -> HIT 3 ms with s-maxage=3600.
  **Lesson:** a dynamic segment is only cached if `generateStaticParams` exists — both
  pages export an empty one on purpose. S5: feed cursor pagination — GET
  /api/posts/discover and /friends take `?cursor=` (base64url keyset {at, createdAt, id,
  score}) and `?limit=` (1..30, default 30) and return `nextCursor`; usePostFeed exposes
  loadMore/loadingMore and both feed screens render a "More" control until nextCursor is
  null. Verified 3 pages x 5 with limit=5 (15 unique, monotone), trending paged order ==
  unpaged. S7: lib/httpCache.ts `cachedJson(req, body, policy)` — public GETs
  (restaurants index/discover/suggest/aspects/dishes) send `public, max-age=0,
  s-maxage=60, stale-while-revalidate=300` + weak ETag and answer If-None-Match with 304;
  private ones (feeds, leaderboard, dish-posts, posts/[id]) send `private, no-cache` +
  Vary: Cookie + ETag. **Lesson that cost the most time:** any `useSearchParams` under a
  static page opts the tree up to the nearest Suspense boundary out of the HTML — the
  restaurant page 500'd and `/m` shipped as an empty `pm-phone-shell`. Fix: it is now
  called once, in components/QuerySync.tsx under `<Suspense fallback={null}>` (rendered
  by `/`, m/layout.tsx and `/restaurant/[id]`), publishing to lib/queryString.ts; every
  client component reads `useQueryParams()` from there. Don't add `useSearchParams` back
  to anything under `/m` or a static page. tsc clean; eslint = RankRing only. Chrome
  extension was disconnected at the end, so the final visual check was the in-app pane
  (Thai filter applied on `/`, `?nav=feed` honoured on /m/restaurant/1). Next: security
  Stage 3, then S8/S9 (typeahead pickers, bbox map endpoint).

- **Library picker is back on the camera screen, BUILT + DEPLOYED 2026-09-14,
  verified in Chrome on /m/post and /post.** Calvin reversed `039271c` ("plate photo is a thing you are looking
  at now"): the cost was the photo, not freshness (iOS/in-app browsers refuse the camera,
  laptops point the wrong way). Camera stays default; library is the small rail button
  left of the shutter (both `/post` and `/m/post`, one component) and a "Choose a photo"
  pill beside "Allow camera" when the camera is blocked/unsupported. `fileToDraft` in
  src/lib/photos.ts cover-crops a chosen file to 3:4 at `SHOT_W`x`SHOT_H` (moved there
  from CameraCapture) and re-encodes JPEG, so a picked photo is the same draft the
  shutter makes. `PhotoIcon` added to icons.tsx. `MAX_PHOTOS` still 1. tsc + eslint
  clean. Verified in Calvin's Chrome (blocked-camera state on the PC: "Allow camera" +
  "Choose a photo", rail button bottom-left, file_upload → review screen). Committed and
  pushed to main; Vercel deploys from there.
- **Map bubbles tap-to-open + orange dish, COMMITTED 2026-09-14.** On `(hover: none)` devices
  the first tap on a bubble adds `.map-bubble-open` (RestaurantMap.tsx click handler; globals.css
  lists the class beside every `.map-bubble:hover` rule) and the second tap navigates; a pan or a
  tap on empty map closes it. `.map-dish-link` is `--pm-orange-text` (Fraunces, weight 700); the comment text is an inline bold (700) ink span right AFTER the dish inside `.map-line-clip`, VISIBLE at rest (ellipsis-clipped, wraps when open); dish is semibold 600 so the words dominate; estimateBubbleWidth budgets dish+words via restingLineFor (3 commits, 2026-09-14). On both
  surfaces (was ink by design; changed at Calvin's request). Verified in the pane with mobile
  emulation (open, then `/m/restaurant/167?post=…`) and by Chrome screenshot.

- **Audit fixes applied 2026-09-15 (uncommitted, 55 src files, tsc + eslint clean).**
  From `probe/audit/BACKLOG.md`, the no-brainers were fixed by five Sonnet agents: Discover
  stale-grid blocker (`located` keyed off `page.filters`, DiscoverBrowser + PhoneDiscoverResults);
  walk times removed everywhere, street address shown instead (RestaurantHeader, PhoneDetailHero;
  `walkTime` stays optional in restaurantTypes but nothing renders it, and it must stay that way);
  forgot-password mail moved into `after()` with an 8 s timeout; CoachTour click-swallow guard;
  price formatting via `formatPrice()`; history-aware back links; search length-ratio guard and
  category demotion (`withCategoryDemotion`, constant 900); Post FAB hidden when signed out on
  phone; profile back links carry `from=`. Open questions for Calvin are listed in the session
  report (placeholder posts, rib triplicate, duplicate restaurants, Chipotle/Panera holds, no phone
  map, no leaderboard route, signup verification mail, web Header "Post a plate" when signed out).
  Perf/security sweep of the same backlog still to do in a fresh session.
  **Production DB writes on Calvin's instruction, 2026-09-15 evening** (snapshots of every
  touched row in `probe/tmp/*-snapshot.json`): 42 same-name-within-150 m duplicate restaurants
  held with `hold_reason = 'duplicate of <survivor id>'` and `listed = false`
  (`probe/tmp/merge-dups.mjs`, survivor = more dishes, null columns filled from the loser; no
  posts were attached to any loser); placeholder posts renamed to "Guava Refresher" (Ellie) and
  "Grapefruit Refresher" (Calvin) at Em Coffee House; two of Calvin's three Phil's BBQ rib posts
  deleted (kept 9e81c0db, the one with upvotes); restaurant 3071 renamed from "Jorge's
  Mexitcatessen". Held chains are the `excluded: generic chain (...)` hold reasons (65 patterns).
  Fixed lines in BACKLOG.md are marked `- [x] fixed:`.

- **Sign-in is mandatory everywhere since 2026-09-17:** `src/proxy.ts` (cookie
  presence → redirect to `/account?next=` or `/m/account?next=`, 401 for
  `/api/*`), `src/lib/signInGate.ts` holds the public-path list,
  `RequireSignIn.tsx` is the client fallback for stale cookies. Two follow-ons:
  `/api/auth/me` now deletes a dead cookie (so the proxy, not the client,
  bounces the next visit), and `useCoachTour` waits for an account (the tour's
  "Tap Feed" first step bounced off the gate). Verified signed out: `/` →
  `/account?next=%2F`, `/m/feed` → `/m/account?next=%2Fm%2Ffeed`, no tour.
  Uncommitted.

- **Overnight audit harness, built 2026-09-13, uncommitted; first full run started
  2026-09-15 03:02.** `probe/audit/`: Sonnet agents (`claude -p`) play personas in a
  headless Chromium via `browse.mjs` and file JSON findings; `oracle.mts` scores search
  against corpus-generated queries; triage merges into `probe/audit/BACKLOG.md`, morning
  summary in `REPORT.md`. Start with `powershell -File probe/audit/start.ps1`, stop with
  `stop.ps1`, docs in `probe/audit/README.md`. `run.mjs` parks and re-checks every 60s
  when `claude -p` is logged out instead of burning the run cap. Runs use the subscription,
  not a card; the `# Resume pack

Read this and nothing else when a session starts or continues after
compaction. It is kept under 2K tokens on purpose. RUNBOOK, STATE, CONTEXT,
TRIAGE and FINDINGS are for humans and for `grep`; do not read them whole.

## Numbers

Run `npm run db:stats` (2 seconds, read-only) instead of trusting anything
written here. Last run 2026-09-05 03:45:

```
restaurants  total 14,078  held 5,143  live 8,935  listed 8,935   (2026-09-05 19:10 PT; deep discovery pass +95 gmap, 74 listed)
menus        with_menu 5,231 (60% of live)  listed_with_menu 4,037 (52% of listed)
todo         queue 4,309  not_found 697  listed_without_menu 3,711
dishes       385,165
by_source    osm 5,019  sweep 3,804  deh 3,790  gmap 789  yelp 675
```

`npm run db:stats -- --json` also writes `probe/stats.json` for scripts and
agent briefs to read. "Listed" is the only number a visitor experiences.

## Security sweep (2026-09-08)

- Phase 1 (read-only audit) is DONE; report in probe/SECURITY-FINDINGS.md:
  1 CRITICAL (GET /api/posts/[id] returns private photo URLs anonymously,
  verified live), 2 HIGH (Neon password leaked twice and never rotated;
  same media gap in getProfilePosts), 9 MEDIUM (no rate limits beyond
  login+forgot, no security headers, /_next/image open proxy + sharp CVEs,
  plaintext session tokens, /drafts live, profile ignores blocks, probe/ and
  menus/ public), 9 LOW. Secrets are clean: nothing from .env.local is in git
  history or the client bundle. Neon password ROTATED 2026-09-09 (finding #2
  closed on the dashboard side; the leaks were into agent transcripts, never
  git). Phase 2 (fixes) is PAUSED 2026-09-09: Calvin has app fixes to land
  first. Nothing from Phase 2 is edited or committed. Resume plan: lead does
  #1+#3 (one media+block gate in hydratePosts), Sonnet agents take #4+#13-16
  (routes), #5+#6 (next.config), #9+#10+#18+#19 (pages/strays); then #8
  (session hashing, needs migration), then #7 (next upgrade) last. Still on
  Calvin: delete the 7 stale POSTGRES_*/PG* lines in .env.local (old
  password), check Vercel env, decide repo visibility (#11/#12).

## Since 2026-09-05 (newest decisions, read these)

- **Restaurant comment threads show their photos, 2026-09-14 (uncommitted).**
  `RestaurantComments.tsx` read `text`, `rating` and `dishName` off `/api/posts`
  but never `media`, so a plate shot arrived under the restaurant as prose only
  while the feed card and the dish sheet drew the picture. `Post` there now
  carries `media` and each row renders up to 3 images with DishPosts' treatment
  (lone photo 4:3, two or three as squares). Gating is unchanged: `getPosts`
  already returns `[]` for a post whose author hasn't opted into public photos.
  One component, so `/restaurant/[id]` and `/m/restaurant/[id]` both get it;
  verified in Chrome on both at Phil's BBQ (362). tsc + eslint clean.

- **Performance plan written 2026-09-14, nothing implemented yet.** probe/PERF-PLAN.md:
  measured the corpus load at 3.5 MB + 1.1 s per instance per minute (9,065 listed rows), no indexes on `posts`, whole-corpus /api/restaurants to the browser,
  two-query sessions, no analytics. Phase A (indexes, trim columns, shared cache,
  one-query session, speed insights) is the agreed-on-paper first step; waiting on
  Calvin to say go. Second pass added a complete by-layer checklist (D/S/C/T/V/O/L/I ids)
  to the same file; map tiles come from openfreemap.org with no SLA (T1).
  Calvin-side dashboard steps with click paths: probe/LAUNCH-CHECKLIST.md (V/N/K/T/M/B ids).

- **Library picker is back on the camera screen, BUILT + DEPLOYED 2026-09-14,
  verified in Chrome on /m/post and /post.** Calvin reversed `039271c` ("plate photo is a thing you are looking
  at now"): the cost was the photo, not freshness (iOS/in-app browsers refuse the camera,
  laptops point the wrong way). Camera stays default; library is the small rail button
  left of the shutter (both `/post` and `/m/post`, one component) and a "Choose a photo"
  pill beside "Allow camera" when the camera is blocked/unsupported. `fileToDraft` in
  src/lib/photos.ts cover-crops a chosen file to 3:4 at `SHOT_W`x`SHOT_H` (moved there
  from CameraCapture) and re-encodes JPEG, so a picked photo is the same draft the
  shutter makes. `PhotoIcon` added to icons.tsx. `MAX_PHOTOS` still 1. tsc + eslint
  clean. Verified in Calvin's Chrome (blocked-camera state on the PC: "Allow camera" +
  "Choose a photo", rail button bottom-left, file_upload → review screen). Committed and
  pushed to main; Vercel deploys from there.
- **Map bubbles tap-to-open + orange dish, COMMITTED 2026-09-14.** On `(hover: none)` devices
  the first tap on a bubble adds `.map-bubble-open` (RestaurantMap.tsx click handler; globals.css
  lists the class beside every `.map-bubble:hover` rule) and the second tap navigates; a pan or a
  tap on empty map closes it. `.map-dish-link` is `--pm-orange-text` (Fraunces, weight 700); the comment text is an inline bold (700) ink span right AFTER the dish inside `.map-line-clip`, VISIBLE at rest (ellipsis-clipped, wraps when open); dish is semibold 600 so the words dominate; estimateBubbleWidth budgets dish+words via restingLineFor (3 commits, 2026-09-14). On both
  surfaces (was ink by design; changed at Calvin's request). Verified in the pane with mobile
  emulation (open, then `/m/restaurant/167?post=…`) and by Chrome screenshot.

 in run.log is Claude Code's API-equivalent estimate. Oracle on the
  120 sample (findings/oracle-2026-09-14-2134.md): name-exact 96.7, name-swap 63.1,
  name-typo 74.8, dish 71.4, cuisine-nearby 71.4 (breakfast near SDSU = tag-only coffee
  shops on top), abbrev 17.1, 45 duplicate listed rows. First night done 2026-09-15 05:27: 60 sessions, 283 raw findings, 0 failed runs,
  BACKLOG.md 231 lines. Top item reproduced by hand: on the dev server, clicking a
  Discover cuisine pill changes the URL to ?cuisine=Mexican but the grid stays at 9065
  places; a direct load of the same URL gives 1389 (client transition path broken).
  "No map"/"no leaderboard" blockers are partly agent expectation: the map lives on web
  /feed, /m has no map route, leaderboard is inside /feed and profiles with no own route.
  Next: Calvin reads BACKLOG.md, then the perf/security sweep (probe/PERF-PLAN.md,
  probe/LAUNCH-CHECKLIST.md) in a fresh session. Do not edit src/ while a loop runs.

- **Phone splash: peel instead of bite, 2026-09-13, on main (58f0501, 150373c, 357a519 + the
  3D-lift commit after it).** The cold-open splash (src/components/mobile/PhoneSplash.tsx +
  the Opening splash block in src/app/m/phone.css) no longer uncovers the bite; the mark
  holds 1.1s, peels off from its bottom-right like a sticker, flies off top-left, then the
  cream sheet fades at 2.2-2.6s. Two copies of the artwork, clip-path + a 3D rotation about
  the fold with perspective (back face = mirrored print), masked to the pin outline by
  public/logo-mark-mask.png which logo:build computes, gradient sheets for crease + contact
  shadow, one linear() easing over the whole sweep. No redraw. Every keyframe number is
  generated: the generator lives only in the session scratchpad, but the derivation is in
  the phone.css comments, so rewrite it from those before changing the geometry.
  Reduced motion: hold and cut. Verified in Chrome by pausing the animations frame by frame.
  23e3dc5 fixed "not showing on my phone": an element whose CSS mask image has not loaded
  paints NOTHING (WebKit and Chromium), and the mask was only requested after the stylesheet
  parsed, so a cold launch on a real network showed a bare cream screen. The stuck copy is
  now unmasked (mask moved to its shadow sheet), the sheet colour is the artwork's own ground
  #f6f0eb so the unmasked rectangle has no edge, and PhoneSplash preloads the mask. Playwright
  WebKit is installed (`npx playwright install webkit` was run); a script that pauses
  `document.getAnimations()` at fixed times and screenshots is the way to check splash frames
  in a real WebKit without a phone.
- **Search: category over name, SHIPPED 2026-09-13, uncommitted.** A cuisine/tag hit now
  outranks every name rung except exact and prefix (`TIER` in src/lib/textMatch.ts:
  CUISINE_EXACT 960 / SUBSTRING 950 / NAME_PREFIX 940 / CUISINE_FUZZY 930 + 0-9 closeness
  band). Dropdown puts Cuisines above Restaurants when the cuisine hit is literal
  (src/lib/suggest.ts `cuisineBeforeRestaurant`). "Breakfast" tag added to coffee, juice,
  acai, bagel, donut, bakery, creperie and pancake labels (src/data/cuisines.ts SYNONYMS);
  scripts/normalize-cuisines.mjs now also unions cuisines across a chain's branches
  (Rigoberto's = Mexican + Fast Food) and writes in 500-row chunks. Ran for real:
  9065 listed unchanged, 1776 live rows carry a Breakfast tag (was 987), 468 chain rows
  gained tags. Snapshot before writes: probe/snapshots/cuisine-2026-09-13.json.
  Probe: `npx tsx --env-file=.env.local probe/search-check.mts --near=32.7757,-117.0719 "breaksfast"`
  (SDSU) leads with campus coffee/bagel/Broken Yolk. The PB report above ("breakfast" via
  `in=dish`) is the dish scope, untouched. Follow-ups: duplicate BCB Coffee rows in
  College Area; Breakfast & Brunch rows whose cuisine_raw is "Restaurant" carry no tags
  (still match through the cuisine column). Details: probe/SEARCH-PLAN.md "Shipped".
- **Full menu-photo pass COMPLETE (2026-09-15), started 2026-09-13.** Calvin approved the full harvest
  after the 100-row sample and said "run the menu extraction" — run harvest→extract→load
  to the end, no check-ins. Harvest (detached):
  `node --env-file=.env.local probe/menu-photos/fetch.mjs --limit 3100 --pause 8 > probe/menu-photos/run-full.log 2>&1`.
  Manifest rows 1-149 = sample (done); 150+ = full pass. Resumable (ids in the manifest
  are skipped). fetch.mjs now bails on the FIRST limited-view instead of retrying 3x
  (retries made the throttle worse); ~50% of rows land as limited-view and are recovered
  later with `node --env-file=.env.local probe/menu-photos/fetch.mjs --retry --pause 20 >> probe/menu-photos/run-full.log 2>&1`
  (repeat while it keeps recovering rows). run-full.log's N/2986 counter is not the
  manifest count; trust `grep -c '"status":"ok"' probe/menu-photos/manifest.jsonl`.
  Helpers: `node probe/menu-photos/pending.mjs` lists harvested "ok" rows with no
  `menus/wip/photos/<id>.json` (pipe through `grep -v -E '^- (id|id) '` to hide in-flight
  batches); spawn one Sonnet agent (never Opus) per 1-6 rows with the prompt in
  EXTRACT.md's header style, telling it to use the name EXACTLY (agents twice prefixed
  the id onto the name — 4662, 9304 — and load-menus' name guard refused the file; fix by
  sed in photos/, result and clean files). Load cycle every few waves:
  `node --env-file=.env.local probe/menu-photos/merge.mjs menus/wip/result-photos-<tag>.json`
  (merges every photos/*.json whose restaurant has no dishes rows) →
  `node scripts/screen-menus.mjs menus/wip/result-photos-<tag>.json` → strip zero-dish
  entries into `menus/wip/clean-photos-<tag>.json` → `rm menus/wip/clean.json menus/wip/quarantine.json`
  → `load-menus.mjs <clean> --dry` then real (in background; >300s). screen-menus now
  exempts `crossCheckedAgainst: "google-maps-menu-photos"` from the markup heuristic
  (photographed boards are the venue's own prices). Unpriced-only boards drop at screen
  (Chiroys, JJANG, Shake Smart, ZENSHI… ~20 of them) — expected, not a bug.
  Loads so far: 0914a 33/939, 0914b 66/2,362, 0914c 47/1,670, 0914d 63/2,090,
  0914e 7/453, 0914f 31/1,485, 0914g 21/831, 0914h 13/701, 0914i 36/1,362, 0914j 30/1,319, 0914k 22/732, 0914l 17/941, 0914m 21/934, 0914n 18/729, 0914o 16/750, 0914p 13/532, 0914q 13/362, 0914r 12/464, 0914s 11/383, 0914t 8/305, 0914u 9/367, 0914v 8/267, 0914w 9/442, 0914x 8/277, 0914y 9/333, 0914z 7/268, 0915a 9/246, 0915b 8/222, 0915c 8/296, 0915d 6/186, 0915e 7/291, 0915f 6/226, 0915g 7/337, 0915h 6/216, 0915i 9/189, 0915j 5/178, 0915k 7/317, 0915l 7/401, 0915m 8/308, 0915n 8/363, 0915o 6/282, 0915p 9/387, 0915q 4/175, 0915r 4/146, 0915s 6/167, 0915t 6/221, 0915u 4/185, 0915v 4/179, 0915w 5/291, 0915x 4/136, 0915y 5/226, 0915z 4/210, 0916a 6/249, 0916b 7/436, 0916c 3/186, 0916d 5/256, 0916e 5/304, 0916f 5/237, 0916g 6/234, 0916h 5/202, 0916i 4/90, 0916j 5/187, 0916k 6/278, 0916l 5/122, 0916m 5/170, 0916n 5/224, 0916o 5/217, 0916p 4/122, 0916q 7/139, 0916r 4/91, 0916s 5/154, 0916t 5/239, 0916u 5/195, 0916v 5/204, 0916w 2/86, 0916x 4/138, 0916y 5/318, 0916z 4/212, 0917a 5/196, 0917b 5/168, 0917c 5/236, 0917d 4/101, 0917e 5/126, 0917f 5/230, 0917g 4/232, 0917h 5/222, 0917i 5/238, 0917j 5/190, 0917k 6/345, 0917l 5/163, 0917m 5/214, 0917n 5/227, 0917o 5/377, 0917p 5/171, 0917q 5/102, 0917r 5/114, 0917s 5/152, 0917t 5/162, 0917u 5/148, 0917v 4/150, 0917w 5/107, 0917x 5/192, 0917y 5/166, 0917z 7/255, 0918a 5/177, 0918b 5/238, 0918c 5/171, 0918d 5/239, 0918e 5/171, 0918f 5/268, 0918g 5/258, 0918h 5/158, 0918i 5/153, 0918j 5/292, 0918k 5/221, 0918l 5/213, 0918m 5/221, 0918n 5/250, 0918o 5/162, 0918p 5/141, 0918q 5/131, 0918r 5/217, 0918s 5/167, 0918t 5/138, 0918u 5/271, 0918v 5/137, 0918w 5/295, 0918x 6/175, 0918y 5/251, 0918z 5/133, 0919a 5/312, 0919b 4/126, 0919c 5/190, 0919d 5/232, 0919e 5/195, 0919f 5/103, 0919g 5/254, 0919h 6/194, 0919i 5/300, 0919j 5/312, 0919k 5/167, 0919l 5/212, 0919m 4/134, 0919n 5/173, 0919o 5/209, 0919p 5/234, 0919q 5/193, 0919r 4/154, 0919s 5/129, 0919t 5/223, 0919u 4/209, 0919v 5/181, 0919w 5/110, 0919x 5/168, 0919y 5/219, 0919z 5/246, 0920a 5/247, 0920b 4/201, 0920c 6/275, 0920d 5/257, 0920e 5/361, 0920f 5/165, 0920g 5/227, 0920h 5/233, 0920i 5/185, 0920j 5/303, 0920k 5/262, 0920l 5/311, 0920m 5/294, 0920n 5/175, 0920o 5/156, 0920p 5/141, 0920q 5/214, 0920r 5/92, 0920s 5/179, 0920t 5/168, 0920u 5/302, 0920v 5/294, 0920w 4/319, 0920x 5/139, 0920y 5/223, 0920z 5/228, 0921a 5/337, 0921b 4/104, 0921c 5/310, 0921d 5/199, 0921e 5/274, 0921f 5/149, 0921g 5/105, 0921h 4/168, 0921i 5/122, 0921j 5/203, 0921k 5/118, 0921l 5/239, 0921m 6/317, 0921n 2/137 → **1,420 menus / 57,113 dishes**; coverage 7,122/9,065 (78.6%) at
  harvest 2,033 ok / 6,045 rows (final). Full pass finished; second retry pass finished 1,158/1,158; third retry pass finished 584/584 (184 ok); fourth retry pass finished 290/290; fifth retry pass finished 146/146; sixth retry pass finished 71/71; seventh retry pass finished 34/34; eighth retry pass finished 14/14; ninth 7/7; tenth 1/1; ELEVENTH pass found 0 to visit — HARVEST CONVERGED (harvester not running): `fetch.mjs --retry --pause 20`, log probe/menu-photos/run-full.log. All harvested rows extracted and loaded; nothing in flight. Next tag if resumed: 0921o. FLAG for Calvin: 11436 Tacos el Cabron is titled "CLOSED - …" on Google Maps — skipped extraction; consider hold_reason. (4663 Arrivederci extracted 79/73p high but is a QUARANTINE_IDS hold — left for Calvin) (6316 D-K-Che Fruteria extracted 87/15p high but is a QUARANTINE_IDS hold — left for Calvin) (3598 Farmhouse 78 extracted 54/50p high but is a QUARANTINE_IDS hold — left for Calvin) (3517 Portal Coffee is also a QUARANTINE_IDS hold — photo extraction 25/25p high in menus/wip/photos/3517.json, not loaded.) (3334 Palomino's is a deliberate QUARANTINE_IDS hold — photo extraction 149/125p medium sits in menus/wip/photos/3334.json, not loaded; Calvin's call.)
  (3715 Pho Royal: photo capture menus/wip/photos/3715.json is 62 dishes / 58 priced, high, from 5 menu-board photos and HAS a Pho section (5 items) — the reason for its QUARANTINE_IDS hold (DoorDash capture had no pho) no longer applies. Left held; un-holding is Calvin's call.) (3977 Imperial Mandarin extracted 52p high but held by QUARANTINE_IDS in scripts/screen-menus.mjs — deliberate hold, not loaded.)
  Working-tree cleanup note (2026-09-14): live write paths for this loop are menus/wip/photos/<id>.json (one file per Sonnet agent, written once at agent end), menus/wip/result-photos-*.json and menus/wip/clean-photos-*.json (written by the load cycle), plus probe/menu-photos/manifest.jsonl, run-full.log and img/<id>/ (appended by the running harvester). Gitignoring menus/wip/ and probe/menu-photos/img/ is safe; nothing else under menus/ is touched by this loop. Loads are paused during any announced session-token migration window. (12179 ZENSHI Handcrafted Sushi = 4th ZENSHI, 22/0 priced, dropped like 12009.) (4539 Flora photo extraction = same brunch-only menu; QUARANTINE_IDS hold kept. 3875 Risers Pizza HELD OUT of loads: its Google menu photos are the prior "Hoboken Pizza & Beer Joint" branding at the same 1459 Garnet address — stale menu; skip id 3875 in merge. NOTE: merge.mjs skip ids are COMMA-separated in one arg, not space-separated.) Agents keep id-prefixing names; the
  strip-prefix node one-liner used for 0914f (loop over photos/, result, clean; drop
  `"<restaurantId> "` from name) is the fix. Flag for Calvin: 11576 Petite Paleo
  Bakery has no street address, agent called it a home-kitchen bakery (no-home-kitchens
  rule) — dropped at screen anyway; his call whether to hold it.

- **Menu-photo sample result, 2026-09-13.** 100 random menuless listed rows: 50 had a
  Google "Menu" photo tab (31 first pass + 19 on `--retry --pause 20`; 22 still throttled
  as "limited view", 28 have no menu category). Sonnet agents transcribed all 50
  (menus/wip/photos/<id>.json): 4 were drink-only (dishes: []), the screener dropped
  unpriced-only captures and thin ones, and 34 menus / 1,214 dishes loaded
  (result-photos-0913.json -> clean-photos-0913.json, 22 menus; result-photos-0913b.json ->
  clean-photos-0913b.json, 12 menus). Net: **34% of sampled menuless restaurants got a
  menu.** Listed coverage 5,668 -> 5,702 of 9,065 (62.9%). The remaining gap with a
  place_id is 3,064 rows, so a full run projects roughly +1,000 menus (~74% coverage) at
  about 1 min/row harvest plus ~4 Sonnet agent-minutes per hit. Decision on the full run
  is Calvin's. 4381 and 5795 came back with real photo menus but stay in
  QUARANTINE_IDS (held on stale prices earlier; photo age unknown). Zero-dish entries
  must be removed from clean.json before loading or load-menus records `not_found`.
- **Menu coverage, 2026-09-13 (listed = hold_reason IS NULL AND lat IS NOT NULL).**
  5,668 of 9,067 listed have a menu (63%), up from 5,641 after the thin review below.
  Serper is at 0 credits and buying more is not worth it: 2,274 of the 3,424 menuless
  listed rows already have a website and the browser yield on them is ~1.8%.
  Held rows (~5,100: outside county, chains, closed, dupes) are never deleted on purpose -
  hold_reason is the blocklist that stops discovery re-adding them.
- **Small-menu floor, 2026-09-13.** `THIN` in scripts/screen-menus.mjs stays at 8. Every 4-7
  dish capture for a listed menuless restaurant (77 rows, probe/thin-review.md) was hand
  read: 28 were whole menus, 49 were carousels/merch/hotel rates/spam. The 28 ids went
  into `COMPLETE_BUT_SHORT` (uncommitted); menus/wip/result-thin-0913.json screened to
  clean-thin-0913.json (921 quarantined, sagemenu aggregator) and loaded: 27 menus, 165
  dishes. Lowering THIN globally would have shipped the 49.
- **Menu-photo harvest, 2026-09-13 (experiment, Calvin said "go ahead and try").**
  `probe/menu-photos/fetch.mjs --limit N | --ids a,b` opens each menuless listed
  restaurant's Google Maps place page headless (URL
  `https://www.google.com/maps/place/?q=place_id:<google_place_id>&hl=en`), clicks
  `button[aria-label^="Photo of"]`, retries up to 3x when Google serves the "limited view"
  shell (no category tiles), clicks the `<button>` whose text is exactly "Menu"
  (`[aria-label="Menu"]` is the hamburger, not the tile), collects the
  `lh3.googleusercontent.com/gps-cs-s` background-image URLs (dedupe on the suffix-stripped
  URL - each photo appears twice), downloads `=w1600` to probe/menu-photos/img/<id>/.
  Manifest: probe/menu-photos/manifest.jsonl (resumable, statuses ok | no-photos |
  limited-view | no-gallery | no-menu-category | menu-category-empty | error). Log in
  probe/menu-photos/run.log. Extraction = Sonnet agents reading the JPGs with the Read
  tool per probe/menu-photos/EXTRACT.md (no ANTHROPIC_API_KEY, so no vision script),
  writing menus/wip/photos/<id>.json -> merged into menus/wip/result-photos-0913.json ->
  screen once -> load. A 100-row random sample was running when this was written; the hit
  rate from that decides whether to run it over all ~3,300 rows. Note tap lists (bars)
  come back as "Menu" photos and must produce dishes: [].
- **RESUME.md is 77KB, far over its own 2K-token rule.** Older dated sections below
  "## 2026-09-05 - distance on search" could be moved to probe/RESUME-archive.md.
- **Words-only plates on the profile — implemented, uncommitted (2026-09-13).** Calvin picked
  tile A (Clipping) + open 2 (the tile, grown up). Shipped in the shared components, so phone
  and web together: `ProfileShelves` "All posts" is now a 2-column shortest-first collage
  (`packBy` in lib/photoShape); a words plate is its tone block edge to edge with the score
  inside; `PlateDetailSheet` leads a photoless post with the same block full-width (hearts
  pinned in its corner, options menu at the score line's right end). tsc + eslint clean.
  The draft routes `/drafts/profile-text-posts`, `/m/drafts/profile-text-posts` and
  `src/components/drafts/ProfileTextPostsDraft.tsx` are superseded — delete once Calvin OKs.
- **Spot-check fixes applied 2026-09-13 (free tier; Serper still at 0).** Details in
  probe/spot-check/REPORT.md "Fixed". Circular duplicates: `scripts/fix-circular-duplicates.mjs`
  broke all 24 pairs (keeper = more dishes > has hours > lower id; hours/website/
  price_band/place_id copied from the loser); 24 restaurants listed again (9,067 listed).
  apply-existing.mjs and retry-permit-only.mjs now refuse to point a row at one already
  held `duplicate of`. `scripts/dedupe-dishes.mjs` deleted 2,387 same-name-same-section
  rows in 195 restaurants (kept the priced/cheapest; different descriptions left alone).
  fix-neighborhoods --apply moved 121 rows. `infer-cuisine.mjs --bars --no-llm` relabelled
  32 "Bars" rows with real food menus (Tahona -> Mexican); Kettner Exchange and ~107 others
  need the LLM stage - **ANTHROPIC_API_KEY is not in .env.local**, add it and run
  `--bars --apply`. `scripts/fix-chain-shared.mjs`: 12 rows adopted their own source URL,
  22 loop rows (Everbowl x16, Las Cuatro Milpas 205/4544, Breakfast Republic x3, Golden
  Chopsticks x2) set to confidence 'low', source_url '' - menus kept, provenance unknown.
  Held: 2611 Carnitas Snack Shack North Park (closed 2019), 609 Addison (dup of 3171).
  Snapshots: probe/snapshots/{circular-duplicates,dedupe-dishes,cuisine-bars,
  chain-shared-self}-2026-09-13*.json, neighborhood-20260913-pre-fix.json,
  targeted-rows-20260913.json.
  Not fixed (need Serper/API): Mama's Bakery 8162 (geocode 2141 El Cajon Blvd, clear
  permit-only hold), Bronx Pizza 24 (menu on allmenus.com), 304 permit-only holds,
  3,119 never-Google-checked, 360 listed rows without address. Kono's/Phil's/Carnitas
  Embarcadero neighborhoods are wrong because regions.ts is a point set (nearest point
  wins) - needs polygons, not a data fix.
  Background probes started 19:31: `scripts/menu-price-drift.mjs` (read-only; fraction of
  our prices still on the source page -> probe/spot-check/price-drift.json, log
  price-drift.log) and check-menu-freshness.mjs baseline over every http source (log
  probe/spot-check/freshness.log; resumable - it orders by checked_at NULLS FIRST). If
  either log ends early, re-run the same command.
  Price-drift result (19:36): 2,959 checkable, 1,204 judged - current 1,108 / drifting 60
  / stale 36 (list: verdict "stale" in price-drift.json, e.g. Fogo de Chao 195, Vigilucci's
  x3, Woodstock's 4419); 256 thin pages (source URL is a landing page/photo), 1,499
  unreadable (595 x 403, 620 JS-rendered, 155 PDF). Re-extracting the 96 stale/drifting
  is a browser-menus job; the 620 JS-rendered ones need the same.
  Freshness baseline finished 19:45: 4,724 http sources - 1,565 now carry a fingerprint
  (1,554 baselined, 9 flagged changed vs an old fingerprint), 3,161 unreadable to a bare
  fetch (browser-only rotation). From here check-menu-freshness.mjs can detect change.

- **50-restaurant spot check (2026-09-13, read-only).** probe/spot-check/REPORT.md.
  49/50 have rows, 46 on the site; menus accurate 29 / mostly 10 / stale 5 / buggy 2 /
  none 3 / unverifiable 1. Found **24 circular "duplicate of" pairs** (both rows held,
  restaurant invisible - Supannee, original Pho Ca Dao) in
  probe/spot-check/dangling-duplicates.json, Mama's Bakery wrongly held permit-only,
  360 listed rows with no address. Nothing fixed yet; Calvin decides.

- **152 junk menus retired 2026-09-13.** Em Coffee House showed `color_3 $1.00
  ... color_11 $52329.00`: the browser tier captured a Wix theme palette
  (siteassets.parastorage.com) as the largest priced payload; 16 more carried
  DoorDash's feature-flag service the same way, plus cents-as-dollars wine and
  coffee lists and two non-food shops. All exported to
  `menus/retired/2026-09-13T19-02-20-976Z-junk.json`, dishes AND ledger rows
  deleted so they are back in the queue (6,840 with menu, queue 3,033).
  `scripts/junk-menu.mjs` (`junkReason`: infrastructure host, identifier
  names, prices >= $1,000, letterless names - Unicode-aware) now runs in
  browser-menus (skips those captures), screen-menus (first reason) and
  load-menus (hard gate). `scripts/retire-junk-menus.mjs --dry` re-finds them.
  Also fixed: load-menus.mjs had a stray `*/` from the 09-09 source-scoping
  edit and would not parse. Details: probe/JUNK-MENUS-2026-09-13.md.

- **Typed dish names are reviewed by hand, never promoted by a threshold
  (2026-09-09).** A diner can always type a dish that is not on the menu — the
  post is never gated. What is gated is the `dishes` row. `npm run dishes:review`
  writes `probe/dish-review-<date>.md` (reads only; four buckets — menu-typo,
  new-dish, new-dish-photo, held), a person edits the `decision:` lines, and
  `npm run dishes:apply` (dry run by default, `--apply` to write) is the only
  thing that turns a spelling into a menu row. Upvote/duplicate-count thresholds
  were rejected: a count that fires for a busy taqueria never fires for the quiet
  place that actually has no menu. Only menu-typo and new-dish arrive pre-filled
  — a queue whose defaults are all `promote` is a threshold with a rubber stamp.
  Promoted dishes carry `dishes.source = 'community'` and the section
  "Added by diners"; **all four places that replace a restaurant's dish list are
  now scoped `AND source = 'menu'`** (load-menus.mjs, db.ts
  replaceDishesForRestaurant, import-restaurants.mjs, retire-untrusted-menus.mjs)
  — unscoped, the next extraction would silently delete every promoted dish.
  Matching is word-by-word typos only (`src/lib/dishNameMatch.ts`), shared with
  the composer's "Already on the menu?" typeahead, so "Carne Asada Fries" never
  merges into "Carne Asada Burrito" and "pho tai" never into "pho gai".
  **Accent-blind since 2026-09-13.** Calvin's call: "Crème Brûlée" and
  "Creme Brulee" are one dish. `foldDishName` runs `foldAccents` first (è→e,
  đ→d, ß→ss), and the SQL side has an IMMUTABLE `fold_accents()` wrapper over
  `unaccent` so `dishes.name_folded` / `posts.dish_name_folded` were dropped and
  rebuilt with the same fold (migrate.mjs, idempotent). `dish_names` was
  re-indexed: 186,772 names, 3,904 accented duplicates merged. Side effect:
  `?dish=` for accented names works now — `normalize()` already folded accents,
  the column did not, so they never met. `dishNameMatch.ts` imports
  `./brandName.ts` (relative, extensioned; `allowImportingTsExtensions` is on)
  because the review scripts load it under plain Node, which cannot resolve `@/`.

- **Yelp free tier is dead (2026-09-09, open).** The nightly
  platemaps-yelp-daily run spent all 300 calls and every one came back
  `400 TRIAL_EXPIRED`. 0 matched, 0 photos, 0 closures. Nothing was
  corrupted - a failed lookup leaves `yelp_checked_at` NULL, so the 7,086-row
  queue is intact and `listed` did not move (9,043 before and after).
  fetch-yelp.mjs is now a PAID script and falls under the same rule as Google
  Places: do not run it unattended. Calvin's call pending: pay for Yelp, pause
  the routine, or try Serper for photos. He wants to keep some scraped photos
  so the feed is not bare; they are seeds, replaced later by the most-upvoted
  photo on a restaurant's posts.

- **The scheduled task's premise was stale.** It claimed a restaurant is
  listed only with photo + rating + coordinates. `publish-check.mjs` READY is
  `hold_reason IS NULL AND lat/lng IS NOT NULL` - no photo, no rating, matching
  the 2026-09-05 decision. All 5,156 unlisted rows are held by hand; the
  photo/rating/hours numbers in its report are informational, not gates. Yelp
  photo work has never moved the `listed` count.

- **How many more Handel's-type gaps? (2026-09-08)** Estimated 100-300
  county-wide; see probe/GAP-ESTIMATE-2026-09-08.md. Permit feed: 80 active
  independent permits with no row (probe/deh-unmatched-independent.json, ~20
  recent). Google side: 156 of 1,051 discovery cells were cut off at 20, and
  no ice cream/dessert/boba sweep has ever run. First fix once Serper has
  credits: `--fetch --query "ice cream"` and `"boba"` over saturated cells.

- **Handel's SDSU / College Area is missing (2026-09-08, open).** A friend of
  Calvin's reported it; confirmed. 5824 Montezuma Rd Ste 130 (Topaz building,
  opened May 2024, 619-269-4070, daily 11-11) has no row. Not in the DEH feed
  under that address, not in OSM, and Maps discovery cell 32.77,-117.07
  returned 20 "restaurants" with no ice cream shop. 14 other Handel's rows
  exist, 13 listed. Serper is at 0 credits ("Not enough credits"), so it
  cannot be pulled via discover-serper until Calvin tops up; then
  `--fetch --query "ice cream"` on that cell, or a hand-built entry in
  data/serper-discovered.json + `--import`. Also check row 2640 "Cream" at
  the same address (OSM 2018): likely closed, possibly the space Handel's took.

- **Back goes back a step, not out of the composer (2026-09-07, uncommitted,
  web + phone).** Calvin: "when your midway through the post process and you
  click back or swipe back it shouuld just take you back a step not take you
  completly out of the posting steps." The five steps lived in a `useState`
  index and nowhere else, so the browser only ever knew about one screen: the
  phone's back gesture, PhoneSwipeBack's edge swipe and the desktop back button
  all popped /post or /m/post and took the photo, the restaurant and the rating
  with them.
  - `components/post/useStepHistory.ts` is the whole fix and both composers
    call it: a forward step pushes an entry at the same URL carrying its own
    index (`__pmStep`), `popstate` reads that index back, and the in-app Back
    button goes *through* the history rather than around it, so no later press
    lands on a step already left. The entry the composer opened on has no
    `__pmStep`, which is exactly where back should still leave — verified
    backing out of step one onto /m/feed.
  - `PhoneSwipeBack` needed two things to keep up: it reads `__pmDepth` live
    off the entry (the ref taken on arrival goes stale as steps push, and a
    composer opened as the app's first screen would hold its swipe back on
    every step of the flow), and it puts a slid-off screen back on a
    **same-path** popstate — nothing new arrives to clear the transform when a
    back stays on /m/post, so the screen used to sit off the right-hand edge
    until the 700ms bailout.
  Verified in Chrome against the dev server: photo → where → dish, back twice,
  answers intact; the in-app Back button leaves `history.length` alone; a
  synthetic edge swipe steps back and clears the transform on the pop.

- **A photo is 4:5 from the viewfinder to the feed, and it never was
  (2026-09-07, uncommitted, web + phone).** Calvin: "when i post the image that
  appears on the feed the dimensions are different." Three different shapes
  were in play. The composer framed at `aspect-[4/5]`; a single shot saved the
  camera's own frame (4:3 or 16:9 landscape, uncropped) while a split saved
  1080x1350; the feed hero was a fixed `aspect-[16/9]` with `object-cover`.
  So the file kept bands the viewfinder had cropped away, and the feed then
  took a second crop of its own — a split lost about half its height. 4:5 is
  now the one shape:
  - `coverCanvas` in CameraCapture does the cover crop for both modes;
    `SHOT_W`/`SHOT_H` put a single shot at 720x900, inside PHOTO_SIZE.
  - The fullscreen composer no longer fills the phone with the viewfinder — a
    handset is roughly 1:2 and framing at that shape was the same lie. The
    picture is a centred `aspect-[4/5] w-full` box, charcoal above and below.
  - The review `img` covers in both modes; the split/contain branch existed
    only because the two pictures were different shapes.
  - `PostMediaCarousel` is `aspect-[4/5]`. Notes in globals.css (`.snap-track`)
    and lib/photos.ts (PHOTO_SIZE) carried the old 16:9 arithmetic and were
    updated with it.
  **Photos already posted are not 4:5** — the live feed holds 675x900, 1080x720
  and 1080x1620 — so old posts are centre-cropped in the new box. Nothing
  stores a photo's dimensions; that is what a per-post ratio would need.

- **The "where" step measures from you, not from downtown (2026-09-07,
  uncommitted, web + phone).** Calvin posted, tapped Next, and got no nearby
  restaurants. The step’s new radius cut (9389d17) filtered on the seeded
  `distance` column, which lib/nearby.ts says is measured from a **fixed
  downtown origin for every visitor alike** — so “within 3 miles” meant “within
  3 miles of the Gaslamp” wherever you stood, and the list handed everyone the
  same 40 downtown rows. It was verified standing in the Gaslamp, which is the
  one place the bug is invisible. `RestaurantPicker` now calls `useNearby()`,
  recomputes every row with `milesBetween`, relabels with `formatMiles`, and
  cuts on that. Measured from Rolando: 40 rows at 0.4-0.5 mi in Rolando and the
  College Area, against Bandar / Vin De Syrah / Tacos El Gordo before.
  - **With no fix there is no honest cut**, only the cap — `!coords` shows
    NEARBY_CEILING rows, the status line reads “Location off — search by name”
    rather than “Near you, closest first”, and the footer says “more” rather
    than “farther away”. The perf win (54,397 DOM nodes down to ~380) is kept
    in every branch; only the claim changes.
  - The prompt is raised on this step’s mount, the one place in the composer
    that asks. lib/nearby.ts reserves the single prompt for “the tap that
    explains why”; “Where were you?” on screen is that explanation.
  - `onSelect` hands back the **untouched** row, so a post’s stored
    `locationLabel` stays the seeded string. How far the poster happened to be
    from the place is not a fact about the place.


- **Search now actually orders by distance, and it never really did
  (2026-09-07, uncommitted, web + phone).** Filters and the relevance ladder
  still decide the tier; distance decides inside it. Two things were stopping
  that, both in `orderResults` (lib/discover.ts) and its two callers:
  - **`f.q` was the gate, and a typed cuisine never survives as `q`.**
    `promote` in discoverFilters turns "thai" into `?cuisine=Thai`, so the
    commonest search in the app measured no distance at all and rendered in
    corpus order. Any active filter now earns the ordering; the bare
    unfiltered grid still keeps corpus order, and a picked neighbourhood still
    turns distance off entirely. The permission-prompt effects in
    `DiscoverBrowser` and `PhoneDiscoverResults` were gated on `f.q` for the
    same reason and were widened the same way — without that the server side
    has no coordinates to sort by.
  - **"Among equals" meant identical scores, and two rungs carry a 0-99
    bonus.** "pizza" scored `Bronx Pizza` 800+50 and `Buona Forchetta Pizza
    Napoletana` 800+25 — one of two name words versus one of four — so a
    25-point measure of *sign length* outranked being across the street.
    `rungOf` in lib/textMatch.ts is the new comparison: coverage bonus dropped,
    fuzzy bonus kept but coarsened to 0.1 of similarity so a typo still finds
    the right place. Raw score is the last tiebreak, so nothing became
    arbitrary. Verified against the dev server from an Oceanside fix:
    `cuisine=Thai` returns Rim Talay (0.0) → Thai Style Kitchen (0.5) → Sabai
    Sabai (1.3); `q=kairoa brewng` still puts Kairoa Brewing Company (32.9)
    above Koakai Brewing (1.4); `q=poke chop` returns all four branches
    nearest-first ahead of a 3.2-mile poke shop, so no tier leaks.

- **Accents were splitting chains in half, and "other locations" now exists
  (2026-09-07, uncommitted, web + phone).** Calvin searched Poke Chop and got
  two branches, neither of them the near ones. Cause: two of the four rows are
  spelled `Poké Chop` (Google) and two `Poke Chop` (OSM), and nothing in the
  search folds the accent — `searchRestaurants` matched the literal string, and
  `textMatch.normalize` was *worse* than nothing because its `[^a-z0-9]+ → " "`
  turned `é` into a space, so `Poké Chop` normalised to `pok chop`. All four
  rows were present, listed and carrying 29-30 dishes the whole time. **This
  was never a coverage bug.** Scope: 379 listed names are non-ASCII, **220** of
  them fold to a different key, and **19 chain groups (53 rows)** are invisible
  to each other without the fold. `share-chain-menus.mjs` uses the same broken
  normaliser, which is why accented branches never inherit a sibling's menu.
  - `src/lib/brandName.ts` is new and is now the one place brand identity is
    decided: `foldAccents` (NFD + strip combining marks), `nameKey`, and
    `brandKey`, which additionally drops a trailing place name **but only the
    row's own neighborhood/city**. A global place list merged "Pho Oceanside"
    into "Phở Carlsbad"; `MIN_KEY_LENGTH = 6` is the guard against exactly
    that. The suffix strip is what merges `Luna Grill Encinitas` into Luna
    Grill — 112 extra brands over the plain fold.
  - `textMatch.normalize` and `discoverFilters.foldSearchText` now fold first.
    `searchRestaurants` gained a second, accent-blind arm over
    `unaccent(translate(...))`; `CREATE EXTENSION IF NOT EXISTS unaccent` is
    appended to `migrate.mjs` and **has been run**. `unaccent` is STABLE, not
    IMMUTABLE, so it cannot be indexed — that arm is a scan.
  - `getSiblingLocations` in `lib/db.ts` + `components/OtherLocations.tsx`
    render the branch list on both `/restaurant/[id]` and `/m/restaurant/[id]`,
    above the full menu. Listed rows only, nearest first, **distance measured
    from the branch on screen** (a server component has no geolocation), a
    branch with no menu still appears and is marked. Collapsed to 5 with a
    "Show N more" — Luna Grill's sixteen branches rendered flat pushed the menu
    off the page. Verified by screenshot at 500px.
  - **This links, it does not merge.** Every branch keeps its own page, menu,
    plates and comments, because prices and kitchens differ per branch. Whether
    Calvin wants a genuine merge is still open.
  - Residual split menus (one branch has a menu, a sibling doesn't): **8 groups
    under the old normaliser, 17 once accents fold.** Small. And the 214 chain
    groups with some branches held are mostly *correct* holds — 134 out of
    county, 34 Google-closed, 22 permit-only.

- **One photo per post, and the shutter now lands on it (2026-09-07,
  pushed).** Calvin: the camera let you stack four photos and the press
  dropped you straight back on the live viewfinder, so the shot you had just
  taken was never on screen. `MAX_PHOTOS` is 1 (lib/photos.ts) and
  `CameraCapture` grew a review state: `taken = photos[0]` replaces the
  viewfinder with the JPEG at `object-cover` in the same box, and the only
  controls left are Retake and Next (fullscreen) or Retake alone on the web
  card, whose Next is the page action bar. The thumbnail strip, the x/4
  counter and the shutter’s “limit reached” state are gone; the mode switch
  belongs to the viewfinder and hides under review, the top-left close does
  not. Split mode is untouched — it still composes two halves into one photo,
  and only the finished picture triggers review. The camera stream keeps
  running behind the review so Retake is instant. `MAX_MEDIA = 4` in
  /api/posts is deliberately left alone: older posts carry several photos and
  that ceiling is a request-shape bound, not a composer rule. Verified by
  screenshot in both shapes on a throwaway /camcheck page, since deleted.
  **Follow-up the same day (pushed):** the review cropped a split photo and its
  buttons sat too low. A split is composed at a fixed 4:5 by `join`, so
  `object-cover` into a phone-shaped screen scaled it up until a third of the
  width was off-screen — "it zooms in after taking photo". Split now uses
  `object-contain` on the charcoal ground (single stays `cover`: that JPEG is
  the video frame the viewfinder was already cropping the same way, so cover is
  the framing you saw). Retake/Next also gained `pb-6` on the fullscreen
  composer, off the strip a phone browser's toolbar and the home indicator
  share, and both rails carry `z-10` so the picture cannot win on DOM order.
  Reported as "Next just doesn't work" — not reproducible on desktop at any
  step (verified end to end in Chrome against a canvas `captureStream` standing
  in for the camera, single and split; Next lands on step 2 both times), so
  those two are the fix for it if it was a hit-target problem, and it needs a
  device to go further if it is not.
  **Second follow-up (same day):** the real report was "Next does nothing",
  then "it's genuinely a five-second delay". Next was innocent — the "where"
  step behind it mounted all 9,043 restaurants as buttons, 54,397 DOM nodes in
  one commit, which on a phone is a multi-second main-thread block that reads
  as a dead button. `RestaurantPicker` (shared by /m/post and the web /post)
  now draws only what is near you: everything within `NEARBY_MI` = 3, floored
  at 12 so the list is never empty out in the county or when the browser
  refused a location (every distance parses to Infinity), ceilinged at 40 so a
  dense block downtown cannot mount six hundred rows. A search is capped at 40
  but not distance-bounded — typing a name means you know the place. Measured
  in Chrome at /m/post: 40 rows / 381 nodes, farthest shown 0.5 mi, against
  9,043 rows / 54,397 nodes before. The footer says "9,003 farther away", not
  "nearby", because they are not.

- **Search dimming is a COLOUR change now, not an alpha one (2026-09-07,
  uncommitted).** Calvin: running a search then zooming out left the unmatched
  field looking undimmed. It was alpha-only (`0.45` at z9 falling to `0.22` at
  z16), and three things cancelled it at low zoom: overlapping dots composite
  to `1-(1-a)^N`, so ~9k restaurants blurred to 3-4px saturate after about five
  and land back on the full ember colour; the aura is hidden for the whole of a
  search, darkening the ground and *raising* each ember contrast; and losing
  glow/inner leaves a hard-edged dot that reads as more present. `DIM_COLOR`
  (`#6b4a3a`, a cooled ember in the accent hue family, deliberately not a
  second grey so it stays clear of `closed` and its `#4b525e`) is now the first
  branch of `restaurant-dots` `circle-color`, tested before `closed` in both
  colour and opacity; `DOT_OPACITY` is a flat `case` (dim 0.7, closed 0.5, else
  0.95) with no zoom ramp. A crowd of dim embers now converges on the dim
  colour instead of on the accent. Verified by screenshot at z10.5 and z9 with
  `ramen` searched. Any future zoom ramp here must repeat the whole `case` at
  each stop: `["zoom"]` is only legal as a top-level `interpolate` input, and
  nesting it inside a `case` branch makes MapLibre reject the property and fall
  back to 1.0, which shipped once as a map that dimmed nothing.

- **Friends' Table shows everyone's rank, not kitchen stations (2026-09-07,
  uncommitted).** Calvin asked for "Head chef" etc. to go from the phone
  leaderboard and for every row to show its rank instead. `RankChip` in
  `PhoneFriendsLeaderboard.tsx` now prints `rankFor(points).title` (Newcomer
  … Institution, `lib/ranks.ts`) on every row, tan on all of them; the `№`
  still carries the podium. `lib/stations.ts` survives only for the web
  `LeaderboardRow`, which nothing imports. Comments in `ranks.ts` and both
  profile pages updated to say the rank now shows in three places. Verified
  by screenshot on a throwaway `/m` page, since deleted. Note: the dev server
  intermittently 500s the whole `/m` tree on another session's in-flight
  suggest work (`hrefForSuggestion` missing from untracked `useSuggest.ts`).

- **Overlays swipe away; the comments header clears the notch (2026-09-07,
  pushed as e363f2e).** In the app the comments screen's back arrow, title and
  count sat behind the status bar: `Dialog`'s `screen` panel is
  `fixed inset-0`, so it is not in `.pm-phone-content` and never got that
  scroller's `env(safe-area-inset-top)`. Its header now carries
  `pt-[max(0.75rem,env(safe-area-inset-top))]` itself — inert in a browser,
  where the inset is 0. Same file gained swipe-to-dismiss for every variant:
  `screen` goes right, sheets and modals go down, touch only, with the
  nearest scroller on that axis deciding who owns the drag. That guard has
  to check computed `overflow` first — `truncate` is `overflow: hidden` and
  reports scrollWidth > clientWidth like a real scroller, so without it the
  dialog's own title swallowed every swipe and nothing moved.
  `PhoneSwipeBack` (new, mounted in `PhoneShell`) adds the same gesture for
  pushed /m routes from the left 28px, standing down while any
  `[role="dialog"]` is open. Its depth counter lives in `history.state`
  (`__pmDepth`, merged so the App Router keeps its key): a ref cannot tell a
  back from a push and climbs by one every round trip until the root screen
  thinks it is deep and swipes the user out of the app.
  Both gestures use **native `touchmove` listeners registered
  `{ passive: false }`**, and that is not a detail: React registers its own
  `touchmove` passively, so a handler written as a JSX prop cannot call
  `preventDefault`. The first version shipped on pointer events and never
  prevented anything, so the WebView started scrolling the moment a thumb
  drifted off-axis and cancelled the swipe with it — every arced swipe died.
  The axis is now decided on the first move carrying 4px (the browser settles
  scroll-vs-not on the first move it keeps, so a decision made after a clean
  10px arrives too late to act on), it is refused outright when `e.cancelable`
  is already false, and a cancel snaps back rather than dismissing.
- **Search is ranked and has a dropdown, web + phone (2026-09-07,
  uncommitted).** Calvin's report: a restaurant with one letter wrong returned
  nothing, and "a bunch of random shit came up". Both halves are now built —
  `probe/SEARCH-PLAN.md` is the full record, read its `## Status` section, not
  this bullet. The dropdown is **one row per reading, never a list of names** —
  Calvin rejected per-name rows twice, then spelled the shape out: "one
  selection for dishes, one selection for restaurants and one selection for food
  or whatever", each carrying its count. The rules that must survive any later
  edit: **a name match outranks every cuisine and dish match, misspelled or
  not** (`TIER` in `lib/textMatch.ts`, floor `SIMILAR_ENOUGH = 0.65`, calibrated
  against 4,016 generated typos — do not raise it by feel); **the count on a row
  is the size of the page that row opens**, which is why `lib/suggest.ts` counts
  with one pass of the grid's own `relevanceFor` filed by `scopeOf` rather than
  a pass per reading (a per-reading count offered 140 over a page of 150);
  **corrections are all-or-nothing across the rows** (a reading with no literal
  hit drops off the moment any other reading has one — `literal` decides
  visibility only, never the printed number); **picking a
  cuisine/neighbourhood/dish row drops `?q=`**, because ANDing a misspelling
  against the right filter is what produced the empty grids; and
  **`lib/suggestTypes.ts` imports nothing**, so client components can hold the
  wire types without dragging the Neon driver into the browser bundle.
  A row that names one thing goes somewhere better than a search —
  `/restaurant/167` for Cannonball, `?cuisine=Thai` for Thai — everything else
  goes to the scoped search `?q=…&in=<scope>` (`SCOPE_PARAM`, read straight off
  the relevance score, so scoping cannot disagree with ranking).
  `promote()` now leaves a term alone when it is exactly a restaurant's name —
  one place in the corpus, `Pizza` in University Heights, which was otherwise
  unreachable by name. Still to do: **B4** (dish precision) and **B5** (SQL
  parity in `searchRestaurants`), both optional and neither blocking.

  **An `All` row comes first (2026-09-07, uncommitted).** Calvin: "add an all
  tab that comes first." It is the un-narrowed ranked search — the one answer
  the menu never named, because Enter already ran it and nothing on screen said
  so or said how big it was. Its count is the sum of the four *tallies*, taken
  before any reading is rewritten, and deliberately not the sum of the four
  printed numbers (a cuisine row prints its facet's size; a corrected dish row
  counts rows the typed spelling cannot reach). It is suppressed when nothing
  matched at all.
  Adding it exposed a real bug and the fix is the part to not undo:
  **there was no URL that meant "all".** A bare `?q=thai` is promoted into
  `?cuisine=Thai` by `promote()`, so the row would have offered 723 and landed
  on 178. `ALL_SCOPE` / `QueryScope` / `QUERY_SCOPES` in `lib/discoverFilters.ts`
  make `?in=all` a legal value that narrows nothing and exists only to suppress
  promotion — it is **not** a field, is not in `SEARCH_SCOPES`, and `scopeOf`
  never returns it. Enter still promotes, because Enter picked nothing.
  The row's reading word (`ALL`, `DISH`) is orange at Calvin's ask, in
  `--pm-orange-text` not `--pm-orange`: small text, and the fill orange is 3.1:1
  on white (DESIGN.md); the count stays `zinc-500` at his follow-up "make the
  number and results original color". Verified by screenshot on both `/` and `/m`, and every
  row's count re-checked against its destination page.

  **`/m` was returning a hard 404 (2026-09-07, fixed).** Not a code bug —
  Turbopack's dev router lost the `/m` entry after sibling pages under
  `src/app/m/` were created and deleted in earlier sessions, leaving stale
  compiled dirs (`.next/dev/server/app/camprobetest123`,
  `.next/dev/server/app/m/zz-draft-friends-table`). Killing the dev server,
  removing those dirs and restarting fixed it; all 13 routes then 200. Same
  class as the cached-500 trap in AGENTS.md, just 404 instead of 500.

- **Phone feed bar is pinned in two tiers, with the refresh gap between them
  (2026-09-07, committed 91b2add / e25b8ba / abf8c5c / c69963b / f0837b0).**
  `PhoneStickyBar` takes a `pinned` prop plus two optional slots —
  `gap` (opens *between* the tiers, sized by `--pm-pull`) and `lower` (the
  second tier, measured by the same ResizeObserver as the first). `PhoneFeedScreen`
  passes the tab row as `children`, `PhonePullToRefresh` as `gap` and the
  sort-switch/search row as `lower`. Discover (/m) is unchanged.

  The middle state went back and forth. All three rows pinned as one block
  (abf8c5c) cost 90pt of a ~640pt screen permanently; the split (c69963b) put
  the sort switch and search in the ordinary flow, which made them reachable
  only from the very top — you scrolled home to change the sort, which is the
  round trip the sticky bar exists to remove. Two tiers is the resolution:
  a quick upward scroll brings the whole header back at once, and at rest the
  gap opening between them means the tab row stays welded to the top while
  New/Trending and search travel down with the cards and the dial arrives in
  front of them. The spacer grows by the pull as well
  (`calc(${height + lowerHeight}px + var(--pm-pull, 0px))`), so the cards
  never shear away from the bar mid-drag. The lower tier uses `pt-0.5`, not
  `mt-0.5`: it is measured with `offsetHeight`, which excludes margins.

  Pinned still hides on the way down and returns on the way up, off the same
  `settle` as the sticky build — there is no pinned early return any more. It
  hides to `-frameHeight` and **not** `-height`: the fixed box wears the inset
  as padding (below), so it only clears the screen once it has travelled its
  content plus the inset, and `height` parked it an inset short with the
  bottom of the tabs showing under the clock. The offset animates through
  `top`, never a transform.

  **Pinned is `position: fixed`, not sticky, and that is not a style choice.**
  Sticky held `top: 0` correctly in a desktop browser and drifted a few points
  up and down on the phone through every scroll ("it still shifts up and down a
  tad bit"): sticky is recomputed against the scrollport each frame, and this
  scroller has a non-passive `touchmove` listener plus a `scroll` listener, so
  while a finger is down WebKit scrolls from the main thread and the offset
  lands a frame late. The fixed build leaves the flow, drops a measured spacer
  in its place, and carries `padding-top: env(safe-area-inset-top)` itself —
  the one place the "never add the inset to `top`" rule in that file's header is
  reversed, because fixed pins above the scroller's padding rather than below
  it. That padding replaces the separate slab. Do not put the feed bar back on
  sticky.

  **The inset was being paid twice on device (e793d60).** The bar measures the
  safe area with a probe div carrying `padding-top: env(safe-area-inset-top)`
  and reading its own height. That probe was `h-0` and *in flow* — and a
  border-box element cannot be shorter than its padding, so the "zero-height"
  probe was a full inset tall in the column, on top of the inset
  `.pm-phone-content` already spends as its own `padding-top`. Invisible in a
  desktop browser, where the inset is 0; on a phone it was ~47pt of blank cream
  between the search row and the first card, which is what "hella space" was.
  It is `absolute` now — still laid out, so `getBoundingClientRect().height`
  still answers, but out of the flow. Anything that reads `env(safe-area-*)`
  by measuring a box has to be out of flow for the same reason.

  **The New/Trending switch was widened to close the gap beside it, and that
  was reverted (0e458f1, reverted in 5ea696f).** `FeedSortSwitch` took a
  `fill` prop that stretched it across the row. Calvin: "I didnt mean make the
  new and treinding thing wider revert it I like everything else you did thou."
  The switch is sized to its labels on purpose — it is a modifier on the feed,
  not the feed's navigation. The space beside it is not a bug to close.

  `PhonePullToRefresh` stopped being a `position: fixed` dial over the list —
  it is now an in-flow block mounted directly under the bar whose *height* is
  the pull (`.phone-refresh` in phone.css: `position: relative;
  height: var(--pm-pull); overflow: hidden; align-items: flex-end`), so the drag
  opens a real gap, the cards below move and the dial slides down out from
  behind the tab row. Still a height and never a transform — a transformed
  ancestor would re-anchor every `position: fixed` overlay in the app for the
  length of the drag.

  The pull is **published on the scroller** as `--pm-pull`, not kept in the
  gap element's own style, because the bar's spacer has to read the same
  number; lifting `pull` into `PhoneFeedScreen` state instead would re-render
  the whole card list on every drag frame. `--pm-pull-ease` travels with it:
  a custom property does not transition, a `calc()` height driven by one does,
  and the spacer cannot see the `data-phase` attribute that switches the gap's
  own transition off — so the duration is carried as a second var. 0s while a
  finger is setting the number (a transition there is lag between the drag and
  the cards), 0.22s for every move the component makes on its own: the snap
  back from a cancelled pull, the drop to REST, and the close. Without it the
  cards jumped home in one frame while the dial was still winding shut.

  It also arms **mid-touch**: reading down the feed and dragging back up is one
  continuous downward drag that reaches the top with the finger still moving,
  and arming only on `touchstart` refused that whole touch, so scrolling home
  got the platform's bare bounce and no wheel. The touch is tracked wherever it
  starts and `startY` is rewritten every frame the scroller is still moving, so
  the pull is measured from where the finger was when the list ran out.
  `.pm-phone-content` went `overscroll-behavior: contain` → `none` for the same
  reason: a drag that reaches the top mid-touch cannot cancel the rubber-band
  (WebKit commits on a touch's opening moves), so bounce and gap would have run
  together and the list would have travelled twice as far.

  There is deliberately **no second threshold** for a pull inherited from a
  scroll. One existed for a day — PICKUP, 28pt of extra travel to arm
  (cbdf2c6) — on the theory that a finger arriving at the end of the list is
  still wandering as it slows and would twitch the gap open and shut at SLOP.
  It was removed in c69963b: "if you start scrolled down and scroll up it
  smoothly transition to the loading animation and not stop at the top" — and
  stopping at the top is exactly what it did, the list running out and nothing
  happening until you had dragged another 28pt. Do not add it back. What holds
  the twitch down instead is a dip back over the baseline **re-baselining**
  rather than ending the touch (so a wobble never accumulates and a deliberate
  drag still pays SLOP in one motion), plus a guard against re-rendering a pull
  value that has not changed.

- **A dish search result opens the dish, not the menu (2026-09-07).**
  "when you search a food and the result that comes up is a dish result it
  should bring you directly to the dish in the restaurant page." The
  `?dish=<id>` deep link already existed — RestaurantDetail and
  PhoneDetailScreen read it and open `DishSheet`, and the feed's post cards
  already produced it — but a *search* card could not, because `MatchedDish`
  was `{name, price}` with no id. It now carries `id`, selected as `d.id` in
  all three producers (`searchRestaurants`' `dish_match` CTE, `dishMatchesFor`,
  `dishesNamedExactly`) and projected as `matched_dish_id`.

  The link itself is `restaurantHref(base, restaurant)` in
  `src/lib/restaurantHref.ts`, one function for both surfaces — `/restaurant`
  and `/m/restaurant` — used by RestaurantCard, PhoneRestaurantCard and
  PhoneRestaurantCardGrid, the three cards that print the matched dish. Which
  dish a card opens is a fact about the search, not about the layout, so it
  does not get two implementations. A row with no matched dish still links to
  the plain page, and an unknown id degrades to it (both readers check
  membership before opening).

  The suggest dropdown's **Dish line is unchanged** and still goes to the
  scoped grid (`?q=…&in=dish`) — one dish name is usually many restaurants,
  and each of those cards now carries the deep link.

  `probe/db.pre-fold.ts` is a frozen copy of db.ts and took the same two
  columns purely to keep `tsc` clean; it is not a second implementation.

- **Map bubbles ~15% larger; downvote arrow fixed (2026-09-07, uncommitted).**
  `arrowGlyph` in RestaurantMap.tsx rotated the downvote with `transform` on
  the outer `<svg>`, which browsers ignore, so both arrows pointed up; it now
  rotates an inner `<g>`. Calvin rejected enlarging the vote pair alone (it
  outgrew the row), so the whole bubble went up a step instead: 12→14px
  headline, 10→11.5px meta row, 11→13px arrows, padding 7/13, with the
  measured row heights and estimateMetaWidth/estimateBubbleWidth per-char
  advances scaled to match. Verified in Chrome on /feed → Map feed.

- **Sunny Side Solana (id 7197) has demo dish percents (2026-09-06).** For Ed to
  see what a restaurant page looks like with THE HITS filled in, eight of its
  105 dishes got hand-set `dishes.yes_votes`/`no_votes` (the read-only
  fallback tally `dishStats` renders when no dish-rated posts exist): Short
  Rib Hash 94, Chilaquiles 91, Short Rib benedict 89, Nutella Banana Pancakes
  88, My Way or Hwy 101 86, Strawberry Dream French Toast 84, Solana Omelet
  81, Country Fried Steak & Eggs 78 (ids 7197-4/6/30/17/1/19/24/5). Phone
  shows seven (`PhoneDetailScreen` caps at 7), web shows eight. These are the
  only non-zero vote rows in the corpus; zero them out to undo.

- **Tour step 6 "nothing appears" fixed (2026-09-06).** A real tap on a step's
  control advances in the capture phase, and Chrome flushes React between the
  phases of a user-initiated click, so the next StepMark was already listening
  when the same tap bubbled and folded it into the "TOUR 6 / 12" badge on
  arrival. `StepMark`'s outside-click listener now ignores events stamped
  before it was armed (`e.timeStamp <= armedAt`). Scripted `el.click()` never
  showed it (no microtask checkpoint mid-dispatch) - test tours with real
  taps. Same day: `POST /api/account/settings {tourSeen}` is two-way
  (`setTourSeen(userId, seen)` in db.ts) and Calvin's `users.tour_seen` was
  reset to false so the tour opens on his localhost without `?tour=1`.

- **Tour walked end to end as a first-timer, rough edges fixed (2026-09-05).**
  `CoachTour.tsx`: the "Have a scroll" step no longer blocks scrolling (it was
  a pane over `.pm-phone-content`; now a capture-phase click swallow, so cards
  and nav are inert but the feed scrolls). A move whose control is off-screen
  scrolls it into view — sticky rows scroll the phone scroller to the top so
  the hidden `PhoneStickyBar` comes back. A move whose control is not on this
  page marks the Feed nav with "Tap Feed to get back" (`home: "feed"` on the
  map/feedtab/restaurant steps); if nothing at all is found for 2.5s the
  caption says so and offers Next. Captions are clamped to the viewport. The
  mark remounts per step *and* page, so a badge folded by a nav tap unfolds on
  the screen it opened. `?tour=1` is latched once per mount (it used to be
  re-read every render and closed itself on the first navigation for anyone
  with the latch set) and always starts at step 1. Chrome on this PC is signed
  in with `tourSeen: true`, so `?tour=1` is the only way to see it here.
  Signed-out Friends/Profile steps land on the sign-in walls — copy unchanged.
  Verifying in a background Chrome tab: rAF and scroll events are paused, so
  take a 0.1-scale screenshot to pump frames before reading layout.
- **The first-run tour no longer needs a login (2026-09-05).** `useCoachTour`
  in `src/components/tour/CoachTour.tsx` used to require an account, so a
  signed-out visitor — the most first-run person there is — never saw it, and
  it could not be looked at on localhost without signing in. The latch now has
  two halves: `account.tourSeen` when signed in, `localStorage["pm-tour-seen"]`
  when not, and `finish()` writes the local one always so signing out does not
  re-offer it. `?tour=1` on any URL replays it past both latches — that is how
  to see it, e.g. `localhost:3000/m/feed?tour=1`. `open` is derived during
  render, not latched by an effect; the two eslint react-hooks rules here
  (`set-state-in-effect`, `refs`) reject both of the obvious alternatives.
  Typecheck and eslint clean, verified running signed-out on `/m`.

- **What killed the Serper credits (forensics 2026-09-05 16:00 PT):** NOT menu
  extraction. Between 13:38 and 13:52 the second-query-word lever was run three
  times back to back — `--query cafe` (1,117 cells), `--query bar` (1,111),
  `--query bakery` (died at 66) — roughly 2,300 credits in fourteen minutes, on
  top of the 1,118-cell "restaurants" grid and the 88-cell deep pass. Yield: 217
  new rows, **95 of them bars, breweries, lounges or nightclubs** (39 typed
  "brewery", 22 "bar", 7 "cocktail_bar"). Those rows then clogged the extraction
  queue and are the direct reason waves w8 and w8b returned almost nothing — the
  agents kept filing "no food menu, hold candidate". **Before running another
  query word, decide whether bars belong on a dish map at all.** The lever costs
  ~1,100 credits per word and this run spent them on venues with no food.
- **SERPER CREDITS EXHAUSTED 2026-09-05 ~13:50 PT** (serper.mjs returns 400 "Not enough
  credits"). The "cafe" discovery pass died after 66 cells (probe/discover-0905b.log,
  1,057 credit errors); w8-03/w8-04 agents could not search, every no-website row
  filed blocked (0 permanent). Do NOT spawn agents on no-website rows until Calvin
  tops up at serper.dev; the router/browser night loop does not need Serper and
  keeps running. Resume: re-run `discover-serper.mjs --fetch --query cafe` (state
  file resumes free), then cut-wave.mjs --prefix w8b.
- **Neighborhoods recomputed 2026-09-05 14:35 PT.** 5,104 listed rows carried a ZONE
  name ("North County Inland") instead of a sub-area, so neighborhood chips
  undercounted (Pauma Valley showed 1 of 12). `fix-neighborhoods.mjs --apply`
  run to convergence (it writes in passes; run until "0 would change"). Snapshot:
  `probe/snapshots/neighborhood-20260905T142340.json`. ~200 listed rows keep a
  zone name on purpose: >5 mi from any sub-area point (Borrego, Campo, Julian
  outskirts) — add points to `src/data/regions.ts` to fix. Held 9967 "Pauma
  Indian Reservation" and 11828 "Valley Center High School Cafe" (not public).
  Out-of-county sweep hold (2,683 rows) IS applied now. Any importer that
  inserts rows must run fix-neighborhoods afterwards or chips undercount again.
  Duplicate suspect: Jilberto's Taco Shop 9513 and 5874, two CA-76 addresses.
- **Cuisine backfill from menus (2026-09-05 ~20:20 PT).** Coverage before:
  1,267 listed rows had no cuisine (raw label "Restaurant"/null). Two passes:
  (1) `src/data/cuisines.ts` ALIASES/UNSET extended with ~60 Google place
  types (`korean_barbecue_restaurant`, `poke_bar`, `chocolate_shop`...) and
  `backfill-cuisine.mjs --apply` filled 322 rows. (2) NEW
  `scripts/infer-cuisine.mjs`: scores name + menu sections + dish names
  against a per-cuisine lexicon (name 6, generic venue word "Grill/Kitchen/
  Cafe/Bar" 3, section 2, dish 1/0.4); decides at score >= 8 with a menu or
  >= 3 on a bare name, and >= 2x the runner-up. `--no-llm --apply` wrote 844
  rows (490 listed). Snapshot of the touched rows:
  `probe/snapshots/cuisine-null-2026-09-05T20-16-50.json`; decision log with
  evidence: `probe/cuisine-inferred-2026-09-05T20-16-50.json`. After: 610
  listed rows still null (1,035 total), 334 of them WITH a menu the keywords
  could not settle ("Ketch Grill & Taps", "Le Bambou") and ~275 bare names
  ("Americana Restaurant", "The Meltdown"). Stage 2 (LLM) was **never run** —
  no ANTHROPIC_API_KEY, and Calvin said do it by hand instead.
- **Manual cuisine pass (2026-09-06 ~02:30 PT).** `probe/cuisine-todo.mjs`
  dumped the 1,046 blank rows into `probe/cuisine-todo/batch-01..10.txt` —
  listed rows first, menu-richest first, each line `<id> | <name> |
  <cuisine_raw> | [top 8 sections] 14 dishes spread through the menu`. I read
  batches 01-06 (every listed row) and hand-wrote verdicts to
  `probe/cuisine-todo/done-01..06.txt` as `<id> <Cuisine>`, skipping anything
  a menu or name could not settle (mess halls, food courts, "The Buffet",
  merch-only menus). NEW `scripts/apply-cuisine-decisions.mjs` reads every
  done-NN.txt, rejects a cuisine outside `CUISINES`, rejects conflicting
  verdicts, snapshots, then fills ONLY rows still blank. 485 rows written;
  snapshot `probe/snapshots/cuisine-manual-2026-09-06T02-31-55.json`.
  **After: 160 listed rows still blank (561 total), down from 621/1,046.**
  Those 160 are the deliberate skips — genuinely unclassifiable names. To go
  further, work `batch-07..10.txt` (unlisted rows only) the same way.
  `normalize-cuisines.mjs` now KEEPS an existing cuisine when the raw label
  maps to nothing, so a re-normalize does not wipe inferred rows.
  `probe/cuisine-coverage.mjs` re-measures. Rows only ever go null -> value;
  cuisine_raw/cuisine_tags untouched.
- **Map search is a filter (2026-09-05).** Typing in the feed map's field lights
  every match and dims everything else: `dim` embers lose glow/inner/ring and
  drop to 0.45 -> 0.22 alpha by zoom; `lit` matches get a hotter halo, wear the
  ring at any score. **The district aura (`restaurant-aura` heatmap) is
  HIDDEN for the whole of a search** (`setAuraVisible` in RestaurantMap,
  2026-09-05 late): Calvin's call — a searched map is dim embers plus lit
  matches on dark ground, no pools. An earlier version instead re-weighted
  the aura toward the matches (2.2x); that was wrong and is gone. Same pass
  fixed `restaurant-dots` `circle-opacity`, which nested a zoom ramp inside a
  `case` — MapLibre rejected the whole property and unmatched dots stayed at
  full brightness. The field calls `/api/restaurants?q=&fields=map`, a slim
  uncapped hit list (limit 2,500) — the default `?q=` cap of 60 was dimming
  real matches. Aura/opacity fix uncommitted; typecheck and eslint clean,
  verified on screen in Chrome.
- **Discovery deep pass done 2026-09-05 19:10 PT.** `discover-serper.mjs` now
  (a) only walks cells inside the county bbox (the sweep import had added
  1,351 out-of-county cells that would have burned credits), (b) has
  `--deep [--limit N]`: for every cell that came back full (20+ places in
  its square or 18+ first seen there) it fetches pages 2-3 at 16z plus the
  four quarter-cell centres at 17z; state in `data/serper-deep.json`,
  re-run is free, (c) skips not-public places (military galleys and base
  exchanges, campus/clinic cafeterias, VFW, beach clubs, park concessions,
  tour operators, delivery services, corporate offices) via NOT_PUBLIC_*
  regexes in `report()`. Result: 1,117 cells + 88 deepened, 857 credits,
  7,722 places seen, 95 imported (gmap now 789), 21 held as chains
  ("it's just wings" added to `data/excluded-chains.json` — a Chili's ghost
  brand), 74 listed (8,861 -> 8,935). Casino restaurants (Sycuan, Barona,
  Harrah's, Valley View) and food trucks were kept on purpose.
  Snapshot: `probe/snapshots/listed-hold-20260905-pre-import.json`. Log:
  `probe/discover-0905.log`. Backup of the pre-patch script:
  `scripts/discover-serper.mjs.bak` (delete once trusted).
  Next discovery lever, not yet asked for: a second query word per cell
  ("food", "cafe", "bar") — "restaurants" misses places Google types as
  cafe/bakery/bar; ~1,100 credits per word.
- The 789 gmap rows have no photo and no hours (photo/hours scripts are Yelp,
  forbidden). They list anyway; the site guards on null.
- **Bash-tool heredoc trap:** a JS template literal containing two
  backslashes then `b` reaches the file as a BACKSPACE byte (0x08) when the
  script is piped through the Bash tool's heredoc, exactly like the perl
  case below. Build word boundaries as `(^|[^a-z0-9])word([^a-z0-9]|$)` or
  use the Edit tool. `grep -nP "" file` finds the damage.

- **A rating is no longer required to be listed.** Calvin: "as long as there
  is a restaurant it should be on the site." `publish-check.mjs` gate is now
  `hold_reason IS NULL AND lat/lng present`. Do not put the rating back.
- **Search ignores apostrophes** on both server (`searchRestaurants` in
  `src/lib/db.ts`) and client (`foldSearchText` in `src/lib/discoverFilters.ts`).
  "clems station" must find "Clem's Station". Keep both in step.
- **Google Maps discovery exists:** `scripts/discover-serper.mjs`
  (`--fetch`, `--report`, `--import [--dry]`), imported 694 `gmap:` rows,
  re-running is safe. After an import: `exclude-chains.mjs --apply` then
  `publish-check.mjs`. Gap: ~20 places/call, so dense cells (downtown, North
  Park, Convoy, Hillcrest) only partly seen — a page-2/3 pass would close it.
- The 694 gmap rows have no menus and are not in the w5 batches; cut them into
  a later wave. 194 of them have no cuisine (Google typed them "Restaurant").
- `serper.mjs` **is allowed** for agents and the coordinator. Google Places
  and Yelp API scripts stay forbidden.
- **2,711 live rows are outside San Diego County and are LISTED** (2,707
  `sweep` + 4 `osm`). Not held yet — needs Calvin's yes. Pending UPDATE (snapshot
  `id, listed, hold_reason` first): `hold_reason='outside_county' WHERE
  hold_reason IS NULL AND (lat/lng outside bbox 32.534-33.44 / -117.6..-116.08
  OR address ~* 'tijuana|tecate|rosarito|ensenada|baja|m[eé]xico')`. In a neon
  sql`` template, `\s`/`\d` lose their backslash — use `[[:space:]]`/`[0-9]`.
  `cut-batches.mjs`/`cut-wave.mjs` already apply this rule so agents stop
  getting them; ~1,100 sweep rows are in-county.
- **Corpus grew by ~2,800 `sweep` rows on 2026-09-05** (979 -> 3,803), listed,
  no menus — cut them into a later wave with the 694 gmap rows.
- Restaurant pages are `/restaurant/<id>`; there is no slug column.
- Still open, not acted on: holding the ~1,000 unverified rows (785 DEH
  permit-only + 220 OSM pins) with a "not yet verified" reason. Calvin has
  not said yes.

## Which terminal am I

- **Ask terminal:** questions, numbers, decisions. Never spawn agents here.
  Answer with `db:stats` or a `grep`, then the user runs `/clear`.
- **Wave terminal:** runs extraction. Do not answer questions here beyond a
  one-line progress figure; every round trip here re-sends the whole context.

## The loop (wave terminal only) — Cost plan 2026-09-08 (see RUNBOOK)

```
# 1. router pass first, zero tokens — catches with-website AND (new) no-website
#    rows via one serper.mjs-style search per row. Cache is fine.
node --env-file=.env.local scripts/route-menus.mjs --concurrency 4   # background it

# 2. cut a wave ONLY from rows the router attempted and failed on
node --env-file=.env.local scripts/cut-wave.mjs --size 20 --count 20 --prefix <name>
# writes menus/wip/<name>-NN.json, each an OBJECT: { tier, tried, restaurants }
# tier "haiku" = every row already has a website/platform the router found;
# "sonnet" = at least one row needs fresh discovery. Spawn on the tier's model.

# 3. spawn agents, brief = probe/AGENT-BRIEF-LITE.md (NOT AGENT-BRIEF.md), one
#    batch each, model per the batch's own "tier" field.

# 4. on each completion, one script does check-shape -> screen -> copy ->
#    check-shape -> refuse-if-mismatched -> load -> log, and prints ONE line:
./scripts/process-result.sh menus/wip/result-<name>-NN.json
```

`probe/AGENT-BRIEF.md` (26KB) is retired for spawned agents — replaced by
`probe/AGENT-BRIEF-LITE.md` (under 8KB): same standing rules, plus a hard
budget (6 tool calls/restaurant, 60/batch, block after 2 dead ends) and an
instruction to read each row's `router`/`tried` note before searching from
scratch. `cut-batches.mjs` still exists for the raw (never-routed) queue;
`cut-wave.mjs` is only for router leftovers. Blocked-row skip in `cut-wave.mjs`
defaults to 30 days (was 24h in `cut-batches.mjs`) — a router/agent block is a
real finding, not worth re-discovering the next morning.

- Wave state 2026-09-05 (late): w5, w6-01..w6k-09 complete. Router pass 2026-09-05 loaded
  25 menus (coverage 6,675/13,983). w7 cut 2026-09-05 through cut-wave.mjs (4 batches of 20,
  from 729 router-failed rows). w7-02, w7-04 done (3 found/40, ~110K tok and ~25 calls per batch). w7-01 done (0 found). w7b-01 done (1 found). w7-03 done (1 found). w7b-02 done (0 found). Calvin said "keep extracting" 2026-09-05 14:45 PT: SPAWNING RESUMED. w8-01..04 done 2026-09-05 15:15 PT: 7 found/80 (~440K tok), Serper dead the whole wave. In flight: none. w8b-01..04 cut 15:20 PT with the NEW `cut-wave.mjs --with-website` flag (only rows an agent can work without a search; 506 such rows available) and spawned on HAIKU — all four batches tier haiku. This is the right shape to keep running while Serper is dead. Brief addition for next spawn: never cat .env.local (w8-02 agent leaked DB creds into its transcript; consider rotating the Neon password). Two night-run loops are running in parallel (iter 18 and iter 24 both browsering the same notes file) — harmless but doubled work, kill one when convenient. the night-run scheduled task keeps the zero-token router+browser tiers cycling. Headless browser pass over router-20260905-184549 notes done: 35 menus loaded, coverage 6,726/14,078. Old w6k-10..20 batch files are superseded; do not spawn them.
  share-chain-menus last ran 2026-09-07 (late, see probe/share-chain.log).
- Four agents max. On each completion: screen, copy, load, spawn a replacement
  in the same turn. Never end a turn with zero agents running unless the queue
  is 0 or Calvin says stop.
- Read every report: `not_found` is permanent and only for confirmed closed /
  replaced / not a food business. "No prices published" (theme park, zoo,
  stadium, campus, airport), "no web presence", "likely closed" are `blocked`.
  Withdraw wrong ones: `node menus/wip/withdraw-many.mjs <file> <ids>`.
  To pull a `found` entry (wrong city, MXN prices) REMOVE it with that
  script; blanking its `dishes` loads as a permanent `not_found`.
- Agents sometimes write `verdict: "blocked"` instead of the `blocked` key; the loader
  then records permanent not_found (w6f-15 did this to 7 rows on 2026-09-07,
  reversed by deleting the menu_lookups rows). check-shape.mjs catches it.
- Agents sometimes write `restaurantId` as a number; the loader now coerces
  to string (it used to report "no such restaurant" and refuse the file).
- `load-menus.mjs` refuses the whole file on a name mismatch. Fix the name in
  the ready file, or if the DB has an obvious typo, one UPDATE with WHERE id.
  Check in-flight work with `ls menus/wip/result-*.json`; a `.screen.lock`
  directory means another session is screening — wait for it.
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

## 2026-09-05 — distance on search (uncommitted, web + phone)
- Discover search (`?q=`) now asks for the visitor's position (prompt on the
  search, silent if already granted), prints the live distance on every card
  and orders results nearest-first, except when a neighbourhood filter is on.
  Server-side rule: `orderResults` / `withDistance` in `src/lib/discover.ts`;
  `milesAway` marks a live value (phone card only prints those).
- Phone results moved into `src/components/mobile/PhoneDiscoverResults.tsx`
  (client) so `/m` can re-answer against coordinates like `DiscoverBrowser`.
- Fixed a pre-existing crash: `POST /api/restaurants/discover` JSON turned the
  facet-count Maps into `{}` (`counts.get is not a function`). Round-trip now
  goes through `src/lib/discoverWire.ts` (`toWire` / `fromWire`).
- Verified in Chrome with a mocked position; localhost geolocation is *denied*
  in Calvin's Chrome, so a real check needs that site permission reset.

## 2026-09-06 - the browser has never opened 1,326 of the gap rows

`browser-menus.mjs:781` admits only notes whose outcome is `needs-browser` or
`gated`. Rows the router marked **`no-platform`** are dropped - and that is
**1,326 of the 2,143 listed gap rows that have a website**, 60% of everything
addressable. There is no guard behind it: the script reads `website` straight
out of `restaurants` and never uses the router's platform at all. The filter is
just narrower than the tool behind it.

Two rows pulled out of that class by hand the same day both filed clean on the
first open - **F Street Cafe** (12 prices printed on its own homepage) and
**Docent Brewing** (28 items behind a harmless age gate). 40 dishes, zero
tokens, from rows the pipeline had written off.

Running now: `probe/mk-noplatform-feed.mjs` builds a feed of those rows with the
outcome relabelled `needs-browser` - no edit to shared code, so nothing changes
under another agent's run. Pass is on `menus/wip/noplatform-mtq7u547.notes.json`
writing `menus/wip/browser-20260906-194137.json`, with an absorb loop behind it.

**Use `--no-chains-first` on this feed.** Only 93 of the 1,326 rows share a name
with another row; chains-first front-loads ten gated Crumbl Cookies before it
reaches a single independent. Notes-file order is review_count DESC, which is
what you want.

### The vision question is answered: don't buy it yet

`probe/classify-gap.mjs` on 200 random gap rows, scaled to the 2,214 with a
website: no-prices-anywhere 45.5% (~1,007), fetch-failed 24.5% (~542),
few-prices 14.5% (~321), image-menu-likely 10% (~221), prices-present 3.5%
(~77), pdf-menu 2% (~44). **A vision sweep addresses only pdf + image = ~265
rows at $75-200.** Nearly half the gap is restaurants that never published
prices at all - confirmed by eye at C Level, Tita's Kitchenette and Junction Bar
& Grill, each with a full menu and no numbers on it. No pipeline reaches those.

Caveat found while checking: `prices-present` is **inflated**. Junction Bar &
Grill landed in it on upcharges alone ("additional toppings $3", "upgrade fries
$4") with not one item price on the page. The bucket needs a rule that discounts
dollar figures inside upgrade/add prose before that 3.5% is trusted.

### Chrome manual extraction

`menus/wip/chrome-manual.notes.json` carries the by-hand outcomes. Filed: Bronx
Pizza (16), F Street Cafe (12), Docent Brewing (28). Not filed: C Level, Tita's
Kitchenette, Junction Bar & Grill (all no prices published), El Charro
(`elcharro.site` is the squatted-domain class - its stored website should be
nulled), Soda & Swine (both locations temporarily closed).

**Peterson's Donut Corner (id 7827) is quarantined, not lost.** 199 items with
prices at `menutoeat.com`, which is deliberately on screen-menus.mjs's tier-5
UNTRUSTED list. Left quarantined - it needs corroboration from a second source,
not an exemption. Worth the effort: 3,661 reviews, 56 clean dishes ready in
`menus/wip/result-chrome-02.json`.

## 2026-09-06 - the never-browsed class is measured, and it is thin

The supervisor (`scripts/noplatform-supervisor.sh`) has now put a real browser
on 400 of the rows `browser-menus.mjs:781` had been silently skipping. Outcome
mix over those 400:

    261  needs-browser   opened, rendered, still no priced menu
     90  fetch-failed    site dead, parked, or refusing the client
     28  gated
     12  gate-personal
      7  filed           <- 1.75%
      2  wrong-branch

**7 menus per 400 rows.** The earlier 11% projection came from the
`needs-browser` class and does not transfer: the router marked these rows
`no-platform` because there usually is no platform, and behind that there is
usually no published price either. F Street Cafe and Docent Brewing were real,
but they were the good end of the distribution, not the middle of it.

412 rows remain in the backlog; at this rate they are worth ~7 more menus.
Zero tokens, so it is still worth finishing - but this lever is nearly spent
and it does not move listed coverage much (5,764 -> 5,768 so far, 63.8%).

What this says about the $50 Serper question: the gap is not mostly a discovery
problem. 90 of 400 sites could not even be fetched and 261 rendered fine with
no prices on them. Finding a website for a restaurant that never published
prices buys nothing. Treat 100-150 menus as the optimistic end and sample 100
rows before committing the rest of the credits.

### Correction: `fetch-failed` was mostly our own resolver

The 1.75% number above stands, but the reason I gave for it does not. I told
Calvin "90 of 400 sites could not even be fetched" and used it as evidence the
gap is intrinsically hard. It is not evidence of anything about those sites.

Classifying every `fetch-failed` note by its Chromium error code gave 441 listed
gap rows as `ERR_NAME_NOT_RESOLVED`. A plain `dns.lookup` on the 40 highest-review
"dead" domains resolved **38 of them** - mamakats.com, rubios.com, sammyspizza.com,
jimbos.com, parakeetcafe.com. Several browser passes were running at once
(supervisor + absorb loop + 20 orphaned Chromium processes from the hung run) and
Chromium's resolver collapsed under it.

`probe/mk-retry-feed.mjs` now resolves every host in Node before feeding it back,
so "dead domain" means something. Of 567 fetch-failed gap rows, **524 resolve**
and 43 genuinely do not (`probe/genuinely-unresolvable.json`).

Two rules follow:

  1. **Run one browser pass at a time.** Concurrency here does not buy speed, it
     manufactures false negatives that look like data.
  2. **Never classify a network error as a fact about the site** without
     re-testing it on a quiet connection.

`scripts/retry-supervisor.sh` runs the 524 in 11 chunks of 50, same hard-timeout
shape as the no-platform supervisor, feed sliced up front by `probe/split-feed.mjs`.

### Retry result: access was the problem, prices are the problem, 0 menus

All 524 DNS-verified rows retried, 11 chunks, no chunk hit the cap.

    357  needs-browser   opened, rendered, no priced menu
    114  fetch-failed    still failed even single-threaded
     24  gated
     10  gate-personal
      8  filed
      7  screened-out
      4  wrong-branch

**410 of 524 (78%) reached the site this time** - rows that had all previously
been written off as fetch-failed. The resolver diagnosis was correct and the fix
worked. The remaining 114 are slow or genuinely unreliable hosts, not resolver
noise.

**Menus loaded: 0.** All 8 filed rows were quarantined as partial captures.

This is the cleanest possible answer to the question the whole pass was asking.
It is not an access problem. We now reach these sites and they do not publish
prices. Every free lever on the website-having gap is spent:

  - never-browsed class: 815 rows -> 15 filed (1.8%)
  - fetch-failed retry:  524 rows ->  8 filed, 0 loaded

Listed coverage 5,769 / 9,043 = 63.8%, unmoved by the retry.

**Recommendation on the $50 of Serper credits: don't.** Serper buys websites.
This pass proves a website is not what is missing.

### Open decision for Calvin: the 8-dish floor is holding real menus

Seven rows were quarantined as "likely a partial capture" purely for being small:

    Burgeon Beer Company  4      Noodles        5
    Camp Coffee Company   5      Merenda        7
    Mama Made Thai        5      Sushi Heights  7
    Veggyjess             6

A coffee shop with five drinks has a complete menu, not a truncated one. The
floor (`MIN_DISHES`, default 5 in browser-menus, 8 in the screener) was written
to catch scrapes that stopped early, and it does - but at the small end it
cannot tell "stopped early" from "that is the whole menu". Not changed: lowering
it puts thin menus on live restaurant pages, which is Calvin's call, not mine.

## 2026-09-07 - the supervisors were killing Calvin's browser, not Playwright's

`taskkill /F /IM chrome.exe` in both supervisors did exactly the opposite of
what it was written to do.

  - It killed **Calvin's Chrome** - tabs, sessions, and the Claude-in-Chrome
    extension - 29 times across the two runs on 2026-09-06.
  - It **never killed a single Playwright process.** Headless Playwright runs
    `chrome-headless-shell.exe` out of `%LOCALAPPDATA%\ms-playwright`, not
    `chrome.exe`. Proof: after both runs "cleaned up", 6 ms-playwright
    processes were still alive on the box and 0 of Calvin's Chrome were.

`scripts/kill-playwright.ps1` replaces it and filters on the executable PATH
(`*ms-playwright*`) rather than the image name, which is what makes it safe -
every Playwright browser lives under that directory and no user-installed
Chrome does, while a `--headed` run's real `chrome.exe` still matches because
it launches from there too. Verified: matched and killed the 6 orphans, left
user Chrome untouched, exit 0. Both supervisors now call it.

**Rule: never kill by image name on this box.** Match the path.

### Not a bug: the busyness labels are dead data

651 listed rows carry `status_label` wait copy ("Filling up", "No wait", "Busy
right now", "Seated quickly") and I first reported this as PRODUCT.md's retired
wait-time copy leaking onto the live site. It is not. `rowToRestaurant`
(src/lib/db.ts:2668) maps it onto the full `Restaurant` type and **no component
renders it** - nothing under src/app, src/components or src/lib reads
`statusLabel`. Visitors do not see it.

Worth removing eventually, because a field sitting on the type is an invitation
to render it again, but it is cruft and not a live violation. Not touched.

### Cannonball is fine (asked 2026-09-07)

Row 167, Mission Beach, 4,943 reviews, 30 priced dishes, listed, no hold.
`/restaurant/167` returns 200 with dishes rendering, it is in `/api/restaurants`
and matches `/?q=cannonball`. Nothing was wrong with it.

### Discover search: fuzzy matching and ranking shipped (2026-09-07)

Calvin's report — a restaurant with one letter wrong returned nothing while
"a bunch of random shit came up" — is fixed. `?q=kairoa brewng` now returns
Kairoa Brewing Company first; it used to return nothing.

The plan and the measurements are in **`probe/SEARCH-PLAN.md`**; read its
`## Status` section first. Step 1 of 7 is done. What is left, in order: dish
precision (B4), the `?dish=` dimension (A2), the suggest endpoint (A3), the
typeahead dropdown with spell-corrected rows (A4/A5), narrowing `promote()`
(A6), SQL parity in `searchRestaurants` (B5).

Two probes, both read-only:

```bash
npx tsx --env-file=.env.local probe/search-check.mts "kairoa brewng"
npx tsx --env-file=.env.local probe/typo-calibrate.mts --sample=600
```

The second is the one that decides `SIMILAR_ENOUGH` in `src/lib/textMatch.ts`
(0.65). **Re-run it rather than nudging that number by feel** — the sweep says
accuracy is flat below 0.65 and falls above it, and the corpus is 9,043 listed
names, not the 8,935 this file used to say.

### Two SDSU pitch leads: Del Cerro Pizza loaded, The Other Side held (2026-09-07)

Calvin asked whether seven restaurants on a partnership shortlist were on the
site with menus. All seven are listed with coordinates and no hold; five
already had menus. The two gaps were **Del Cerro Pizza (5702)** and **The Other
Side Bar and Grill (10001)**, neither of which had ever been attempted — no
`menu_lookups` row at all.

**Del Cerro Pizza: 50 dishes loaded.** The router filed it `needs-browser`
("Slice storefront with neither `__SLICE_REDUX_STATE__`, a menuRequest blob nor
JSON-LD"). That verdict is wrong, and the bug is worth fixing before the next
wave. A plain `curl` of the Slice storefront returns `__SLICE_REDUX_STATE__`
AND a 17.5KB schema.org block — but the block's top-level node is a
`Restaurant`, and the whole menu hangs off it as
`hasMenu.hasMenuSection[].hasMenuItem[].offers.price`. The Slice branch
(`scripts/route-menus.mjs:1873`) does
`nodes.find(n => typeOf(n).includes("Menu"))`, and `jsonLdNodes` flattens
`@graph` and arrays but never descends into `hasMenu` — so a Restaurant node
wrapping a Menu is invisible to it and the branch falls through to the
`needs-browser` return two lines later. Following `hasMenu` (here and at the
other four `jsonLdNodes` call sites) should hand back every Slice row in the
backlog carrying that exact note, for free. Prices are whole dollars on 36 of
50 items, so there is no delivery uplift.

**The Other Side is held, not filed.** `probe/held-otherside-10001.json`
carries 9 priced cocktails photographed from the printed in-house board (the
best kind of source there is), but it is **drinks only** for a wings-and-tacos
bar, and filing it would write `status = 'found'` and retire the food menu from
the queue permanently. Load it only alongside food.

No food menu is published anywhere online: no website (Google offers "Add
website"), absent from DoorDash / UberEats / Grubhub search, Yelp serves
nothing to curl, and Google's "Menu & highlights" panel holds a single promo
item. It shares 6690 Mission Gorge Rd with **Emiliano's Mexican Restaurant and
Cantina (7386, 172 dishes)** under the same ownership — the bar runs its own
kitchen, so do not copy Emiliano's menu across. A phone photo of the food board
is all this one needs.

**Serper is out of credits** (`400 {"message":"Not enough credits"}`). That
kills the router's no-website fallback and every agent's search tool, so the
next wave will be materially weaker until Calvin tops it up.

## Address as location (2026-09-22) — built, NOT committed
Discover "Use an address" box (web: DiscoverFilters; phone: PhoneFilterSheet).
Address -> POST /api/geocode (Nominatim proxy, signed-in, 20/h) -> saved in
localStorage `platemaps:saved-location`, device-only by Calvin's choice;
overrides GPS in useNearby (src/lib/nearby.ts) until cleared. tsc + eslint
clean; geocode verified server-side. Not yet clicked through signed-in in a
browser (Chrome extension was disconnected). Files: src/app/api/geocode/route.ts,
src/lib/nearby.ts, DiscoverFilters.tsx, DiscoverBrowser.tsx, PhoneFilterSheet.tsx.
