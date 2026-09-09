# Coverage gap estimate (2026-09-08)

Prompted by Handel's SDSU (5824 Montezuma Rd Ste 130) being absent. Scripts:
probe/scratch/deh-gap3.mjs, deh-gap4.mjs (read-only). Serper had 0 credits,
so the Google side is bounded, not measured.

## Permit side (county DEH feed, active Restaurant/Low-Risk permits)

- 10,057 active permits. ~9,444 match a row by record id, resolved file,
  or street-number + name. 613 do not.
- Of the 613: 94 are fast-food-tier chains (held on purpose), 281 are
  hotels/venues/institutional/markets, 238 look independent.
- Of the 238, a name search finds 158 somewhere in the DB (address drift).
  **80 have no row at all** -> probe/deh-unmatched-independent.json.
  60 of the 80 are permits from before 2020 (many probably stale or
  renamed); ~20 are 2020+ and worth loading, e.g. Swami's Cafe North Park
  (3794 30th St), Hive Sushi (1065 14th St), Slater's 50/50 Liberty
  Station, Baja Rick's Cantina, Hasta Manana Cantina, Huckleberry's
  Escondido, Mr Charlie's Hillcrest, Calicos + Kendall's (Borrego).

## Google-only side (the Handel's class: in Google, not in DEH by address, not in OSM)

- 34% of gmap-sourced listed rows and 46% of sweep-sourced have no permit at
  their street number, so the permit feed is not a safety net for this class.
- Discovery grid: 1,051 cells; 156 returned a full page of 20+ "restaurants"
  (cut off), 23 got exactly 20 with no page 2. Handel's SDSU cell
  (32.77,-117.07) is one of the cut-off cells.
- Category sweeps: bar 1,111 cells, cafe 1,117, bakery only 66, and no
  ice cream / dessert / boba / juice sweep at all. Dessert shops rank low
  under a "restaurants" query, so they are the systematic hole.
- Chain spot checks (official list vs DB): Handel's 13/14, Salt & Straw
  3/3, Crumbl 11 listed vs 13 DEH permits, Sharetea 2 listed vs 6 DEH,
  85C 1 listed vs 8 DEH permits (rows 8278/8282 held as duplicates).

## Rough total

Likely 100-300 real, open, public restaurants/dessert shops missing county-
wide, concentrated in dense cells and dessert/boba categories. Not
thousands: the permit feed covers ~94% of what it knows, and OSM+Yelp+Google
cover most of the rest.

## Cheapest fixes, in order

1. Top up Serper; run discover-serper `--fetch --query "ice cream"` and
   `--query "boba"` over the 156 saturated cells (~160-320 credits each).
2. Load the ~20 recent no-row permits from probe/deh-unmatched-independent.json.
3. Chain sitemap audits are free (one WebFetch each): 85C, Sharetea, Crumbl.
