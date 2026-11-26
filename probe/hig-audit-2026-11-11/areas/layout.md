# Layout, safe areas and the status bar

12 confirmed (0 critical, 1 major, 3 minor, 8 polish) · 0 deliberate · 0 refuted, of 12 (11 reported, 1 added by reviewer).

No finding here is likely to cause an App Review rejection. The one that matters most is the status bar style, and it can only be settled on a real phone.

## Findings

### LAY-01 · major · Nothing sets the status bar style, so the clock can be unreadable in Dark Mode and over the dark map
- **Where:** `ios/App/App/Info.plist:52` (UIViewControllerBasedStatusBarAppearance true, no UIStatusBarStyle, no UIUserInterfaceStyle). Also `ios/App/App/AppDelegate.swift` (no status bar code), `capacitor.config.ts` (no ios options), `src/app/layout.tsx:60`, `src/components/mobile/PhoneFeedScreen.tsx:364`, `src/components/post/CameraCapture.tsx:949`, `src/components/AvatarCropper.tsx:250`
- **Screens:** Every cream screen if the phone is in Dark Mode. The feed map tab, the camera step, the avatar cropper and the free-food ticket if the phone is in Light Mode.
- **HIG:** Status bars. The bar is transparent by default, so what sits behind it can make the time and battery hard to read. Keep it legible; Apple points to a scroll edge effect (a blur) behind it. The page does not set out light and dark rules; that part is general iOS behaviour.
- **What happens:** Capacitor's `CAPBridgeViewController` defaults `statusBarStyle` to `.default` (node_modules/@capacitor/ios, line 14). `.default` follows the phone's light or dark setting, not the page. The web UI has 0 `prefers-color-scheme` rules and `phone.css` has none, so the page is always cream `#F7F4EC` (or dark on the map and camera). Dark Mode phone: white clock on cream. Light Mode phone: black clock on the dark map `#191c22`. The layout.tsx comment that calls `black-translucent` "deliberate" is about the home-screen web app mode. It does not reach the Capacitor shell, and the theme-color swap at PhoneFeedScreen.tsx:364 is the same kind of web-only mechanism. No rule in AGENTS.md or DESIGN.md covers this. Inferred from code, not seen on a device.
- **Fix:** Add `UIUserInterfaceStyle = Light` to Info.plist. That makes the status bar dark text on cream everywhere and matches the cream-only design. For the map and camera, either add `@capacitor/status-bar` and set the style per screen, or paint a cream cap under the clock on those screens.
- **App Review risk:** low (not a rejection reason by itself; it looks careless in review on a Dark Mode test phone)
- **Needs device:** yes. Check the clock on the feed, map tab, camera and cropper in Light and Dark Mode.

### LAY-02 · minor · Sheet, panel and modal dialogs skip the home-indicator inset
- **Where:** `src/components/feed/Dialog.tsx:409-414` (only `variant === "screen"` gets `pb-[max(0.75rem,env(safe-area-inset-bottom))]`). Also `src/components/PlateDetailSheet.tsx:894` (variant "sheet" with the comment Composer as footer), `src/components/feed/ReportSheet.tsx:84`, `src/components/RankLadderModal.tsx:23`, `src/components/post/PhotoPrivacyNotice.tsx:81`
- **Screens:** Restaurant plate detail sheet (comment box), report sheet, rank ladder, points info, first-post photo notice.
- **HIG:** Layout. Respect the safe areas so system UI such as the home indicator does not cover controls.
- **What happens:** The sheet panel is bottom-aligned (`items-end`, `PANEL_CLASS` sheet/panel/modal have no inset). The non-screen footer is `px-5 py-3`, so the comment field sits 12px above the screen edge. The home indicator zone is about 34px on a notched iPhone. The scroller at Dialog.tsx:421 has no bottom padding, so ReportSheet's Submit button (16px of padding) and RankLadder content end near the edge.
- **Fix:** Add `pb-[max(0.75rem,env(safe-area-inset-bottom))]` to the non-screen footer, and `pb-[env(safe-area-inset-bottom)]` on the body scroller for sheet and panel (DishSheet.tsx:37 already does this).
- **App Review risk:** low
- **Needs device:** yes. Open the plate sheet and the report sheet on a notched phone.

