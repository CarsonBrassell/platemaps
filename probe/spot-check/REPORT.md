# 50-restaurant spot check — 2026-09-13

Hand-picked 50 well-known independent San Diego restaurants across neighborhoods and
cuisines, resolved each to its DB row, dumped the row + dishes (data/<id>.json), and had
Sonnet agents verify each against the real menu online (results/<id>.json, tallied in
all-results.json). Read-only; nothing written to the DB.

## Headline
- 49/50 have a row. The miss (Kous Kous, Hillcrest) closed — Rocko's is at that address
  now — so the absence is correct.
- 46/49 are on the site. 3 are wrongly invisible: Supannee House of Thai (179<->4408
  circular duplicate), the original Pho Ca Dao on El Cajon Blvd (257<->4819 circular),
  Mama's Bakery (held "permit-only", but open since 1988; moved to 2141 El Cajon Blvd in 2025).
- Menus (of the 50 checked rows): accurate 29 · mostly 10 · stale 5 · buggy 2 · none 3 ·
  unverifiable 1. So ~58% fully right, ~78% usable, ~20% would mislead a diner.
- Data: accurate 29 · minor 17 · wrong 4.

## Fixed 2026-09-13 (after the check)
- 24 circular duplicate pairs broken; 24 restaurants (Supannee 4408, Pho Ca Dao 4819, ...)
  listed again with hours/price band merged from the losing row. Writers guarded.
- 2,387 duplicate dish rows deleted across 195 restaurants (same name + section; kept
  the priced/cheapest row). Same-name-different-description pairs left as real items.
- 121 neighborhoods corrected to the nearest region point.
- 32 "Bars" rows with full food menus relabelled by keyword (Tahona 65 -> Mexican).
  Kettner Exchange 78 still Bars: needs the LLM stage (no ANTHROPIC_API_KEY on disk).
- 34 bogus chain-shared lookups: 12 now point at their own real source; 22 loops
  (Las Cuatro Milpas 205 among them) marked low-confidence with no source.
- 2611 Carnitas Snack Shack North Park held closed; 609 Addison held as duplicate of 3171.
- Deferred to Serper: Mama's Bakery 8162, Bronx Pizza 24, the 304 permit-only holds,
  360 listed rows without an address. Stale/markup menus (552, 408, 2318, 144, 1561,
  136, 23, 138, 8) wait for the corpus-wide price-drift result (price-drift.json).

## Corpus-wide bugs found on the way
- 24 circular "duplicate of" pairs (48 rows) — 24 real restaurants invisible. List in
  dangling-duplicates.json (`target is duplicate` bucket). Fix: pick the row with more
  dishes/hours, clear its hold, keep the other as the duplicate.
- 360 listed rows have no address; 4,887 listed rows have no hours.

## Per-row problems worth fixing
Stale prices: Punjabi Tandoor 552 (~decade old, curries $4.95), Ironside 408 (pre-March-2026
relaunch), Herb & Wood 2318, Kono's 144, Extraordinary Desserts 1561 (source_url is a
cash.app link), Crack Shack 136, Hash House 23 (DoorDash markup +30-40%).
Buggy: Juniper & Ivy 138 (dupes, "Take Cheese Ravioli", 3 NY Strip variants — menutoeat
source), PB Fish Shop 8 ("Sliver Lobster", "River Halibut", flat price for 4-tier items).
Empty: Bronx Pizza 24 (menu is on allmenus.com), Carnitas' Snack Shack North Park 2611
(closed ~2019, still listed with 0 dishes), Addison 609 (no address; duplicate of 3171).
Labels: Kettner Exchange 78 and Tahona 65 cuisine "Bars"; Barbarella 420 "Breakfast &
Brunch"; neighborhoods wrong on Phil's 164 (Liberty Station), Pho Ca Dao 6761 (Normal
Heights for Fenton Pkwy), Kono's 144 (Mission Beach), Carnitas' 87 (Little Italy).
Chain-shared misuse: Las Cuatro Milpas 205 (one location, labeled chain-shared), Taco
Stand La Jolla 2932 (prices copied from Encinitas, 3/10 drift).
