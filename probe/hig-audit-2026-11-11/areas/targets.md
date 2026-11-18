# Touch targets, buttons and controls

8 confirmed (0 critical, 1 major, 5 minor, 2 polish) · 0 deliberate · 1 refuted, of 9 reported.

Apple's numbers, as seen on the HIG pages: the Accessibility page gives iOS controls a default hit size of 44x44 pt and a minimum of 28x28 pt. The Buttons page says a button needs a hit region of at least 44x44 pt and says to always include a press state for a custom button. In a WKWebView one CSS px is one pt. The project's own floor (AGENTS.md line 24, DESIGN.md line 282) is 44px (`min-h-11`), so anything under 44 breaks the project rule even when it clears Apple's 28 minimum.

## Findings

### TGT-01 · major · Comment collapse toggle and vote arrows are under Apple's 28 pt minimum
- **Where:** `src/components/feed/CommentsScreen.tsx:356` (collapse toggle `h-6 w-5`, 20x24); `src/components/feed/CommentsScreen.tsx:530` (comment vote arrows `h-11 w-6`, 24 wide); `src/components/feed/ShortThread.tsx:656` (same `h-11 w-6` arrows); `src/components/feed/CommentsScreen.tsx:452` (thread rail button `w-4`, 16 wide).
- **Screens:** Comments screen (opened from the phone feed), restaurant and dish pages (RestaurantComments uses ShortThread, shown by PhoneDetailScreen).
- **HIG:** Accessibility: iOS controls default to 44x44 pt and should never go below 28x28 pt. Buttons: 44x44 pt hit region.
- **What happens:** The vote pair is two buttons side by side, each 24px wide, so the up and down targets sit 24px apart. That is 4px under the 28 pt minimum, on a core action. The collapse toggle is 20x24, under the minimum in both directions. The rail is 16 wide but has `tabIndex={-1}` and the +/– toggle does the same job, so the rail is a bonus, not the main control. The post-level arrows in `PostActions.tsx:305` are `h-11 w-7`, which is exactly 28: at the floor, not under it, so they are not part of this finding.
- **Fix:** Make the comment and short-thread arrows `w-8` or wider (the pair already uses `-ml-1` to tighten, so offset it). Give the collapse toggle `h-11 w-8` and keep the small glyph centred.
- **App Review risk:** low
- **Needs device:** yes (mis-taps between the up and down arrow with a thumb)

### TGT-02 · minor · Segmented switches are 32px tall (and the Nearby chip 40px)
- **Where:** `src/components/feed/FeedSortSwitch.tsx:55` (`min-h-8`); `src/components/feed/CommentsScreen.tsx:263` (`min-h-8` comment sort); `src/app/m/drafts/profile-text-posts/page.tsx:63` (`min-h-8`); `src/components/feed/NearbyChip.tsx:54` (`h-10 min-h-10`, 40px).
- **Screens:** Discover feed (sort switch and Nearby chip sit side by side, PhoneFeedScreen.tsx:581), Comments, profile text-post drafts.
- **HIG:** Accessibility: default 44 pt, minimum 28 pt. Segmented Controls: the page gives no hit-size number; it asks for consistent segment sizes.
- **What happens:** Each segment is 32px tall inside a `p-1` track, so the visible control is about 40px, but only the 32px button takes the tap. 32 clears Apple's minimum of 28 but breaks the project floor of 44. PhoneFeedTabs.tsx:93-98 carries a comment saying the min-h-10 row was put back to min-h-11 for this exact reason, so the switch beside it was missed. `feed/Leaderboard.tsx:105` was also cited, but nothing imports it (the phone leaderboard is under `mobile/leaderboard`), so it is dropped.
- **Fix:** Raise segments to `min-h-11`, or keep the 32px look and add padding or a transparent `::after` so the hit area is 44px. Make `NearbyChip` `h-11 min-h-11`.
- **App Review risk:** none
- **Needs device:** no