### LAY-03 · minor · No keyboard handling: composer Next/Post bar hides under the keyboard
- **Where:** `src/app/m/post/page.tsx:781` (action bar `fixed inset-x-0 bottom-0`, `paddingBottom: var(--phone-nav-space)`). Also `src/components/feed/Dialog.tsx:409`, `src/components/mobile/PhoneSignUpSheet.tsx:187`
- **Screens:** Post composer (caption and comment steps), comments screen, plate detail sheet, sign-up sheet.
- **HIG:** Layout / general principle: keep primary actions reachable. The Layout page does not cover keyboards, so this rests on a general principle.
- **What happens:** Grep finds 0 uses of `visualViewport`, `interactive-widget` or a Keyboard plugin in src or package.json. The composer bar sits 90px (124px on a notched phone) above the bottom, inside a keyboard of about 290pt, so Next and Post are hidden while typing. The comments footer and plate-sheet Composer are pinned to a `h-dvh` / `dvh` box; `dvh` does not shrink for the keyboard on iOS. The shell is `overflow: clip` (phone.css:233), so how WKWebView scrolls the field into view is not clear from code.
- **Fix:** Add a small `visualViewport` listener that sets a `--kb-inset` variable, hide the nav and the composer bar's nav padding while a field has focus, and pad the dialog panel by `--kb-inset`. Or add `@capacitor/keyboard` with `resize: 'body'`.
- **App Review risk:** low
- **Needs device:** yes. Type in the caption, a comment and the sign-up sheet; see where the bars and fields land.

### LAY-04 · minor · Content scrolls under the clock with no scrim on most screens
- **Where:** `src/app/m/phone.css:303` (`padding-top: env(safe-area-inset-top)` on the scroller). Cap exists only at `src/components/mobile/PhoneStickyBar.tsx:451`.
- **Screens:** Restaurant detail, user profile, account, friends, settings.
- **HIG:** Status bars. Content behind the bar can make it hard to read and can look tappable; put a scroll edge effect or blur behind it.
- **What happens:** The inset is padding inside the scroller, so it scrolls away. After 1 screen of scroll, cards and text pass directly under the clock and battery. PhoneStickyBar paints a cap (`z-[35]`, `bg-background`) only on Discover and the feed.
- **Fix:** One fixed cap in PhoneShell: `fixed top-0 inset-x-0 h-[env(safe-area-inset-top)] bg-background/90 backdrop-blur-sm`, hidden on the map and the hero. Then PhoneStickyBar can drop its own copy.
- **App Review risk:** none
- **Needs device:** yes. Scroll a restaurant page and look at the clock.

### LAY-05 · polish · Composer stacks an action bar on top of the tab bar
- **Where:** `src/app/m/post/page.tsx:781`, form padding at `:442`
- **Screens:** Post composer.
- **HIG:** General principle (the Layout page has no explicit rule on stacked bars): give content the room it needs.
- **What happens:** The bar reserves `--phone-nav-space` (90px on an SE, 124px notched) plus a row of about 60px, with the nav visible below. About 150px of a 667px screen (22%) is chrome during a multi-step form. The code comment at line 756 says the /m layout cannot be edited to hide the nav for one route.
- **Fix:** Let PhoneNav hide itself on `/m/post`, or move Next/Post into the nav's slot. That returns about 90px.
- **App Review risk:** none
- **Needs device:** no

