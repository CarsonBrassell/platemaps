# Menu sweep 2026-10-25

- Live site: platemaps.com /, /feed, /m and /restaurant/* all return 200. **www.platemaps.com fails TLS** (cert lacks www: SEC_E_WRONG_PRINCIPAL); CNAME is cname.vercel-dns.com, so www is likely not added as a domain on the Vercel project. Vercel MCP returned 403 for the team, so this was not confirmed in the dashboard.
- Freshness (fresh-parallel.mjs, 12 workers): 6,205 http sources. 355 changed vs fingerprint, 1,053 unchanged, 119 newly baselined, 4,678 unreadable to a bare fetch. List: changed.json.
- Price drift (menu-price-drift.mjs): 1,197 judged, current 1,059 / drifting 81 / stale 57 (Sept 13: 60 / 36). probe/spot-check/price-drift.json.
- Re-extract queue (union, deduped): reextract-queue.json. Entries flagged by both checks are listed first.
- Audit (menus-audit.mjs, audit.log): 8,321 menus; 13 with no prices, 286 partly priceless, 210 under 8 dishes, 136 possible delivery markup.
- Junk dish rows on listed restaurants (junk-count.mjs): OUT OF STOCK 305 (49 restaurants), Close 211 (Mi Asador Vista), Card Fee 24 (Kotija Jr Carlsbad), Unavailable 14 (Bakehouse by CoCo). "Regular" ×112 left alone; it may be a real size variant.
- Writes made: menu_lookups.checked_at on every source, plus source_fingerprint on the 119 new baselines. Dishes were not changed.

## Re-extract outcome (rx-01..43, done 2026-10-25)
- 335 menus reloaded and DB-verified N/N per batch; fingerprints rebaselined. The rest were skipped (old menu kept): partial captures, 403s, unpairable prices.
- Batch 42 deliberately NOT loaded: all 9 are Shopify retail catalogs (dresses, jewelry, Pokemon cards, candles). The HELD menus for those ids are the same retail catalogs (e.g. Morning Lavender 895 rows of clothing). Needs a hold/rebuild decision.
- 10213 Milk & Honey, 11123 Adam Ice Cream not loaded (variant explosion); raw in menus/wip/rx-result-35.orig.json.
- Every skip, identity suspect and hold candidate: followups.txt.
- Junk delete still pending (classifier-blocked): `node --env-file=.env.local probe/sweep-2026-10-25/junk-delete.mjs`, then junk-count.mjs.
