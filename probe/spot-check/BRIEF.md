# Spot-check brief

You are verifying what the PlateMaps database says about a handful of real San Diego
restaurants against the real world. Read-only: you must NOT run any script that writes
to the database, NOT run scripts/fetch-google.mjs, fetch-yelp.mjs, enrich-google.mjs,
enrich-places.mjs or resolve-places.mjs (paid APIs), and NOT commit anything.

For each restaurant id you are given:

1. Read `probe/spot-check/data/<id>.json`. It has `restaurant` (name, address, city,
   neighborhood, lat, lng, website, hours as [{day 0=Monday, start "HHMM", end "HHMM"}],
   listed, hold_reason, cuisine, price_band, source_url = where the menu was extracted
   from, confidence) and `dishes` (name, price, section, description).
2. Find the restaurant's REAL current menu. Try, in order: `restaurant.website`, the
   `source_url`, then WebSearch "<name> <city> menu". Use WebFetch to read the menu page.
   Toast/DoorDash/Uber pages often block fetches; if the official site fails, try a
   second source (menu PDF, Instagram is useless, try a Google-cached ordering page or
   a third-party menu site) and say which source you used. Spend at most ~5 fetches per
   restaurant. If nothing is fetchable, say so — never invent a verdict.
3. Compare. Pick 8-10 of OUR dishes spread across sections and check each against the
   real menu: does the dish exist, is the price within $1, is the name spelled right.
   Also note whether the real menu has whole sections we are missing, whether our menu
   has items that are not food (theme colors, feature flags, "Delivery fee", gift
   cards), garbage names, duplicated items, prices like $0.00 or $52329, descriptions
   that are obviously from a different dish, or a menu that belongs to a different
   restaurant/location. Count how many of your checked dishes matched.
4. Check the data: is the address the real address (right street number, right city)?
   Is the neighborhood label sane for that address? Do the hours match the real hours
   for at least two days you can see? Is the cuisine label right? Is the place actually
   open (search "<name> closed" if unsure)? Are lat/lng in San Diego County?
5. Write `probe/spot-check/results/<id>.json`:

```json
{
  "id": "…", "name": "…",
  "on_site": true|false,              // restaurant.listed && !hold_reason
  "menu_verdict": "accurate" | "mostly" | "stale" | "wrong" | "buggy" | "none" | "unverifiable",
  "menu_checked": 10, "menu_matched": 8,
  "menu_notes": "one or two sentences: source used, what was off",
  "data_verdict": "accurate" | "minor" | "wrong",
  "data_notes": "address/hours/neighborhood/cuisine/closed findings",
  "issues": ["short bullet", "..."]    // concrete, fixable things; empty if none
}
```

Verdict meanings: accurate = ≥80% of checked dishes exist at the right price;
mostly = ≥60% or right dishes with drifted prices; stale = clearly an old menu;
wrong = menu is a different restaurant/location or mostly not on the real menu;
buggy = non-food rows, junk names, absurd prices, duplicated items; none = 0 dishes;
unverifiable = you could not reach any real menu.

Do NOT edit anything under `src/`, `scripts/`, or the database. When all your ids are
done, reply with a one-line-per-restaurant summary: `id | name | menu_verdict m/n |
data_verdict | top issue`.
