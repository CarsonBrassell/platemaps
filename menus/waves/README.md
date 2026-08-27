# Pre-cut wave queues for cloud menu extraction

Regenerated 2026-08-27 from the live queue: **1,920 restaurants**, 40 waves of
4 groups of 12, ordered by review count (most-reviewed first).

## Why this directory exists at all

A cloud session has no access to Calvin's machine, and `.env.local` is
gitignored, so a cloud agent has **no `DATABASE_URL` and cannot reach Neon**.
Every script in `scripts/` dies on its first line there.

That rules out the normal wave protocol in the cloud — but only the database
half of it. Extraction itself needs nothing but the open web. So the work is
split:

- **Cloud** does the slow, expensive half: find menus, write `result-N.json`,
  commit. No database, no scripts, no credentials.
- **Local** does the database half: screen, load, propagate. Runs when Calvin's
  machine is on.

This is why a cloud agent must never try to run `load-menus.mjs`,
`menus-todo.mjs`, `share-chain-menus.mjs` or `publish-check.mjs`. They will fail,
and the failure is expected rather than a bug to be worked around.

## Claiming a wave

**A wave is unclaimed if it contains no `result-*.json` file.**

Take the lowest-numbered unclaimed wave. Write results back into that same
directory as `result-1.json` … `result-4.json`, alongside the group files.

Commit after every restaurant. A cloud run can be cut off mid-wave at any time,
and on 2026-08-27 two local waves were killed part-way — once by a session limit
and once by a machine restart. Everything that had been written to disk survived
and was loaded; everything held in memory was lost.

## What a result file looks like

```json
[
  {
    "restaurantId": "164",
    "name": "...",
    "sourceUrl": "https://...",
    "confidence": "high|medium|low",
    "crossCheckedAgainst": "https://... (tier 5 only)",
    "blocked": "short reason, only when stopped by something temporary",
    "dishes": [{ "name": "...", "description": "...", "price": "$12.00", "section": "..." }]
  }
]
```

Rules that matter, in full, are in `probe/FINDINGS.md`. The three that get
violated most:

- **Never write a dish without a real price.** A priceless name list is a
  not-found, not a menu.
- **`blocked` is not `not_found`.** A not-found is permanent and stops the
  restaurant ever being queued again; `blocked` re-queues it. Use `blocked` for
  a dead host, a closed-store price gate, or a page that stopped responding.
- **Section shape beats dish count.** A taqueria with no burritos is a partial
  capture however many rows it has.

## Branch

This branch (`menu-extraction-output`) exists so cloud runs have somewhere to
commit without touching `main`. Nothing here should ever be merged to `main` —
the results are consumed by loading them into the database locally, not by
merging them.