### LAY-06 · polish · Filter and taste sheets reserve the full tab-bar height under a sheet that covers the tab bar
- **Where:** `src/components/mobile/PhoneFilterSheet.tsx:707`, `src/components/mobile/PhoneTasteSection.tsx:92`
- **Screens:** Discover filter sheet, taste sheet.
- **HIG:** Layout. Use the safe area; do not reserve space for UI that is not there.
- **What happens:** The sheet is `z-[60]`, above the nav at `z-40`, yet its footer uses `pb-[var(--phone-nav-space)]` (90px, or 124px notched). PhoneSignUpSheet.tsx:187 uses `max(1rem, env(safe-area-inset-bottom))` instead. On an SE the 86dvh sheet is about 573px and about 90px of it is empty. The comment at PhoneFilterSheet.tsx:587-594 records this as a fix for a stacking problem, so changing it needs a check that the buttons stay clear of the nav.
- **Fix:** Use `pb-[max(1rem,env(safe-area-inset-bottom))]` and make sure the sheet's stacking context stays above the nav.
- **App Review risk:** none
- **Needs device:** yes (confirm the sheet fully covers the nav on all three nav variants)

### LAY-07 · polish · Side margins differ: 20px in dialogs, 16px on screens and phone sheets
- **Where:** `src/components/feed/Dialog.tsx:343` and `:409` (px-5); ReportSheet.tsx:84 and RankLadderModal.tsx:23 (px-5). Screens and phone sheets use px-4 (PhoneSettingsScreen.tsx:55, PhoneSignUpSheet.tsx:183, post composer).
- **Screens:** Comments screen, report, ladder and points sheets, compared with Discover, feed and composer.
- **HIG:** Layout. Align elements from screen to screen so people can scan.
- **What happens:** The comments screen opens from the feed (16px gutter) and its content is 20px in.
- **Fix:** Pick 16px as the phone gutter and change Dialog's px-5 to px-4.
- **App Review risk:** none
- **Needs device:** no

### LAY-08 · polish · Map photo preview has no safe-area padding and no close button
- **Where:** `src/components/RestaurantMap.tsx:3076` (`fixed inset-0 ... p-4`, image `max-h-full`)
- **Screens:** Map photo preview.
- **HIG:** Layout. Keep content clear of the Dynamic Island and home indicator. Closing should be easy to find (general principle).
- **What happens:** A tall photo fills to 16px from each edge, so its top can run under the Dynamic Island (inset about 59px) and its bottom under the home indicator. Dismissal is tap anywhere (`aria-label` "tap to close"); there is no button.
- **Fix:** `pt-[max(1rem,env(safe-area-inset-top))]` and `pb-[max(1rem,env(safe-area-inset-bottom))]`, plus a 44px close button inside the inset.
- **App Review risk:** none
- **Needs device:** yes

### LAY-09 · polish · Coach tour caption sits at `bottom-28` (112px), lower than the nav on notched phones
- **Where:** `src/components/tour/CoachTour.tsx:665`; Skip button at `:731` (`bottom-36`, already moved up once).
- **Screens:** First-run coach tour (steps with no target).
- **HIG:** Layout. Place overlays relative to the safe area, not a fixed number.
- **What happens:** The nav reserves 90px plus the 34px inset = 124px, so the caption overlaps the top 12px of the bar on a notched phone. On a phone with no notch it clears by 22px. The file already has `NAV_RESERVE = 96` (line 209).
- **Fix:** `bottom: calc(var(--phone-nav-space) + 1rem)`.
- **App Review risk:** none
- **Needs device:** yes

### LAY-10 · polish · A long unbroken Discover search term overflows the heading sideways
- **Where:** `src/components/mobile/PhoneDiscoverScreen.tsx:236` (heading built at `:215` from `filters.q`). Also `src/components/mobile/PhoneDetailHero.tsx:145` (restaurant name).
- **Screens:** Discover results; restaurant header with a very long single-word name.
- **HIG:** Layout. Text should not be cropped or pushed off screen (the page states this loosely).
- **What happens:** The h1 is 26px with no `break-words`. A single 25+ character word is wider than 343px at 375px width. The scroller is `overflow-y: auto` (phone.css:248), so overflow-x computes to auto and the screen can pan sideways. Only one `break-words` exists in src/components/mobile and src/app/m (RivalCallout.tsx:44). No length cap on `q` was found. Rare input, so polish.
- **Fix:** Add `break-words` to both h1s, or a global `h1, h2 { overflow-wrap: anywhere }`.
- **App Review risk:** none
- **Needs device:** no

