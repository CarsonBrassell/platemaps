# Brief: Serper mode for presence (2026-09-04)

Repo: this directory. Read `probe/CHEAPER.md` section 2a and the header
comments of `scripts/resolve-places.mjs`, `scripts/enrich-places.mjs`,
`scripts/import-deh.mjs`, `scripts/find-websites.mjs` before editing.
Report in under 300 words. Do not commit. Do not run anything that calls
Serper, Google or Yelp; Calvin runs those. Never print `.env.local` values.
Run `npx tsc --noEmit` before stopping; leave the tree compiling.

## Task A: `--via serper` in resolve-places.mjs

Goal: the same output as the Google path (`data/deh-resolved.json` entries
with `place{id, displayName, formattedAddress, businessStatus}` plus status
and why) but sourced from Serper's `/maps` endpoint (`https://google.serper.dev/maps`,
POST, header `X-API-KEY`, body `{ q, ll? , gl:"us", hl:"en" }`), the key
from `SERPER_API_KEY` exactly as `find-websites.mjs` reads it.

Rules:
- `--max-calls` still defaults to 0 and is a hard stop, ledger to
  `data/serper-calls.jsonl` (one line per call: query, credits, result count,
  timestamp), never re-query a sourceKey already in deh-resolved.json.
- Query = permit name + street address + ", San Diego, CA" (or the permit's
  city). Reuse the existing address/name matching logic to pick the winning
  result and classify duplicate / unmatched / closed; do not fork it.
- Map fields defensively: `placeId` (also accept `place_id`), `cid`,
  `title`, `address`, `rating`, `ratingCount`, `website`, `phoneNumber`,
  `type`/`category`, `thumbnailUrl`, `latitude`/`longitude`. Store the extra
  fields on the resolved entry under `serper{}` so import-deh can carry
  rating, review_count, website, phone and photo url into the row.
- `--probe`: make exactly ONE call for the first unresolved queue entry, print
  the top-level keys of the response and of the first result (values
  truncated to 40 chars, key masked), write nothing to deh-resolved.json,
  exit. This is how Calvin confirms `placeId` exists before buying credits.
- If a result has no place id at all, classify as `unmatched-no-id` and say
  so in the report; do not invent one from cid.

## Task B: carry Serper fields through import-deh.mjs

When a resolved entry has `serper{}`, `import-deh.mjs --apply` writes
rating, review_count, website (and phone if the column exists) onto the new
row so `enrich-places.mjs` is only needed for the photo. Check the column
names against `scripts/migrate.mjs` and the existing insert; do not add
columns.

## Task C: `--mask pro` in enrich-places.mjs

A mode that requests only `id,businessStatus,photos` (Pro SKU, $17/1k,
5,000 free) for rows that already have a rating, so the photo reference
never touches Enterprise. Ledger SKU label `PlaceDetailsPro`. Default mask
unchanged. Same `--max-calls` discipline.

Deliverable: the three diffs described above, a `--dry` run of each that
makes no network call, and a report listing the exact commands for Calvin:
probe, then a 50-row sample, then the full run.
