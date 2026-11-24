# Gestures, motion and haptics

8 confirmed (0 critical, 0 major, 3 minor, 5 polish) · 0 deliberate · 1 refuted, of 9 reported.

HIG pages used: Gestures, Motion, Playing haptics, Scroll views (all fetched 2026-11-11). The refresh-content page returned 404, so the pull-to-refresh items rest on the general Gestures guidance. Nothing here is likely to cause an App Review rejection on its own.

## Findings

### MOT-01 · minor · The post-success flash blocks every touch for at least 3.6 seconds, with no way to skip
- **Where:** `src/app/m/phone.css:387` (`.post-flash-on { pointer-events: auto }`), `src/lib/postCelebration.ts:60` (`MIN_ON_SCREEN_MS = EAT_TOTAL_MS + 90`), `src/components/mobile/PostFlash.tsx:194` (aria-hidden, no tap handler)
- **Screens:** Composer (`/m/post`) after tapping Post, then the feed
- **HIG:** Motion. Avoid extra motion in things people do often. Make animation skippable or interruptible. Do not block input until an animation finishes.
- **What happens:** The flash opens on the tap. The floor is 3,500 ms of bites plus 90 ms, so 3,590 ms, capped at 6,000 ms. Reduced motion shortens it to 650 ms. The layer takes all touches. `PostFlash.tsx` has no onClick, no onTouch and no dismiss control (grep found none). Posting is the app's main repeat action. DESIGN.md also sets a motion budget of 300 ms or less (Motion & accessibility, line 280), and this is about twelve times that. Part of the wait covers the real publish request, and blocking input there is sensible. The animation floor after the publish returns is the part that is not.
- **Fix:** Let a tap anywhere on the flash end it early (call `closePostFlash` with the floor ignored once the publish has resolved). Or drop `pointer-events: auto` once the publish is done.
- **App Review risk:** low
- **Needs device:** no

### MOT-02 · minor · Several animations ignore Reduce Motion, and there is no global rule
- **Where:** `src/components/mobile/PhoneTasteSection.tsx:151,160` (Tailwind `animate-pulse`), `src/components/RestaurantSearch.tsx:161` (`animate-spin`), `src/components/MyLocation.tsx:232,351` (`map.easeTo` at 900 ms, and 700 or 1200 ms, no `matchMedia` check), `src/components/feed/PostMediaCarousel.tsx:101` and `src/components/mobile/PhoneDetailScreen.tsx:141` and `src/components/RestaurantComments.tsx:98` (`behavior: "smooth"`)
- **Screens:** Taste section, photo carousel, detail screen, map My Location button, restaurant search
- **HIG:** Motion. Custom motion should stay usable when the system accessibility settings are on. It should be optional.
- **What happens:** AGENTS.md line 24 lists `prefers-reduced-motion` as part of the accessibility floor, and DESIGN.md says everything is disabled under it. Coverage is per feature (15 blocks in globals.css, 4 in phone.css, plus rivals.css, rankTracker.css, freefood.css). The only catch-all is `.lb-root *` in the leaderboard. The files above have no guard. `.snap-track { scroll-behavior: auto }` at `globals.css:1119` does not help, because an explicit `behavior: "smooth"` in script overrides it. The map is inconsistent with itself: `useMapSearch.ts:191` and the first-fit dive in `RestaurantMap.tsx` already skip animation, but My Location flies for up to 1.2 s. The pulse and the spinner are mild (opacity and a small spin), so those two are the weakest part of this item.
- **Fix:** Add one `prefersReducedMotion()` helper (the code in `useMapSearch.ts:191` already does this) and route `easeTo`, `scrollTo` and `scrollIntoView` through it. Add `motion-reduce:animate-none` to the pulse skeletons.
- **App Review risk:** low
- **Needs device:** yes (turn Reduce Motion on and tap My Location, the carousel dots, and open the Taste section)

### MOT-03 · minor · Pull-to-refresh takes the touch on the first downward pixel, so a slightly drooping horizontal swipe on a photo carousel is cancelled
- **Where:** `src/components/mobile/PhonePullToRefresh.tsx:332-341` (no comparison of dy to dx anywhere in `onMove`), `src/components/feed/PostMediaCarousel.tsx:143` (the multi-photo track has no `touch-action`; only the single-photo track has `touch-pan-y`)
- **Screens:** Feed, any multi-photo card visible while the list is scrolled to the top
- **HIG:** Gestures. Respond predictably, and do not break standard gestures such as swipe and scroll.
- **What happens:** When `scrollTop` is 0, the touch starts with `atTop = true`. The first `touchmove` with dy greater than 0 sets `engaged = true` and calls `preventDefault()`. The code comment says this is intentional so that WebKit does not start its own bounce. The cost is that a horizontal swipe on a carousel that moves even one pixel downward on its first move loses its horizontal scroll. The `SLOP` of 8 only affects the dial, not who owns the gesture.
- **Fix:** Wait for the axis. Claim the touch only when dy is greater than |dx| after a few pixels (as `PhoneSwipeBack.tsx:198` does), and let the carousel keep horizontal moves. Test that the iOS bounce does not return, because `overscroll-behavior: none` already refuses it.
- **App Review risk:** low
- **Needs device:** yes (whether the first `touchmove` is still cancelable in WKWebView, and how often real swipes drift down)

