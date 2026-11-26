# PlateMaps runtime measurements (Chromium, 393x852 @2x, signed out)

Per route: small = targets with box under 44 px (effective hit size under 44 px in brackets), tiny = text nodes under 11 px, lowC = low-contrast text, unnamed = unnamed controls, noAlt = img without alt, overflow = horizontal overflow.

| route | targets | small (eff) | tiny | lowC | unnamed | noAlt | overflow |
|---|---|---|---|---|---|---|---|
| feed | 58 | 40 (40) | 4 | 0 | 0 | 0 | no |
| discover | 39 | 1 (1) | 51 | 24 | 0 | 0 | no |
| account | 18 | 6 (6) | 4 | 0 | 0 | 0 | no |
| friends | 7 | 1 (1) | 4 | 1 | 0 | 0 | no |
| post | 18 | 6 (6) | 4 | 0 | 0 | 0 | no |
| settings | 18 | 6 (6) | 4 | 0 | 0 | 0 | no |
| privacy | 23 | 17 (17) | 4 | 1 | 0 | 0 | no |
| terms | 28 | 22 (22) | 4 | 1 | 0 | 0 | no |
| forgot | 8 | 0 (0) | 4 | 0 | 0 | 0 | no |
| restaurant | 15 | 4 (4) | 10 | 1 | 0 | 0 | no |
| user | 18 | 6 (6) | 4 | 0 | 0 | 0 | no |
| i:comments | 2 | 1 (1) | 0 | 1 | 0 | 0 | no |
| i:plate | 22 | 12 (12) | 4 | 0 | 0 | 0 | no |
| i:filters | 15 | 0 (0) | 0 | 1 | 0 | 0 | no |
| i:vote | 22 | 12 (12) | 4 | 0 | 0 | 0 | no |
| i:ov-feed | 4 | 0 (0) | 0 | 0 | 0 | 0 | no |
| i:ov-discover | 4 | 0 (0) | 0 | 0 | 0 | 0 | no |
| i:ov-restaurant | 4 | 0 (0) | 0 | 0 | 0 | 0 | no |
| 375:feed | 42 | 28 (28) | 4 | 0 | 0 | 0 | no |
| 375:discover | 39 | 1 (1) | 51 | 24 | 0 | 0 | no |
| 375:post | 18 | 6 (6) | 4 | 0 | 0 | 0 | no |
| 375:account | 18 | 6 (6) | 4 | 0 | 0 | 0 | no |
| dark:feed | 31 | 19 (19) | 4 | 0 | 0 | 0 | no |
| dark:account | 18 | 6 (6) | 4 | 0 | 0 | 0 | no |

## Ten worst offenders overall (smallest hit area / smallest text / lowest contrast, deduplicated)
1. [target] feed: "View Elliefelber's profile" - 79.2x14 box, 0x0 hit
2. [target] feed: "Upvote this plate" - 28x44 box, 0x0 hit
3. [target] feed: "Downvote this plate" - 28x44 box, 0x0 hit
4. [target] feed: "Share this plate" - 30x44 box, 0x0 hit
5. [target] feed: "Save this plate" - 30x44 box, 0x0 hit
6. [target] feed: "California Burrito" - 112x16 box, 0x0 hit
7. [target] feed: "The Taco Stand" - 100.8x15 box, 0x0 hit
8. [target] privacy: "14. Changes to This Policy" - 159.7x19 box, 0x0 hit
9. [target] privacy: "15. Contact Us" - 89.2x19 box, 0x0 hit
10. [target] terms: "7. Promoted Listings, Advertising, and P" - 262.7x39 box, 0x0 hit

## Variants
- reduced motion feed: running animations 6 (infinite 6) default vs 0 (infinite 0) with Reduce Motion
- reduced motion discover: running animations 15 (infinite 15) default vs 0 (infinite 0) with Reduce Motion
- reduced motion friends: running animations 1 (infinite 1) default vs 0 (infinite 0) with Reduce Motion
- dark feed: {"colorSigEqual":true,"lightBodyBg":"rgb(247, 244, 236)","darkBodyBg":"rgb(247, 244, 236)","darkPrefers":true,"htmlColorScheme":"normal"}
- dark account: {"colorSigEqual":false,"lightBodyBg":"rgb(247, 244, 236)","darkBodyBg":"rgb(247, 244, 236)","darkPrefers":true,"htmlColorScheme":"normal"}
- text 130% feed: 36/377 text nodes grew (10%), 341 stayed fixed; scrollWidth 393 vs 393; escapes 0
- text 130% account: 14/21 text nodes grew (67%), 7 stayed fixed; scrollWidth 393 vs 393; escapes 0
- 375x667 feed: scrollWidth 375, escapes 0, clipped 7
- 375x667 discover: scrollWidth 375, escapes 0, clipped 0
- 375x667 post: scrollWidth 375, escapes 0, clipped 0
- 375x667 account: scrollWidth 375, escapes 0, clipped 0

Signed-in pass: skipped: probe/audit/.env (AUDIT_EMAIL/AUDIT_PASSWORD) does not exist on this machine
