# PlateMaps security sweep — Phase 1 findings

Date: 2026-09-08. Scope: probe/SECURITY-SWEEP-PROMPT.md, Phase 1 (read-only audit).
Nothing was edited, committed or written to the database. Live probes were plain GETs
against platemaps.com. No secret value appears in this file.

## One-screen summary

| Severity | Count |
|---|---|
| CRITICAL | 1 |
| HIGH | 2 |
| MEDIUM | 9 |
| LOW | 9 |
| OK (verified clean) | 14 |

**Top 5 to fix (Phase 2, in this order)**

1. **#1 Private photos leak through `GET /api/posts/[id]`.** Verified on the live site
   with no cookie: a post that Discover shows with `media: []` returns its blob URL when
   fetched by id. Code fix in `src/lib/db.ts` (`getPostById`, `getProfilePosts`).
2. **#2 Rotate the Neon password.** Two documented leaks (2026-08-11 into Yelp error
   bodies, and around 2026-09-05 into an agent transcript); no rotation recorded and
   `.env.local` predates the second leak. Dashboard action.
3. **#4 Rate limits** on signup, forgot (per-IP), blob/upload, posts, comments, votes,
   friend requests, reports and email re-send, reusing `src/lib/loginThrottle.ts`.
4. **#5 Security headers** (CSP, X-Content-Type-Options, X-Frame-Options,
   Referrer-Policy, Permissions-Policy, HSTS with includeSubDomains) in `next.config.ts`.
5. **#6/#7 Close the open image proxy and upgrade Next** so the four HIGH libvips CVEs
   in `sharp` stop being reachable by anyone with a URL.

**Dashboard actions only Calvin can do**

- **Neon:** rotate the `neondb_owner` password. Then update `DATABASE_URL` in Vercel
  and in `.env.local`. Tell me when done; I will re-verify history and the build.
- **Vercel > Settings > Environment Variables:** confirm `SERPER_API_KEY`,
  `YELP_API_KEY`, `GOOGLE_PLACES_API_KEY`, `FIRECRAWL_API_KEY` are NOT set there
  (scripts-only). Delete the 17 unused Neon-integration duplicates (`PG*`,
  `POSTGRES_*`, `NEON_*`, `DATABASE_URL_UNPOOLED`, `VITE_NEON_AUTH_URL`) if present.
- **GitHub:** decide whether `CarsonBrassell/platemaps` stays public. If it does,
  approve removing `probe/` (92 MB of scraped third-party pages, agent logs and
  incident notes) and the root strays from the tree, and whether to rewrite history
  (`git filter-repo` + force push, which invalidates every clone).
- **Decision:** whether the `menus/` corpus and `osm/san-diego.json` stay public, and
  add the ODbL attribution if `osm/` stays.

Detail files from the audit agents (not tracked): the scratchpad `routes.md`
(41 routes, 51 method rows), `auth-data.md`, `repo-env-public.md`.

---

## CRITICAL

### 1. `GET /api/posts/[id]` returns private photo URLs to anyone
- **Where:** `src/app/api/posts/[id]/route.ts:15-21` calls `getPostById` with a
  possibly-null viewer; `src/lib/db.ts:805-808` runs `POST_SELECT WHERE p.id = $1`, and
  `POST_SELECT` (`db.ts:735-744`) selects `p.media` raw. `hydratePosts` (`db.ts:698`)
  passes it through. Only `getDiscoverFeed` applies
  `CASE WHEN p.photos_public THEN p.media ELSE '[]'::jsonb` (`db.ts:936`).
- **Verified live:** `/api/posts/discover` (no cookie) listed 19 posts, 6 with
  `media: []`. Fetching those 6 by id with no cookie: one came back with
  `photosPublic: false` and a `blob.vercel-storage.com` URL in `media`. The other
  five simply had no photo. Post ids are public (Discover, `/feed?post=` share links,
  map bubbles), so the id is not a secret.
- **Abuse:** anyone, signed out, enumerates Discover, fetches each hidden post by id,
  and collects every photo users chose to share only with friends. The blob store is
  public by design; the URL is the privacy boundary (`blob/upload/route.ts:18-22`).
  Block status is also ignored here, so a blocked user still reads the post and its
  comments.