### MOT-04 · polish · A range slider thumb at 0 to 3 percent sits inside the 28 px swipe-back edge
- **Where:** `src/components/mobile/PhoneSwipeBack.tsx:13,168` (EDGE = 28; only `.maplibregl-map` and `[data-no-swipe-back]` are exempt; `data-no-swipe-back` is set nowhere in `src`), `src/components/post/PercentMeter.tsx:176`, `src/app/globals.css:1512-1535`
- **Screens:** Composer, rating step
- **HIG:** Gestures. Custom gestures must not conflict with standard controls. Edge swipe supplements navigation.
- **What happens:** The composer has a 16 px page gutter (`px-4`). The meter is a full-width, 56 px tall range input with a 10 px thumb. At 0 percent the thumb spans x 16 to 26, and the first 12 px of the track is inside the edge zone. Composer steps push history entries, so depth is above 1 and swipe-back is live there. A rightward drag started in that strip is taken by swipe-back (`preventDefault` on touchmove) instead of moving the thumb. That strip is about 3 percent of the track. The finder also cited `EmojiSlider.tsx:67`, but no phone route uses it (the phone composer uses only `PercentMeter`), so only one control is affected.
- **Fix:** Add `data-no-swipe-back` to the `.meter-shell` wrapper, or have `onStart` return when the target is `input[type=range]`.
- **App Review risk:** none
- **Needs device:** yes (whether swipe-back or the slider wins; WKWebView handles slider drags natively)

### MOT-05 · polish · `overscroll-behavior: none` on every phone scroller removes the elastic edge outside the feed
- **Where:** `src/app/m/phone.css:249` (`.pm-phone-content`), `src/app/m/phone.css:46` and `:174` (map lock)
- **Screens:** Every `/m` screen that scrolls, apart from the feed (the feed has its own pull)
- **HIG:** Scroll views. People expect standard scroll behavior. (The page only states a rule for custom scroll indicators, not for page bounce, so this is a general principle.)
- **What happens:** The code comment above line 249 says `none` was chosen over `contain` on purpose, so the native bounce does not double the pull-to-refresh at the top. That reasoning holds for the feed only. Discover, friends, account, restaurant, profile and the others lose the bounce and the visible end of the list for no gain. This is not in AGENTS.md or DESIGN.md, so it is not a recorded design rule.
- **Fix:** Keep `none` on the feed scroller. Use `overscroll-behavior-y: contain` on the other screens. Check on a device first, since the map lock block (line 46) is separate and should stay.
- **App Review risk:** none
- **Needs device:** yes (whether the page bounces at all in this WKWebView)

### MOT-06 · polish · Pull-to-refresh is the only way to refresh the feed
- **Where:** `src/components/mobile/PhonePullToRefresh.tsx:364-367`, `src/components/mobile/PhoneFeedScreen.tsx:573` (the only caller)
- **Screens:** Feed
- **HIG:** Gestures. Do not make a gesture the only way to do an important action, and give people other ways to interact (VoiceOver, Switch Control).
- **What happens:** Refresh runs through touch listeners only. `PhoneNav.tsx` has no re-tap-to-top or refresh handling (grep for scrollTo and refresh found nothing). Refreshing a feed is not a critical action, and pull-to-refresh is a familiar system pattern, so this is a small gap. The sort switch and leaving and returning may refetch, but that was not checked.
- **Fix:** Re-tapping the active Feed tab scrolls to the top and calls `reloadFeed`. Optionally add a VoiceOver custom action.
- **App Review risk:** none
- **Needs device:** yes (what VoiceOver offers on the feed)