### LAY-11 · polish · Top inset is spent twice on Settings, the legal pages and the detail hero back button (added by reviewer)
- **Where:** `src/components/mobile/PhoneSettingsScreen.tsx:55`, `src/components/mobile/PhoneLegalFrame.tsx:34`, `src/components/mobile/PhoneDetailHero.tsx:111`
- **Screens:** Account settings, privacy, terms, restaurant detail.
- **HIG:** Layout. Respect the safe area, and no more.
- **What happens:** The `.pm-phone-content` scroller already pads the top by the full inset (phone.css:303, about 59px on a Dynamic Island phone). These three add `max(0.75rem, env(safe-area-inset-top))` again. The Back button sits about 59px further down than needed, so about 118px of space above it. Their comments pre-date the scroller fix. I found no negative margin cancelling it.
- **Fix:** Change those to a plain `pt-3` (and `top-3` for the hero button).
- **App Review risk:** none
- **Needs device:** yes (measure the gap above Back)

### LAY-12 · polish · Info.plist lists four iPad orientations for an iPhone-only target
- **Where:** `ios/App/App/Info.plist:45` (`UISupportedInterfaceOrientations~ipad`); `project.pbxproj` has `TARGETED_DEVICE_FAMILY = 1` (lines 367, 388).
- **Screens:** None on iPhone.
- **HIG:** General principle: declared orientation support should match the UI.
- **What happens:** The iPad key is unused for an iPhone-only target. It is a Capacitor template leftover.
- **Fix:** Delete the `~ipad` array, or reduce it to Portrait.
- **App Review risk:** low
- **Needs device:** no

## Deliberate deviations
None found in AGENTS.md or DESIGN.md for this area. `appleWebApp.statusBarStyle: "black-translucent"` (layout.tsx:60) is a written decision in a code comment, but it covers the home-screen web app mode and does not decide the Capacitor status bar (see LAY-01).

## Refuted
None. All 11 reported findings held up on the code; one was re-rated (the Discover heading overflow, minor to polish, because it needs an unusual search term).

## Already right
- `src/components/mobile/PhoneNav.tsx:152`, `:249`, `:323` pad all three nav variants for the home indicator; `src/app/m/phone.css:287` publishes `--phone-nav-space`.
- `src/app/m/phone.css:303` pads the scroller by the top inset so headers clear the Dynamic Island.
- `src/app/layout.tsx:93` sets `viewportFit: "cover"` and leaves pinch zoom unlocked (recorded in the comment above it).
- `src/components/feed/Dialog.tsx:353` and `:411` pad the screen variant for the notch and the home indicator.
- `src/components/post/CameraCapture.tsx:926`, `:949`, `:971` use safe-area insets and a dvh-based viewfinder.
- `src/components/AvatarCropper.tsx:250` and `:337` pad top and bottom.
- `src/components/mobile/freefood/TicketPopup.tsx:79` pads the top.
- `src/components/mobile/PhoneFeedScreen.tsx:451` and `:618` clear the island with `max()` and the top inset.
- `src/components/mobile/PhoneStickyBar.tsx:451` paints a status-bar-height cap while stuck.
- `public/offline.html:56` pads with `max(24px, env(safe-area-*))`.
- `src/app/m/phone.css:209-233` makes the shell `100dvh` with `overflow: clip` and `overscroll-behavior: none` on the scroller (phone.css:248).

## Needs a real iPhone
- Status bar text colour on cream, map, camera and cropper screens, in Light and Dark Mode (LAY-01).
- Where the keyboard leaves the composer bar, comments footer, plate-sheet comment box and sign-up sheet (LAY-03).
- Home-indicator and Dynamic Island clearance on iPhone 15 Pro, 16 Pro Max and SE 3 in the TestFlight build (LAY-02, LAY-08, LAY-09).
- Whether `(display-mode: standalone)` in phone.css:137-167 matches inside the Capacitor WKWebView. If it does, html and body become `100vh` with `touch-action: none`; test for stuck scrolling.
- Whether pull-to-refresh and `overscroll-behavior: none` feel right with the native rubber band removed.
- The double top inset on Settings, legal pages and the hero back button (LAY-11).
