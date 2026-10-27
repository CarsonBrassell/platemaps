# Taste Wheel spec (proposed 2026-10-19, NOT built, awaiting Calvin)

Verified with probe/taste-wheel-calc.mjs: Calvin vs Carson 78% (2.243/2.893).

## Formula

TASTE WHEEL v2 (final spec). Fixed 8-family diverging radar. All arithmetic on s uses values rounded to 3 decimals; do the match sums in integer thousandths so chart and % cannot drift.

0. GATE. Show the chart only if both people have >= 3 posts; otherwise keep the existing empty state. Spokes are always exactly 8.

1. FAMILIES (fixed, drawing order, clockwise from 12 o'clock; spoke i at angle -90deg + 45deg*i):
0 Brunch = Breakfast & Brunch
1 Cafe & Sweets = Coffee & Tea, Bakery & Desserts, Juice
2 Deli & Pub = Sandwiches, American, Bars
3 Burgers & BBQ = Burgers, BBQ, Chicken, Steakhouse, Fast Food
4 Pizza & Italian = Pizza, Italian
5 Mexican & Latin = Mexican, Latin American
6 Asian = Japanese, Chinese, Korean, Thai, Vietnamese, Indian, Asian, Hawaiian
7 Med & Seafood = Mediterranean, Seafood, Vegetarian, French, African
A cuisine not in this map is ignored (log it). Q[f] = share of listed restaurants (hold_reason IS NULL, has coordinates) whose cuisine is in family f; snapshot values: .028 .249 .186 .064 .079 .163 .160 .071. Recompute daily and cache.

2. CONSTANTS. MU=84.5, SD=8.7, KM=5, TCAP=1.5, DEAD=0.5, DCAP=1.5, W_UP=1, W_SAVE=1, W_HEART=2, W_DOWN=2, FLOOR=1.0, K0=6, KC=0.15, AVE0=3, AVSPAN=5, AVMAX=0.25, SMIN=-0.45, SMAX=0.70, LOVE=0.45, LIKE=0.20, GAP=0.20, THIN=2.0, SPLIT=3.0, MINEV=8, MINTOT=0.40.

3. PER PERSON (run once for each of the two people).
Inputs: posts[] of {cuisine, rating or null}; per-cuisine counts of upvotes, saves, hearts, downvotes that the person CAST, each attributed to the voted post's restaurant cuisine. Only dish-kind ratings (0-100 percent) count as rating; star-kind or missing = null. N = number of posts. events = N + all vote rows.
a) Shrunken personal mean: m = (sum of rated posts + KM*MU) / (n_rated + KM).
b) For each post in family f: touch[f] += 1; t = (rating == null) ? 0 : (rating - m)/SD; L[f] += 1 + clamp(t, 0, TCAP); Dip[f] += clamp(-t - DEAD, 0, DCAP).
c) For each vote: touch[f] += count; upvote adds W_UP*count to L[f]; save adds W_SAVE*count; heart adds W_HEART*count; downvote adds count to DV[f] (not to L).
d) T = sum over f of L[f]; K = max(K0, KC*T). K is activity-scaled pseudo-evidence: it stops heavy users saturating at the rim.
e) For each family: Dpre = W_DOWN*DV[f] + Dip[f]; Deff = max(0, Dpre - FLOOR) (1.0 noise floor); E = N*Q[f]; AV = (touch[f]==0) ? AVMAX*clamp((E-AVE0)/AVSPAN, 0, 1) : 0 (silence-versus-supply: they post a lot yet never touch a family that is a big share of the map; max -0.25 so silence alone can never read as HATE); raw = (L - Deff)/(L + Deff + K) - AV; s = round3(clamp(raw, SMIN, SMAX)).
f) Flags per family: thin = (L + Dpre) < THIN (hollow marker); none = touch[f]==0; split = min(L, Dpre) >= SPLIT (loves it AND dumps on it; half-filled marker with a notch).
g) Radius: r = R*(0.4 + 0.6*s/0.70), R = plot radius. s=0 sits on the neutral ring at 0.4R, s=0.70 on the rim, s=-0.45 about 0.014R from centre.

