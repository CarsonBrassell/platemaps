# Junk-menu estimate (2026-09-13)

Trigger: Em Coffee House (ids 10544, 11848) shows dishes named color_3..color_65
with prices like $52329.00. Source is a Wix theme JSON (siteassets.parastorage.com)
parsed as a menu.

Method: heuristic SQL over `dishes` (ident-style names `^[a-z]+(_[a-z0-9]+)+$`,
price >= $1000, names with no letters), grouped per restaurant, then joined to
menu_lookups.source_url. Plus 12 random menus eyeballed (1/12 was junk).

Result: ~160 of 6,992 restaurants with a menu (2.3%) are >=20% junk; 148 are
>=50% junk. Two sources explain 142 of them:
- siteassets.parastorage.com (Wix theme/palette JSON) — 126 restaurants, 100% junk
- dynamic-values-edge-service.doordash.com (DoorDash feature-flag JSON) — 16, ~96% junk
Remaining ~18 are single-site oddities (lavalencia, barona, casbahmusic, ...).
All 160 are live and listed. Not counted: menus that are plausible-looking but
wrong; heuristics only catch structurally broken output.

Queries: probe/junk1.sql .. junk6.sql, run with
`node --env-file=.env.local probe/q.mjs probe/junkN.sql`.

## Done (same day)

- `scripts/junk-menu.mjs` — shared `junkReason(dishes, host)`; wired into
  browser-menus.mjs (drops infrastructure captures before the size contest,
  skips junk groups), screen-menus.mjs (first reason in the chain),
  load-menus.mjs (validation problem, nothing written).
- `scripts/retire-junk-menus.mjs` — 152 restaurants retired, 7,188 dishes
  exported to menus/retired/2026-09-13T19-02-20-976Z-junk.json. Beyond the
  142 from the two hosts: Invita Cafe (identifiers, other host), Ho Wan and
  The Casbah (nameless "#1" / "21+" rows), La Sala Lounge, The Whaling Bar,
  Vigilante Coffee x2 (cents read as dollars), Royal Sweets (foreign-currency
  prices), Arcidiacono (espresso machines), Chainline (bikes).
- Not touched: the 3 static.wixstatic.com menus (Choi's, La Dolce Vita, Luce)
  are real, read off menu photos; the host list excludes wixstatic on purpose.