### MOT-07 · polish · The launch splash covers the feed for 1.2 s on every cold start, and 1.6 s under Reduce Motion
- **Where:** `src/app/m/phone.css:711` (`animation: phone-splash-out 1.6s`), `src/app/m/phone.css:730-734` (reduced motion switches to `steps(1, end)`), `src/components/mobile/PhoneSplash.tsx`
- **Screens:** App launch
- **HIG:** Motion. Do not make people wait on animation. (This overlaps the launch-screen area.)
- **What happens:** The keyframes hold at full opacity until 75 percent (1.2 s) and then fade for 0.4 s. With `steps(1, end)` the last interval does not fade at all, so the mark stays until 1.6 s and then cuts. The reduced-motion path therefore holds 0.4 s longer than the normal one. The layer has `pointer-events: none`, so taps pass through, but the content under it cannot be seen. The splash also masks the real page load of the remote site, which is why it exists (its doc comment explains this).
- **Fix:** Under reduced motion, use a 200 ms fade and end the hold. Better, tie the dismissal to the feed being ready rather than a fixed 1.2 s.
- **App Review risk:** low
- **Needs device:** no

### MOT-08 · polish · No haptics anywhere
- **Where:** `package.json` (Capacitor plugins are core, ios and push-notifications only)
- **Screens:** Vote buttons, post success, pull-to-refresh
- **HIG:** Playing haptics. Haptics should complement visual feedback, be used sparingly, and stay optional. The page does not require them.
- **What happens:** No Haptics plugin, so votes, post success and the refresh threshold have no tap feedback. Nothing in HIG says an app must have haptics. It is a native-feel nicety. The finder rated App Review risk medium. I rate it none: a missing haptic is not a rejection reason. (A remote-URL shell has other review risk, covered in other areas.)
- **Fix:** In the next native build, add `@capacitor/haptics` and fire a light impact on vote and a success notification on post, behind `Capacitor.isNativePlatform()`. Add an off switch if more than two uses are added.
- **App Review risk:** none
- **Needs device:** yes (a native build is needed to feel it)

## Deliberate deviations

None. The overscroll choice (MOT-05) is explained in a code comment but is not a rule in AGENTS.md or DESIGN.md, so it is listed as a finding.

## Refuted

- Swipe-back commits on any fast flick with no minimum distance: the touch must start inside the 28 px edge and move 4 px rightward before it is owned, and the content follows the finger, so there is a preview. A flick commits on velocity in the native iOS back gesture as well. HIG states no minimum-distance rule.

## Already right

- Swipe-back skips when a dialog is open, on the map, and never navigates on `touchcancel`: `src/components/mobile/PhoneSwipeBack.tsx:166-168,258`.
- Swipe-back keeps `touchmove` non-passive, owns the gesture only for a rightward, cancelable move (`e.cancelable` guard), and calls `preventDefault` only once owned: `PhoneSwipeBack.tsx:193-205,254`.
- Swipe-back has a 700 ms bailout so a failed `back()` cannot leave the screen parked off the edge: `PhoneSwipeBack.tsx:30-39,242-246`.
- Swipe-back reads depth live from `history.state`, so the composer's own steps still get the gesture: `PhoneSwipeBack.tsx:158-164`.
- Pull-to-refresh handles a multi-touch start, re-baselines at the end of a scroll, and releases cleanly if the finger reverses, so no gap is left open: `src/components/mobile/PhonePullToRefresh.tsx:240-296`.
- Pull-to-refresh is disabled while the comments screen or the post flash is up: `PhoneFeedScreen.tsx:573`.
- Double-tap to vote has a visible vote-arrow alternative and ignores buttons and links: `src/components/feed/useDoubleTap.ts:42`.
- Dialog swipe-to-dismiss turns its transition off while dragging, and sheets use `overscroll-contain`: `src/components/feed/Dialog.tsx:334,405`.
- Map camera moves honor Reduce Motion in search and first fit: `src/components/useMapSearch.ts:191,232`, `src/components/RestaurantMap.tsx:2477`.
- Reduced-motion rules exist for the post flash (650 ms floor), splash, vote kick, rank ring, heat meter and `.snap-track` smooth scroll: `src/lib/postCelebration.ts:68`, `src/app/m/phone.css:730`, `src/app/globals.css:1119,1844-1943`.
- Pull-to-refresh announces status through an sr-only region: `PhonePullToRefresh.tsx:445-447`.
- The splash layer never takes touches: `src/app/m/phone.css:709`.

## Needs a real iPhone

- Whether the first `touchmove` is still cancelable in WKWebView, for pull-to-refresh (MOT-03) and swipe-back.
- Whether swipe-back or the slider wins in the first 28 px of the composer meter (MOT-04).
- Whether `.pm-phone-content` bounces at all with `overscroll-behavior: none` (MOT-05).
- VoiceOver and Switch Control paths for refresh and swipe-back (MOT-06).
- Reduce Motion on: the My Location fly, carousel dots, Taste skeleton and the flash (MOT-02).
- The feel of the 3.6 s post flash when the publish has already finished (MOT-01).
- Haptic feel (none installed, MOT-08).
