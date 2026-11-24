# Typography and Dynamic Type

9 confirmed (0 critical, 2 major, 4 minor, 3 polish) · 0 deliberate · 0 refuted, of 11 reported. Two reported items were folded into others as duplicates.

## Findings

### TYP-01 · major · No Dynamic Type hook: the iOS text-size setting does nothing
- **Where:** `src/app/globals.css:80-85` (body sets only `font-family`). Also `src/app/layout.tsx` (viewport block).
- **Screens:** All phone screens.
- **HIG:** Accessibility: ideally let people enlarge text by at least 200 percent, through custom UI or by adopting Dynamic Type, the system text-size setting. Typography: Dynamic Type is a system-level feature on iOS. Also keep truncation low as text grows.
- **What happens:** Grep for `apple-system-body`, `text-size-adjust` and any `html` font-size rule across `src` returns nothing. The root stays at the browser default of 16px. About 350 sizes are fixed px (`text-[10px]` to `text-[48px]`) and the rem utilities (`text-xs`, `text-sm`, `text-base`) sit on that fixed root. So Settings > Display & Text Size > Larger Text changes nothing in the app. Pinch zoom is not locked (deliberate, see AGENTS.md), so people can zoom, but that zooms the whole layout and is not a text-size setting. There is no in-app text size control either.
- **Fix:** Make the root follow the system. Add `@supports (font: -apple-system-body) { html { font: -apple-system-body; } }` (17px at the default setting, so also set `font-size: calc(1em * 16 / 17)` or a `--pm-scale` variable to keep today's look at the default). Then convert phone text from `text-[Npx]` to rem, starting with the feed, Discover cards, tab bar and profile. Cap the very largest sizes on fixed chrome (tab bar, top bars). Fixed boxes that would clip once text grows (avatar discs `h-6 w-6` with 9 to 10px initials at `FoodPostCard.tsx:39`; the `+N` disc at `PlateDetailSheet.tsx:371`; square profile tiles with `line-clamp-3/4` at `PhoneProfileScreen.tsx:162`) need `min-h` and padding instead of fixed sizes at the same time.
- **App Review risk:** low. Dynamic Type is not a stated rejection reason, but it is a common accessibility note.
- **Needs device:** yes. Check that WKWebView scales a `-apple-system-body` root when Larger Text and the Accessibility sizes (AX1 to AX5) change, and how the tab bar, sheets and map overlays lay out.

### TYP-02 · major · Discover grid cards set card details at 9 to 10px, and the no-rating note is low contrast
- **Where:** `src/components/mobile/PhoneRestaurantCardGrid.tsx:132` (dish chip, price, distance row, `text-[10px]`), `:159` (cuisine row, 10px), `:101` (score pill, 10px), `:184` (no-rating note, `text-[9px] text-zinc-400`), `:199` (aspect chip, 9px). `src/components/mobile/PhoneRestaurantCardTiny.tsx:40` (percent, 9px bold) and `:45` (name, 10px).
- **Screens:** Discover results grid and the taste section.
- **HIG:** Typography: iOS default is 17 pt and the minimum is 11 pt; Caption 2, the smallest system style, is 11 pt. Accessibility: text up to 17 pt needs 4.5:1 contrast.
- **What happens:** The main browse screen shows every card detail below 11px; the smallest are 9px. `zinc-400` is `#A79E8D` (DESIGN.md:64 limits it to large decorative text). Computed contrast: 2.65:1 on white and 2.41:1 on the cream ground, well under 4.5:1. So `:184` breaks both the HIG floor and the project's own body-contrast floor. Price and score are the numbers meant for comparing places.
- **Fix:** Raise these to at least 11px. Make the no-rating note `text-[11px] text-zinc-500` (or `text-pm-grey-text`). If width is tight, put the distance on its own line rather than shrink type.
- **App Review risk:** low.
- **Needs device:** no. A check on an iPhone SE for wrapping after the change is useful.

### TYP-03 · minor · Sub-11px text elsewhere (about 77 uses in 31 files)
- **Where:** `src/components/ProfileShelves.tsx:701` (9px meta line), `:725` region; `src/components/mobile/leaderboard/ChangeMark.tsx:13` (9px NEW chip, uppercase, tracked); `src/components/mobile/PhoneFriendsLeaderboard.tsx:304` and `:342` (10px uppercase, 0.14em tracking, the second is a full sentence); `src/components/mobile/leaderboard/MovementBanner.tsx:55` (10px, 0.16em, cream at 80 percent); `src/components/mobile/freefood/TicketCard.tsx:76,114` (10px uppercase labels); `src/components/feed/FoodPostCard.tsx:39` and `src/components/PlateDetailSheet.tsx:371` (9 to 10px in 22 to 24px discs); `src/components/mobile/PhoneDetailHero.tsx:134` (10px photo credit on a `bg-white/85` pill).
- **Screens:** Profile, Friends leaderboard, comment threads, plate sheet, free-food tickets, restaurant detail hero.
- **HIG:** Typography: 11 pt iOS minimum; small custom type needs enough weight and contrast.
- **What happens:** Grep for `text-[8px|9px|9.5px|10px]` under `src/app/m` and `src/components` finds 77 uses in 31 .tsx files. The shared `.mono-label` is already 11px (`globals.css:119-126`), so these are hand-rolled stacks that fall below it. Wide tracking at 10px makes some labels wrap to two lines.
- **Fix:** Raise to `text-[11px]` or use `.mono-label`, and give the small discs room (`min-h-6 px-1`). Keep all-caps to one to three words.
- **App Review risk:** none.
- **Needs device:** no.

### TYP-04 · minor · Tab bar labels are 10px, DESIGN.md says 11px
- **Where:** `src/components/mobile/PhoneNav.tsx:307` (`ArcNav`, the default variant: `DEFAULT_VARIANT` is `"arc"` at `:42`).
- **Screens:** Every screen with the bottom tab bar.
- **HIG:** Typography: iOS minimum 11 pt for custom type.
- **What happens:** Medium weight 10px in `pm-grey-text`. DESIGN.md:117 says "icon over an 11px label". The unused `StripNav` variant already uses 11px (`:226`). The 56px slots have room.
- **Fix:** Change `text-[10px]` to `text-[11px]`.
- **App Review risk:** none.
- **Needs device:** no.

### TYP-05 · minor · Camera failure message is 10px at white/40
- **Where:** `src/components/post/CameraCapture.tsx:661`.
- **Screens:** Post composer camera, permission-denied or error state.
- **HIG:** Typography: 11 pt minimum. Accessibility: 4.5:1 for text up to 17 pt.
- **What happens:** `font-mono text-[10px] text-white/40` on `bg-pm-charcoal` (`#232019`, `:908`). White at 40 percent blends to about `#7b7975`, which is 3.74:1 on the charcoal. It is the only line that says why the camera did not open.
- **Fix:** `text-xs` with `text-white/80` or the cream token.
- **App Review risk:** low. Reviewers exercise the camera and may deny permission.
- **Needs device:** no.

### TYP-06 · minor · Dish name in the Discover grid chip truncates first
- **Where:** `src/components/mobile/PhoneRestaurantCardGrid.tsx:133-150` (chip is `truncate`; price `shrink-0`; distance `shrink-0 max-w-[6rem] truncate`). Same pattern for cuisine at `:159`.
- **Screens:** Discover with a dish search.
- **HIG:** Typography: keep truncation to a minimum; avoid it unless people can open a separate view to read the rest.
- **What happens:** The code comment says price survives on purpose. The cost is the dish name, the thing the search was for. In a roughly 170px card with a price and distance beside it, the chip gets well under 100px at 10px type. The tap goes to the restaurant, so the full dish name is not shown on the card.
- **Fix:** Put the chip on its own line (`line-clamp-2`), and price and distance on a second row.
- **App Review risk:** none.
- **Needs device:** yes (real card width on SE and Pro Max).

### TYP-07 · polish · Discover heading has no wrap rule for a long unbroken query
- **Where:** `src/components/mobile/PhoneDiscoverScreen.tsx:235`.
- **Screens:** Discover.
- **HIG:** General principle: layout should tolerate long text.
- **What happens:** The h1 (`text-[26px]`) has no `break-words`. The query is capped at 60 characters (`MAX_QUERY`, `src/lib/discoverFilters.ts:878,976`), so only a pasted unbroken string of about 25 or more characters would push the page sideways. Normal multi-word queries wrap fine. The finder's claim of an unlimited query is wrong; the cap exists.
- **Fix:** Add `break-words` to the h1.
- **App Review risk:** none.
- **Needs device:** no.

### TYP-08 · polish · Feed post subject line is footnote size
- **Where:** `src/components/mobile/PhoneFeedPostCard.tsx:627` (dish 13px), `:631,636` (restaurant 12px), `:716,730` (meta 11px).
- **Screens:** Feed.
- **HIG:** Typography: Footnote is 13 pt and Caption 1 is 12 pt, for secondary information; body defaults to 17 pt.
- **What happens:** The dish and restaurant are the post's headline but sit at footnote and caption size. All are at or above 11px, so this is a size judgment, not a floor breach. The web card uses 15px for the dish (`FoodPostCard.tsx:562`).
- **Fix:** Try 15px dish, 13px restaurant, 12px meta; the row already truncates.
- **App Review risk:** none.
- **Needs device:** yes (feel at real size).

### TYP-09 · polish · Map neon sign labels are 10px uppercase with wide tracking
- **Where:** `src/app/globals.css:698` (`.map-neon-sign` overrides the shared 11px at `:677`); attribution at `:500` (10px `!important`).
- **Screens:** Map.
- **HIG:** Typography: 11 pt iOS minimum.
- **What happens:** The dark neo-noir map and unclustered pins are deliberate (AGENTS.md:23). The 10px size and 0.18em tracking are not recorded. Colour is `#ffb07a` with a glow on dark, so contrast is fine (about 10:1 on `#15171a`).
- **Fix:** Drop the 10px override, or raise it to 11px. `SIGN_LEFT` and `SIGN_GAP` in `RestaurantMap.tsx` estimate the sign width for collision, so recheck that estimate after any change.
- **App Review risk:** none.
- **Needs device:** yes (legibility on the map at arm's length).

## Deliberate deviations
None. Neither AGENTS.md nor DESIGN.md records a sub-11px rule; DESIGN.md:117 actually specifies 11px for the tab bar.

## Refuted
- R1 Many text containers have a fixed box that would clip: duplicate. It is a consequence of TYP-01 and is dormant today; folded into the TYP-01 fix text.
- R2 Small uppercase mono labels with wide tracking in 59 places: duplicate of TYP-03 (same locations and fix).

## Already right
- No light, thin or extralight weights: `src/app/globals.css:119-126` (`.mono-label` is weight 500).
- Shared `.mono-label` sits exactly at 11px: `src/app/globals.css:119-126`.
- Legal and long-form copy is 15px with relaxed leading and a bounded column: `src/components/legal/LegalSection.tsx:18`.
- Text over feed photos has a real shadow or backing: `src/components/feed/FoodPostCard.tsx:452`.
- Price is protected from truncation by design: `src/components/mobile/PhoneRestaurantCardGrid.tsx:133-150`.
- `min-h-dvh` instead of `100vh`: `src/components/mobile/PhoneDiscoverScreen.tsx:223`.
- Newer controls use `text-xs` or larger at 44px height: `src/components/mobile/PhoneFeedPostCard.tsx:594`.
- Fonts load through `next/font` with fallbacks: `src/app/layout.tsx:2-30`.
- Orange text on cream uses `--pm-orange-text` at 5.8:1: `src/app/globals.css:7,14`.

## Needs a real iPhone
- Whether a `-apple-system-body` root scales inside the Capacitor WKWebView when Larger Text changes, and how the tab bar, sheets and map overlays lay out at AX1 to AX5.
- Whether 10px tab labels read next to system apps.
- Real width of the Discover 2-up card on SE and Pro Max, which sets how much of the dish name survives.
- Contrast of 10px credits and pills over live photos (`PhoneDetailHero.tsx:134`).
- Font swap flash for Fraunces and Spline Sans Mono on a cold start.
- Bold Text setting: WKWebView does not apply it to web fonts.
