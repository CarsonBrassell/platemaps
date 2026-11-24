# Launch, loading, empty and error states

11 confirmed (0 critical, 0 major, 7 minor, 4 polish) · 0 deliberate · 1 refuted, of 12 reported. The finder's two "major" boundary and loading items and its "major" restore item were re-rated minor: none is hit regularly on a primary screen. Three finder details were corrected (FBK-02, FBK-09, FBK-01).

HIG pages fetched: launching, loading, feedback, progress-indicators, app-icons. The loading page does not say what to do when content is unavailable, and the feedback page has no error-page rule, so FBK-01 and FBK-06 rest on the feedback page's "explain why something failed" guidance plus general principle. Nothing here is recorded in AGENTS.md or DESIGN.md (no match for splash, launch or offline in DESIGN.md).

## Findings

### FBK-01 · minor · No not-found, error or global-error boundary under /m
- **Where:** `src/app/m/layout.tsx:33` (no sibling boundary files exist anywhere under `src/app`; a find for not-found.tsx, error.tsx, global-error.tsx and loading.tsx returned nothing). Callers: `src/app/m/restaurant/[id]/page.tsx:37`, `src/app/m/u/[id]/page.tsx:52` and `:70`.
- **Screens:** Restaurant detail (unknown or retired id), public profile (unknown user, or a user you blocked or who blocked you), any /m route that throws on the server.
- **HIG:** Feedback: tell people when something cannot be done and explain why. General principle: do not leave a dead end with no way forward.
- **What happens:** Three `notFound()` calls and no boundary, so Next's built-in unbranded 404 shows (and its generic error page for a throw). With no `not-found.tsx` under /m, the page most likely renders under the root layout only, so no PlateMaps header and no tab bar. The WKWebView has no address bar or Back button. `ProfileBlockButton` does not navigate after a block, so the 404 appears on the next visit to that profile, not at the moment of blocking. A stale push link or old card to a held restaurant is the other route in.
- **Fix:** Add `src/app/m/not-found.tsx` and `src/app/m/error.tsx` (client, with `reset`) using the white-card-on-cream look of `PhoneFeedState`: a title, one sentence, a "Back to the feed" pill (`/m/feed`) and, for errors, "Try again". Add a bare `src/app/global-error.tsx` on the cream ground.
- **App Review risk:** low (a reviewer has to hit a bad id or a server throw; a dead end would be cited under 2.1)
- **Needs device:** yes (see what the default 404 looks like in the shell, whether swipe-back works, and Dark Mode)

### FBK-02 · minor · No loading state when a tap goes to a server-rendered screen
- **Where:** `src/app/m/layout.tsx:51` (`<Suspense fallback={<div className="pm-phone-shell" />}>`), `src/app/m/u/[id]/page.tsx:46`, `src/app/m/restaurant/[id]/page.tsx:25`.
- **Screens:** Feed or Discover to a public profile; first visit to any restaurant not yet generated.
- **HIG:** Loading: show something right away and swap real content in as it arrives, rather than leaving people looking at nothing changing.
- **What happens:** There is no `loading.tsx` under /m. The finder's claim is too broad. The restaurant page is on-demand ISR (`revalidate = 3600`, empty `generateStaticParams`), so after the first render per hour it is cached and Link prefetch makes it quick. The profile page is the real gap: it calls `getCurrentUser()` and `getBlockStatus()` (`u/[id]/page.tsx:46-70`), so it is dynamic and a tap waits on the server with the old screen unchanged. The only pending treatment in the phone tree is the Discover filter dim (a `useTransition`, noted in CLAUDE.md). The feed skeleton exists but only shows after mount.
- **Fix:** Add `src/app/m/u/[id]/loading.tsx` and `src/app/m/restaurant/[id]/loading.tsx` with the existing `.skeleton` blocks (reduced motion already honoured in `globals.css`). A shared `src/app/m/loading.tsx` would also replace the empty shell div.
- **App Review risk:** none
- **Needs device:** yes (cellular tap-to-content time on a profile)

### FBK-03 · minor · Relaunch after the web view is evicted always opens the feed; composer state is lost
- **Where:** `src/app/m/post/page.tsx:95-111` (photos, plates, dish, pct, step all in `useState`; no `localStorage` or `sessionStorage` in the file), `capacitor.config.ts:48` (URL pinned to /m/feed).
- **Screens:** Post composer, plus wherever the person was before the app was reclaimed.
- **HIG:** Launching: restore the previous state on restart so people continue where they left off, including detail such as scroll position.
- **What happens:** If iOS drops the web content process while the app is in the background, the reload goes to `/m/feed` and an in-progress post (photos included) is gone. Comment text in the composer reply field is lost the same way. A text-post drafts route exists (`src/app/m/drafts`), but the photo composer has no draft. How often iOS evicts cannot be known from code.
- **Fix:** Save `location.pathname + search` to `sessionStorage` on `pagehide`/`visibilitychange` and restore it on a cold /m/feed open if under about 30 minutes old. For the composer, persist restaurant, dish, pct and step the same way; photos need IndexedDB and are a later step.
- **App Review risk:** none
- **Needs device:** yes (background the app on a low-memory phone mid-post)

