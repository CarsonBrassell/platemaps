# Colour, contrast and Dark Mode

9 confirmed (0 critical, 2 major, 5 minor, 2 polish) · 0 deliberate · 2 refuted, of 11 reported.

All contrast numbers below were recomputed by the reviewer from the hex values in globals.css and DESIGN.md. Apple's accessibility page gives the floors used: 4.5:1 for text up to 17 pt, 3:1 for 18 pt text or bold text. The "3:1 for icons" floor is a general WCAG-style principle, not a number Apple states on the pages fetched.

## Findings

### COL-01 · major · Dark Mode is neither supported nor cleanly opted out
- **Where:** `ios/App/App/Info.plist:51` (no `UIUserInterfaceStyle` key anywhere in the file); `src/app/layout.tsx:93-96` (viewport has no `colorScheme`); `src/app/globals.css:3` (no `color-scheme`); `capacitor.config.ts` (no `ios` block, so no `backgroundColor`). A repo-wide search of `src` for `prefers-color-scheme` and `color-scheme` returns 0 hits.
- **Screens:** Every screen, for anyone whose iPhone is in Dark Mode.
- **HIG:** Dark Mode page. Apps should look right in Light, Dark and Auto. Dark-only is for rare cases. Text must reach 4.5:1 in each appearance. The page does not discuss a light-only app, so the fix below is a hedge, not an Apple-endorsed pattern.
- **What happens:** The page is cream (#F7F4EC) in both appearances and has no dark theme. The web view runs edge to edge under the status bar (viewportFit cover, no contentInset set). Capacitor here has no StatusBar plugin, so the glyph colour follows the system appearance. In Dark Mode that means white glyphs, and white on cream is 1.10:1. The clock and battery are nearly invisible on every cream screen. Other system pieces (keyboard, overscroll area behind the page) may also theme dark. Neither AGENTS.md nor DESIGN.md records a light-only decision, so this is an omission.
- **Fix:** Smallest change that makes the light-only choice explicit: add `UIUserInterfaceStyle` = `Light` to Info.plist, add `color-scheme: light` on `:root`, and set `ios.backgroundColor` to `#F7F4EC` in capacitor.config.ts. Add one line to DESIGN.md recording the decision. A real dark theme is a separate, larger project.
- **App Review risk:** low. Apple does not reject for missing Dark Mode, but an unreadable status bar is the kind of thing a reviewer notices.
- **Needs device:** yes. Put the phone in Dark Mode and check the clock on feed, keyboard colour, and what shows when you pull past the top of the page.

### COL-02 · major · Status bar glyphs cannot follow the page: dark map ground under the clock
- **Where:** `src/app/m/phone.css:90-93` (`html.pm-lock-scroll, html.pm-lock-scroll body { background:#191c22 }` below 480px); `src/components/mobile/PhoneFeedScreen.tsx:351-372` (theme-color swap), `:439` (65% black top scrim); `src/app/layout.tsx:49-60` (`black-translucent` comment).
- **Screens:** Feed with the Discover/Friends map up, in Light Mode.
- **HIG:** Accessibility and color pages. Foreground items need enough contrast against what sits behind them. System chrome such as the status bar must stay legible over the app's own backgrounds.
- **What happens:** While the map is up, the strip under the clock is near-black (#191c22). The Capacitor project has only core, ios and push-notifications, so nothing changes the glyph style. In Light Mode the system default is dark glyphs, which are about 1.23:1 on that ground. This is the mirror of COL-01: Light Mode breaks the map, Dark Mode breaks the cream screens. The `black-translucent` setting and the theme-color swap only affect Safari home-screen web apps, not the WKWebView shell. The comments in layout.tsx and PhoneFeedScreen.tsx say the opposite and are misleading.
- **Fix:** Add `@capacitor/status-bar` and call `setStyle` when the map mounts and unmounts (light glyphs over the map, default elsewhere). Correct the two comments.
- **App Review risk:** low.
- **Needs device:** yes. Open the feed map in Light Mode and read the clock.

### COL-03 · minor · Resting vote arrows and icon buttons are zinc-400 (2.4 to 2.65:1)
- **Where:** `src/components/feed/PostActions.tsx:308`; `src/components/feed/CommentsScreen.tsx:531`; `src/components/feed/ShortThread.tsx:657`; `src/components/PlateDetailSheet.tsx:603`; `src/components/mobile/PhoneFeedPostCard.tsx:806`; `src/components/feed/FoodPostCard.tsx:707`.
- **Screens:** Feed cards, comments, thread, plate sheet.
- **HIG:** Color and accessibility. Interactive glyphs should be clearly visible; the 3:1 figure is a general principle here.
- **What happens:** `text-zinc-400` is #A79E8D: 2.65:1 on white and 2.41:1 on cream. The arrow shape (outline at rest, filled when pressed) is a recorded rule (AGENTS.md line 21), so the shape stays. The rest colour is not covered by that rule, and DESIGN.md:64 limits zinc-400 to decorative, large uses. The state is also carried by shape and `aria-pressed`, so this is a findability issue, not a state-by-colour-alone one.
- **Fix:** Rest colour `text-zinc-500` on white cards (4.70:1) and `text-pm-grey-text` on cream. Keep orange for the active state.
- **App Review risk:** low.
- **Needs device:** no.

### COL-04 · minor · Light labels on the --pm-orange fill are under 4.5:1 (white 4.26:1, cream 3.87:1)
- **Where:** `src/components/mobile/freefood/TicketCard.tsx:134`, `TicketPopup.tsx:122`, `InviteFriends.tsx:89` (white, 12 to 14px semibold mono); `src/app/m/post/page.tsx:634` (cream, selected chip); `src/components/post/CameraCapture.tsx:640` (cream, 14px medium); `src/components/feed/ReportSheet.tsx:135` (cream, 14px medium); `public/offline.html:104-105` (white, 16px 600). A grep finds about 63 `bg-pm-orange` buttons with white or cream text in src/app/m and src/components, so the pattern is widespread.
- **Screens:** Primary action pills across the phone app, free-food tickets, composer chips, camera permission, report sheet, offline page.
- **HIG:** Accessibility page. Text up to 17 pt needs 4.5:1; bold text of any size needs 3:1.
- **What happens:** White on #C9591F is 4.26:1. Semibold probably counts as bold, so those pass the 3:1 bold floor. Cream on #C9591F is 3.87:1 at 14px weight 500, which is not bold, so those fail. The orange primary pill is a recorded project choice; only the label colour and weight are in question. DESIGN.md:67 itself calls the fill "large text only".
- **Fix:** Use white (not cream) on orange fills, and make small labels semibold. Or put small-label buttons on `--pm-orange-text` (#A8481A, 5.82:1 with white).
- **App Review risk:** low. The finder said medium; contrast alone is not a rejection reason.
- **Needs device:** no.
- **Note:** The cited `PhoneFeedMapPanel.tsx:810` has no cream-on-orange label; that location was not found and is dropped.

### COL-05 · minor · Placeholders are zinc-500 on a tinted fill (about 4.0 to 4.2:1)
- **Where:** `src/app/m/post/page.tsx:61`; `src/components/account/NoticeCard.tsx:25`; `src/components/feed/ReportSheet.tsx:121`; `src/components/post/DishPicker.tsx:168`; `src/components/mobile/PhoneProfileAuth.tsx:29`; `src/components/mobile/PhoneFilterSheet.tsx:329`; `src/components/post/RestaurantPicker.tsx:174`.
- **Screens:** Composer note, sign-in and sign-up, report sheet, dish and restaurant pickers, filter-sheet address field.
- **HIG:** Accessibility page. Placeholder text is text; 4.5:1 for 16px type.
- **What happens:** zinc-500 (#7E7261) on `bg-pm-grey-tint/60` is 4.02:1 over cream and 4.17:1 over a white card. The filter field (tint/70) is 3.98 to 4.09:1. AGENTS.md:19 says zinc-500 is for plain white only.
- **Fix:** `placeholder:text-pm-grey-text` (#665C4E, 5.36:1 on the tint). One shared class would cover most sites.
- **App Review risk:** none.
- **Needs device:** no.

### COL-06 · minor · zinc-400 used for readable small text
- **Where:** `src/components/mobile/PhoneRestaurantCardGrid.tsx:184` (9px, 2.65:1 on white); `src/components/mobile/PhoneTasteSection.tsx:248` (12px); `src/app/m/post/page.tsx:566`, `:606` ("(optional)"), `:632` (best-dish chip); `src/components/feed/LeaderboardRow.tsx:31` (10px).
- **Screens:** Restaurant grid, taste section, composer labels, leaderboard.
- **HIG:** Accessibility page. 4.5:1 for text under 18 pt.
- **What happens:** zinc-400 is 2.65:1 on white and 2.41:1 on cream. Part of this is a documented choice: DESIGN.md:326 says "No plates rated yet" sits in 11px zinc-400. That line contradicts DESIGN.md:64 (zinc-400 is decorative only), and the code at line 184 is 9px, smaller than the doc. The disabled chip at post/page.tsx:632 is exempt from the ratio rule (2.31:1 on its tint, but disabled).
- **Fix:** zinc-500 on white, `pm-grey-text` on cream. Raise the 9px label to at least 11px. Fix the DESIGN.md:326 line so the two rules agree.
- **App Review risk:** none.
- **Needs device:** no.

### COL-07 · minor · Low-opacity white text on the camera and cropper screens
- **Where:** `src/components/post/CameraCapture.tsx:663` (10px `white/40`, failure message); `:582` (12px `white/45`); `src/components/AvatarCropper.tsx:337` (12px `white/45`). The cropper is at `src/components/AvatarCropper.tsx`, not `src/components/post/`.
- **Screens:** Camera capture, avatar cropper.
- **HIG:** Accessibility page. 4.5:1 for small text, also on dark grounds.
- **What happens:** Over solid charcoal, white/40 is 3.74:1 and white/45 is 4.36:1. The 10px camera failure message is the one that matters, since it tells a person why the camera did not work. The `white/30` icons at :581 are decorative (2.71:1) and fine. The finder's ratios were estimates; these are computed against #232019.
- **Fix:** Use `text-white/70` or higher for the failure message and the helper lines; raise 10px to at least 11px.
- **App Review risk:** none.
- **Needs device:** no. Over live video the ratio would differ, but the text sits on the solid lower half.

### COL-08 · polish · No Increase Contrast handling; blurred pills have no opaque fallback
- **Where:** `src/components/mobile/PhoneMapSearch.tsx:79` and `src/components/mobile/PhoneFeedMapPanel.tsx:473` (`bg-black/45 backdrop-blur-md`); `src/components/mobile/PhoneNav.tsx:249` (95% cream, blur-sm); `src/components/feed/Dialog.tsx:315,353`.
- **Screens:** Map search and source-switch pills, tab bar, dialogs.
- **HIG:** Color page: custom colours should offer a higher-contrast variant when Increase Contrast is on. Materials page: accessibility settings can reduce transparency or raise contrast. Dark Mode page: test legibility with both settings.
- **What happens:** Zero hits for `prefers-contrast`, `prefers-reduced-transparency` or `forced-colors` in src. The map pills are the most exposed because 45% black sits over a moving map. Apart from them, the translucency is mild (tab bar 95%, dialog scrim 45%). Whether WebKit exposes `prefers-reduced-transparency` was not confirmed; `prefers-contrast: more` is the safer hook.
- **Fix:** Add a `@media (prefers-contrast: more)` block that makes the two map pills solid (for example `#191c22`) and darkens muted text.
- **App Review risk:** none.
- **Needs device:** yes. Turn on Increase Contrast and Reduce Transparency and look at the map pills.

### COL-09 · polish · Contrast comment in globals.css gives only the white-ground figure
- **Where:** `src/app/globals.css:7` (and the same "5.8:1" in `DESIGN.md:68`).
- **Screens:** Code comment only.
- **HIG:** General principle: documented ratios should match the ground the colour sits on.
- **What happens:** `--pm-orange-text` is 5.82:1 on white but 5.30:1 on the cream ground. It still passes, so nothing breaks, but the next contrast check could use the wrong number.
- **Fix:** Edit both lines to say "5.8 on white, 5.3 on cream".
- **App Review risk:** none.
- **Needs device:** no.

## Deliberate deviations
None. The cream ground, orange accent and dark neo-noir map are recorded rules, but no finding here is covered by one. The outline-at-rest vote arrow shape (AGENTS.md:21) is deliberate; only its resting colour is flagged in COL-03.

## Refuted
- R1 "Inactive tab-bar icons are zinc-400 on cream with no label" (PhoneNav.tsx:191): that is the `pill` variant, reached only with `?nav=pill`. The default is `arc` (PhoneNav.tsx:42, "Chosen 12 Aug 2026"), whose items use `text-pm-grey-text` for inactive, `text-pm-orange-text` for current, and print a label on every item. The pill and strip variants are marked as kept only until cut.
- R2 "zinc-500 muted text on tone, tint and cream grounds is below 4.5:1" (PhoneFilterSheet.tsx:661 and others): the filter sheet is `bg-white` (PhoneFilterSheet.tsx:609), where zinc-500 is 4.70:1; line 661 is an `aria-disabled` chip. `src/app/u/[id]/page.tsx` is a desktop route, out of scope. The composer legends at post/page.tsx:62 sit partly inside a white card (:518), so the claim is unproven. The "108 unchecked uses" is not evidence.

## Already right
- Colour tokens and the two orange voices: `src/app/globals.css:5-17`; pairs documented in `DESIGN.md:63-68`.
- Arc tab bar (the default) uses `pm-grey-text` / `pm-orange-text` and labels every tab: `src/components/mobile/PhoneNav.tsx:284-330`.
- Muted-on-cream text uses `pm-grey-text` (5.96:1): `src/components/OpenStatePill.tsx:48`, `src/components/feed/NearbyChip.tsx:55`.
- Vote state is carried by shape and `aria-pressed`, not colour alone: `src/components/feed/PostActions.tsx:295-320`.
- Leaderboard rank change has a glyph and an aria-label: `src/components/feed/LeaderboardRow.tsx:36-47`.
- Form errors have text, `role="alert"` and a ring: `src/components/mobile/PhoneProfileAuth.tsx:46,331`.
- Map chrome is high contrast on the night ground: `src/components/mobile/PhoneFeedMapPanel.tsx:488`.
- Pinch zoom is not locked and the theme colour is set: `src/app/layout.tsx:89-95`.
- Orange focus rings on the inputs and buttons sampled (for example `src/app/m/post/page.tsx:61`).
- Filter sheet muted labels on white pass: `src/components/mobile/PhoneFilterSheet.tsx:273,471,648` (zinc-500 on white, 4.70:1).

## Needs a real iPhone
- Status bar glyph colour in Light and Dark Mode, on cream screens and over the feed map (COL-01, COL-02).
- Keyboard appearance, select and date pickers, and alert colours in Dark Mode.
- What shows behind the page during overscroll and before first paint, with no `backgroundColor` configured.
- Increase Contrast and Reduce Transparency on the map pills, tab bar and dialogs (COL-08).
- Camera screen text over live video frames.
- VoiceOver wording for colour-coded states.
