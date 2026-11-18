# Rendered measurements

14 confirmed (0 critical, 3 major, 9 minor, 2 polish) · 1 deliberate · 0 refuted, of 14 reported. The cream-on-orange report was split: the 12 to 13px labels are confirmed (RUN-06) and the 14px ones are deliberate (RUN-D1). Two cited locations were wrong and corrected (RUN-09, RUN-10, RUN-12).

Source: Chromium at 393x852, signed out, from `probe/hig-audit-2026-11-11/measurements.json`. Box sizes and font sizes are real numbers. The "effective hit" column in that file read 0 for off-screen elements and was ignored. Many of these were also reported by other areas; the cross-reference is in each block.

## Findings

### RUN-01 · major · Text does not follow the system text size (10 percent of feed text grew at 130 percent)
- **Where:** `src/app/globals.css:79` (body rule sets only the font; no `-apple-system-body` or root font-size rule anywhere in `src` or the native shell). Fixed px sizes at `src/components/mobile/PhoneNav.tsx:307`, `src/components/mobile/PhoneRestaurantCardGrid.tsx:132`, `src/components/mobile/PhoneFeedPostCard.tsx` and about 350 other `text-[Npx]` uses.
- **Screens:** Feed, Account, every tab label, Discover.
- **HIG:** Typography and Accessibility: iOS text should follow the system text size (Dynamic Type), and people should be able to enlarge text to at least 200 percent. Custom fonts must implement the same behaviour.
- **What happens:** With the root font size at 130 percent, 36 of 377 feed text nodes grew (10 percent) and 341 stayed fixed. Account grew 14 of 21 (67 percent). Tab labels, mono buttons and the h1 stayed fixed. A real iPhone does not change the root size from the Larger Text setting unless the page asks for it, so a WKWebView user at a large setting sees today's sizes. The 130 percent run is a proxy, not a Dynamic Type test. Also reported as TYP-01.
- **Fix:** Make the root follow the system (`font: -apple-system-body` under `@supports`, scaled so the default look is unchanged), then move phone text from `text-[Npx]` to rem. Start with tab labels, card metadata and buttons.
- **App Review risk:** low. Not a named rejection reason.
- **Needs device:** yes (Settings > Accessibility > Display and Text Size > Larger Text, then check feed and Discover).