### FBK-04 · minor · Posting shows only the button text "Posting…"
- **Where:** `src/app/m/post/page.tsx:805` (label), `:348` (`await uploadMealPhotos(...)` before the post request).
- **Screens:** Post composer, last step.
- **HIG:** Progress indicators: use a determinate indicator when the length is known, keep indicators moving, and avoid vague labels. Offer Cancel if stopping is safe.
- **What happens:** The button goes to 50% opacity and says "Posting…" while every photo uploads one batch then the post is sent. The only progressbar on the page (`:474-482`) is the step counter. A multi-photo meal on weak signal has no count and no movement. I did not read `uploadMealPhotos`, so I cannot say whether it times out. Failure handling itself is good (see Already right).
- **Fix:** Pass an `onProgress` callback and show "Uploading 2 of 5…" in the button; reuse the `.step-progress` bar as a determinate bar. A Cancel via `AbortController` is optional.
- **App Review risk:** none
- **Needs device:** yes (a throttled cellular upload)

### FBK-05 · minor · A failed pull-to-refresh says nothing when posts are already showing
- **Where:** `src/components/feed/usePostFeed.ts:106` (catch keeps previous posts and sets `loadError`), `src/components/mobile/PhoneFeedScreen.tsx:643` (`loadError && posts.length === 0` is the only place the error shows).
- **Screens:** Feed, Discover and Friends tabs.
- **HIG:** Feedback: say when something could not be done and why; failures are where feedback matters most.
- **What happens:** `PhonePullToRefresh` runs `reloadFeed`; if the fetch fails the spinner stops and the same feed stays, with no message. The offline banner only shows when `navigator.onLine` is false (`usePostFeed.ts:187-196`), which stays true on a captive portal, a timeout or a server error. Load-more failures do show a banner (`:171`), so the pattern exists.
- **Fix:** In the catch, when previous posts exist, call `setBanner("Couldn't refresh. Pull to try again.")`. The same line fixes the web feed.
- **App Review risk:** none
- **Needs device:** no

### FBK-06 · minor · Friends list load failure has no retry and also shows the empty-friends view
- **Where:** `src/components/mobile/PhoneFriendsScreen.tsx:172` (no `r.ok` check before `r.json()`), `:179-182` (catch sets `friends` to `[]` and an error string), `:275` (plain `role="alert"` paragraph).
- **Screens:** Friends.
- **HIG:** Feedback: explain what went wrong and give a way to act on it.
- **What happens:** On a network failure the screen shows one sentence and falls through to the same layout as a person with no friends, which is untrue. There is no Try again, unlike the feed's card (`PhoneFeedScreen.tsx:643-657`). A 500 with a JSON body takes the success path with undefined lists.
- **Fix:** Keep `friends` null on failure, render a `PhoneFeedState` card with Try again that re-runs `load`, and check `r.ok`.
- **App Review risk:** none
- **Needs device:** no