- **Fix (code):** gate media in `getPostById` on
  `photos_public OR viewer = author OR viewer is a mutual friend`, and return 404 when
  either side has blocked the other (`getBlockStatus` already exists). Better: move the
  gate into `POST_SELECT`/`hydratePosts` once so no future caller can forget it. Ships
  to web and phone automatically (same route).

## HIGH

### 2. Neon database password leaked twice; no rotation recorded
- **Where:** `setup.sh` comment (2026-08-11: `DATABASE_URL` pasted into the Yelp key
  prompt, sent to Yelp as a Bearer token in ~70 requests and echoed in error bodies);
  `probe/RESUME.md:697`, committed publicly in `e15c1cb` (2026-09-07): "w8-02 agent
  leaked DB creds into its transcript; consider rotating the Neon password".
- **Evidence:** grep for "rotat" across `probe/RESUME.md`, `STATE.md`, `RUNBOOK.md`
  finds no rotation entry. `.env.local` was last modified 2026-09-02, before the w8-02
  leak, so the password in use today is the one in that transcript.
- **Abuse:** anyone holding either transcript or Yelp's request logs has a full
  production connection string.
- **Fix (dashboard):** rotate in Neon, update Vercel env and `.env.local`.
  **Fix (code):** delete the incident line from the public note.