### TGT-03 · minor · Some custom buttons have no press state
- **Where:** `src/components/feed/FeedSortSwitch.tsx:55`; `src/components/mobile/PhoneFeedTabs.tsx:82-112`; `src/components/mobile/PhoneFeedPostCard.tsx:842,854` (menu rows; also the Report and Block rows below them); `src/components/feed/CommentsScreen.tsx:415,426` (Reply, Report).
- **Screens:** Discover feed, post overflow menu, Comments.
- **HIG:** Buttons: always include a press state for a custom button, because without one it can feel unresponsive.
- **What happens:** Tailwind preflight sets `-webkit-tap-highlight-color: transparent` (`node_modules/tailwindcss/preflight.css:50`), so the system flash is off. These buttons have `hover:` styles only, and hover applies on touch only after a tap sticks. None has an `active:` class (grep of those files found none). Other controls do it right: `.post-action:active` (globals.css:2077), the Add button (`active:scale-[0.97]`, PhoneFindFriends.tsx:509) and the create button (`active:scale-90`, PhoneNav.tsx:162). The finder rated this major; it is minor because about 50 other `active:` uses exist in the mobile and feed folders and the gap is limited to text-style buttons and menu rows.
- **Fix:** Add one shared press treatment (a tint or opacity step, no motion needed) to segmented, tab, menu-row and text-button classes.
- **App Review risk:** none
- **Needs device:** yes (whether `:active` paints at all inside the WKWebView)

### TGT-04 · minor · Filter sheet "Change" and "Clear" links are about 28px tall with no focus ring
- **Where:** `src/components/mobile/PhoneFilterSheet.tsx:284` and `:291`.
- **Screens:** Phone filter sheet (location row).
- **HIG:** Accessibility: default 44 pt, minimum 28 pt. Buttons: 44x44 pt hit region.
- **What happens:** Both are `px-2 py-1 text-[13px]` text buttons: 13px type plus 8px vertical padding, so roughly 28px. They sit side by side. Neither has a `focus-visible` outline, which breaks the project's orange-ring rule. The same file does it right at line 720 (`min-h-11` with an orange ring).
- **Fix:** `inline-flex min-h-11 items-center px-3` plus the orange `focus-visible` classes from line 720.
- **App Review risk:** none
- **Needs device:** no

### TGT-05 · minor · Icon-only close and remove buttons are 28 to 36px
- **Where:** `src/components/DishSheet.tsx:45` (`h-8 w-8`, 32px); `src/components/post/MealPlates.tsx:113` (`h-7 w-7`, 28px); `src/components/post/CameraCapture.tsx:981` (`h-9 w-9`, 36px) and `:1036` (`h-8 w-8`, 32px).
- **Screens:** Dish sheet (opened from PhoneDetailScreen.tsx:184), post composer meal list (post/page.tsx:527), camera split-photo restart.
- **HIG:** Accessibility: default 44x44 pt, minimum 28x28 pt. Buttons: 44x44 pt hit region.
- **What happens:** The MealPlates remove button is exactly at the 28 floor and sits in a list row; the Dish sheet close is 32. The camera restart button at 981 appears only mid-split and has a 44px close (line 955) elsewhere in the same file, so the right size is known. The DishSheet close is the one people use most.
- **Fix:** Keep the small visual circle and make the button `h-11 w-11` (negative margin to keep the layout), or add a padded transparent hit area.
- **App Review risk:** none
- **Needs device:** no

### TGT-06 · minor · Percent slider thumb is 10px wide
- **Where:** `src/components/post/PercentMeter.tsx:174`; `src/app/globals.css:1515-1560` (`.pct-meter`, 56px track, `::-webkit-slider-thumb` 10px wide and 56px tall).
- **Screens:** Post composer.
- **HIG:** Sliders: show live feedback and label the ends; for precise values the page suggests pairing the slider with a text field and stepper. It gives no thumb size. Accessibility sets 28 pt as the minimum control size.
- **What happens:** A native `type="range"` with `aria-valuetext`, a live big number and a band label, so feedback and labels are in place. The thumb is 10px wide, but it is 56px tall and the whole bar is the visual target. A coarse "how much did you like it" meter does not need a stepper, so that part of the finder's claim is soft. Whether iOS lets a thumb tap start a drag from the track or only from the 10px thumb cannot be settled from code.
- **Fix:** Test on a phone first. If grabbing is hard, widen the thumb to 28px or add transparent padding.
- **App Review risk:** none
- **Needs device:** yes (grab area on the track versus the thumb, and whether the drag fights the page scroll)

