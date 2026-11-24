# Web view feel and system integration

13 confirmed (0 critical, 1 major, 6 minor, 6 polish) · 0 deliberate · 1 refuted, of 14 reported.

Grounded in the HIG pages web-views and launching (fetched 2026-11-11). The web-views page is short: show web content briefly inside the app, do not rebuild a browser, offer back/forward when people visit several pages. The launching page asks for a launch screen that matches the first screen and the current appearance, and for state to be restored on return. Most items below rest on those two pages plus general HIG principles; where that is so, the text says it.

## Findings

### WEB-01 · major · The synced Xcode config has no allowNavigation, so the build 8 fix may not be in the archive
- **Where:** `ios/App/App/capacitor.config.json:5` (dated Sep 20; `capacitor.config.ts` was saved Oct 11 and holds `allowNavigation: [SITE_HOST]` at line 69). Also `ios/App/App/public/offline.html:169` (retry goes to `/m`; `public/offline.html:169` says `/m/feed`).
- **Screens:** First launch, sign-in redirect to `/m/account`, Account tab, offline screen.
- **HIG:** launching: the first screen should arrive without a jarring detour. The real rule at stake is App Review 2.1(a), which rejected build 8 (the repo's own comment, `capacitor.config.ts:24-35`).
- **What happens:** The file Xcode builds from lacks the host entry. I read `WebViewDelegationHandler.swift` in Capacitor 8.5.1: a main-frame URL stays in the web view only if its host is in `allowNavigation` (line 102) or it starts with the full `server.url` (line 111, which here is `https://platemaps.com/m/feed`). Anything else is cancelled and handed to `UIApplication.open`. So `/m/account` would open in Safari, and the cancelled load shows `offline.html`. The bundled offline page is also an older copy (Sep 4). Both stale files are what `npx cap sync ios` overwrites. I cannot tell from the repo whether the submitted binary was built after a sync.
- **Fix:** Run `npx cap sync ios` before every archive. Confirm `ios/App/App/capacitor.config.json` contains `"allowNavigation": ["platemaps.com"]` and that the two `offline.html` files match. Add a one-line diff check to the release steps.
- **App Review risk:** high if the archive was made from the stale copy (same failure as build 8); none if it was synced after Oct 11.
- **Needs device:** no for the code fact. Yes to settle the shipped build: install the TestFlight build, sign out, and open the app cold.

### WEB-02 · minor · "Download my data" is an attachment link; a WKWebView failure would show the offline page
- **Where:** `src/components/account/AccountLedger.tsx:329-335` (`<a href="/api/account/export" download>`); `src/app/api/account/export/route.ts:31-32` answers `Content-Disposition: attachment`; `node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift:156`.
- **Screens:** Account settings, "Your data".
- **HIG:** general principle (web-views and activity-views): files handed out of an app should go through the system, such as the share sheet or Files. Apple's page does not say more.
- **What happens:** The host is allowed, so the tap navigates. A grep of Capacitor 8.5.1 for `navigationResponse` and `WKDownload` finds nothing, so no handler exists for an attachment response. `didFailProvisionalNavigation` loads `offline.html` for any error, not just network errors. If WebKit fails the load, the person sees "No connection" and "Try again" leads to the feed. This is inferred from source; I did not run it.
- **Fix:** In the app, `fetch()` the JSON and pass a `File` to `navigator.share({ files })` so it lands in the share sheet (Save to Files). Keep the link on the web. Test on a device first.
- **App Review risk:** low (export is not an App Review requirement, but a broken button on Account settings is visible).
- **Needs device:** yes. Tap it on an iPhone and see what appears.

### WEB-03 · minor · A comment-notification tap on an older post lands on the feed with nothing opened
- **Where:** `src/components/mobile/PhoneFeedScreen.tsx:199-207` (the comment states an older post "is left to the feed"; line 207 returns when the post is not in the loaded list). Also `src/lib/pushClient.ts:196`.
- **Screens:** Feed, from a push.
- **HIG:** launching: return people to where they meant to go. A tap should open what the notification is about.
- **What happens:** Routing is correct and safe (only `/m/` paths). But `?post=<id>` opens comments only if that post is in the first loaded page. Otherwise the person sees the plain feed with no note.
- **Fix:** Fetch the single post when it is missing from the list, or show a short "That plate isn't in your feed" note.
- **App Review risk:** none.
- **Needs device:** no.

### WEB-04 · minor · The web view and launch screen use the system background, not the cream ground
- **Where:** `capacitor.config.ts:87` (no `ios` block); `node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift:313-314` (falls back to `UIColor.systemBackground`); `ios/App/App/Base.lproj/LaunchScreen.storyboard:18` (`systemBackgroundColor`).
- **Screens:** Cold launch, return from the offline screen.
- **HIG:** launching: the launch screen should be nearly the same as the first screen and match the current appearance.
- **What happens:** `ios.backgroundColor` is read by `CAPInstanceDescriptor.swift` but not set. The page ground is `#F7F4EC` and the site has no dark theme. Info.plist has no `UIUserInterfaceStyle`. In Dark Mode the web view sits black behind a slow first paint, then flips to cream. In Light Mode it is white, then cream. I did not look at the Splash image itself.
- **Fix:** Add `ios: { backgroundColor: '#F7F4EC' }` to `capacitor.config.ts` and set the storyboard background to the same cream. Consider `UIUserInterfaceStyle = Light` since the site is light only.
- **App Review risk:** none.
- **Needs device:** yes. Cold launch in Dark Mode on a throttled connection.

### WEB-05 · minor · No Keyboard plugin: the form accessory bar shows, and keyboard overlap is unhandled
- **Where:** `package.json:41-43` (only core, ios, push-notifications); `capacitor.config.ts:87`. Fixed or sticky bottom controls: `PhoneStickyBar`, `Dialog.tsx` comment bar.
- **Screens:** Comments, composer, sign-in forms, search.
- **HIG:** general principle: keep the field being typed in visible and controls reachable while the keyboard is up.
- **What happens:** WKWebView draws its prev/next/Done bar above the keyboard on every input, as Safari does. `phone.css` uses `100dvh` and no `visualViewport` code, so whether fixed bars stay above the keyboard depends on WKWebView behaviour I cannot see from code. `CommentsScreen.tsx` has no `fixed` positioning, which may mean the comment box sits in flow and is fine.
- **Fix:** Install `@capacitor/keyboard` with `accessoryBarVisible: false` (and a `resize` mode), then test comments and the composer.
- **App Review risk:** none.
- **Needs device:** yes.

### WEB-06 · minor · Nothing refreshes the feed when the app returns from the background
- **Where:** `ios/App/App/AppDelegate.swift:28,49` (empty template stubs); `src/components/feed/usePostFeed.ts:188-195` (only an `online` listener). The only `visibilitychange` listener is the shared clock, `src/lib/clock.ts:57`.
- **Screens:** Feed, Discover, Friends.
- **HIG:** launching: apps are switched in and out often; people expect to return to a current screen in the place they left it.
- **What happens:** iOS keeps the web view alive, so a feed read at breakfast is still the feed at dinner. If iOS ends the web process, Capacitor reloads the current URL (`WebViewDelegationHandler.swift:164-167`), which keeps the route but loses scroll position.
- **Fix:** In `usePostFeed`, on `visibilitychange` to visible after about 10 minutes hidden, call the existing refresh quietly.
- **App Review risk:** none.
- **Needs device:** yes, for how long iOS keeps the page and what a reload feels like.

### WEB-07 · minor · The only native capability is push, which invites a 4.2 question
- **Where:** `package.json:41-43`; `ios/App/App/AppDelegate.swift:35-50` (only push token forwards).
- **Screens:** Whole app, App Review.
- **HIG:** web-views: a web view is for briefly showing web content, and an app should not be a browser. This is mostly App Review 4.2 (minimum functionality), not an HIG rule.
- **What happens:** Camera, location, photo pick and share all use web APIs. The shell is a remote site plus push. The app has accounts, community content and a phone-specific UI, so it may well pass, but it is thin.
- **Fix:** In the review notes, say that push, in-app camera capture and location discovery use native permissions. Cheap native touches if wanted: `@capacitor/haptics` on vote, `@capacitor/share`, `@capacitor/keyboard`.
- **App Review risk:** medium (4.2 is a common reason for wrapper apps).
- **Needs device:** no.

### WEB-08 · polish · Double-tap zoom is switched off only on the feed card
- **Where:** `src/components/mobile/PhoneFeedPostCard.tsx:490` (`touch-manipulation`); `src/app/m/phone.css` has `touch-action` only for the map lock (lines 117-162). Layout viewport allows scaling on purpose.
- **Screens:** All phone screens except the feed card.
- **HIG:** general principle: taps should act on the control, not be taken by the browser. Pinch zoom stays on by design.
- **What happens:** Fast double taps on vote arrows, tab bar or list rows may zoom the page in WKWebView. I am not sure WKWebView does this on a `width=device-width` page, so it needs a device.
- **Fix:** `.pm-phone-shell { touch-action: manipulation; }` in `phone.css`. Pinch zoom is untouched.
- **App Review risk:** none.
- **Needs device:** yes. Double-tap a tab and a row.

### WEB-09 · polish · Long press on tabs and cards raises Safari's link preview and callout
- **Where:** `capacitor.config.ts:87` (no `ios.allowsLinkPreview`; key read at `CAPInstanceDescriptor.swift`); no `-webkit-touch-callout` or `user-select` under `src/app/m` or `src/components/mobile`. `src/app/globals.css:1062` keeps the image callout on purpose.
- **Screens:** Tab bar, feed cards, lists.
- **HIG:** general principle: app chrome should not behave like page content.
- **What happens:** Tabs and cards are anchors, so a long press shows the preview and the Open / Copy Link menu. I did not check the Capacitor default value for `allowsLinkPreview`; the finder reported it as true.
- **Fix:** `ios: { allowsLinkPreview: false }`, and in `phone.css` set `-webkit-touch-callout: none` on `nav a` and buttons only, leaving images alone.
- **App Review risk:** none.
- **Needs device:** yes.

### WEB-10 · polish · Phone copy says "browser" and "this site" inside an app
- **Where:** `src/components/mobile/PhoneFeedMapPanel.tsx:83-84`; `src/components/feed/NearbyFeedGate.tsx:74,95`. Also `src/components/post/CameraCapture.tsx` (a "browser" camera message near line 616, not re-read) and "the PlateMaps website" in `PrivacyDocument.tsx:101` and `TermsDocument.tsx:53` (per the finder, not re-read).
- **Screens:** Map fallback, Nearby gate, camera, Terms, Privacy.
- **HIG:** general principle: the app should not read like a recreated browser (web-views, "don't build a web browser").
- **What happens:** "Allow location for this site in your browser or phone settings" sends people to the wrong place; in the app it is Settings, PlateMaps.
- **Fix:** Use "your phone" and "PlateMaps". For the location gate: "Turn on Location for PlateMaps in Settings."
- **App Review risk:** low.
- **Needs device:** no.

### WEB-11 · polish · Directions link goes to Google Maps on an iPhone-only app
- **Where:** `src/lib/format.ts:53`; used at `src/components/mobile/PhoneDetailHero.tsx:157-158`.
- **Screens:** Restaurant page.
- **HIG:** general principle (designing-for-ios): use what the platform already gives. The pages do not name Apple Maps.
- **What happens:** `https://www.google.com/maps/search/?api=1&query=...` opens Safari unless the Google Maps app is installed. Capacitor hands it to the system (`WebViewDelegationHandler.swift:336`). The address link has a 44 pt target already.
- **Fix:** On iOS build `https://maps.apple.com/?q=<name, address>` and keep the Google URL on other platforms.
- **App Review risk:** none.
- **Needs device:** no.

### WEB-12 · polish · Shared plate links open Safari even when the app is installed
- **Where:** `ios/App/App/App.entitlements:5` (only `aps-environment`); no `public/.well-known`; `src/components/feed/usePostFeed.ts:489` (`/feed?post=<id>`).
- **Screens:** Share on a feed card.
- **HIG:** general principle: a shared link should land in the right place.
- **What happens:** A friend who taps the link opens Safari. Correction to the finder: `src/proxy.ts:84-90` redirects phones from `/feed` to `/m/feed` and keeps the query string, so `?post=` survives and the web page works. The gap is only that the app does not open.
- **Fix:** Add `applinks:platemaps.com`, serve an apple-app-site-association file for `/m/*`, and use the App plugin to route the opened URL. This is real work for a small gain.
- **App Review risk:** none.
- **Needs device:** no.

### WEB-13 · polish · The contact row is a bare mailto
- **Where:** `src/components/mobile/PhoneSettingsScreen.tsx:129` (`SUPPORT_MAILTO`); `src/components/mobile/freefood/InviteFriends.tsx:51` (sms: via `window.location.href`, per the finder).
- **Screens:** Settings, free food invite.
- **HIG:** general principle: a hand-off should still work when the target app is not set up.
- **What happens:** The row does not show the address and offers no copy. With no mail account, the tap does little.
- **Fix:** Show the address as the row's secondary text, or add a Copy action.
- **App Review risk:** none.
- **Needs device:** no.

## Deliberate deviations

None in this list. Pinch zoom stays unlocked by design (AGENTS.md, DESIGN.md); WEB-08 leaves it alone.

## Refuted

- R1 External links (Instagram, Yelp, Google Maps) throw people into Safari: the web-views page says Safari is the primary way people browse and discourages rebuilding it. Handing off to Safari or the target app is the intended pattern, not an HIG gap. (The links are `target="_blank"` at `PhoneDetailHero.tsx:158,236` and `TicketCard.tsx:57`, and Capacitor opens them with `UIApplication.open`.) The Apple Maps point is kept as WEB-11.

## Already right

- Navigation stays in the app by next/link; `window.location` is used only for sms: (`InviteFriends.tsx:51`).
- Offline page exists and works: `capacitor.config.ts:85`, `public/offline.html:80-108`; online listener at `usePostFeed.ts:188-195`.
- Terms, Privacy, forgot/reset password and verify-email have `/m` routes; Settings links to them (`PhoneSettingsScreen.tsx:134-141`). This clears the September check's stranded-on-desktop item.
- Share uses `navigator.share` with a clipboard fallback and an honest failure note (`usePostFeed.ts:489-507`).
- Pinch zoom not locked; inputs are 16 px (`layout.tsx:80-95`, `Composer.tsx:79-88`).
- Push tap routing accepts only `/m/` paths and survives a cold launch (`pushClient.ts:196-199`, `PushRegistration.tsx:38`); the permission prompt waits for a first action.
- Address link and Instagram link have 44 pt targets and `rel="noopener noreferrer"` (`PhoneDetailHero.tsx:158-163`, `TicketCard.tsx:57-60`).
- Overscroll: Capacitor sets `bounces = false` (`CAPBridgeViewController.swift:301`); `phone.css:42-47` sets `overscroll-behavior: none` when the map locks scroll. Scrollbar override is mouse-only (`phone.css:262-266`).
- Double-tap-to-like on the feed card has `touch-manipulation` (`PhoneFeedPostCard.tsx:490`).

## Needs a real iPhone

- Whether the submitted binary was built after `npx cap sync ios` (WEB-01).
- What "Download my data" does in WKWebView (WEB-02).
- Dark Mode flash before first paint, and the launch image against cream (WEB-04).
- Keyboard: accessory bar, and whether the comment box, composer bar and sticky bar stay visible (WEB-05).
- How long the page lives in the background, and scroll position after a web-process reload (WEB-06).
- Double-tap zoom on tabs, vote arrows and rows (WEB-08).
- Long-press preview and callout on tabs and cards (WEB-09).
- Camera and location permission prompts, and which host name they show.
- Back/forward feel of the JS edge swipe (`PhoneSwipeBack.tsx`) against the offline page's retry from a deep screen.
