# PlateMaps security sweep

Repo: C:\Users\Calvin  Lensink\Documents\platemaps (cd there for every command).
Live site: https://platemaps.com — Next.js on Vercel, Neon Postgres, Vercel Blob.
Read probe/RESUME.md first. Any subagents you spawn must be Sonnet.

Goal: confirm nothing is exposed that shouldn't be — no API keys, no secrets,
no private data, no unauthenticated writes, no unmetered abuse paths.

RULES
- NEVER print a secret value. Show only the variable NAME and the first 4
  characters. A stray `cat .env.local` in a past session leaked the DB
  password once; do not repeat it.
- Phase 1 is read-only. Do not edit code, do not commit, do not touch the
  database beyond `npm run db:stats`. Stop at the end of Phase 1 and hand me
  the report. I will approve fixes before Phase 2 starts.
- Write the report to probe/SECURITY-FINDINGS.md as you go, ordered by
  severity: CRITICAL / HIGH / MEDIUM / LOW / OK. Each finding: what, where
  (file:line), how someone would abuse it, the fix, and whether the fix is
  code (you) or a dashboard action (me — Vercel, Neon, GitHub).

PHASE 1 — AUDIT

1. Secrets in git history
   - Run gitleaks if available (`npx gitleaks detect --source . -v`); if not,
     `git log -p --all | grep -nE "(sk_|AIza|key|token|password|secret)"`
     and grep every commit for the NAMES of the vars in .env.local.
   - Confirm .env* was ignored from the FIRST commit, not added later.
   - The GitHub repo (CarsonBrassell/platemaps) is PUBLIC. Report every file
     that shouldn't be readable by strangers: data/, menus/, osm/, scripts/
     with hardcoded keys, probe/ notes with hostnames or emails, the .xlsx
     rating model, stray HTML/PNG at the repo root.

2. Secrets reaching the browser
   - grep src/ for NEXT_PUBLIC_ and VITE_ — list each and what it exposes.
   - Build (`npm run build`) and grep .next/static for every env var NAME
     and value prefix from .env.local. Anything found = CRITICAL.
   - Check the iOS/Capacitor bundle (ios/, capacitor.config.ts) for baked-in
     keys or a non-HTTPS server URL.

3. Environment scope
   - List every var in .env.local and classify: needed by the deployed app
     at runtime / needed only by local scripts (SERPER, YELP, GOOGLE_PLACES,
     FIRECRAWL are scripts-only) / unknown. Script-only keys should NOT be
     set in Vercel — flag for me to check the Vercel dashboard.
   - Confirm the Blob store is intentionally public and that URLs are
     UUID-unguessable (src/app/api/blob/upload/route.ts).

4. Every API route (find src/app/api -name route.ts)
   For each route and method, record: auth required? owner check on the
   resource (can user A edit/delete user B's post, comment, avatar, friend
   request)? input validated (length caps, type checks)? rate limited?
   Known so far: only auth/login and auth/forgot have throttles. Signup,
   posts, comments, votes, blob/upload have none — confirm and rate the
   abuse cost (blob storage, Neon writes, email sends).

5. Auth flow specifics
   - Email enumeration: do signup/forgot/login respond differently for an
     existing vs unknown email (status, message, timing)?
   - Password change / reset: are all other sessions invalidated?
   - Reset & verify tokens: expiry, single-use, hashed at rest (lib/tokens.ts).
   - Session cookie: httpOnly, secure, sameSite, max-age (lib/session.ts).
   - Open redirect: any `?next=` / `?redirect=` param followed unchecked?

6. Data exposure in responses
   - grep lib/db.ts and every route for `email`, `password_hash`,
     `token` in SELECTs that feed public or other-user responses.
   - users/search, leaderboard, friends/list, posts/discover: what fields
     leave the server about OTHER users? Respect hide_from_leaderboard,
     discoverable_by_username, share_photos_publicly, blocks.
   - Error responses: do any return stack traces, SQL text, or file paths?

7. Headers and transport
   - curl -sI https://platemaps.com and report: HSTS, CSP,
     X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CORS.
   - Check next.config.ts for a headers() block. Missing CSP/HSTS = MEDIUM.

8. Dependencies
   - `npm audit --omit=dev` — list HIGH/CRITICAL with the package and
     whether it's reachable from server code.

9. Public folder and routes
   - List public/ and every page route; confirm nothing debug-only or
     internal (drafts, probe, admin) is reachable without auth.
   - Check robots.txt / sitemap / manifest for user pages that shouldn't
     be indexed.

10. Content moderation
   - lib/moderation.ts is text-only. Photos are public with no image
     screening. Report as a finding with options (Vercel/OpenAI/AWS
     Rekognition moderation endpoint, or manual report queue via
     api/reports) — do not implement.

Finish Phase 1 with a one-screen summary at the top of
probe/SECURITY-FINDINGS.md: counts by severity, the top 5 things to fix,
and the dashboard actions I must do myself (key rotations, Vercel env
cleanup, repo visibility). Then STOP and tell me.

PHASE 2 — FIXES (only after I say go)
- Fix in severity order. One commit per finding, message referencing the
  finding number. Every fix ships to phone AND web.
- Rate limits: reuse the pattern in lib/loginThrottle.ts; apply to signup,
  posts, comments, votes, blob/upload, account/email/send.
- Security headers in next.config.ts.
- Any leaked key: tell me to rotate it in the provider dashboard; do not
  attempt rotation yourself. After I rotate, verify the old value is gone
  from git history and the build.
- Verify each fix against the dev server (npm run dev) with curl, and
  update probe/RESUME.md with what changed.