### TGT-07 · polish · Find Friends "Add" button is 36px tall
- **Where:** `src/components/mobile/PhoneFindFriends.tsx:509` (`min-h-9`); the neighbouring dismiss button at `:465` is `h-11 w-11`.
- **Screens:** Find friends.
- **HIG:** Accessibility: default 44 pt, minimum 28 pt. Buttons: 44 pt hit region.
- **What happens:** The primary action in each suggestion card is 36px, above Apple's minimum and under the project floor. It has a press state and an orange focus ring (FOCUS, line 25).
- **Fix:** `min-h-11`. The `wide` card variant already spans the card width, so only height changes.
- **App Review risk:** none
- **Needs device:** no

### TGT-08 · polish · Block menu item uses a close (X) icon
- **Where:** `src/components/mobile/PhoneFeedPostCard.tsx:882`
- **Screens:** Feed post overflow menu.
- **HIG:** General principle (not a rule I could confirm on the Buttons page): an icon should match its meaning. Added to this area because it is a menu-row control.
- **What happens:** The Block row shows `CloseIcon` next to "Block @name", so the X reads as "dismiss". The row is `min-h-11` and red, so its destructive nature is already signalled.
- **Fix:** Use a person-slash or block glyph.
- **App Review risk:** none
- **Needs device:** no

## Deliberate deviations

None. AGENTS.md and DESIGN.md record the vote arrows' shape and pill styling, but not any target size below 44px. Both files say the 44px floor must not regress (AGENTS.md line 24, DESIGN.md line 282).

## Refuted

- Signup consent checkbox is 20px with inline legal links: the control is the whole label, `min-h-11` (PhoneProfileAuth.tsx:362), so the 20px box is not the target. Links inside a label navigate when tapped; they do not toggle the box. Inline links in a sentence are normal and Apple's Buttons page sets no hit size for them.

## Already right

- Bottom nav and create button are 44px: `src/components/mobile/PhoneNav.tsx:158-163` (`h-11 w-11`, press scale, focus ring).
- Report reasons are `min-h-11` radio buttons with focus rings: `src/components/feed/ReportSheet.tsx:84-100`.
- Sign-in segmented control is `min-h-11` with `aria-pressed`: `src/components/mobile/PhoneProfileAuth.tsx:184-199`.
- Feed tabs are `min-h-11` with a comment explaining why: `src/components/mobile/PhoneFeedTabs.tsx:93-98`.
- Post overflow menu rows are `min-h-11`: `src/components/mobile/PhoneFeedPostCard.tsx:842-860`.
- Filter sheet "Clear all" is `min-h-11` with an orange ring: `src/components/mobile/PhoneFilterSheet.tsx:716-724`.
- Comment Reply and Report buttons are `min-h-11` with focus rings: `src/components/feed/CommentsScreen.tsx:415-426`.
- Post vote arrows are `h-11 w-7`, at Apple's 28 minimum, with `aria-pressed`: `src/components/feed/PostActions.tsx:305`.
- Press state with reduced-motion handling: `src/app/globals.css:2077-2107`.
- Camera close is `h-11 w-11`: `src/components/post/CameraCapture.tsx:955`.

## Needs a real iPhone

- Whether `:active` styles paint inside the WKWebView with tap highlight off (TGT-03).
- Mis-taps between the 24px up and down comment arrows with a thumb (TGT-01).
- Grab area and scroll conflict on the percent slider (TGT-06).
- VoiceOver and Dynamic Type behaviour of these controls; not testable from code.
