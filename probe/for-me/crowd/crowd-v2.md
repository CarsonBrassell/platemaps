# Crowd bonus v2 (Calvin only, flavor40 path)

Only other users' ratings drive it; presence or photos count for nothing. Ratings are 0-100 in the DB, read here as stars (rating / 20).

Per poster (mean of their posts at the place): score s = +0.6 at 4.5 rising to +1.0 at 5.0; 0 for 4.0-4.49; under 4.0, -(0.1 + 0.3 * (4.0 - stars)), floored at -1.
Place: net = sum of s over distinct posters (viewer and blocked users left out; places the viewer posted are skipped in rankDishes).
- net > 0: multiplier = 1 + 0.30 * (1 - exp(-1.2 * net))   (cap 1.30)
- net < 0: multiplier = 1 - 0.15 * (1 - exp(-1.2 * |net|))  (floor 0.85)

Old vs new multiplier. The old curve (1 + 0.08 * (1 - exp(-0.6 * net)), never under 1.0) read relative evidence, so the old column is approximate: +0.5 per 4.5+ post, +0.2 at 4.0-4.4, -0.3 under 4.0.

| ratings (stars) | old (1.00-1.08) | new (0.85-1.30) |
|---|---|---|
| one 4.5 | 1.021 | 1.154 |
| one 5.0 | 1.036 | 1.210 |
| one 4.2 | 1.009 | 1.000 |
| one 3.5 | 1.000 | 0.961 |
| one 2.0 | 1.000 | 0.915 |
| two 5.0 | 1.056 | 1.273 |
| three 4.5 | 1.047 | 1.265 |
| 5.0 + 4.5 + 3.0 | 1.041 | 1.229 |
| three 3.5 | 1.000 | 0.911 |
| five 5.0 | 1.076 | 1.299 |