4. PAIR (A = viewer, B = friend). Per spoke split each s into a+ = max(s,0), a- = max(-s,0).
shared = sum over spokes of [min(A+,B+) + min(A-,B-)]
total = sum over spokes of [max(A+,B+) + max(A-,B-)]
matchPct = round(100*shared/total). If total == 0 or min(eventsA, eventsB) < MINEV or total < MINTOT: show the pill 'Too early' instead of a number (chart still draws).
Opposite-sign spokes contribute 0 to shared and |a|+|b| to total, so a love-vs-skip spoke hurts the match as much as it should. Self-match is exactly 100%.

5. PAIR READ per spoke (first rule that fires wins): (1) NEITHER if both none and both thin; (2) BOTH LOVE if both s > LOVE; (3) BOTH SKIP if both s < -LIKE; (4) LEANS if |sA - sB| >= GAP (the higher person leans; a 1e-9 epsilon on the compare); (5) BOTH LIKE if both s > LIKE; (6) NEUTRAL. Glyphs (colour-blind safe, always paired with colour): heart = BOTH LOVE, x = BOTH SKIP, != = LEANS, ? = NEITHER or thin.

6. CALIBRATION (300 synthetic pairs, 8 families): same-taste pairs 61-87%, random 33-47%, disjoint 16-29%, love lands on about 3 of 8 spokes, spurious skips about 0 per user. Sparse users sit near the neutral ring and show Too early.

7. VERIFIED CALVIN VS CARSON: m = 86.821 / 85.731, T = 56.746 / 29.683, K = 8.512 / 6, events 50 / 27, AV = 0 for both (max E is 2.5 < 3). shared = 2.243, total = 2.893, 77.53% -> 78%. Per-spoke s (Calvin / Carson): Brunch .518/.555, Cafe & Sweets .272/.507 (Calvin split: L 19, Dpre 10.054), Deli & Pub .419/.501, Burgers & BBQ .514/.400, Pizza & Italian .412/.400, Mexican & Latin .261/.143, Asian .091/.143, Med & Seafood 0/0 (neither tried). Sum of per-spoke min = .518+.272+.419+.400+.400+.143+.091+0 = 2.243; sum of max = .555+.507+.501+.514+.412+.261+.143+0 = 2.893.

8. STRIP UNDER THE CHART (words, never counts of hearts or downvotes): 'Both love: <families by min(sA,sB) desc>'; 'Both skip: <families by max(sA,sB) asc>' or 'none yet'; 'Differ: <family, who leans> by gap desc'; 'Neither tried: <families>'. Ties break by spoke index. Tapping a spoke shows that family's top-rated post per person.

## Chart

One SVG, viewBox 0 0 300 300, centre (150,150), plot radius R=78, readable at about 300px wide. Spokes at -90deg + 45deg*i clockwise from 12 o'clock in the family order. Radius per point r = R*(0.4 + 0.6*s/0.70). Rings: neutral ring at 0.4R drawn solid mid-grey 1.5px and labelled 'even'; faint dotted rings at 0.7R and the rim R; the disc inside the neutral ring gets a light hatch tint meaning 'leans away', centre means skip/hate. Calvin: solid orange #eb6834 polygon 2.5px, 14% orange fill, ROUND points r=4.5. Friend: DASHED charcoal #3b3b3b polygon 2px, dasharray 6 4, no fill, SQUARE points 8x8. Draw friend first, Calvin on top. Overlap ribbon: on every spoke a 9px bar runs from the neutral ring out to r(min(a+,b+)) in teal-green for shared like, and inward to r(min(a-,b-)) in crimson with hatch for shared dislike; the gap beyond the ribbon (to the larger value, or across the ring if signs differ) is a thin light bar. Ribbon length summed = shared and ribbon+gap summed = total, so matchPct equals ribbon / (ribbon + gap) by construction. BOTH LOVE spokes get a soft green 45deg wedge behind them and a heart glyph at the rim; BOTH SKIP a soft red wedge and an x; LEANS a != glyph; NEITHER or thin a ? glyph and a hollow marker; split markers are half-filled with a notch. Labels sit at R+12, 11-12px, family name wrapped after ' &' (e.g. 'Mexican' / '& Latin') so left and right labels fit within 70px. Legend row below the chart: orange dot solid line = you, grey square dashed line = friend, then 'outside ring = leans toward, inside = leans away', then the Both love / Both skip / Differ strip and the match % pill.

## Edge cases

