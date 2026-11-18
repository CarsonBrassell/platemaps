# PlateMaps iPhone app: Apple HIG audit

2026-11-11. Read-only: no code was changed.

## Result

- **160 confirmed findings: 0 critical, 13 major, 87 minor, 60 polish.**
- Some are one problem seen by two areas. Merged, that is **134 distinct problems: 10 major, 75 minor, 49 polish.**
- 180 findings were reviewed. 15 were refuted, 3 were dropped as repeats and 2 are deliberate design choices.
- **App Review risk:** WEB-01 high, PRV-01 medium, WEB-07 medium. Nothing else is rated above low.
- The code that was audited is six days older than the live app. Every finding was re-checked against the live branch and all 160 still apply. See [Which code this is](#which-code-this-is).
- **Follow-up pass: 8 more confirmed findings** (0 major, 4 minor, 4 polish), from the phone code that is new or changed on the live branch. 3 of them are in a row everyone sees; the other 5 are limited to named or admin accounts today. They are listed apart and are not in the counts above. See [Follow-up pass on the live branch](#follow-up-pass-on-the-live-branch).
- Not covered: screens that need a login were not measured in a browser, the live site was checked in code only, and nothing ran on a real iPhone. See [Not covered](#not-covered).

## Which code this is

- The audit read the working tree on this PC: `main` at `eb2db87` (2026-11-05) plus the uncommitted edits that were in it. Line numbers in this report refer to that tree.
- The iPhone app loads platemaps.com, which is `origin/main` at `c7d1254` (2026-11-11). That is 35 commits newer. Nothing was pulled or merged for this audit.
- Every confirmed finding was compared with the live branch. 128 are in files that are identical there. 30 are in files that changed somewhere else: the cited code is unchanged, and the live line number is given where it moved.
- The other 2 were checked by hand. MOT-08 cites `package.json` as a whole, and the live branch only adds one script line to it. WEB-01 cites a file that `npx cap sync ios` generates and git does not track; its source, `capacitor.config.ts`, is identical there.
- **All 160 still apply to the live app.** The 12 fix-first items were also re-read on the live branch. See their Live branch lines.
- The phone code that is new or changed on the live branch got its own pass. See [Follow-up pass on the live branch](#follow-up-pass-on-the-live-branch).

## What the majors are about

1. **The iOS project on this PC is missing the build 8 fix** (WEB-01). The synced config has no `allowNavigation`. An archive built from a copy like this sends the sign-in redirect to Safari again.
2. **Dark Mode and the status bar** (COL-01, COL-02). The app is light-only but never tells iOS. On a Dark Mode phone the clock is white on cream. In Light Mode it is dark on the dark map.
3. **Small text, and no Dynamic Type** (TYP-01, TYP-02). The iOS text size setting changes almost nothing. Discover cards use 9 and 10px details.
4. **Small touch targets** (RUN-03, TGT-01, MED-01). Feed card links are 14 to 16px tall. Comment vote arrows are 24px wide and the collapse toggle is 20×24. Map zoom and locate buttons are 29px.
5. **Two modal problems** (MOD-01, MOD-02). Leaving the composer throws the post away with no warning. The sign-up sheet can open on top of the free-food ticket.

## Fix first

12 items, in the order the audit ranked them. PRV-01 and WEB-07 are minor findings; they are listed because of App Review. Where lines are from the audited tree; the Live branch line gives the live ones.

### 1. WEB-01 · major · Synced Capacitor config lacks allowNavigation (App Review risk high)

- **Where:** `ios/App/App/capacitor.config.json:5`, `ios/App/App/public/offline.html:169`
- **Fix:** Run npx cap sync ios before every archive. Confirm the file contains "allowNavigation": ["platemaps.com"]. Diff the two offline.html copies. Add the check to the release steps, and test the TestFlight build cold and signed out. Without it /m/account can open in Safari and show offline.html, the failure that got build 8 rejected under 2.1(a).
- **Checked:** Confirmed on this PC. `ios/App/App/capacitor.config.json` (dated 2026-09-20) has no `allowNavigation`; `capacitor.config.ts:69` has it. The two `offline.html` copies differ at line 169 (`/m` against `/m/feed`). Both stale files are gitignored output of `npx cap sync ios`, so the copy that counts is the one on the Mac that builds the archive. Check it there.
- **Live branch:** Still applies. `capacitor.config.ts` and `public/offline.html` are identical there. The stale synced copies are not tracked by git, so the live branch cannot show them. Check them on the build Mac.

### 2. COL-01 · major · No light-only declaration, so Dark Mode phones get a white clock on cream (1.10:1). Also covers LAY-01 and RUN-14.

- **Where:** `ios/App/App/Info.plist:51`, `src/app/layout.tsx:93`, `src/app/globals.css:3`, `capacitor.config.ts (no ios block)`
- **Fix:** Add UIUserInterfaceStyle=Light, add color-scheme: light on :root, set ios.backgroundColor to #F7F4EC, and record the decision in DESIGN.md. Apple's Dark Mode page does not discuss light-only apps, so this is a hedge.
- **Checked:** Confirmed. No `UIUserInterfaceStyle` in `Info.plist`, no `color-scheme` in `globals.css`, `phone.css` or `layout.tsx`, and no `ios.backgroundColor` in `capacitor.config.ts`.
- **Live branch:** Still true. `Info.plist`, `globals.css`, `phone.css` and `capacitor.config.ts` are identical there. `layout.tsx` changed only its analytics import.
- **Also reported as:** LAY-01, RUN-14

### 3. COL-02 · major · Status bar glyphs are not set over the dark map (about 1.23:1 in Light Mode)

- **Where:** `src/app/m/phone.css:90`, `src/components/mobile/PhoneFeedScreen.tsx:351`, `src/app/layout.tsx:49`
- **Fix:** Add @capacitor/status-bar and call setStyle when the map mounts and unmounts (light glyphs over the map; same for camera and cropper). Correct the misleading black-translucent and theme-color comments, which only affect Safari home-screen apps.
- **Checked:** Confirmed. `@capacitor/status-bar` is not in `package.json` and nothing in `src` sets a status bar style.
- **Live branch:** Still true. No status bar plugin or call was added. `statusBarStyle: "black-translucent"` is at `layout.tsx:62` there.

### 4. MOD-02 · major · Sign-up sheet opens on top of the auto-opened free-food ticket on first launch (shots/ov-feed.jpg)

- **Where:** `src/components/mobile/PhoneSignUpSheet.tsx:75`, `src/components/mobile/freefood/TicketButton.tsx:38`
- **Fix:** On each timer fire, wait while any [role="dialog"] is in the document and re-arm.
- **Checked:** Confirmed by the saved screenshot [shots/ov-feed.jpg](shots/ov-feed.jpg): the Join PlateMaps sheet sits on top of the free-slice ticket.
- **Live branch:** Still true. Both files are identical there.
- **Also reported as:** RUN-12

### 5. MED-01 · major · Map zoom and locate buttons are 29px; locate is the only way to recentre

- **Where:** `src/app/globals.css:479`, `src/app/globals.css:517`
- **Fix:** Give .map-fun-tiles .maplibregl-ctrl-group button and .map-locate-btn width: 44px; height: 44px. Check the stack against the search capsule on a device.
- **Checked:** Confirmed. MapLibre's stylesheet sets the control buttons to 29px by 29px, and neither `globals.css` nor `phone.css` overrides it.
- **Live branch:** Still true. `globals.css` is identical there. `package.json` gained one script line and no dependency changed.

### 6. TYP-02 · major · 51 text nodes on Discover are under 11px (price, distance, score, 9px chips). The no-rating note is zinc-400 at 2.65:1. Also covers RUN-02.

- **Where:** `src/components/mobile/PhoneRestaurantCardGrid.tsx:132,159,184,199`, `PhoneRestaurantCardTiny.tsx:40,45`
- **Fix:** Raise all to at least 11px. Make the no-rating note text-zinc-500 or text-pm-grey-text. Put distance on its own line if width is tight.
- **Checked:** Confirmed. `text-[9px]` and `text-[10px]` at the cited lines; the no-rating note is `text-zinc-400`.
- **Live branch:** Still true. The 9 and 10px text is at `PhoneRestaurantCardGrid.tsx:127`, `:158`, `:185`, `:226` and `:241` there. `PhoneRestaurantCardTiny.tsx` is identical.
- **Also reported as:** RUN-02

### 7. RUN-03 · major · Restaurant, dish and author links on every feed card are 14 to 16px tall with about 4px between them

- **Where:** `src/components/mobile/PhoneFeedPostCard.tsx:138,179,733`
- **Fix:** Use inline-flex min-h-11 items-center, or a transparent ::after that grows the hit area to 44px without moving the text.
- **Checked:** Confirmed. The links at `PhoneFeedPostCard.tsx:138`, `:179` and `:733` set no minimum height. The 14 to 16px heights come from the rendered measurement.
- **Live branch:** Still true. The three links open at `PhoneFeedPostCard.tsx:137`, `:176` and `:731` there and set no minimum height.

### 8. TGT-01 · major · Comment vote arrows are 24px wide, the collapse toggle 20x24 and the thread rail 16px (under the 28 pt floor). Also covers RUN-08 and MED-06.

- **Where:** `src/components/feed/CommentsScreen.tsx:530,356`, `src/components/feed/ShortThread.tsx:656`, `src/components/feed/PostActions.tsx:305`
- **Fix:** Comment and short-thread arrows to w-8 or wider; collapse toggle h-11 w-8; post arrows w-7 to w-9 or w-10.
- **Checked:** Confirmed. Comment vote arrows are `h-11 w-6`, 24px wide (`CommentsScreen.tsx:530`, `ShortThread.tsx:656`). The collapse toggle is `h-6 w-5`, 20×24 (`CommentsScreen.tsx:356`). The post vote arrows are a separate finding (RUN-08, MED-06): `h-11 w-7`, 28px wide, which is Apple's minimum and not under it. One change can widen both.
- **Live branch:** Still true. The arrows are at `CommentsScreen.tsx:541` and `ShortThread.tsx:673` there, the toggle at `CommentsScreen.tsx:361`.

### 9. MOD-01 · major · Composer X, camera X and step-1 Cancel discard the post with no confirmation and no draft. Also covers INP-03.

- **Where:** `src/app/m/post/page.tsx:450,429,789`, `src/components/post/CameraCapture.tsx:953`
- **Fix:** When a photo, place, dish or caption exists, show a two-choice sheet (Discard post in red, Keep editing), or save a draft.
- **Checked:** Supported. The X and Back exits push straight to `/m/feed` (`src/app/m/post/page.tsx:429`, `:789`) and the composer has no confirm or saved-draft code. Not traced through every exit.
- **Live branch:** Still true. `src/app/m/post/page.tsx` is identical there.
- **Also reported as:** INP-03

### 10. TYP-01 · major · Nothing hooks into iOS Larger Text; about 350 fixed px sizes. At 130% only 36 of 377 feed text nodes grew. Also covers RUN-01.

- **Where:** `src/app/globals.css:80`
- **Fix:** Stage 1: add an @supports (font: -apple-system-body) root rule scaled so the default look is unchanged. Stage 2: convert feed, Discover cards, tab bar and profile from text-[Npx] to rem. Stage 3: cap the largest sizes on fixed chrome and replace fixed-size discs with min-h and padding (FoodPostCard.tsx:39, PlateDetailSheet.tsx:371). Confirm on a device that WKWebView scales the root.
- **Checked:** Confirmed. No `-apple-system-body` and no `text-size-adjust` in `globals.css` or `phone.css`. Measured: at 130% text, 36 of 377 feed text nodes grew.
- **Live branch:** Still true. No `-apple-system-body` and no `text-size-adjust` anywhere in `src` there.
- **Also reported as:** RUN-01

### 11. PRV-01 · minor · Plate detail sheet has no Report post or Block on other people's plates (App Review 1.2, risk medium)

- **Where:** `src/components/PlateDetailSheet.tsx:955,707`
- **Fix:** For non-owners show the three-dot menu with Report post (the existing ReportSheet) and Block, reusing PhoneFeedPostCard.tsx:866-883.
- **Checked:** Confirmed. In `PlateDetailSheet.tsx` the only report control is on comments (`:516`, `kind="comment"`). The feed card has Report post and Block (`PhoneFeedPostCard.tsx:864-884`).
- **Live branch:** Still true. The sheet's options menu (`PlateDetailSheet.tsx:964` there) is the owner's delete menu and holds no report or block. The only report control is on comments (`:520`).

### 12. WEB-07 · minor · Push is the only native capability, which invites a 4.2 minimum-functionality question (App Review risk medium)

- **Where:** `package.json:41-43`, `ios/App/App/AppDelegate.swift:35-50`
- **Fix:** State in the review notes that push, in-app camera capture and location discovery use native permissions. Optionally add @capacitor/haptics, @capacitor/keyboard and @capacitor/share in the same build as COL-01 and COL-02.
- **Checked:** Confirmed. The only Capacitor packages are core, ios and push-notifications (`package.json:41-43`).
- **Live branch:** Still true. The same three packages, at `package.json:42-44` there.

The 13 majors are the 10 above plus 3 repeats: LAY-01 (same problem as COL-01), RUN-01 (same problem as TYP-01), RUN-02 (same problem as TYP-02).

## App Review risks

- **WEB-01 · high · Synced iOS config lacks allowNavigation; build 8 fix may not be in the archive** `ios/App/App/capacitor.config.json:5`  
  The Xcode-built config (Sep 20) has no allowNavigation, the .ts (Oct 11) does; run npx cap sync ios before archiving and diff both configs and both offline.html copies.
- **PRV-01 · medium · Plate detail sheet has no Report post or Block on other people's plates** `src/components/PlateDetailSheet.tsx:955`  
  Sheet menu only deletes own posts; Report post exists only on feed cards. Add non-owner Report post and Block to the sheet menu. Profile Report user does exist (finder wrong there).
- **WEB-07 · medium · Only native capability is push; App Review 4.2 question** `package.json:41`  
  Plugins are core, ios, push only. Explain native-permission features in the review notes; optionally add haptics/share/keyboard plugins.

## Follow-up pass on the live branch

A follow-up pass read the phone code that is new or changed on the live branch (`c7d1254`): the For me and Nearby buttons on Discover, the Your taste section and its picks, the reworked Discover cards, and the admin delete button. It read code only. Nothing in this section was rendered.

- **8 confirmed: 0 major, 4 minor, 4 polish.** They are not in the counts at the top.
- 10 were reviewed. 1 was refuted and 1 repeated a finding in the main audit.
- LIV-03, LIV-04 and LIV-07 are in the Your taste row on Discover, which everyone sees. Most of that code is in the audited tree too, so the main audit missed them, apart from one line of LIV-04 that COL-06 already has. The other 5 are in code that only the live branch has.
- Severity is rated as if each screen were open to everyone. Who can see it today is on each line.
- Line numbers in this section are live-branch lines.

- **LIV-01 · minor · Undo bar sits above the picks grid, so it is off-screen after acting on a lower card** `src/components/mobile/PhoneTastePicks.tsx:109`  
  Undo bar is mounted above a 24-card grid, so it is off-screen when you act low down; pin it above the tab bar and give Undo the orange focus ring. Only the accounts behind the gate see it today. Gate: useDiscoverModes().access for the picks grid; useForMeAccess for the dish-picks row. Effect needs a device check.
- **LIV-02 · minor · Location prompt is raised on load for picks accounts, before any tap** `src/lib/useDiscoverQuery.ts:97`  
  Dish-picks accounts get the iOS location alert on first Discover frame; add a one-line reason first or wait for the For me / Nearby tap. Only the accounts behind the gate see it today. Gate: useForMeAccess (askOnLoad only takes effect when it is true) Effect needs a device check.
- **LIV-03 · minor · A failed taste request shows the 'What do you like?' prompt, with no failure message** `src/components/mobile/PhoneTasteSection.tsx:358`  
  Row shows the cuisine prompt on a request failure and says 'up to 3' when the cap is 5; show a failure line with Try again and fix the number. Everyone sees it. Gate: none for the prompt; Refresh in this branch needs useForMeAccess and a signed-in user. Also in the audited tree.
- **LIV-04 · minor · Your taste text is zinc-500 or zinc-400 on the cream ground, below 4.5:1** `src/components/mobile/PhoneTasteSection.tsx:408`  
  Taste headings, short header, Edit and sign-up link are zinc-500/400 on cream (4.28:1 or worse); switch to text-pm-grey-text. Everyone sees it. Gate: none for the row; the picks grid header needs useDiscoverModes().access. Also in the audited tree. One of its lines is already in COL-06.
- **LIV-05 · polish · For me and Nearby clear applied filters silently and the page never names the mode** `src/components/mobile/PhoneFilterBar.tsx:97`  
  Mode buttons wipe filters without a word and two controls are both called Nearby; add a notice, rename one, and name the mode in the heading. Only the accounts behind the gate see it today. Gate: useDiscoverModes().access (one account)
- **LIV-06 · polish · Admin delete: every button just says Delete, failure is not announced, shelf delete reverts silently** `src/components/feed/AdminDeleteButton.tsx:53`  
  Admin Delete buttons are unnamed, failure is silent to VoiceOver and replies vanish without warning; add labels, an alert and a replies note. Only admin accounts see it. Gate: useAdminAccess. Effect needs a device check.
- **LIV-07 · polish · Taste loading skeleton can widen the page for everyone except the picks accounts** `src/components/mobile/PhoneTasteSection.tsx:337`  
  The loading skeleton is wider than the phone and only gated accounts clip it; apply overflow-hidden for everyone. Everyone sees it. Gate: none (clip applies for useForMeAccess only) Also in the audited tree. Effect needs a device check.
- **LIV-08 · polish · Pick impressions and opens are logged; privacy page only says 'usage data' in general** `src/lib/usePickLog.ts:99`  
  Which picks you see and open are logged; add one sentence to the privacy page and check the App Store Usage Data label. Only the accounts behind the gate see it today. Gate: useForMeAccess (usePickLog is off otherwise)

What the live branch changes for findings in the main audit, as this pass saw it:

- **TYP-02:** Slightly wider in c7d1254: gated accounts see distance in the existing 10px rows (PhoneRestaurantCardGrid.tsx:173, 185, 198). The 9px plate-score (:226) and 9px aspect pill (:241) are unchanged old code.
- **MOT-02:** The Taste skeleton animate-pulse moved from PhoneTasteSection.tsx:151/160 to :325 and :341, and a new unguarded animate-pulse skeleton is at PhoneTastePicks.tsx:67. The new Refresh spinner is guarded (motion-safe at PhoneTasteSection.tsx:50).

Full write-up, with the refuted and deliberate items: [areas/live-delta.md](areas/live-delta.md).

## How it was run

- HIG was read as Apple's Human Interface Guidelines, applied to the iPhone app: the Capacitor shell and the `/m` screens it loads. The desktop site was out of scope.
- 31 Sonnet agents: 15 finders (one per area), 15 reviewers (one second look per area, told to try to refute each finding) and 1 report writer. The report writer's file write was blocked, so the main session built this file from the reviewers' saved results.
- 14 areas read code. The runtime area drove the local dev build (the Nov 5 code) in Chromium at 393×852 and 375×667, signed out, and measured targets, text sizes, contrast, Dark Mode, Larger Text and Reduce Motion.
- Rules in `AGENTS.md` and `DESIGN.md` were treated as deliberate. Code that breaks the project's own floor (44px targets, 4.5:1 text, reduced motion) counts as a finding.
- The main session re-checked the ten distinct majors and the two App Review items against the code, one pass each. Results are on the Checked lines above.
- The main session then compared the code every confirmed finding cites with `origin/main`: the cited line and the lines either side of it, by script. It re-read the fix-first items there by hand.
- A follow-up pass of 2 more Sonnet agents (1 finder, 1 reviewer) read the phone code that is new or changed on the live branch. The main session then read the code each of its confirmed findings cites on the live branch, one pass each. That makes 33 agents in all.

## Same problem seen by two areas

| Kept | Also reported as | Why they are one problem |
| --- | --- | --- |
| COL-01 | LAY-01, RUN-14 | No light-only declaration: UIUserInterfaceStyle, color-scheme and ios.backgroundColor are all missing. LAY-01 also wants a per-screen status bar style, which is COL-02. |
| TYP-01 | RUN-01 | No Dynamic Type hook in globals.css (-apple-system-body). The runtime run measured the same gap. |
| TYP-02 | RUN-02 | Discover card details under 11px, same lines in PhoneRestaurantCardGrid.tsx. |
| COL-06 | RUN-05 | 9px zinc-400 no-rating note at PhoneRestaurantCardGrid.tsx:184. TYP-02 also covers this line. |
| TYP-04 | RUN-04 | Tab bar labels are 10px against DESIGN.md's 11px. |
| TYP-05 | COL-07 | 10px white/40 camera failure message. COL-07 also covers other low-opacity white text. |
| RUN-08 | MED-06 | Post vote arrows are w-7 in PostActions.tsx. Same file, same fix. MED-06 also raises the score label (see AXS-07). |
| LAY-10 | TYP-07 | Discover h1 needs break-words. |
| MOD-01 | INP-03 | Composer exits discard the post silently. Same fix: a discard sheet or a draft. |
| MOD-03 | CPY-01 | Feed-card Delete post fires on one tap with no confirmation. |
| MOD-02 | RUN-12 | Sign-up sheet opens over the free-food ticket. Same fix: wait while any dialog is open. |
| MOD-07 | RUN-13 | Signed-out vote notice is a text pill with no action. |
| FBK-10 | CPY-12 | Nearby empty state has no button. |
| PRV-03 | CPY-02, WEB-10 | Location copy talks about a site or browser and names no Settings path. |
| PRV-04 | WEB-02 | Download my data is a plain download link. |
| MED-03 | AXS-11, LAY-08 | Map photo viewer has no close button, no safe-area padding and no focus restore. Same component, same fix. |
| PRV-06 | WEB-13 | Support row is a bare mailto. |
| NAV-07 | FBK-01 | No not-found.tsx or error.tsx under src/app. |
| FBK-07 | MOT-07 | Native launch image plus the PhoneSplash hold (phone.css:711). |
| LAY-03 | WEB-05 | No keyboard handling and no Keyboard plugin. |
| WEB-04 | FBK-08 | No ios.backgroundColor. Partly overlaps COL-01, whose fix includes it. |
| COL-04 | RUN-06 | Light labels on --pm-orange under 4.5:1 at 12 to 13px. |
| NAV-02 | MOT-06 | Nothing happens when the current tab is tapped again (scroll to top or refresh). |

## All confirmed findings by area

### Layout, safe areas and the status bar

12 confirmed: 1 major, 3 minor, 8 polish (reported 11, reviewed 12). Full write-up: [areas/layout.md](areas/layout.md).

- **LAY-01 · major · Nothing sets the status bar style; clock can be unreadable in Dark Mode and over the dark map** `ios/App/App/Info.plist:52`  
  Capacitor defaults to .default status bar, which follows the phone, not the always-cream page. Fix: UIUserInterfaceStyle=Light, plus StatusBar plugin or a cap on map/camera. Same problem as COL-01. Effect needs a device check.
- **LAY-02 · minor · Sheet, panel and modal dialogs skip the home-indicator inset** `src/components/feed/Dialog.tsx:409`  
  Only the screen variant pads for safe-area-inset-bottom, so the sheet comment field sits 12px from the edge. Fix: add the inset padding to the non-screen footer and scroller. Effect needs a device check.
- **LAY-03 · minor · No keyboard handling: composer Next/Post bar hides under the keyboard** `src/app/m/post/page.tsx:781`  
  No visualViewport or Keyboard plugin anywhere; fixed bottom bars and dvh dialogs may sit under the keyboard. Fix: --kb-inset listener or @capacitor/keyboard resize body. Effect needs a device check.
- **LAY-04 · minor · Content scrolls under the clock with no scrim on most screens** `src/app/m/phone.css:303`  
  Top inset is scroller padding that scrolls away; only PhoneStickyBar paints a cap. Fix: one fixed blurred cap in PhoneShell. Effect needs a device check.
- **LAY-05 · polish · Composer stacks an action bar on top of the tab bar** `src/app/m/post/page.tsx:781`  
  About 150px of chrome on an SE during a multi-step form. Fix: hide PhoneNav on /m/post or merge Next/Post into its slot.
- **LAY-06 · polish · Filter and taste sheets reserve full tab-bar height under a sheet that covers the nav** `src/components/mobile/PhoneFilterSheet.tsx:707`  
  Footer uses pb-[var(--phone-nav-space)] under a z-60 sheet, wasting 90-124px. Fix: use max(1rem, safe-area-inset-bottom) and verify stacking. Effect needs a device check.
- **LAY-07 · polish · Side margins differ: 20px in dialogs, 16px on screens and phone sheets** `src/components/feed/Dialog.tsx:343`  
  Dialog uses px-5 while screens use px-4, so pushed screens do not line up. Fix: switch Dialog to px-4.
- **LAY-08 · polish · Map photo preview has no safe-area padding and no close button** `src/components/RestaurantMap.tsx:3076`  
  fixed inset-0 p-4 lets a tall photo run under the Dynamic Island and home indicator; dismissal is tap-anywhere only. Fix: inset padding plus a 44px close button. Same problem as MED-03. Effect needs a device check. Live line 3011.
- **LAY-09 · polish · Coach tour caption at bottom-28 is lower than the nav on notched phones** `src/components/tour/CoachTour.tsx:665`  
  112px caption offset vs 124px nav space overlaps the bar by 12px on notched iPhones. Fix: bottom calc(var(--phone-nav-space) + 1rem). Effect needs a device check.
- **LAY-10 · polish · Long unbroken Discover search term overflows the heading sideways** `src/components/mobile/PhoneDiscoverScreen.tsx:236`  
  h1 has no break-words and heading uses free-text q; scroller is overflow-y:auto so it can pan sideways. Fix: add break-words to h1s. Live line 273.
- **LAY-11 · polish · Top inset spent twice on Settings, legal pages and detail hero back button** `src/components/mobile/PhoneSettingsScreen.tsx:55`  
  Scroller already pads by safe-area-inset-top; these add max(0.75rem, inset) again, about 59px extra. Fix: use plain pt-3 / top-3. Effect needs a device check.
- **LAY-12 · polish · Info.plist declares four iPad orientations for an iPhone-only target** `ios/App/App/Info.plist:45`  
  Template leftover; TARGETED_DEVICE_FAMILY is 1. Fix: delete the ~ipad array or reduce it to Portrait.

### Touch targets, buttons and controls

8 confirmed: 1 major, 5 minor, 2 polish (reported 9, reviewed 9, refuted 1). Full write-up: [areas/targets.md](areas/targets.md).

- **TGT-01 · major · Comment collapse toggle and vote arrows under Apple's 28 pt minimum** `src/components/feed/CommentsScreen.tsx:530`  
  Comment/short-thread vote arrows are 24px wide and the collapse toggle is 20x24, under 28 pt on core actions. Widen arrows to w-8+ and give the toggle h-11 w-8. Effect needs a device check. Live line 541.
- **TGT-02 · minor · Segmented switches are 32px tall, Nearby chip 40px** `src/components/feed/FeedSortSwitch.tsx:55`  
  min-h-8 segments (32px) clear Apple's 28 pt minimum but break the project's 44px floor. Raise to min-h-11 or pad the hit area; NearbyChip h-10 to h-11.
- **TGT-03 · minor · Some custom buttons have no press state** `src/components/feed/FeedSortSwitch.tsx:55`  
  Preflight turns tap highlight off and these buttons have no active: style, against the Buttons page rule to always give custom buttons a press state. Add a shared active treatment. Effect needs a device check.
- **TGT-04 · minor · Filter sheet Change/Clear links about 28px tall, no focus ring** `src/components/mobile/PhoneFilterSheet.tsx:284`  
  px-2 py-1 text-[13px] links are about 28px tall with no focus-visible outline. Use min-h-11 px-3 and the orange ring used at line 720.
- **TGT-05 · minor · Icon-only close/remove buttons are 28 to 36px** `src/components/DishSheet.tsx:45`  
  DishSheet close 32px, MealPlates remove 28px, camera split-restart 36/32px. Make hit area h-11 w-11 and keep the small visual circle.
- **TGT-06 · minor · Percent slider thumb is 10px wide** `src/components/post/PercentMeter.tsx:174`  
  Native range with 10px-wide thumb on a 56px bar; grab behaviour on iOS unproven from code. Test on device, then widen thumb to 28px if needed. Effect needs a device check.
- **TGT-07 · polish · Find Friends Add button is 36px tall** `src/components/mobile/PhoneFindFriends.tsx:509`  
  min-h-9 (36px) Add button is under the 44px project floor; change to min-h-11 (it already has a press state and focus ring).
- **TGT-08 · polish · Block menu item uses a close (X) icon** `src/components/mobile/PhoneFeedPostCard.tsx:882`  
  Block row shows CloseIcon, which reads as dismiss; use a block/person-slash glyph. Live line 881.

### Typography and Dynamic Type

9 confirmed: 2 major, 4 minor, 3 polish (reported 11, reviewed 11, repeats dropped 2). Full write-up: [areas/type.md](areas/type.md).

- **TYP-01 · major · No Dynamic Type hook: iOS text size setting does nothing** `src/app/globals.css:80`  
  No apple-system-body, text-size-adjust or html font-size anywhere; px and rem sizes are fixed. Add an @supports (font: -apple-system-body) root rule, then move px sizes to rem. Effect needs a device check.
- **TYP-02 · major · Discover grid cards use 9-10px details; no-rating note is zinc-400** `src/components/mobile/PhoneRestaurantCardGrid.tsx:132`  
  Dish chip, price, distance, cuisine, score pill are 10px; no-rating note 9px at 2.65:1 (zinc-400 on white). Raise all to 11px and use zinc-500 or pm-grey-text. Live line 158.
- **TYP-03 · minor · Sub-11px text elsewhere (77 uses, 31 files)** `src/components/ProfileShelves.tsx:701`  
  Grep count of 77 uses in 31 tsx files matches. Replace 9-10px classes with 11px or .mono-label and give small discs room. Live line 702.
- **TYP-04 · minor · Tab bar labels 10px, DESIGN.md says 11px** `src/components/mobile/PhoneNav.tsx:307`  
  ArcNav (default variant) labels are text-[10px]; DESIGN.md:117 specifies 11px. Change to text-[11px].
- **TYP-05 · minor · Camera failure message 10px at white/40** `src/components/post/CameraCapture.tsx:661`  
  Only explanation of camera failure is 10px at white/40 on charcoal, about 3.74:1. Use text-xs with white/80 or cream.
- **TYP-06 · minor · Dish name chip truncates first in Discover grid** `src/components/mobile/PhoneRestaurantCardGrid.tsx:133`  
  Price and distance are shrink-0 so the dish name truncates in a ~170px card. Give the chip its own line-clamp-2 row. Effect needs a device check. Live line 159.
- **TYP-07 · polish · Discover heading has no wrap rule for long unbroken query** `src/components/mobile/PhoneDiscoverScreen.tsx:235`  
  h1 at 26px lacks break-words; query is capped at 60 chars (MAX_QUERY), so only a pasted unbroken string overflows. Add break-words. Same problem as LAY-10. Live line 272.
- **TYP-08 · polish · Feed post subject line is footnote size** `src/components/mobile/PhoneFeedPostCard.tsx:627`  
  Dish 13px, restaurant 12px, meta 11px: all at or above 11px but small for the headline. Try 15/13/12. Effect needs a device check.
- **TYP-09 · polish · Map neon signs 10px uppercase with wide tracking** `src/app/globals.css:698`  
  Override sets 10px under the shared 11px rule; attribution also 10px. Drop override; recheck SIGN_LEFT/SIGN_GAP width estimate in RestaurantMap.tsx. Effect needs a device check.

### Colour, contrast and Dark Mode

9 confirmed: 2 major, 5 minor, 2 polish (reported 11, reviewed 11, refuted 2). Full write-up: [areas/color.md](areas/color.md).

- **COL-01 · major · Dark Mode neither supported nor cleanly opted out** `ios/App/App/Info.plist:51`  
  No UIUserInterfaceStyle or color-scheme; cream page under system chrome, so Dark Mode gives white clock on cream (1.10:1). Add UIUserInterfaceStyle Light, color-scheme light, ios.backgroundColor. Effect needs a device check.
- **COL-02 · major · Status bar glyphs cannot follow page: dark map under clock** `src/app/m/phone.css:90`  
  Map-up state paints #191c22 under the clock but no StatusBar plugin; Light Mode dark glyphs are about 1.23:1. Add @capacitor/status-bar and set style on map mount/unmount; fix misleading comments. Effect needs a device check.
- **COL-03 · minor · Resting vote arrows and icon buttons are zinc-400 (2.4-2.65:1)** `src/components/feed/PostActions.tsx:308`  
  text-zinc-400 rest colour is 2.65:1 on white, 2.41:1 on cream, against DESIGN.md:64. Use zinc-500 on white and pm-grey-text on cream; keep the arrow shape.
- **COL-04 · minor · Light labels on --pm-orange fill under 4.5:1** `src/components/mobile/freefood/TicketCard.tsx:134`  
  White on #C9591F is 4.26:1 (semibold, probably passes Apple's bold 3:1); cream is 3.87:1 at weight 500 and fails. About 63 sites. Use white and semibold, or --pm-orange-text fill.
- **COL-05 · minor · Placeholders zinc-500 on tinted fill (about 4.0-4.2:1)** `src/app/m/post/page.tsx:61`  
  zinc-500 on bg-pm-grey-tint/60 is 4.02:1 on cream, 4.17:1 on white; filter field about 4.0. Switch to placeholder:text-pm-grey-text (5.36:1).
- **COL-06 · minor · zinc-400 used for readable small text** `src/components/mobile/PhoneRestaurantCardGrid.tsx:184`  
  9px zinc-400 text is 2.65:1 on white, against DESIGN.md:64. Use zinc-500 or pm-grey-text, raise to 11px, and reconcile DESIGN.md:326, which records 11px zinc-400. Live line 226.
- **COL-07 · minor · Low-opacity white text on camera and cropper screens** `src/components/post/CameraCapture.tsx:663`  
  10px white/40 failure message is 3.74:1 on charcoal; white/45 helper text is 4.36:1. Raise small text to white/70 or more and 11px or larger. Same problem as TYP-05.
- **COL-08 · polish · No Increase Contrast handling; blurred pills lack opaque fallback** `src/components/mobile/PhoneNav.tsx:249`  
  Zero prefers-contrast hits; map pills are bg-black/45 backdrop-blur over a moving map. Add a prefers-contrast: more block with solid pill grounds. Effect needs a device check.
- **COL-09 · polish · Contrast comment gives only the white-ground figure** `src/app/globals.css:7`  
  --pm-orange-text is 5.82:1 on white but 5.30:1 on cream; comment and DESIGN.md:68 say 5.8. Edit both to give both numbers.

### Navigation, tab bar and search

9 confirmed: 0 major, 8 minor, 1 polish (reported 13, reviewed 13, refuted 3, deliberate 1). Full write-up: [areas/nav.md](areas/nav.md).

- **NAV-01 · minor · Tabs are history pushes: edge swipe crosses tabs, no per-tab state** `src/components/mobile/PhoneSwipeBack.tsx:164`  
  Tab switches are Link pushes, so edge swipe on a tab root lands on another tab and tab state is lost. Stand the swipe down on tab roots; optionally remember last path per tab. Effect needs a device check.
- **NAV-02 · minor · No tap-status-bar or re-tap-tab scroll to top** `src/app/m/phone.css:246`  
  Single inner scroller means status-bar tap does nothing and re-tapping the current tab only kicks. Scroll .pm-phone-content to top on re-tap of the current tab. Effect needs a device check.
- **NAV-03 · minor · Selected tab told apart by hue alone** `src/components/mobile/PhoneNav.tsx:307`  
  Selected #A8481A (4.76:1) and unselected #665C4E (5.36:1) on #EDE8DC are near equal in luminance, no weight or shape change. Add the 5px bullet or a filled icon.
- **NAV-04 · minor · Public profile Back goes to a guessed parent** `src/app/m/u/[id]/page.tsx:95`  
  Unknown or missing from falls back to Discover, e.g. profile opened from a map bubble. Use history-aware router.back() with the from map as fallback.
- **NAV-05 · minor · Composer exits push /m/feed on top of the composer** `src/app/m/post/page.tsx:391`  
  Publish, X and Cancel all router.push the feed, so edge swipe on the feed reopens an emptied composer. Use replace after publish and back() for Cancel/X.
- **NAV-06 · minor · Back is built four different ways** `src/components/mobile/PhoneDetailHero.tsx:97`  
  White chip, tan Back pill, tan Profile pill and bare text link differ in shape, label and behaviour. Make one PhoneBackButton: 44px, chevron, history-aware with fixed fallback.
- **NAV-07 · minor · Missing or blocked restaurant or profile shows the stock Next 404** `src/app/m/restaurant/[id]/page.tsx:37`  
  notFound() with no not-found.tsx or error.tsx under src/app gives an unstyled page with no Back. Add src/app/m/not-found.tsx and error.tsx in house style.
- **NAV-08 · minor · Discover search Clear empties the field but keeps ?q results** `src/components/mobile/PhoneDiscoverSearch.tsx:173`  
  Clear only does setTerm(""), leaving ?q and the filtered grid under an empty field. Call runSearch with the empty term; widen button from w-8 to w-11.
- **NAV-09 · polish · Search shows nothing before you type** `src/components/mobile/PhoneDiscoverSearch.tsx:71`  
  No recents or suggestions on focus in Discover, Feed or Map. Keep last five terms in localStorage with a Clear link.

### Sheets, alerts, menus and interruptions

10 confirmed: 2 major, 7 minor, 1 polish (reported 12, reviewed 12, refuted 1, repeats dropped 1). Full write-up: [areas/modality.md](areas/modality.md).

- **MOD-01 · major · Composer exits discard the whole post with no confirmation** `src/app/m/post/page.tsx:450`  
  Header X, camera X and step-1 Cancel leave /m/post with no confirm or draft. Fix: when any photo, dish or caption exists, show Discard post / Keep editing, or save a draft.
- **MOD-02 · major · Sign-up sheet can open over the auto-opened free-food ticket** `src/components/mobile/PhoneSignUpSheet.tsx:75`  
  Sign-up sheet arms at 1.2 s without checking for an open dialog, so it stacks on TicketPopup. Fix: wait while any [role=dialog] is open and re-arm.
- **MOD-03 · minor · Feed-card Delete post is instant, no confirm and no Undo** `src/components/mobile/PhoneFeedPostCard.tsx:833`  
  Delete runs DELETE on one tap and the tombstone has no Undo. Fix: reuse PostOptionsMenu's Delete for good step, or delay the DELETE and add Undo. Live line 832.
- **MOD-04 · minor · Typed comment or report note lost on swipe, scrim tap or close** `src/components/feed/Composer.tsx:33`  
  Dialog dismisses by swipe, scrim tap and Escape with no dirty-state check. Fix: add an isDirty prop that asks Discard / Keep editing. Effect needs a device check.
- **MOD-05 · minor · Static grabbers on three sheets that do not drag; swipeable Dialog has no grabber** `src/components/mobile/PhoneSignUpSheet.tsx:162`  
  Sign-up, Filter and Dish sheets draw a grabber with no touch handling, while Dialog swipes with none. Fix: share Dialog's touch-dismiss and make the affordance consistent. Effect needs a device check.
- **MOD-06 · minor · DishSheet lacks dialog semantics, Escape, focus handling and scroll lock; close is 32 px** `src/components/DishSheet.tsx:28`  
  No role=dialog, key listener or effect, and close is h-8 w-8. Fix: render through Dialog variant=sheet, or add role, Escape and an h-11 w-11 close. Effect needs a device check.
- **MOD-07 · minor · Signed-out gate is a 3 s text pill with no action** `src/components/mobile/PhoneFeedScreen.tsx:749`  
  onRequireSignIn only sets a banner cleared after 3 s, while Not now is stored forever. Fix: reopen the sign-up sheet or add a Sign in button and keep errors up longer.
- **MOD-08 · minor · Sheet scroll lock is body overflow only; project CSS says iOS still bounces** `src/components/feed/Dialog.tsx:143`  
  Dialog, PhoneFilterSheet and TicketPopup set only body overflow:hidden. Fix: also toggle html.pm-lock-scroll, ref-counted. Effect needs a device check.
- **MOD-09 · minor · Plate-sheet options trigger is 28 px** `src/components/PostOptionsMenu.tsx:140`  
  Trigger is h-7 w-7 on a photo, under the 44 px floor. Fix: keep the look, add a 44 px hit area.
- **MOD-10 · polish · Block is one tap with no Undo on the feed tombstone** `src/components/mobile/PhoneFeedPostCard.tsx:302`  
  handleBlock posts at once; the tombstone has no Undo though Hide does. Fix: pass onUndo that calls DELETE /api/blocks, or accept it. Live line 306.

### Gestures, motion and haptics

8 confirmed: 0 major, 3 minor, 5 polish (reported 9, reviewed 9, refuted 1). Full write-up: [areas/motion.md](areas/motion.md).

- **MOT-01 · minor · Post-success flash blocks all touch for 3.6s+ with no skip** `src/app/m/phone.css:387`  
  .post-flash-on takes pointer-events for a 3,590ms floor (650ms reduced), no tap-to-skip. HIG Motion: do not block input, make animation skippable. Let a tap end it once the publish resolves.
- **MOT-02 · minor · Several animations ignore Reduce Motion; no global rule** `src/components/mobile/PhoneTasteSection.tsx:151`  
  animate-pulse, animate-spin, smooth scrollTo/scrollIntoView and MyLocation easeTo (900-1200ms) have no reduced-motion guard. Add a shared prefersReducedMotion helper and motion-reduce:animate-none. Effect needs a device check. Live line 325.
- **MOT-03 · minor · Pull-to-refresh claims touch on first downward pixel, no axis check** `src/components/mobile/PhonePullToRefresh.tsx:332`  
  onMove preventDefaults on first dy>0 with no dx comparison, cancelling a drooping horizontal carousel swipe at scrollTop 0. Claim only when dy>|dx|, as PhoneSwipeBack does. Effect needs a device check.
- **MOT-04 · polish · Composer range slider thumb at 0-3% sits inside swipe-back edge** `src/components/mobile/PhoneSwipeBack.tsx:168`  
  EDGE=28 vs 16px gutter and 10px thumb leaves ~12px of PercentMeter track in the edge zone; data-no-swipe-back is set nowhere. Add the attribute to .meter-shell. Effect needs a device check.
- **MOT-05 · polish · overscroll-behavior:none removes elastic edge outside the feed** `src/app/m/phone.css:249`  
  The scroller refuses bounce on every screen though only the feed has a pull. Use contain on non-feed screens, keep none on the feed. Effect needs a device check.
- **MOT-06 · polish · Pull-to-refresh is the only way to refresh the feed** `src/components/mobile/PhonePullToRefresh.tsx:364`  
  Refresh is gesture-only; PhoneNav has no re-tap-to-refresh. HIG Gestures: not the only way to act. Re-tapping the Feed tab should scroll to top and refresh. Same problem as NAV-02. Effect needs a device check.
- **MOT-07 · polish · Launch splash holds 1.2s, and 1.6s under Reduce Motion** `src/app/m/phone.css:711`  
  phone-splash-out runs 1.6s; steps(1,end) under reduced motion holds the mark 0.4s longer, not shorter. Use a ~200ms fade and dismiss when the feed is ready. Same problem as FBK-07.
- **MOT-08 · polish · No haptic feedback on votes, post success or refresh** `package.json:1`  
  No Haptics plugin installed. HIG treats haptics as optional. Add @capacitor/haptics in the next native build behind isNativePlatform(). Effect needs a device check.

### VoiceOver and assistive access

12 confirmed: 0 major, 6 minor, 6 polish (reported 12, reviewed 12). Full write-up: [areas/a11y.md](areas/a11y.md).

- **AXS-01 · minor · Nine phone routes share the title PlateMaps** `src/app/m/layout.tsx:29`  
  Only 5 routes export metadata, so route announcer says PlateMaps on every navigation. Add per-route titles and generateMetadata for restaurant/[id] and u/[id], with a title template. Effect needs a device check.
- **AXS-02 · minor · Feed has no heading; no /m screen has a main landmark** `src/components/mobile/PhoneFeedHeader.tsx:55`  
  Header returns null without a count and the title was removed; no h1 or main anywhere on /m. Add an sr-only h1 in PhoneFeedScreen and make pm-phone-content a main. Effect needs a device check.
- **AXS-03 · minor · Rival toast button named Dismiss hides message; toast times out** `src/components/mobile/PhoneRivalToast.tsx:161`  
  aria-label Dismiss replaces the visible message and the toast leaves after 4.5 to 6 s. Remove the label, use an always-mounted sr-only status, and pause the timer on focus. Effect needs a device check.
- **AXS-04 · minor · Filters and taste sheets never move focus in** `src/components/mobile/PhoneFilterSheet.tsx:536`  
  Effect saves opener and traps Tab but never focuses into the dialog; same in PhoneTasteSection.tsx:71. Focus the first button or heading on mount. Effect needs a device check.
- **AXS-05 · minor · Map canvas is unnamed and does not point to the list alternative** `src/components/RestaurantMap.tsx:3034`  
  Container div has no role or label. Add role=region aria-label and an sr-only line pointing to Discover. Effect needs a device check. Live line 2969.
- **AXS-06 · minor · Carousel: no onscreen arrows on phones, identical alt per slide** `src/components/feed/PostMediaCarousel.tsx:177`  
  Arrows are hidden below sm and the ?? Photo i fallback is dead code, so all slides read the same. Add position to alt; optionally show 44px arrows. Effect needs a device check.
- **AXS-07 · polish · Vote/heart/save labels flip and also set aria-pressed; score is a labelled span** `src/components/feed/PostActions.tsx:296`  
  State is stated twice (Remove upvote plus pressed) and the span aria-label may be ignored. Use fixed labels with aria-pressed and an sr-only score suffix. Effect needs a device check.
- **AXS-08 · polish · Card toasts are mounted already containing their text** `src/components/feed/PostActions.tsx:230`  
  Saved, points and share notes are conditional role=status spans. Use one always-mounted sr-only status per card. Effect needs a device check.
- **AXS-09 · polish · Form errors not tied to fields** `src/components/mobile/PhoneProfileAuth.tsx:282`  
  aria-invalid set but no aria-describedby; composer and RecoveryForms have neither. Add ids and describedby.
- **AXS-10 · polish · role=tab controls have no tabpanel** `src/components/mobile/PhoneFeedTabs.tsx:78`  
  tablist and tab with no tabpanel, aria-controls or arrow keys. Add tabpanel or use aria-pressed buttons.
- **AXS-11 · polish · Map photo lightbox has no close button or focus restore** `src/components/RestaurantMap.tsx:3068`  
  Closes only by overlay tap or Escape; focus is not returned. Add a 44px Close photo button and restore focus. Same problem as MED-03. Effect needs a device check. Live line 3003.
- **AXS-12 · polish · Pill nav variant has icon-only links** `src/components/mobile/PhoneNav.tsx:194`  
  Non-current pill links have no accessible name and the variant is reachable by ?nav=pill. Add aria-label or delete the scaffolding.

### Text entry, sign-in, accounts and onboarding

14 confirmed: 0 major, 7 minor, 7 polish (reported 14, reviewed 14). Full write-up: [areas/input.md](areas/input.md).

- **INP-01 · minor · No webcredentials associated domain for password AutoFill** `ios/App/App/App.entitlements:5`  
  Entitlements hold only aps-environment and no AASA file exists. Add associated-domains with webcredentials plus /.well-known/apple-app-site-association. Rated down from major: iPhone effect unproven. Effect needs a device check.
- **INP-02 · minor · Verify-email and reset-password links open Safari with no route back to the app** `src/components/account/RecoveryForms.tsx:180`  
  Email links are plain https, so Mail opens Safari and the success cards stay there. Add 'open the PlateMaps app' copy now, universal links later. Effect needs a device check.
- **INP-03 · minor · Leaving the composer discards a multi-step post with no confirmation** `src/app/m/post/page.tsx:453`  
  X, Cancel and camera close leave with no prompt, and nothing is saved. Add a Discard this post? sheet once any photo, place or note exists. Same problem as MOD-01.
- **INP-04 · minor · Return in custom-dish and search fields submits the step instead of choosing** `src/components/post/DishPicker.tsx:240`  
  Return runs handleSubmit, which rejects a typed-but-unadded dish. Make Enter run 'Use this' and add enterKeyHint.
- **INP-05 · minor · Terms and Privacy links in the sign-up form navigate away and lose the form** `src/components/mobile/PhoneProfileAuth.tsx:378`  
  Links have no target and a WKWebView has no tabs, so typed values are lost; the comment says new tab. Open in a sheet or save to sessionStorage.
- **INP-06 · minor · Sign-up errors appear only after submit, as one message** `src/components/mobile/PhoneProfileAuth.tsx:331`  
  validate() runs only on submit and shows the first problem near the button. Validate username and email on blur with aria-describedby. Effect needs a device check.
- **INP-07 · minor · Sign-up username allows capitalising and autocorrect; Return after username submits an empty form** `src/components/mobile/PhoneProfileAuth.tsx:255`  
  No autoCapitalize, autoCorrect or enterKeyHint on auth fields. Add none/off/next on username, next on email, go on password. Effect needs a device check.
- **INP-08 · polish · Log-in email field uses autocomplete=email, not username** `src/components/mobile/PhoneProfileAuth.tsx:277`  
  Use autoComplete username in login mode so AutoFill pairs it with the password. The token is a web detail, not an HIG rule. Effect needs a device check.
- **INP-09 · polish · No show/hide control on new-password fields** `src/components/mobile/PhoneProfileAuth.tsx:299`  
  New-password fields on sign-up, reset and settings are blind entry. Add a 44px Show toggle there; keep log-in masked.
- **INP-10 · polish · Coach tour cannot be replayed from inside the app** `src/components/tour/CoachTour.tsx:878`  
  Only the ?tour=1 URL replays it and a WKWebView has no address bar. Add a Replay the tour row in Settings to /m/feed?tour=1.
- **INP-11 · polish · Last composer step is titled Anything else? but the note is required** `src/app/m/post/page.tsx:229`  
  Heading and unmarked label read as optional while an empty note is rejected. Retitle to 'Say something about it' and mark the label required.
- **INP-12 · polish · Two autocomplete tokens suggest the wrong thing** `src/components/mobile/freefood/InviteFriends.tsx:69`  
  Friend's number field says tel (own number); new-email field says email (current address). Set autoComplete off on both.
- **INP-13 · polish · Composer note is a fixed 3-row box for 200 characters; comments are single-line** `src/app/m/post/page.tsx:555`  
  rows=3 resize-none for a 200-char note, same in ReportSheet, single-line comment input. Let the box grow to about 6 rows. Effect needs a device check.
- **INP-14 · polish · Password-only accounts: no passkey option or second factor** `src/components/mobile/PhoneProfileAuth.tsx:299`  
  Email plus password only. HIG prefers passkeys without Sign in with Apple, or 2FA with passwords. Backlog; do INP-01 first.

### Launch, loading, empty and error states

11 confirmed: 0 major, 7 minor, 4 polish (reported 12, reviewed 12, refuted 1). Full write-up: [areas/feedback.md](areas/feedback.md).

- **FBK-01 · minor · No not-found, error or global-error boundary under /m** `src/app/m/layout.tsx:33`  
  Three notFound() calls and no boundary files, so Next's default 404 or error page shows with no way back. Add m/not-found.tsx, m/error.tsx and global-error.tsx with a Back to the feed pill. Same problem as NAV-07. Effect needs a device check.
- **FBK-02 · minor · No loading state when a tap goes to a server-rendered screen** `src/app/m/layout.tsx:51`  
  No loading.tsx; the profile page is dynamic (reads user and block status) so a tap waits with no feedback. Add loading.tsx skeletons for u/[id] and restaurant/[id]. Effect needs a device check.
- **FBK-03 · minor · Relaunch after web view eviction opens the feed and loses the composer** `src/app/m/post/page.tsx:107`  
  Composer state is only in useState and the URL is pinned to /m/feed. Save path and non-photo fields to sessionStorage and restore on cold open. Effect needs a device check.
- **FBK-04 · minor · Posting shows only the button text Posting…** `src/app/m/post/page.tsx:805`  
  Multi-photo upload shows no count or movement. Add an onProgress callback and Uploading 2 of 5 label with a determinate bar. Effect needs a device check.
- **FBK-05 · minor · Failed pull-to-refresh says nothing when posts are already showing** `src/components/feed/usePostFeed.ts:106`  
  Catch keeps old posts and error card shows only when posts are empty. Call setBanner(Couldn't refresh) when previous posts exist.
- **FBK-06 · minor · Friends list load failure has no retry and also shows the empty-friends view** `src/components/mobile/PhoneFriendsScreen.tsx:179`  
  Catch sets friends to [] with a plain error line and no r.ok check. Keep friends null and render a Try again card. Live line 178.
- **FBK-07 · minor · Native launch image and PhoneSplash are two logo screens with a fixed 1.2 s hold** `src/app/m/phone.css:711`  
  Mark size changes at the handoff and the overlay holds opaque 1.2 s on every cold open. Drop the web splash or match sizes and end the hold on first paint. Effect needs a device check.
- **FBK-08 · polish · Web view has no background colour before first paint** `capacitor.config.ts:48`  
  No backgroundColor or ios block, so default ground shows (black in Dark Mode). Set backgroundColor to #F7F4EC and the storyboard view to cream. Same problem as WEB-04. Effect needs a device check.
- **FBK-09 · polish · Offline banner says last plates are shown beside a failed-feed card** `src/components/feed/EmptyFeedState.tsx:103`  
  Banner copy contradicts the failed card after a tab switch offline. Add a hasPosts prop and say only You're offline when empty.
- **FBK-10 · polish · No plates within 5 mi empty state offers no action** `src/components/mobile/PhoneFeedScreen.tsx:683`  
  Card tells people to switch tabs but has no button. Add a Show all of San Diego pill that turns Nearby off.
- **FBK-11 · polish · offline.html status line is not a live region** `public/offline.html:156`  
  Still offline and Reconnecting text is silent to VoiceOver. Add role=status aria-live=polite. Effect needs a device check.

### Privacy, permissions and notifications

8 confirmed: 0 major, 4 minor, 4 polish (reported 8, reviewed 8). Full write-up: [areas/privacy.md](areas/privacy.md).

- **PRV-01 · minor · Plate detail sheet has no Report post or Block on other people's plates** `src/components/PlateDetailSheet.tsx:955`  
  Sheet menu only deletes own posts; Report post exists only on feed cards. Add non-owner Report post and Block to the sheet menu. Profile Report user does exist (finder wrong there). App Review risk medium. Live line 964.
- **PRV-02 · minor · Camera permission prompt is raised underneath the photo-privacy dialog** `src/components/post/PhotoPrivacyNotice.tsx:29`  
  Viewfinder mounts under the notice so two prompts arrive together. Start getUserMedia after the notice is answered or dismissed. Recommended-pill claim dropped (no HIG rule). Effect needs a device check.
- **PRV-03 · minor · Location-denied states use browser wording and dead-end** `src/components/feed/NearbyFeedGate.tsx:74`  
  Copy says 'site' and 'browser' in a native app and names no Settings path; denied gate has no button though setSavedLocation exists. Use isNativeApp wording and add an enter-a-place action. Effect needs a device check.
- **PRV-04 · minor · Download my data is a plain download link that may do nothing in the web view** `src/components/account/AccountLedger.tsx:330`  
  a[download] to an attachment route with no download or share plugin in the shell. Test on device; else fetch and use navigator.share or an in-app view. Effect needs a device check.
- **PRV-05 · polish · Push permission alert lands over success feedback with no lead-in** `src/lib/pushClient.ts:156`  
  Alert follows a real action and is asked once, which fits HIG; only polish left. Delay until success animation ends; optional single-Continue lead-in. Effect needs a device check.
- **PRV-06 · polish · Support row is a bare mailto to a personal Gmail address** `src/components/mobile/PhoneSettingsScreen.tsx:129`  
  Row shows no address and does nothing useful with no Mail account. Show the address as secondary text with Copy; later a platemaps.com address or /m/support page. Effect needs a device check.
- **PRV-07 · polish · Free-slice promotion shows no rules or Apple disclaimer** `src/components/mobile/freefood/TicketPopup.tsx:159`  
  No eligibility, one-per-person or Apple-not-a-sponsor line. Add a short footer and rules link.
- **PRV-08 · polish · Notification settings are one On/Off switch** `src/components/account/SettingsLedger.tsx:436`  
  One switch covers four notification kinds. In-app settings exist as HIG requires; per-type toggles are optional and checked server-side before send.

### Web view feel and system integration

13 confirmed: 1 major, 6 minor, 6 polish (reported 14, reviewed 14, refuted 1). Full write-up: [areas/webview.md](areas/webview.md).

- **WEB-01 · major · Synced iOS config lacks allowNavigation; build 8 fix may not be in the archive** `ios/App/App/capacitor.config.json:5`  
  The Xcode-built config (Sep 20) has no allowNavigation, the .ts (Oct 11) does; run npx cap sync ios before archiving and diff both configs and both offline.html copies. App Review risk high. Effect needs a device check.
- **WEB-02 · minor · 'Download my data' attachment link; WKWebView failure would show offline page** `src/components/account/AccountLedger.tsx:329`  
  Attachment link has no WKDownload/navigationResponse handler in Capacitor 8.5.1, and any failed load shows offline.html. Use fetch plus navigator.share with a file in the app; test on a device. Same problem as PRV-04. Effect needs a device check.
- **WEB-03 · minor · Notification tap on an older post lands on the feed with nothing opened** `src/components/mobile/PhoneFeedScreen.tsx:207`  
  ?post= opens comments only if the post is in the loaded page; otherwise silent. Fetch the single post or show a short note.
- **WEB-04 · minor · Web view and launch screen use system background, not cream** `capacitor.config.ts:87`  
  No ios.backgroundColor, so the web view paints systemBackground (black in Dark Mode) before the cream page. Add ios.backgroundColor #F7F4EC and set the storyboard to match. Effect needs a device check.
- **WEB-05 · minor · No Keyboard plugin: accessory bar shows, keyboard overlap unhandled** `package.json:43`  
  Install @capacitor/keyboard with accessoryBarVisible false and a resize mode, then test comments and composer on a device. Same problem as LAY-03. Effect needs a device check. Live line 44.
- **WEB-06 · minor · No refresh when the app returns from the background** `ios/App/App/AppDelegate.swift:28`  
  Foreground stubs are empty and the feed has no visibilitychange check. Refresh quietly after about 10 minutes hidden in usePostFeed. Effect needs a device check.
- **WEB-07 · minor · Only native capability is push; App Review 4.2 question** `package.json:41`  
  Plugins are core, ios, push only. Explain native-permission features in the review notes; optionally add haptics/share/keyboard plugins. App Review risk medium. Live line 42.
- **WEB-08 · polish · Double-tap zoom switched off only on the feed card** `src/app/m/phone.css:21`  
  touch-manipulation exists only on PhoneFeedPostCard; add .pm-phone-shell { touch-action: manipulation; } (pinch zoom stays). Effect needs a device check.
- **WEB-09 · polish · Long press raises Safari link preview and callout on tabs and cards** `capacitor.config.ts:87`  
  Set ios.allowsLinkPreview false and -webkit-touch-callout none on nav links and buttons, leaving images alone. Effect needs a device check.
- **WEB-10 · polish · Phone copy says browser / this site / website** `src/components/mobile/PhoneFeedMapPanel.tsx:83`  
  Reword to 'your phone' / 'PlateMaps' and 'Turn on Location for PlateMaps in Settings' in the map, Nearby gate and camera messages. Same problem as PRV-03.
- **WEB-11 · polish · Directions use Google Maps URL on an iPhone-only app** `src/lib/format.ts:53`  
  Build a maps.apple.com URL on iOS and keep Google elsewhere.
- **WEB-12 · polish · No universal links; shared plate links open Safari** `ios/App/App/App.entitlements:5`  
  Add applinks:platemaps.com, an apple-app-site-association file for /m/*, and App-plugin routing; a modest gain for real work.
- **WEB-13 · polish · Contact row is a bare mailto with no fallback** `src/components/mobile/PhoneSettingsScreen.tsx:129`  
  Show the address as secondary text or add a Copy action so support is reachable without a mail account. Same problem as PRV-06.

### Map, photos, lists and data display

10 confirmed: 1 major, 6 minor, 3 polish (reported 15, reviewed 15, refuted 5). Full write-up: [areas/media.md](areas/media.md).

- **MED-01 · major · Map zoom and locate buttons are 29px, under the 44px floor** `src/app/globals.css:479`  
  MapLibre's 29px control buttons are never enlarged on /m, and .map-locate-btn has no size. Set both to 44x44 in globals.css. Effect needs a device check.
- **MED-02 · minor · Denied location leaves a dead, silent locate button** `src/components/MyLocation.tsx:109`  
  Button is disabled on denial with only a tooltip saying 'blocked for this site'. Keep it enabled and show a short Settings hint; say 'app' not 'site'. Effect needs a device check.
- **MED-03 · minor · Photo viewer has no visible close button and no zoom** `src/components/RestaurantMap.tsx:3069`  
  Lightbox closes only by tap-anywhere or Escape, no button or swipe-down, no zoom. Add a 44px close button and swipe-down; optionally open it from feed photos. Effect needs a device check. Live line 3004.
- **MED-04 · minor · Restaurant pin hit area is 28 to 48px across** `src/components/RestaurantMap.tsx:2274`  
  restaurant-hit radius byZoom(14,16,19,24) gives 28/32/38/48px at zoom 9/13/15/18. Raise to at least 22 at every stop; leave visible pins alone. Effect needs a device check. Live line 2209.
- **MED-05 · minor · Attribution is not lifted clear of the floating nav** `src/app/globals.css:497`  
  Map runs under the nav and attribution stays at the default bottom-right with no phone offset. Lift .maplibregl-ctrl-bottom-right by --phone-nav-space. Effect needs a device check.
- **MED-06 · minor · Net score may not be announced; vote arrows are 28px wide** `src/components/feed/PostActions.tsx:335`  
  aria-label on a plain span may be ignored by VoiceOver, and arrows are w-7. Use role=img or sr-only text, and widen arrows to w-11. Same problem as RUN-08. Effect needs a device check.
- **MED-07 · minor · Percent meter end labels fall below 4.5:1** `src/components/post/PercentMeter.tsx:207`  
  The 0% and 100% labels use text-zinc-400, about 2.4 to 2.6:1. Switch to text-pm-grey-text or zinc-500.
- **MED-08 · polish · Taste radar spoke labels shrink to about 11px on a phone** `src/components/TasteRadar.tsx:159`  
  14-unit labels in a 440-wide viewBox scale to about 11.4px at 358px wide. Raise to about 17 or use a narrower viewBox.
- **MED-09 · polish · Pull to refresh exists only on the feed** `src/components/mobile/PhoneFeedScreen.tsx:573`  
  PhonePullToRefresh is used only on the feed. Reuse it on friends and leaderboard lists if they load client-side.
- **MED-10 · polish · Settings puts Support and legal below the delete panel** `src/components/mobile/PhoneSettingsScreen.tsx:128`  
  Delete panel (:107) comes before Support and legal (:128). Move Support and legal above log out; keep delete last.

### Writing and tone

13 confirmed: 0 major, 7 minor, 6 polish (reported 13, reviewed 13). Full write-up: [areas/copy.md](areas/copy.md).

- **CPY-01 · minor · Owner Delete post on phone feed card fires on one tap** `src/components/mobile/PhoneFeedPostCard.tsx:836`  
  Menu row deletes at once, no confirm, no Undo; PostOptionsMenu already has a Delete for good / Keep it step. Reuse it or add Undo to the tombstone. Same problem as MOD-03. Live line 835.
- **CPY-02 · minor · Location copy says this site / your browser, no Settings path** `src/components/feed/NearbyFeedGate.tsx:74`  
  Denied and unsupported strings talk about a site and a browser inside an iPhone app. Name Settings > PlateMaps > Location and drop browser wording. Same problem as PRV-03. Effect needs a device check.
- **CPY-03 · minor · Raw JS error names and messages shown as failure text** `src/components/post/CameraCapture.tsx:660`  
  err.name: err.message printed at 10px mono; AvatarCropper and profile show err.message as is. Map known names to plain sentences, log the raw string. Effect needs a device check.
- **CPY-04 · minor · Failure messages give no next step; network wording varies** `src/components/feed/ShortThread.tsx:175`  
  Vote and friends errors stop at what failed; three network phrasings incl. the server. Use Couldn't X. Check your connection and try again., say PlateMaps.
- **CPY-05 · minor · Delete-account confirm uses Are you sure? and Yes, delete my account** `src/components/mobile/PhoneDeleteAccountPanel.tsx:95`  
  Generic title and Yes label (Alerts: avoid Yes/No). Use Delete your account? with Keep account / Delete account; keep the good body.
- **CPY-06 · minor · No singular: 1 reviews and Rated by 1 locals** `src/components/mobile/PhoneDetailHero.tsx:217`  
  No singular branch in PhoneDetailHero and PhoneDetailHits:91. Add ===1 branches or one shared plural() helper.
- **CPY-07 · minor · One thing, several names: heart/like, plate/post, Friend(s) feed, PP** `src/components/PlateDetailSheet.tsx:878`  
  Heart is counted as likes; tab says Friends feed but hero says Friend feed; PP never expanded. Pick one term per concept. Live line 887.
- **CPY-08 · polish · Friend removal swaps to a bare Confirm** `src/components/mobile/PhoneFriendsScreen.tsx:469`  
  Armed label is Confirm in a 12px pill; aria-label is better. Use Remove friend? or Tap again to remove. Effect needs a device check. Live line 468.
- **CPY-09 · polish · Log in vs Sign in both used** `src/components/mobile/PhoneProfileAuth.tsx:238`  
  Log in tab/submit beside Sign in sentence on the same screen. Use Sign in everywhere.
- **CPY-10 · polish · Settings descriptions read like developer notes** `src/components/account/SettingsLedger.tsx:188`  
  Cuisine and restaurant descriptions explain implementation and promise a later feature. Say Shown on your profile.
- **CPY-11 · polish · Tour copy: UK idiom and spelling, I'm done vs Next** `src/components/tour/CoachTour.tsx:130`  
  Have a scroll, neighbourhood, Centre, and I'm done. Use US spelling, Scroll the feed, Next then Done. Effect needs a device check.
- **CPY-12 · polish · Nearby empty state has no button and hard-codes 5 mi** `src/components/mobile/PhoneFeedScreen.tsx:683`  
  Tells people to switch tabs with no action; radius typed as a literal while the gate uses NEARBY_RADIUS_MI. Add Show Trending button, use the constant. Same problem as FBK-10.
- **CPY-13 · polish · Three dots vs ellipsis, relative time stops at days** `src/components/mobile/freefood/TicketPopup.tsx:143`  
  Claiming... and Search friends... use three dots; relativeTime gives 324d ago. Use the ellipsis char; past 7 days use the existing day formatter.

### Rendered measurements

14 confirmed: 3 major, 9 minor, 2 polish (reported 14, reviewed 15, deliberate 1). Full write-up: [areas/runtime.md](areas/runtime.md).

- **RUN-01 · major · Text does not follow the system text size (10% of feed text grew at 130%)** `src/app/globals.css:79`  
  No root font-size or -apple-system-body rule and ~350 fixed px sizes, so Larger Text does nothing. Fix: make root follow system text size, then convert text-[Npx] to rem. Same problem as TYP-01. Effect needs a device check.
- **RUN-02 · major · Discover and card metadata set at 9 to 10px (51 nodes)** `src/components/mobile/PhoneRestaurantCardGrid.tsx:132`  
  Cuisine, distance, dish and score lines are 9-10px, below the 11 pt minimum, with no DESIGN.md exception. Fix: raise to 11-12px or drop secondary chips. Same problem as TYP-02. Effect needs a device check. Live line 158.
- **RUN-03 · major · Feed card links are 14-16px tall, 4px apart** `src/components/mobile/PhoneFeedPostCard.tsx:138`  
  Restaurant, dish and author links have no min-h or padding, so they are 14-16px tall, under the 28 pt minimum. Fix: inline-flex min-h-11 or a transparent hit-area expansion. Effect needs a device check. Live line 139.
- **RUN-04 · minor · Tab bar labels are 10px; DESIGN.md says 11px** `src/components/mobile/PhoneNav.tsx:307`  
  Live tab labels are text-[10px] against a documented 11px; the unused pill variant at :226 uses 11px. Fix: text-[11px]. Same problem as TYP-04.
- **RUN-05 · minor · Discover score note is 9px zinc-400 (2.65:1)** `src/components/mobile/PhoneRestaurantCardGrid.tsx:184`  
  text-[9px] zinc-400 on white fails 4.5:1; DESIGN.md:64 limits zinc-400 to large decorative text. Fix: zinc-500 and 11px. Same problem as COL-06. Live line 226.
- **RUN-06 · minor · Small cream-on-orange labels at 12-13px are 3.87:1** `src/components/mobile/PhoneFindFriends.tsx:509`  
  Add (12px) and Save (13px) break DESIGN.md:74, which allows cream on orange only at 14px medium and up. Fix: text-sm or a darker fill. Same problem as COL-04.
- **RUN-07 · minor · Header Feed and Map tabs are 32-35px wide** `src/components/mobile/PhoneFeedTabs.tsx:99`  
  min-h-11 sets height only; tabs measure 31.9 and 34.7px wide, under the 44px floor. Fix: add min-w-11 or px-2. Effect needs a device check.
- **RUN-08 · minor · Vote arrows 28px and Share/Save 30px wide** `src/components/feed/PostActions.tsx:305`  
  Vote buttons are w-7 (28px), exactly the 28 pt floor; pseudo-elements add no hit area. Fix: widen to w-9/w-10 with negative margin. Effect needs a device check.
- **RUN-09 · minor · Legal contents links are 19px tall on a 26px pitch** `src/components/legal/LegalSection.tsx:40`  
  17 (Privacy) and 22 (Terms) contents links are 19px tall, under 28 pt. Fix: block min-h-11 py-2 on each link.
- **RUN-10 · minor · See every comment button is 16px; dish sheet Close is 32px** `src/components/DishPosts.tsx:165`  
  font-mono text-xs button with no padding is 16px tall; Close is 32x32. Fix: min-h-11 on the button and a 44px hit box on Close.
- **RUN-11 · minor · Last updated line is zinc-500 on cream (4.28:1)** `src/components/legal/PrivacyDocument.tsx:84`  
  text-zinc-500 on the cream ground fails 4.5:1 and breaks AGENTS.md. Fix: text-pm-grey-text here and in TermsDocument.tsx:47.
- **RUN-12 · minor · Free-slice popup then sign-up sheet on first launch** `src/components/mobile/PhoneSignUpSheet.tsx:82`  
  Sheet arms after 1200 ms without checking for an open dialog; ov-feed.jpg shows both stacked. Fix: wait for any role=dialog to close first. Same problem as MOD-02.
- **RUN-13 · polish · Signed-out vote notice has no action** `src/components/mobile/PhoneFeedScreen.tsx:749`  
  onRequireSignIn only sets a text banner that cannot be tapped. Fix: make the pill a button that reopens the sign-up sheet. Same problem as MOD-07.
- **RUN-14 · polish · No color-scheme declared; page identical in Dark Mode** `src/app/layout.tsx:93`  
  Viewport has no colorScheme, CSS has no color-scheme, Info.plist has no UIUserInterfaceStyle. Fix: color-scheme: light on :root plus the plist key. Same problem as COL-01. Effect needs a device check. Live line 92.

## Deliberate deviations

- **NAV-D1 · Post a plate is an action in the middle of the tab bar** `src/components/mobile/PhoneNav.tsx:328`  
  Finder item 11. Opens the /m/post route and has aria-label.
- **RUN-D1 · Cream on orange at 14px medium and up (filter CTA, Friends sign-in)** `src/components/mobile/PhoneFilterSheet.tsx:728`  
  Also PhoneFriendsScreen.tsx:309. Split from the finder's cream-on-orange report.
- Pinch zoom left unlocked, the dark map with unclustered pins, and vote arrows are project rules. No area flagged them as violations.

## Refuted on review (15)

- **R1 · Profile avatar image has empty alt** `src/components/mobile/PhoneProfileScreen.tsx:156`  
  Spot-check failed: wrong element cited.
- **R2 · zinc-500 muted text on tone/tint/cream grounds under 4.5:1** `src/components/mobile/PhoneFilterSheet.tsx:661`  
  PhoneFilterSheet.tsx:609 sets bg-white. post/page.tsx legends partly sit inside a white card (:518); the rest is unproven.
- **R2 · Feed scroll position lost on return** `src/components/feed/usePostFeed.ts:146`  
  Would need a device test to claim.
- **R4 · Upload progress is a bar with no text and no retry** `src/app/m/post/page.tsx:478`  
  Spot-check failed.
- **R1 · Signup consent checkbox is 20px with inline legal links** `src/components/mobile/PhoneProfileAuth.tsx:362`  
  Evidence at :362-385 shows label min-h-11 wrapping box and links.
- **R1 · Inactive tab-bar icons are zinc-400 on cream with no label** `src/components/mobile/PhoneNav.tsx:191`  
  DEFAULT_VARIANT is arc (PhoneNav.tsx:42); ArcNav items use pm-grey-text / pm-orange-text and print labels. Pill and strip are marked for removal.
- **R1 · Map search uses type=text with role=searchbox** `src/components/mobile/PhoneMapSearch.tsx:146`  
  Finder item 9.
- **R1 · Log out is one tap with no confirmation** `src/components/mobile/PhoneSettingsScreen.tsx:101`  
  Button is spaced away from the destructive delete block.
- **R1 · Swipe-back commits on any fast flick with no minimum distance** `src/components/mobile/PhoneSwipeBack.tsx:231`  
  Evidence (offset>span*0.3 || speed>0.5) is real, but the claim is built on a rule Apple does not state.
- **R1 · App icon is a single 1024 universal image with no dark or tinted variants** `ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json:2`  
  Opaque, no text, full-bleed icon passes the rules. Appearance of generated variants is a device check only.
- **R1 · External links throw people out of the app into Safari** `src/components/mobile/PhoneDetailHero.tsx:158`  
  Links are target=_blank at PhoneDetailHero 158 and 236 and TicketCard 57; Capacitor opens them with UIApplication.open. Apple Maps angle kept as WEB-11.
- **R2 · Feed tablist mixes view and filters with no title** `src/components/mobile/PhoneFeedTabs.tsx:37`  
  Finder item 12.
- **R3 · Unused nav variants and ?nav= ship in production** `src/components/mobile/PhoneNav.tsx:95`  
  Finder item 13.
- **R3 · Rank change has no unit or period** `src/components/mobile/leaderboard/ChangeMark.tsx:34`  
  Spot-check failed.
- **R5 · Map rotation disabled with no compass** `src/components/RestaurantMap.tsx:1660`  
  Finder marked deliberate but no rule exists.

## Dropped as repeats by a reviewer (3)

- **R1 · Many text containers have a fixed box that would clip if type were enlarged** `src/components/mobile/PhoneProfileScreen.tsx:162`  
  Evidence present (aspect-square tiles, h-6 w-6 discs) but only matters once TYP-01 is fixed.
- **R2 · Small uppercase mono labels with wide tracking (59 places)** `src/components/mobile/leaderboard/MovementBanner.tsx:55`  
  Duplicate of TYP-03.
- **R2 · Fixed status banner overlays header for 3 s and cannot be dismissed** `src/components/mobile/PhoneFeedScreen.tsx:615`  
  Duplicate of MOD-07.

## Already right

- No horizontal overflow on any measured screen, at 393 or 375 wide.
- Every control has an accessible name. Every image has alt text.
- Reduce Motion is honored: running animations fell to 0 on the feed (from 6), Discover (from 15) and Friends (from 1).
- Each area file ends with its own Already right list: 141 items in total.

## Needs a real iPhone (26)

1. Status bar clock colour on cream screens, the feed map, camera and cropper, in Light and Dark Mode
2. What shows before first paint and when pulling past the page edge with no backgroundColor set; Dark Mode keyboard and alert colours
3. Whether the TestFlight archive was built after npx cap sync ios: sign out, open cold, check /m/account stays in the app
4. Whether WKWebView scales a -apple-system-body root with Larger Text and AX1 to AX5; how the tab bar, sheets and map overlays lay out
5. Keyboard overlap and accessory bar: composer Next/Post bar, comment box, plate-sheet comment, report note, sign-up sheet on a 375x667 phone
6. Home indicator and Dynamic Island clearance on iPhone SE 3, 15 Pro and 16 Pro Max; double top inset on Settings, legal pages and the hero back button
7. Whether (display-mode: standalone) in phone.css:137-167 matches in the WKWebView and sets touch-action: none
8. Thumb accuracy: feed links (14 to 16px), comment and post vote arrows, header Feed/Map tabs, map zoom and locate buttons, pins at zoom 9 to 15, percent slider grab area
9. Whether :active press styles paint with tap highlight off; long-press link preview and callout on tabs and cards; double-tap zoom on tabs and rows
10. Whether the first touchmove is cancelable for pull-to-refresh and swipe-back; slider versus swipe-back in the first 28px of the composer meter; whether overscroll-behavior: none leaves the scroller dead
11. Whether status-bar tap or re-tapping a tab does anything; history.length after cold start, push open and the offline page
12. VoiceOver: route titles, rotor headings and landmarks, whether aria-modal hides the page behind sheets, focus on open, vote arrows and score span, carousel, map and lightbox, role=status toasts, rival toast Dismiss label
13. Switch Control and Full Keyboard Access order in the composer, CoachTour and CameraCapture
14. First-launch order of splash, free-food ticket, sign-up sheet and the system push prompt; native launch mark against PhoneSplash size and position
15. Whether body overflow: hidden stops the page behind a sheet from scrolling or bouncing
16. Camera and location prompts: one alert or two, order of camera alert and photo notice, host name shown, web view behaviour after location is denied
17. What Download my data does in WKWebView
18. Support mailto with no Mail account; which browser Mail opens for reset and verify links and where the person lands
19. Whether iCloud Keychain offers or saves passwords without the webcredentials association; whether iOS capitalises the username
20. Whether iOS evicts the web view mid-composer and what Capacitor shows for a mid-session failure; how Next's default 404 and error pages look and whether swipe-back leaves them
21. Multi-photo upload time and failure on weak signal; tap-to-content on a public profile over cellular
22. Reduce Motion on: My Location fly, carousel dots, Taste skeleton, post flash (3.6 s when publish already finished)
23. Increase Contrast and Reduce Transparency on map pills, tab bar and dialogs; contrast of 10px credits over live photos and white text over live camera frames
24. Bold Text setting, font swap flash on cold start, generated dark app icon
25. Discover 2-up card width on SE and Pro Max after type is raised; readability of 10px tab labels beside system apps
26. Whether aps-environment becomes production in the distribution archive; how the push alert lands over the post-success animation and on the lock screen

The follow-up pass adds 5 more device checks. They are in [areas/live-delta.md](areas/live-delta.md).

## Rendered measurements

Chromium, the local dev build (the Nov 5 code at `eb2db87`), signed out, 393×852 at 2x and 375×667.

- Feed: 58 touch targets, 40 under 44px. Worst: the profile link at 79×14, the dish link at 112×16, the restaurant link at 101×15. Vote arrows are 28×44; Share and Save are 30×44.
- Discover: 51 text nodes under 11px, 24 under 4.5:1 contrast.
- Larger Text at 130%: 36 of 377 feed text nodes grew (10%). On Account, 14 of 21.
- Dark Mode emulation: page colours identical to Light. The page has no dark theme, which is by design. The finding is that the app never tells iOS it is light-only (COL-01).
- 375×667: no overflow.
- These numbers are from the Nov 5 build. The Discover cards changed on the live branch since. Their 9 and 10px text is still there (TYP-02), but the counts were not measured again.
- Full table: [measurements-summary.md](measurements-summary.md). Raw numbers: [measurements.json](measurements.json). Script: [measure.mjs](measure.mjs). Screenshots: `shots/`.

## Not covered

- **Screens that need a login, in the browser.** The measuring run was signed out because this machine has no test login file. Posting, voting, commenting and the signed-in account screens were read in code but not measured.
- **The live site, in the browser.** The measurements came from the local build, which is six days behind. The live branch was checked in code only.
- **The code that is new on the live branch, rendered.** The local build does not have it, and the For me and Nearby buttons and the picks are limited to named accounts. It was read in code only.
- **The plate detail sheet, rendered.** It did not open in the measuring run, so it was read in code only.
- **A real iPhone.** Everything rendered was Chromium emulation on Windows. The checks in the list above need a device or the TestFlight build.
- **The shipped binary.** The repo cannot show what the submitted archive contained (WEB-01). Install the TestFlight build, sign out, open it cold and check that `/m/account` stays in the app.
- **The desktop site.** Out of scope.

## Files

- Area write-ups: [layout](areas/layout.md), [targets](areas/targets.md), [type](areas/type.md), [color](areas/color.md), [nav](areas/nav.md), [modality](areas/modality.md), [motion](areas/motion.md), [a11y](areas/a11y.md), [input](areas/input.md), [feedback](areas/feedback.md), [privacy](areas/privacy.md), [webview](areas/webview.md), [media](areas/media.md), [copy](areas/copy.md), [runtime](areas/runtime.md), [live-delta](areas/live-delta.md).
- [measurements-summary.md](measurements-summary.md), [measurements.json](measurements.json), [measure.mjs](measure.mjs), `shots/` (34 screenshots).