### RUN-02 · major · Discover and card metadata set at 9 to 10px (51 text nodes on Discover)
- **Where:** `src/components/mobile/PhoneRestaurantCardGrid.tsx:132` (matched-dish line 10px), `:154` (cuisine and distance 10px), `:184` (score note 9px), `:~199` (aspect chip 9px). Also `src/components/mobile/PhoneRestaurantCard.tsx:65,70,76,91`, `src/components/mobile/PhoneRestaurantCardTiny.tsx:40,45`, `src/components/mobile/PhoneFriendsLeaderboard.tsx:150,157,304,342`, `src/components/mobile/leaderboard/ChangeMark.tsx:13,23`, `src/components/feed/ShortThread.tsx:536,551`, `src/components/mobile/PhoneDetailHero.tsx:134`.
- **Screens:** Discover, Friends leaderboard, restaurant cards, comment threads, restaurant photo credit.
- **HIG:** Typography: iOS default text is 17 pt and the stated minimum is 11 pt, for custom fonts too.
- **What happens:** Measured 51 text nodes at 9 or 10px on `/m/discover`, and 4 (the tab labels) on every other route. The cuisine, distance, dish and price lines carry facts people compare, so this is content, not decoration. DESIGN.md sets 11px as the small-label size (line 18 and the 11px metadata lines in the restaurant screen notes) and records no 9px or 10px exception. Also reported as TYP-02 and TYP-03.
- **Fix:** Raise to 11px at least (12px for cuisine and distance). Drop or merge secondary chips rather than shrinking them.
- **App Review risk:** low
- **Needs device:** yes (legibility at arm's length on a real screen).

### RUN-03 · major · Feed card links are 14 to 16px tall, with about 4px between them
- **Where:** `src/components/mobile/PhoneFeedPostCard.tsx:138` (restaurant link), `:179` (dish link), `:~733` (author handle link).
- **Screens:** Feed.
- **HIG:** Accessibility: iOS controls default to 44 x 44 pt and should not go below 28 x 28 pt. Layout and Buttons: keep room between targets.
- **What happens:** Measured heights: restaurant link 15 to 16px, dish link 15 to 16px, author link 14px (widths 50 to 154px). The classes are `rounded-sm hover:underline` with no `min-h-11`, no padding and no hit-area expansion. All three are below the 28 pt minimum and stack close together on every card. This breaks the AGENTS.md floor (`min-h-11`). Not covered by other areas (TGT-01 and TGT-02 cover other controls).
- **Fix:** Make each link `inline-flex min-h-11 items-center`, or add a transparent `::after` that grows the hit area to 44px without moving the text. Keep the type size.
- **App Review risk:** low
- **Needs device:** yes (mis-taps between handle, dish and restaurant with a thumb).

### RUN-04 · minor · Tab bar labels are 10px; DESIGN.md says 11px
- **Where:** `src/components/mobile/PhoneNav.tsx:307` (live `arc` variant). The unused `pill` variant at `:226` already uses 11px.
- **Screens:** Every tabbed screen.
- **HIG:** Typography: 11 pt minimum. Tab Bars: keep labels short and legible. (Apple's own tab bar labels are small, so the HIG call here is modest.)
- **What happens:** Measured 10px on every measured route. DESIGN.md says the bottom bar uses "an 11px label". The tab items are 72 x 48, so the targets are fine. Also reported as TYP-04.
- **Fix:** `text-[11px]`. Check that "Discover" still fits in the 72px item.
- **App Review risk:** none
- **Needs device:** no

### RUN-05 · minor · Discover "N to a score" line is 9px zinc-400 (2.65:1 on white)
- **Where:** `src/components/mobile/PhoneRestaurantCardGrid.tsx:184`; text from `src/lib/plateScore.ts` (`plateScoreLabel`).
- **Screens:** Discover.
- **HIG:** Color and Accessibility: 4.5:1 for text under 18 pt.
- **What happens:** `font-mono text-[9px] leading-none text-zinc-400` on a white card. DESIGN.md:64 says zinc-400 is "decorative text (large sizes only)" and DESIGN.md:65 names zinc-500 for readable muted text on white. 24 nodes on `/m/discover` are flagged low contrast. The line states a fact ("how many ratings to a score"), so it is not decoration. Also reported as COL-06.
- **Fix:** `text-zinc-500` and at least 11px.
- **App Review risk:** none
- **Needs device:** no

### RUN-06 · minor · Small cream-on-orange labels at 12 to 13px are 3.87:1
- **Where:** `src/components/mobile/PhoneFindFriends.tsx:509` ("Add", `text-xs font-medium`, 12px), `src/components/mobile/PhoneFilterSheet.tsx:335` ("Save", `text-[13px] font-medium`).
- **Screens:** Find friends, filter sheet (saved address).
- **HIG:** Color and Accessibility: 4.5:1 for normal text.
- **What happens:** `#F7F4EC` on `#C9591F` is 3.87:1. DESIGN.md:74 says this pairing "carries at 14px medium and above and must never be asked to hold a label-sized line". These two are 12px and 13px, below that written line, so they break the project's own rule. Also reported as COL-04. The 14px cases are deliberate (see RUN-D1).
- **Fix:** Raise both to `text-sm` (14px) at least, or use `--pm-orange-text` as the fill for small-label buttons.
- **App Review risk:** none
- **Needs device:** no

### RUN-07 · minor · Header Feed and Map tabs are 32 to 35px wide
- **Where:** `src/components/mobile/PhoneFeedTabs.tsx:99` (`min-h-11` sets height only; the tab is as wide as its word).
- **Screens:** Feed (and the map view).
- **HIG:** Accessibility: 44 x 44 pt default, 28 pt minimum. Layout: keep targets apart.
- **What happens:** Measured: Map 31.9 x 44, Feed 34.7 x 44. Both clear 28 pt but not the 44px floor, and the two sit next to each other with a small gap. The New and Trending switch beside it is 32px tall; that part is TGT-02 and not repeated here.
- **Fix:** Add `min-w-11` or horizontal padding (`px-2`) to each tab; the underline is positioned off the box so the look holds.
- **App Review risk:** none
- **Needs device:** yes (thumb reach with the one-handed grip).

### RUN-08 · minor · Vote arrows are 28px wide and Share and Save 30px, in a tight row
- **Where:** `src/components/feed/PostActions.tsx:305` (`vote-btn ... h-11 w-7`, 28px), `src/app/globals.css:1219-1241` (the `.vote-btn` pseudo-elements are `pointer-events: none` and add no hit area), `.post-action` at `src/app/globals.css:2067`.
- **Screens:** Feed, restaurant dish posts.
- **HIG:** Accessibility: 44 x 44 pt default, 28 pt minimum.
- **What happens:** Measured: vote arrows 28 x 44, Share and Save 30 x 44, 2px apart. 28 is exactly the minimum, so this is at the floor, not under it. The finder's guess that the pseudo-elements widen the hit area is wrong: the CSS comment says they never take pointer events. The vote is the core action on the main screen, so the narrow box is worth widening. TGT-01 notes the same 28px width and leaves it out.
- **Fix:** Widen to `w-9` or `w-10` and pull the pair together with a negative margin so the look stays.
- **App Review risk:** none
- **Needs device:** yes (up versus down mis-taps).

### RUN-09 · minor · Legal contents links are 19px tall on a 26px pitch
- **Where:** `src/components/legal/LegalSection.tsx:40` (the `<a>` in each contents row). The finder cited `PrivacyDocument.tsx:84`, which is the "Last updated" line; the links live in `LegalSection`, used by both documents.
- **Screens:** Privacy, Terms (phone: `src/app/m/privacy/page.tsx` renders `PrivacyDocument`).
- **HIG:** Accessibility: 28 pt minimum, 44 default. Layout: space between targets.
- **What happens:** 17 contents links on Privacy and 22 on Terms, each 19px tall, rows `gap-y-1.5` apart. They are the only way to jump around pages that scroll 6,509px and 12,957px. A two-line title is 39px tall, so longer ones pass.
- **Fix:** `block min-h-11 py-2` on each link (and drop `gap-y-1.5`).
- **App Review risk:** none
- **Needs device:** no

### RUN-10 · minor · "See every comment on this restaurant" is a 16px button, and the dish sheet Close is 32px
- **Where:** `src/components/DishPosts.tsx:165` (`font-mono text-xs`, no padding, 259 x 16 measured), `src/components/DishSheet.tsx:45` (Close `h-8 w-8`, 32 x 32 measured). The finder cited `PhoneDetailHero.tsx:134`, which is the Yelp photo credit chip; neither control lives there.
- **Screens:** Restaurant detail.
- **HIG:** Accessibility: 28 pt minimum, 44 default.
- **What happens:** The comments button is 16px tall, under the 28 pt minimum, and is the way into the full comment list. The Close button clears 28 but not 44. The Close finding is also MOD-06.
- **Fix:** `min-h-11 inline-flex items-center` on the button; `h-11 w-11` hit box around the 32px circle for Close.
- **App Review risk:** none
- **Needs device:** no

### RUN-11 · minor · Muted "Last updated" line is zinc-500 on cream (4.28:1)
- **Where:** `src/components/legal/PrivacyDocument.tsx:84`, `src/components/legal/TermsDocument.tsx:47` (`font-mono text-xs text-zinc-500` on the cream ground).
- **Screens:** Privacy, Terms.
- **HIG:** Color and Accessibility: 4.5:1 for normal text.
- **What happens:** Measured 4.28:1 at 12px. AGENTS.md says zinc-500 is for white and `--pm-grey-text` is for cream, because zinc-500 is 4.28:1 on `#F7F4EC`. The finder's claim that restaurant detail shows the same pairing is only a flagged row in the run, not traced to a line, so it is not counted. The "Contents" label in `LegalSection.tsx:25` is on a white card and passes.
- **Fix:** `text-pm-grey-text` on both lines.
- **App Review risk:** none
- **Needs device:** no

### RUN-12 · minor · Free-slice popup and the sign-up sheet appear one after the other on first launch
- **Where:** `src/components/mobile/PhoneSignUpSheet.tsx:41,82-85` (opens after `SHOW_DELAY_MS` = 1200, does not check for an open dialog); `src/components/mobile/freefood/TicketButton.tsx:38-45` (opens the popup on first visit). The finder cited line 1, which is the file header.
- **Screens:** Feed, first launch, signed out, while the free-slice event shows.
- **HIG:** Modality: avoid stacking modal views and do not interrupt the first task.
- **What happens:** `shots/ov-feed.jpg` shows the free-slice ticket behind the "Join PlateMaps" sheet, with two close controls on screen. Both are dismissed in every other run, so this is a first-run only view. Same defect as MOD-02, which rates it major; here it is minor because it needs both first visit and the event window.
- **Fix:** Wait for any `[role="dialog"]` to close before arming the sheet.
- **App Review risk:** low (the reviewer's first screen)
- **Needs device:** no

### RUN-13 · polish · Signed-out vote notice has no action and covers the header tabs
- **Where:** `src/components/mobile/PhoneFeedScreen.tsx:749` (`onRequireSignIn` only sets the banner).
- **Screens:** Feed, signed out, after "Not now".
- **HIG:** General HIG principle: a message that asks for a step should offer the step. No single page quoted.
- **What happens:** The pill reads "Sign in to join in" and clears after a few seconds. It cannot be tapped. Also reported as MOD-07.
- **Fix:** Make the pill a button that reopens the sign-up sheet.
- **App Review risk:** low
- **Needs device:** no

### RUN-14 · polish · Page is identical under Dark Mode and declares no color scheme
- **Where:** `src/app/layout.tsx:93-96` (viewport has `viewportFit` and `themeColor` only). `src/app/globals.css` has no `color-scheme`. `ios/App/App/Info.plist` has no `UIUserInterfaceStyle`.
- **Screens:** All.
- **HIG:** Dark Mode: apps should support both appearances, and dark-only is for rare cases. The page does not discuss a light-only app, so a declared light scheme is a hedge, not an Apple pattern.
- **What happens:** `dark-feed.jpg` matches the light capture; computed `color-scheme` is `normal`. Form controls and the scroll area can still go dark under a cream page. COL-01 covers the larger status bar consequence and rates it major; this block is only the CSS side.
- **Fix:** `color-scheme: light` on `:root`, plus the Info.plist key from COL-01. Record the light-only choice in DESIGN.md.
- **App Review risk:** low
- **Needs device:** yes (iPhone in Dark Mode: clock, keyboard, overscroll).

## Deliberate deviations
- RUN-D1 · Cream on orange at 14px medium and above (filter CTA `PhoneFilterSheet.tsx:728`, Friends sign-in button `PhoneFriendsScreen.tsx:309`): DESIGN.md:74 says the 3.87:1 pairing "carries at 14px medium and above". The finder rated these 3.87:1 as a defect; only the 12 to 13px cases break the rule (RUN-06).

## Refuted
None refuted outright. Two sub-claims did not hold and were corrected inside their findings:
- The `.vote-btn` pseudo-elements might enlarge the hit area: no, the CSS comment says they never take pointer events (RUN-08).
- Close button at `PhoneDetailHero.tsx:134`: wrong file. It is `DishSheet.tsx:45` (RUN-10).

## Already right
- Viewport does not lock zoom; `viewportFit: cover` and `themeColor` match the cream ground: `src/app/layout.tsx:93-96`.
- Tab bar pads for the home indicator: `src/components/mobile/PhoneNav.tsx:152,323` (`env(safe-area-inset-bottom)`); tab items are 72 x 48 (`:307`).
- Sign-up sheet is a real modal dialog with "Not now": `src/components/mobile/PhoneSignUpSheet.tsx:165-166,213,225`.
- Consent checkbox label is a 44px target: `src/components/mobile/PhoneProfileAuth.tsx:362` (`min-h-11`).
- Tab Feed and Map tabs were raised to `min-h-11` on purpose: `src/components/mobile/PhoneFeedTabs.tsx:93-99`.
- Reduced motion: running infinite animations fell from 6, 15 and 1 to 0 on feed, discover and friends (`measurements-summary.md`).
- No horizontal overflow at 393 or 375 wide, no unnamed controls, no images without alt (`measurements-summary.md`, all 24 rows).

## Needs a real iPhone
- Whether the system Larger Text setting changes anything in the WKWebView (RUN-01).
- Legibility of 9 to 11px text on the Discover grid and tab bar (RUN-02, RUN-04).
- Thumb accuracy for 14 to 16px feed links, 28px vote arrows and 32 to 35px header tabs (RUN-03, RUN-07, RUN-08).
- Dark Mode: status bar clock, keyboard and overscroll colours (RUN-14).
- Safe areas under the notch or Dynamic Island, keyboard overlap and VoiceOver, none of which the Chromium run could model.
- Signed-in screens were not measured (no audit credentials on this machine); the plate detail sheet did not open in the run.