- Too early: if either person has fewer than 8 events (posts plus votes) or total < 0.40, show a 'Too early' pill instead of a percent; the chart still draws. If total == 0 the percent is null.
- Fewer than 3 posts on either side: do not draw, keep the existing empty state.
- Untouched family: s = 0 (on the neutral ring), hollow marker, ? glyph. It only goes negative through the silence term, which needs E = N*Q[f] >= 3 expected posts and zero touches, ramps to -0.25 at E >= 8, and can never reach HATE (floor -0.25 vs -0.45).
- Both silent on the same supply-heavy family: reads NEITHER first (precedence rule 1), never BOTH SKIP, so silence alone never becomes a shared dislike claim.
- Split taste (min(L, Dpre) >= 3, e.g. Calvin on Cafe & Sweets): marker is half-filled with a notch, tooltip says 'you love it and dump on it'; the net score is honest rather than hiding either side.
- No downvotes from the friend: the skip arc is empty and the strip says 'none yet'. Product gap: honest shared dislike needs a signal, so add a one-tap 'not for me' on a cuisine or family and feed it in as DV.
- Saturation: heavy users are held off the rim by K = max(6, 0.15*T); s is clamped to [-0.45, +0.70] inside the score so ribbon, wheel and % all use the same clamped number.
- Ratings are compressed (avg 84.5, sd 8.7): a rating only tilts relative to the person's own shrunken mean m; positive tilt capped at 1.5 sd, and a dip only counts beyond 0.5 sd, so a bland 82 is not a dislike.
- Null or star-kind ratings count as a plain post (+1 to L) with no tilt and no dip.
- Opposite-sign spokes (one loves, one skips) add 0 to shared and |a|+|b| to total, so they cost the match the full amount; reads LEANS.
- Identical profiles give exactly 100%. Two empty-but-gated profiles give total = 0 and show Too early, not 0%.
- Unmapped cuisine, deleted restaurant or missing cuisine: the post or vote drops out of the family sums (still counts as an event only if its cuisine mapped).
- Privacy: hearts and downvotes enter only as family-level scores; tooltip, strip and SPLIT badge are words only, never counts. Show the chart only for confirmed friends, never for blocked pairs, same as the current Taste match.
- Float safety: round s to 3 decimals, then sum in integer thousandths; compare GAP with a 1e-9 epsilon so 0.20 gaps are stable across platforms.

## SQL needed

Add to src/lib/db.ts (keep getCuisineCounts for the other cards) and a pure src/lib/tasteWheel.ts holding FAMILIES, CUISINE_TO_FAMILY, the constants, scoreUser() and matchPair(). 1) getTasteWheelPosts(userIds): SELECT p.user_id, r.cuisine, r.id AS restaurant_id, r.name, r.listed, CASE WHEN p.rating_kind = 'dish' THEN p.rating::float END AS rating FROM posts p JOIN restaurants r ON r.id = p.restaurant_id WHERE p.user_id = ANY($1) AND p.meal_id IS NULL AND r.cuisine IS NOT NULL (one row per post; the top-rated post per family for the tooltip is picked in TypeScript from these rows). 2) getTasteWheelVotes(userIds): four grouped reads UNION ALL'd, one per vote table, each as SELECT v.user_id, r.cuisine, '<up|down|heart|save>' AS kind, COUNT(*)::int AS n FROM <post_upvotes|post_downvotes|post_hearts|post_saves> v JOIN posts p ON p.id = v.post_id JOIN restaurants r ON r.id = p.restaurant_id WHERE v.user_id = ANY($1) AND r.cuisine IS NOT NULL GROUP BY v.user_id, r.cuisine (attribute each vote to the VOTED post's restaurant cuisine, the voter is v.user_id). 3) getListedSupplyByCuisine(): SELECT cuisine, COUNT(*)::int FROM restaurants WHERE hold_reason IS NULL AND <has coordinates> AND cuisine IS NOT NULL GROUP BY cuisine, cached daily, folded into Q[f] in TypeScript with the cuisine-to-family map. 4) events per person = posts count + sum of vote n, computed in TypeScript, no SQL needed. 5) getTasteWheelForProfile(viewerId, otherId): same friends-only and blocked-pair guards as getTasteMatchForProfile, calls 1-3 once for [viewerId, otherId], returns { wheel: {spokes[8] with sA, sB, flags, read}, matchPct, early } or { wheel: null } for the empty state. No schema change is needed for the first release; a later 'not for me' cuisine tap needs one new table (user_id, cuisine, created_at) feeding DV.
