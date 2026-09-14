# Feed: minimal / fun / engaging — idea list (2026-09-13)

Grounded in FoodPostCard.tsx, PostActions.tsx, page.tsx, PRODUCT.md and the earlier
public/_feed-concepts.html (9 concepts). Mockups of A/B/C are on the design canvas.

## Three directions (canvas)
A. One Verdict — card = dish · score · one sentence · "Would you eat this?" Yes/No. Heart, share, save, comments behind "…".
B. Ticket Rail — ledger rows (score | dish | place | age); tap expands in place. Plate of the day banner. Streak dots.
C. Hot Board — 2-col tiles, big scores, flame pulse, "Your call" card, leaderboard nudge pill.

## Subtract (minimal)
1. One action row → one question. The yes/no verdict is the product's signature; make it the only visible control. Heart/share/save go behind the dots menu or long-press.
2. Collapse the header stack (FeedHeader + FeedTabs + FeedSortSwitch + FeedSearchField) into one line: title + a Now/Friends segmented pill. Search becomes a pull-down or a magnifier icon.
3. Drop the "Rating" mono label under the %; the number is self-explanatory at 42px.
4. Drop the author row to a single mono line `mayaellis · 2h` under the quote; avatar only on Friends tab.
5. Vibe / best-at / let-down chips: hide on the card, show on tap-expand.
6. Photos: keep the friends-only rule; on Discover let the score be the "image".
7. Restaurant page hand-off: the card's restaurant line becomes the only link; nothing else underlined.

## Motion (fun, but earned)
8. Score count-up on first paint (0→92 in ~400ms, mono tabular so nothing jumps). Once per card, reduced-motion off.
9. Verdict tap: the chosen pill fills orange, the other collapses, and "31 said yes" replaces the question — spring, 200ms, exit shorter than enter.
10. Double-tap pop already exists — reuse its keyframes for the verdict so the vocabulary stays one.
11. Flame pulse only on truly hot plates (already gated); 1.4s ease-in-out, stops when tab hidden.
12. Pull-to-refresh with the plate mark rotating; "3 new plates" pill at the bottom instead of a top banner (thumb reach).
13. Skeleton rows in the same rhythm as the real rows (FeedSkeleton already exists; match B's row height 56px).
14. Press feedback: scale .97 on cards, 100ms, restore on release.

## Engagement (loops, not noise)
15. Plate of the day: the single highest yes-rate plate in the last 24h, one dark card at the top. Tap → restaurant.
16. "Your call" card: one unrated plate served to the user per session, +1 point (the existing first-verdict rule). One, not a stream.
17. Streak line: "Rated 4 days running" + 7 dots. No badges, no confetti.
18. Leaderboard nudge as a one-line pill at the foot: "#12 this week · 8 pts to pass dro_eats". Leaderboard itself stays off the feed.
19. Friends-ate-here line on Discover cards: "2 friends said yes" in mono grey, only when true.
20. Nearby-first ordering with an "Open now" chip pre-selected at mealtime (PRODUCT.md: proximity + open state are load-bearing).
21. Empty Following tab: show the three most-liked local posters with a follow pill each (EmptyFeedState exists; make it actionable).

## Guardrails
- One accent; ≤3 orange elements per screen beyond the score numbers (DESIGN.md).
- No horizontal swipe on cards (gesture conflict with the map tab and iOS back).
- No busyness/wait copy, ever.
- Points and leaderboard stay behind the decision (PRODUCT.md principle 4) — C pushes hardest on this and needs a call.

## Round 2 (2026-09-13, after "all ass · boring · Beli/Letterboxd")
Canvas replaced. A/B/C are archived in the session scratchpad only.
D. Face-off — two friends' plates, tap the one you'd order (Beli's pairwise ranking). Your top 5 re-sorts under it with rank deltas. Taste-match card at the bottom. The tap is the verdict; no like button.
E. Friends ate — Letterboxd-style diary rows: "maya ranked X #1 of 23", "dro went back ×3", "jules said no · disagrees with your #3 · Defend it". Score big on the right. Weekly "dro passed you" card.
F. Top ten — tonight's ranked list within 2 mi, deltas since last night, "your #1" pinned in place, #1 in charcoal, one orange "your call moves the board" card.
Needs if built: pairwise-comparison table (post a vs post b, user, winner), per-user ranking derived from it, "went back" = repeat post same dish+restaurant, taste match = agreement rate on shared verdicts.
