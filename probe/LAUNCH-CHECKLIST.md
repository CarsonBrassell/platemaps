# Launch checklist: the dashboard steps (Calvin's side)

Written 2026-09-14. Everything here needs Calvin's login, card, or a click.
The code-side work is in PERF-PLAN.md. Tick items here as they land.

Only two database variables are read by the app: DATABASE_URL and
BLOB_READ_WRITE_TOKEN (checked by grep over src/ and scripts/). Every
POSTGRES_*, PG* and DATABASE_URL_UNPOOLED entry is unused and can go.

## Vercel

- [ ] V0 Plan -> Pro. Team page > Settings > Billing > Upgrade. Pro unlocks
      Firewall rate limits, Skew Protection, Spend Management, higher function
      concurrency. Without it items V4, V5, V6 are greyed out.
- [ ] V1 Function region -> iad1. Project > Settings > Functions > Function
      Region > "Washington, D.C., USA (East) - iad1". Save, then Deployments >
      latest > Redeploy. Why: Neon is in AWS us-east-1; any other region adds
      30-80 ms to every one of the ~11 queries a feed page makes.
- [ ] V2 Fluid Compute -> on. Same Settings > Functions page, toggle "Fluid
      Compute". Redeploy. Why: one instance handles many requests at once and
      stays warm, so the in-memory corpus cache is reused and cold starts drop.
- [ ] V3 Speed Insights + Web Analytics. Project > "Speed Insights" tab >
      Enable; Project > "Analytics" tab > Enable. Then tell me; I add the two
      packages to layout.tsx. Why: real users' load times per page, per device.
- [ ] V4 Firewall rate limits. Project > Firewall > Configure > "+ New Rule".
      Name "writes"; condition Request Path "starts with" /api/posts; action
      Rate Limit, 30 requests per 60 s keyed by IP, then Deny. Repeat (or add
      OR conditions) for /api/blob/upload, /api/auth, /api/comments,
      /api/friends. Click Publish. Why: one script against a write route is
      enough to pin the database; this stops it before it reaches a function.
- [ ] V5 Skew Protection -> on. Project > Settings > Advanced > Skew
      Protection. Why: after a deploy, a phone that still has the old page
      open otherwise requests chunk files that no longer exist and 404s.
- [ ] V6 Spend Management. Team > Settings > Billing > Spend Management >
      set a monthly dollar cap and the email to alert; choose "pause
      production deployments" or just "notify". Why: a traffic spike or a
      runaway image-optimisation bill becomes an email, not a surprise.
- [ ] V7 Environment variables. Project > Settings > Environment Variables.
      Open DATABASE_URL (Production): the host must contain "-pooler". Delete
      every POSTGRES_*, PG* and DATABASE_URL_UNPOOLED entry (unused; some hold
      the pre-rotation password). Do the same in the local .env.local.
- [ ] V8 Usage watch. Project > Usage > Image Optimization > "Source
      images". Note the number weekly for the first month. If it climbs toward
      the plan's included amount, tell me and I switch restaurant photos to
      unoptimized.

## Neon

- [ ] N0 Plan. If on Free, scale-to-zero cannot be turned off and history is
      short: upgrade to Launch (Billing > Change plan).
- [ ] N1 Compute. Project > Branches > production > Compute > Edit.
      "Scale to zero": off (Launch+), or the longest suspend delay allowed.
      Autoscaling: min 0.25-0.5 CU, max 2 CU to start. Save. Why: a suspended
      compute costs the first visitor ~0.5-1 s; the max CU is what absorbs a
      spike without a restart.
- [ ] N2 pg_stat_statements. Project > SQL Editor, production branch, run:
      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
      Why: it records every query's count and total time so slow ones become
      a list I can read instead of a guess.
- [ ] N3 History retention. Project > Settings > "Restore" / history
      retention: set to the plan maximum (7 days on Launch). Why: this is the
      database backup. Point-in-time restore is the only undo for a bad
      migration or a bulk SQL mistake.
- [ ] N4 Data transfer. Billing > Usage > Data transfer. Read the number now
      and after Phase A. Why: every function instance re-reads 3.5 MB per
      minute; ten instances is ~50 GB/day, which is why S1 must land before
      any traffic push.
- [ ] N5 Branch "scale-test". Branches > Create branch > from production,
      include data. Or authorize the Neon connector and I create it. Why: I
      seed it with 100k fake posts and load-test there, never on production.

## Connectors for me

- [ ] K1 Vercel: claude.ai > Settings > Connectors > Vercel > Connect,
      approve the OAuth screen. Already installed, never authorized.
- [ ] K2 Neon: same page > Browse connectors > Neon > Add > Connect. Gives me
      query tuning, branches, slow-query reads.
- [ ] K3 Sentry: after M1 below, same page > Sentry > Add > Connect.

## Map tiles

- [ ] T1 The map style points at tiles.openfreemap.org, a free volunteer
      server with no uptime promise. Two options; pick one:
      (a) MapTiler fallback: maptiler.com > sign up (free 100k tile loads /
      month) > API keys > copy key > add MAPTILER_KEY in Vercel env vars. I
      make the style URL switchable by env var so a swap is one change.
      (b) Self-host: I download a San Diego PMTiles extract and serve it from
      Blob; nothing needed from you unless Blob egress cost says move it to
      Cloudflare R2 (then: cloudflare.com > R2 > create bucket + API token).
      Recommendation: (a) now, (b) when there is a second city.

## Monitoring accounts

- [ ] M1 Sentry: sentry.io > sign up (free Developer plan) > Create project
      > platform Next.js > copy the DSN. Add it in Vercel env vars as
      SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN, then tell me and I wire the SDK.
      Why: server and client errors with stack traces and the release they
      came from, instead of "it broke on my phone".
- [ ] M2 Uptime: betterstack.com (free: 10 monitors) > Uptime > Create
      monitor > URL https://<your domain>/ , check every 3 min, expect 200.
      Repeat for /m and /api/posts/discover. Add your phone under
      On-call/Escalation so a down alert calls or texts you.

## Money and blast radius

- [ ] B1 Blob backup decision. Vercel Blob keeps no versions: a bad delete is
      gone. Either write "accepted" here, or create a Cloudflare account >
      R2 > bucket "platemaps-photos-backup" + an API token with write access,
      give me the token via Vercel env vars, and I write the nightly copy
      cron.
- [ ] B2 Incident page. I draft probe/RUNBOOK-INCIDENT.md (Attack Challenge
      Mode, Neon CU bump, deploy rollback). You add the phone numbers and the
      order you want to be woken in.