### 3. Same media gap in `getProfilePosts` and `getPosts`
- **Where:** `src/lib/db.ts:783-801` (`getProfilePosts`: the `OR p.id IN (post_saves)`
  clause returns other people's posts a user saved, with raw `media`);
  `db.ts:746-748` (`getPosts`, exported, currently unused by any route).
- **Abuse:** save a friend's post, unfriend them, and keep reading the photo they no
  longer share with you. Any future route wired to `getPosts` leaks everything.
- **Fix (code):** same central gate as #1.

## MEDIUM

### 4. No rate limits outside login and forgot
- **Where (confirmed by import grep; only `auth/login` imports `loginThrottle`):**
  - `src/app/api/auth/signup/route.ts` — none. Cost per call: a bcrypt hash, one
    `users` row, one `sessions` row.
  - `src/app/api/auth/forgot/route.ts` — 60 s per-account cooldown only, no per-IP
    counter. One caller can fan out reset emails across every known address.
  - `src/app/api/blob/upload/route.ts:25-70` — none. 2 MB JPEG per call, auth
    required, but a fresh self-registered account (see signup) can fill storage; nothing
    sweeps blobs never attached to a post.
  - `posts` POST, `posts/[id]/comments` POST, `posts/[id]/vote`, `comments/[id]/vote`,
    `posts/[id]/heart`, `posts/[id]/save`, `friends/request`, `reports`, `blocks` —
    none. Neon write amplification; reports also send a moderator email per new
    (post, reporter) pair.
  - `account/email` and `account/email/send` — 60 s per-account only.
- **Fix (code):** reuse the `login_attempts` table pattern from
  `src/lib/loginThrottle.ts` with per-IP and per-user windows; add a sweep for blobs
  older than N hours with no `posts.media`/`users.avatar_url` reference.

### 5. Security headers missing on the live site
- **Where:** `curl -sI https://platemaps.com` returns only
  `Strict-Transport-Security: max-age=63072000` (no `includeSubDomains`, no
  `preload`) and `X-Powered-By: Next.js`. No `Content-Security-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`,
  `Permissions-Policy`. `next.config.ts` has no `headers()` block and does not set
  `poweredByHeader: false`.
- **Abuse:** clickjacking of the signed-in app, MIME sniffing of uploaded content,
  referrer leakage of `/feed?post=` and reset-token URLs to third-party image hosts.
- **Fix (code):** `headers()` in `next.config.ts`. CSP needs care for MapLibre and
  blob/yelpcdn images; start with `frame-ancestors 'none'` and report-only for the rest.

### 6. `/_next/image` is an open image proxy
- **Where:** `next.config.ts` `images.remotePatterns` includes
  `{ protocol: "https", hostname: "**" }`.
- **Verified live:** `platemaps.com/_next/image?url=https://upload.wikimedia.org/...`
  returned `200 image/png` with no cookie. Non-image URLs return 400.
- **Abuse:** free image CDN on PlateMaps' metered Vercel image-optimization and egress;
  attacker-chosen images are decoded by `sharp`/libvips, which has four open HIGH CVEs
  (#7); limited SSRF (any https host, image responses only).
- **Fix (code):** copy restaurant photos into Blob at import time and allow only the
  blob host plus `*.fl.yelpcdn.com`; or render restaurant photos with a plain `<img>`
  (`unoptimized`) and delete the wildcard. The config comment already anticipates this.

### 7. Dependencies: 4 HIGH in `npm audit --omit=dev`
- `sharp <0.35.0` (libvips CVE-2026-33327, -33328, -35590, -35591) — **reachable at
  runtime** through `/_next/image` with attacker-supplied images (#6).
- `postcss <=8.5.22` (XSS in stringify, sourcemap path traversal) — build-time only.
- `nanoid <3.3.18` — transitive via postcss, build-time only, not imported by `src/`.
- **Fix (code):** upgrade `next` 16.2.12 → 16.3.4 (`npm audit fix --force`; outside the
  stated range, needs a build and smoke test), then `npm audit fix` for nanoid.

### 8. Session tokens stored in plaintext with no server-side expiry
- **Where:** `src/lib/db.ts:390-397` (`getSessionUserId`, `createSession`) store and
  match the raw token; `sessions` has no expiry column (`src/lib/session.ts:13-14`).
  Reset and verify tokens, by contrast, are SHA-256 hashed (`src/lib/tokens.ts:22`).
- **Abuse:** a DB dump, backup or verbose log hands over directly-usable cookies for
  every signed-in user, valid until that user signs out or changes password.
- **Fix (code):** store `hashToken(token)`, look up by hash; add `expires_at` and prune
  like `login_attempts` (`loginThrottle.ts:130-142`). Cookie max-age is 400 days, so
  pick a server-side window to match.

### 9. `/drafts/**` is live in production; no robots.txt or sitemap
- **Where:** `src/app/drafts/**/page.tsx` (6 routes). Verified
  `GET https://platemaps.com/drafts/onboarding` = 200. `GET /robots.txt` = 404 page.
  No `src/app/robots.ts`, no sitemap, no `src/middleware.ts`. `drafts/profile-grid`
  calls `/api/posts?mine=1` and renders the signed-in visitor's own posts.
- **Abuse:** internal design-review surfaces reachable by URL guess and indexable;
  nothing marks `/account`, `/m/account`, `/api` as no-index.
- **Fix (code):** `src/app/robots.ts` disallowing `/drafts`, `/account`, `/m/account`,
  `/api`; `notFound()` in the drafts layout when `NODE_ENV === "production"`.

### 10. Public profile pages ignore blocks
- **Where:** `src/app/u/[id]/page.tsx:27` and `src/app/m/u/[id]/page.tsx:41` call
  `getPublicProfile(id)` with no `getBlockStatus` check.
- **Abuse:** a blocked user still opens the blocker's profile card (name, avatar, rank,
  points, favorites). Thin exposure, but blocking is expected to hide it.
- **Fix (code):** check block status in both page components and render an
  unavailable state. Web and phone.

### 11. `probe/` (468 files, 92 MB) is in the public repo
- **Where:** `git ls-files probe` — raw scraped DoorDash/Sirved/Foursquare/restaurant
  HTML and JSON, ~330 agent `.log` files, one-off scripts, and operational notes
  including the incident line in #2. `menus/wip/` scraped HTML also carries third-party
  Google Maps browser keys belonging to restaurant sites (`menus/wip/tmp/cb_dd.html:622`,
  `menus/wip/tmp/liv1.html:30`, `menus/wip/scratch-n1358-06/eatleftys-home.html:76`) —
  not PlateMaps keys (verified: `GOOGLE_PLACES_API_KEY` prefix has 0 hits anywhere),
  but republished.
- **Abuse:** ToS/copyright exposure for scraped content; leaks methodology and incident
  history; a stranger reads "there was a live leak here".
- **Fix (dashboard + code):** make the repo private, or `.gitignore` `probe/`,
  `git rm -r --cached`, and rewrite history.

### 12. Product corpus is public: `menus/` and `osm/san-diego.json`
- **Where:** 3,528 tracked files under `menus/` (24,809 dishes per
  `menus/EXTRACTION-STATUS.md`); `osm/san-diego.json` is a 1.9 MB OpenStreetMap
  extract (ODbL). No ODbL attribution notice found in the repo.
- **Fix (decision + code):** keep public with attribution, or untrack like #11.

## LOW

### 13. `restaurant` / `restaurantId` on `POST /api/posts` have no length cap
- `src/app/api/posts/route.ts:200-201` only trims; `createPost` in `db.ts` inserts
  as-is. Siblings are capped (`dishName` 120, `price` 20, `locationLabel` 120).
  A megabyte string bloats the row and every feed payload. Fix: `.slice(0, 200)`.

### 14. Eleven routes return 500 on malformed JSON
- Verified live: `POST /api/auth/login` with body `{` → 500, empty body. Unguarded
  `req.json()` in `blocks` (25, 43), `friends` (36), `friends/request` (17),
  `friends/respond` (17), `posts` (79), `posts/[id]/comments` (17),
  `account/settings` (29), `auth/avatar` (18), `auth/login` (30), `auth/signup`,
  `comments/[id]/vote` (20). No stack trace or SQL is echoed (Next production 500).
  Fix: the `.catch(() => null)` → 400 pattern already used in `reports/route.ts:43`.

### 15. Login timing side-channel and unbounded password at login
- `src/app/api/auth/login/route.ts:46-48`: bcrypt runs only when the user exists, so
  latency distinguishes known emails (status and body are identical). Login also skips
  the 72-byte `checkPassword` cap that the password-setting routes apply. Fix: compare
  against a fixed dummy hash when the user is null; cap length before comparing.

### 16. `comments/[id]/vote` ignores block status
- `posts/[id]/comments/route.ts` returns 403 when either side blocked; the vote route
  has no equivalent. Fix: same `getBlockStatus` call.

### 17. `.env.local` and Vercel env hygiene
- 17 of 22 variables in `.env.local` are read by no tracked code (`PG*`, `POSTGRES_*`,
  `NEON_*`, `DATABASE_URL_UNPOOLED`, `VITE_NEON_AUTH_URL`, `VERCEL_OIDC_TOKEN`). Line 3
  is a pasted shell prompt containing the owner's machine hostname. Fix: prune locally;
  dashboard check listed in the summary. Also read by `src/` but not in `.env.local`
  (so set in Vercel only): `APP_URL`, `MAIL_FROM`, `MODERATION_EMAIL`, `RESEND_API_KEY`.

### 18. Repo strays
- Root: `x` (scraped menu JSON), `cbc_utc.html` (saved Olo ordering page),
  `r8-brunch.png`, `r8-menu1-p1.png`, `r8-menu1-p2.png` (menu photos);
  `scripts/discover-serper.mjs.bak`, `src/data/regions.ts.bak`; ~330 `.log` files under
  `menus/wip/`. Fix: `git rm`.

### 19. Owner's personal email hardcoded as seed data
- `scripts/simulate-activity.mjs:90`. Fix: placeholder like the other demo addresses.

### 20. Page-level auth is client-side only
- `/account`, `/account/settings`, `/friends`, `/m/*` gate with `useAuth()`; no
  `middleware.ts`. Safe today because every `/api` route checks `getCurrentUser()`
  itself (verified across all 41 routes). Optional: middleware on `/api/account/*` as a
  safety net for future routes.

### 21. Policy notes (informational)
- Minimum password length 6 (`src/lib/password.ts:34`, owner-accepted per its comment).
- No route requires a verified email; an unverified account can do everything.
- No reserved-username list (`admin`, `support`, `platemaps` are registrable).

## OK — verified clean

1. `.env*` ignored from the first commit (`f7cf82d`, 2026-07-29); no env file ever
   tracked (`git log --all -- '.env*'` is empty).
2. No secret value in git history, the tracked tree, `.next/static` or `.next/server`:
   tested the first 12 characters of all 22 values, plus 45 characters of
   `DATABASE_URL` and 60 of `VERCEL_OIDC_TOKEN`, against `git log -p --all`,
   `git ls-files` and the build. Only generic-prefix false positives (`postgresql:/`,
   the RS256 JWT header, `neondb_owner`). `PGPASSWORD` prefix: 0 hits everywhere.
   Gitleaks is not installed; these greps stand in for it.
3. No env var name appears in `.next/static`. The only public-prefixed variable in
   `src/` is `NEXT_PUBLIC_APP_URL` (`src/lib/mail.ts:34`, a fallback for the site
   URL). No `VITE_` in `src/`.
4. `SERPER_API_KEY`, `YELP_API_KEY`, `GOOGLE_PLACES_API_KEY`, `FIRECRAWL_API_KEY` are
   read only under `scripts/`, never `src/`.
5. iOS/Capacitor: `server.url` is `https://platemaps.com/m/feed`, `cleartext: false`,
   no `NSAllowsArbitraryLoads`, no provisioning profiles, `.p12` or
   `GoogleService-Info.plist` tracked.
6. Blob: upload proxied server-side with the server token (never sent to a client),
   auth required, `image/jpeg` only, 2 MB cap (`src/lib/photos.ts:52`), path
   `posts|avatars/<userId>/<randomUUID>.jpg`, no list endpoint, DELETE checks
   `/<userId>/` in the path. Store is intentionally public.
7. No SQL injection surface: every `sql.unsafe`/`sql.query` interpolates only
   compile-time constants or positional parameters (all 41 routes and `db.ts` read).
8. Ownership checks hold for post delete, friend accept/decline, hearts, blocks, blob
   delete, account export/activity (which take no user-id parameter by design).
9. Login and forgot are enumeration-safe on status and body; forgot returns `{ok:true}`
   under throttle and mail failure alike.
10. Password change (`account/password/route.ts:75`) and reset
    (`auth/reset/route.ts:87-88`) invalidate other sessions. Reset/verify tokens are
    256-bit, SHA-256 hashed at rest, single-use, expire in 1 h / 24 h.
11. Session cookie: `httpOnly`, `secure` in production, `sameSite: lax` (deliberate,
    WKWebView), logout deletes the server row. Lax blocks cross-site POST CSRF.
12. No open redirect: no `next=`, `redirect=`, `returnTo`, `callbackUrl` anywhere.
13. Discover, leaderboard and user search respect `photos_public`,
    `hide_from_leaderboard`, `discoverable_by_username` and blocks in SQL. No route
    returns `email`, `password_hash` or tokens about other users. No error response
    echoes stack traces, SQL or paths. No `Access-Control-Allow-Origin` on API
    responses. HTTP → HTTPS 308 works.
14. Points economy pays once per unique reason string; no farming path via vote flips.

## Section 10 — content moderation (options only, nothing implemented)

- `src/lib/moderation.ts` is text-only (`moderateText`, `moderateUsername`). No image
  screening anywhere in `src/` (grep for rekognition/nsfw/safesearch: 0 hits). Photos
  are never inspected; the store is public.
- Existing valve: `POST /api/reports` (auth, reason enum, self-report blocked, one row
  per post+reporter, emails `MODERATION_EMAIL`). Manual only; no auto-hide.
- Options:
  1. **Screen at upload** in `blob/upload/route.ts`: OpenAI omni-moderation (image +
     text, free), AWS Rekognition DetectModerationLabels (~$1 per 1,000), Google Vision
     SafeSearch (~$1.50 per 1,000), or Sightengine. Reject with 422 so nothing bad ever
     gets a public URL. Adds roughly 0.3-0.8 s per photo.
  2. **Screen after publish**: `waitUntil` or a Vercel cron job; set a hidden flag and
     notify the moderator.
  3. **Cheapest backstop**: auto-hide after N distinct reports, moderator unhide, and a
     rate limit on reports (#4).
- Recommendation: option 1 (JPEG only, one call per photo, volumes are small) plus
  option 3.