### FBK-07 · minor · Native launch image and PhoneSplash do not match, and the web splash holds a fixed 1.2 s
- **Where:** `src/app/m/phone.css:711-726` (animation 1.6 s, opaque to 75%), `src/components/mobile/PhoneSplash.tsx:57` (`h-48` = 192 pt), `ios/App/App/Base.lproj/LaunchScreen.storyboard:13` (2732 px square, scale-aspect-fill).
- **Screens:** Cold launch.
- **HIG:** Launching: the launch screen should be nearly identical to the first screen and is not a branding opportunity; logos only if a fixed part of the first screen. A splash, if used, comes after launching completes. Launch instantly.
- **What happens:** The native screen is a logo image and so is the web overlay, so there are two logo screens in a row. The native mark scales with the image (about 0.309 per pixel on an 844 pt phone, per the finder's measured 708 px pin height, which I did not re-measure), the web mark is a fixed 192 pt, so the mark changes size at the handoff. Then the overlay stays fully opaque 1.2 s on every cold open whatever the load state, with reduced motion unchanged (`:731-734`). The overlay does not block taps (`pointer-events: none`), but it hides the feed skeleton underneath.
- **Fix:** Drop the web splash and let the native screen hand off to the feed skeleton, or size the web mark to match and end the hold when the first posts paint (about 0.4 s minimum).
- **App Review risk:** none
- **Needs device:** yes (compare the handoff by eye)

### FBK-08 · polish · Web view has no background colour, so the gap before first paint is the system default
- **Where:** `capacitor.config.ts:40-86` (no `backgroundColor`, no `ios` block), `ios/App/App/Base.lproj/LaunchScreen.storyboard:14` (`systemBackgroundColor` under the image).
- **Screens:** Cold launch, return from offline.html.
- **HIG:** Launching: avoid a jarring change between the launch screen and the first screen.
- **What happens:** The site is remote, so between the launch image going away and the first HTML byte the web view shows its own default ground. `Info.plist` has no `UIUserInterfaceStyle`, so a Dark Mode phone may show black, then cream. Duration depends on the network.
- **Fix:** Add `backgroundColor: '#F7F4EC'` (or `ios.backgroundColor`) to the config and `cap sync`; set the storyboard view colour to the same cream.
- **App Review risk:** none
- **Needs device:** yes (Dark Mode cold launch on a slow connection)

### FBK-09 · polish · Offline banner promises "the last plates we loaded" next to a card saying the feed failed
- **Where:** `src/components/feed/EmptyFeedState.tsx:103`, `src/components/mobile/PhoneFeedScreen.tsx:605` and `:458` (banner), `:643-648` (failed card).
- **Screens:** Feed.
- **HIG:** Feedback: status messages should be accurate.
- **What happens:** The finder said this happens after a cold start offline. It does not: a cold offline launch shows `offline.html` (`capacitor.config.ts` `errorPath`). The real trigger is going offline after the page loaded and then switching tab: `usePostFeed.ts` clears `posts` on an endpoint change, the fetch fails, and the screen shows "Couldn't load the feed" under a banner that says last plates are being shown. With posts on screen the copy is correct.
- **Fix:** Give `OfflineBanner` a `hasPosts` prop; with none, say "You're offline." only.
- **App Review risk:** none
- **Needs device:** no

### FBK-10 · polish · "No plates within 5 mi yet" gives advice but no button
- **Where:** `src/components/mobile/PhoneFeedScreen.tsx:679-685` (no `action` prop on that `PhoneFeedState`).
- **Screens:** Feed, Discover tab with Nearby on.
- **HIG:** General principle: an empty state should explain itself and make the next step easy.
- **What happens:** The card says to switch to Trending or New; the neighbouring empty states all carry a pill (`Post a plate`, `Find friends`, `Clear filters`).
- **Fix:** Add a `min-h-11` pill, "Show all of San Diego", that turns Nearby off with the same setter the Nearby chip uses.
- **App Review risk:** none
- **Needs device:** no

### FBK-11 · polish · offline.html status line is not a live region
- **Where:** `public/offline.html:156` (`<p class="status" id="status">`), script at `:171-180`.
- **Screens:** Offline launch or failed first load.
- **HIG:** Feedback accessibility: do not rely on one channel; VoiceOver users need the same result.
- **What happens:** "Still offline" and "Reconnecting…" are written into a plain paragraph with no `role="status"` or `aria-live`, so VoiceOver stays silent. If the site is still unreachable after `location.replace(SITE)`, the page reloads with the text cleared and nothing explains the flash.
- **Fix:** Add `role="status" aria-live="polite"` to the paragraph. Optionally store a "Tried again, still can't reach PlateMaps" string in `sessionStorage` for the reload.
- **App Review risk:** none
- **Needs device:** yes (VoiceOver on the offline page)

## Deliberate deviations
None found. The splash behaviour is explained in a code comment (`PhoneSplash.tsx`, `phone.css`) but is not a rule in AGENTS.md or DESIGN.md.

## Refuted
- App icon is a single 1024 universal image with no dark or tinted variants: the app-icons page says the system generates any variant that is not supplied, and segments a flat bitmap into foreground and background. Nothing in the file breaks a stated rule (opaque, no text, full-bleed). Whether the generated dark look reads well is a device check, not a defect.

## Already right
- `public/offline.html:60-156` and `capacitor.config.ts:85`: local-only offline fallback with a 44 pt pill and a retry that also fires on the `online` event; answers the build 8 blank-screen rejection.
- `src/components/feed/FeedSkeleton.tsx:1-27`: skeleton shaped like a post card, sr-only "Loading posts…", shimmer honours reduced motion (`src/app/globals.css:1112`).
- `src/components/mobile/PhoneFeedScreen.tsx:643-693`: feed error and empty states are cards with plain-language copy and a pill action (Try again, Post a plate, Find friends).
- `src/components/mobile/PhoneDiscoverResults.tsx:75-102`: filter changes dim the old grid, and the zero-result card names the filter and offers Clear filters.
- `src/app/m/post/page.tsx:338-399`: photos upload before the confirmation opens, and a refused post discards the orphan uploads with a specific message.
- `src/components/feed/usePostFeed.ts:271-292` and `src/components/mobile/PhoneFeedScreen.tsx:610-618`: optimistic votes roll back with a viewport-fixed role=status banner.
- `src/components/mobile/PhoneFeedMapPanel.tsx:100-108`: dark map skeleton so no cream flash on the night surface.
- `capacitor.config.ts:91-93`: foreground push shows alert, sound and badge.

## Needs a real iPhone
- Cold-launch timing and whether the default web view ground (white or black) shows before the first paint, including Dark Mode.
- Whether the native launch mark and PhoneSplash line up in size and position on different iPhones.
- Whether and how often iOS evicts the web view mid-composer, and what Capacitor shows for a mid-session main-frame failure.
- How Next's default 404 and error pages look inside the shell and whether swipe-back leaves them.
- Tap-to-content time on a public profile over cellular, and multi-photo upload time and failure on weak signal.
- VoiceOver on loading states, banners and the offline page status line.
