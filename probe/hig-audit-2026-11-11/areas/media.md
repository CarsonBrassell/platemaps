# Map, photos, lists and data display

10 confirmed (0 critical, 1 major, 6 minor, 3 polish) · 0 deliberate · 5 refuted, of 15 reported.

Checked against the code and the HIG pages for maps, modality, charting-data, layout and privacy. The maps page gives no pin size and no control size. The 44 pt target figure is a general HIG principle (the layout page fetched here did not state it) and the project's own floor (`min-h-11`), so target findings are kept modest.

## Findings

### MED-01 · major · Map zoom and locate buttons are 29px, under the 44px floor
- **Where:** `src/app/globals.css:479` (`.map-fun-tiles .maplibregl-ctrl-group button`, no size set), `src/app/globals.css:517` (`.map-locate-btn`, no size set), `src/components/RestaurantMap.tsx:1663` (`NavigationControl`), `src/components/MyLocation.tsx:86`
- **Screens:** Map tab (Discover and Friends map), restaurant map
- **HIG:** General target-size principle (44 x 44 pt). The maps page says custom controls must contrast with the map; it gives no size.
- **What happens:** MapLibre's own stylesheet sets `.maplibregl-ctrl-group button` to 29px by 29px (`node_modules/maplibre-gl/dist/maplibre-gl.css`). Nothing in `globals.css` or `src/app/m/phone.css` overrides it. The phone panel only moves the stack down (`PhoneFeedMapPanel.tsx:408`, `pt-[calc(3.5rem+env(safe-area-inset-top))]`). So zoom in, zoom out and locate are three stacked 29px buttons with no gap. Locate is the only way to recentre. The Discover/Friends switch on the same screen uses `min-h-11`, so the screen breaks its own rule.
- **Fix:** In `globals.css`, give `.map-fun-tiles .maplibregl-ctrl-group button` and `.map-locate-btn` `width: 44px; height: 44px`. The `pt-[calc(3.5rem...)]` offset in `PhoneFeedMapPanel.tsx:408` still clears the tab row; the stack grows downward.
- **App Review risk:** low
- **Needs device:** yes (check the enlarged stack does not crowd the right edge or the search capsule)

### MED-02 · minor · Denied location leaves a dead, silent locate button
- **Where:** `src/components/MyLocation.tsx:109` (`button.disabled = state === "denied" || state === "unsupported"`), label text at `:118`, disabled colour `src/app/globals.css:533`
- **Screens:** Map tab
- **HIG:** Privacy page only says people can change a choice later in Settings. It does not tell apps to link there. So this is a general principle: say what is wrong and how to fix it.
- **What happens:** After a denial the button is disabled and shows only a tooltip/aria-label, "Location is blocked for this site". There is no visible message, no mention of iOS Settings, and the wording says "site" in an app. A disabled button also cannot be tapped to reveal anything. `useMyLocation` treats denial as final (`src/lib/myLocation.ts:192`). Disabled colour `#5c646e` on `#1d2126` is about 2.7:1, which is normal for a disabled control.
- **Fix:** Keep the button enabled in the denied state. On tap, show one line: "Location is off for PlateMaps. Turn it on in Settings > Privacy > Location Services." Change "site" to "app".
- **App Review risk:** low
- **Needs device:** yes (WKWebView denial behaviour and whether iOS ever re-prompts)

### MED-03 · minor · Photo viewer has no visible close button and no zoom
- **Where:** `src/components/RestaurantMap.tsx:3069` (`PhotoLightbox`), comment at `:3051` ("deliberately no close button")
- **Screens:** Map bubbles and popups
- **HIG:** Modality: always give an obvious way to dismiss a modal view; on iOS that is usually a toolbar button or a swipe down. Photos are named as a fit for full-screen modality.
- **What happens:** The overlay is a full-screen `role="dialog"` that closes on tap anywhere or Escape. There is no button, no swipe-down, and no pinch or double-tap zoom in the viewer. Tap-anywhere does work, and page pinch zoom is not locked, so this is not a dead end. The "deliberately" comment is a code comment, not a rule in AGENTS.md or DESIGN.md, so it is not a recorded design decision. Feed carousel photos (`PostMediaCarousel.tsx`) have no tap-to-enlarge at all. The prev/next buttons there are `hidden` below `sm`, but swipe works and the group is labelled "swipe to browse", so that part is fine.
- **Fix:** Add a 44px close button at top right (inside the safe area) and let a downward swipe close. Optional: open the same viewer from feed photos.
- **App Review risk:** low
- **Needs device:** yes (VoiceOver: whether the overlay can be dismissed; native page zoom inside the fixed overlay)

### MED-04 · minor · Restaurant pin hit area is 28 to 48px across
- **Where:** `src/components/RestaurantMap.tsx:2274` (`"circle-radius": byZoom(14, 16, 19, 24)` on layer `restaurant-hit`); `byZoom` is defined at `:2066` with stops at zoom 9, 13, 15, 18
- **Screens:** Map tab
- **HIG:** General target-size principle. The maps page gives no pin size.
- **What happens:** Radius 14, 16, 19, 24 gives diameters of 28, 32, 38 and 48 px at zoom 9, 13, 15 and 18. Only the last stop reaches 44px. The finder's "falls below 44 at zoom 9 and 13" understated it; zoom 15 is also short. A tap that misses clears the armed pin (`:2450`). A larger radius also makes crowded areas more ambiguous, and the click handler already picks the nearest pin (`:2396`). The unclustered ember pins themselves are the deliberate design (AGENTS.md "Map" rule) and are not at issue.
- **Fix:** Raise the hit radii to at least 22 at every stop, for example `byZoom(22, 22, 22, 24)`. Leave the visible pins alone.
- **App Review risk:** low
- **Needs device:** yes (feel in dense areas)

### MED-05 · minor · Attribution is not lifted clear of the floating nav
- **Where:** `src/app/globals.css:497` (attribution styling), `src/components/mobile/PhoneFeedMapPanel.tsx:386` (the map fills the whole frame and runs under the nav); only the search capsule and the source switch use `bottom-[calc(var(--phone-nav-space)+0.25rem)]` (`:469`, `PhoneMapSearch.tsx:64`)
- **Screens:** Map tab
- **HIG:** Maps page: keep the legal text visible; it may be covered briefly but not all the time, with about 10 pt of padding around it and clear of movable elements. That is Apple Maps guidance, used here as the principle for the OpenStreetMap and OpenFreeMap credit.
- **What happens:** MapLibre puts the attribution at the bottom-right of the map container. Nothing in `phone.css` or the panel moves it. The container runs under the nav (z-40 in `PhoneNav.tsx`), so the credit may sit behind the nav or the search capsule. The finder's contrast claim does not hold: `#8b939c` on the near-black attribution fill is about 5.7:1. The text is 10px, which is small but passes.
- **Fix:** Add a phone-only rule, for example `.pm-phone-shell .maplibregl-ctrl-bottom-right { bottom: var(--phone-nav-space); }`, and raise the text to 11px.
- **App Review risk:** low
- **Needs device:** yes (is the credit actually covered, and by what)

### MED-06 · minor · Net score may not be announced, and vote arrows are 28px wide
- **Where:** `src/components/feed/PostActions.tsx:335` (score span `aria-label` with no role), `:305` (`h-11 w-7` arrows)
- **Screens:** Feed, post detail, comments
- **HIG:** General accessibility principle (labels belong on elements that expose them); general target-size principle.
- **What happens:** The label is `Net score {score}` on a plain `<span>`. Browsers and VoiceOver often ignore `aria-label` on a generic element and read the bare number. The arrows are 44px tall but 28px wide, so they meet the project's `min-h-11` floor only on one axis. The arrow look and the pair layout are deliberate (AGENTS.md "Votes are arrows"); the width is not covered by that rule.
- **Fix:** Add `role="img"` (or hide the number and add `<span className="sr-only">Net score 5</span>`). Widen the arrow buttons to `w-11` and trim the gap; the score column can shrink to compensate.
- **App Review risk:** low
- **Needs device:** yes (VoiceOver readout)

### MED-07 · minor · Percent meter end labels fall below 4.5:1
- **Where:** `src/components/post/PercentMeter.tsx:207` and `:215` (`text-xs text-zinc-400` for "0%" and "100%")
- **Screens:** New post (composer)
- **HIG:** General legibility principle; the project floor is 4.5:1 (AGENTS.md accessibility floor).
- **What happens:** `zinc-400` (`#a1a1aa`) on white is about 2.6:1, and on the cream ground `#F7F4EC` about 2.4:1. The two labels are 12px. The live percent above the slider is large and the slider has `aria-valuetext`, so nobody loses information, but the labels break the project's own floor.
- **Fix:** Use `text-pm-grey-text` (cream ground) or `text-zinc-500` (on white).
- **App Review risk:** none
- **Needs device:** no

### MED-08 · polish · Taste radar spoke labels shrink to about 11px on a phone
- **Where:** `src/components/TasteRadar.tsx:159` (`fontSize={14}`), viewBox 440 x 320 at `:23-24`, `:83`
- **Screens:** Taste match card on profiles
- **HIG:** Charting data: chart text should be easy to read, and every chart needs accessibility labels. The `role="img"` plus `<desc>` with the values (`:85-88`) covers the second part well.
- **What happens:** The SVG is `w-full max-w-[440px]`. In a column about 358px wide the scale is about 0.81, so the 14-unit labels render near 11.4px. The only visible number is "Outer ring N%" in the legend (`:200`).
- **Fix:** Raise the label size to about 17 in the viewBox, or use a narrower viewBox on small screens.
- **App Review risk:** none
- **Needs device:** no

### MED-09 · polish · Pull to refresh exists only on the feed
- **Where:** `src/components/mobile/PhoneFeedScreen.tsx:573` is the only use of `PhonePullToRefresh` in `src/components/mobile/`
- **Screens:** Friends, leaderboard
- **HIG:** No fetched page requires it. It is an iOS convention for long lists that change; treated as a nicety.
- **What happens:** Friends and leaderboard lists reload only by leaving and returning.
- **Fix:** Reuse `PhonePullToRefresh` on those lists if they load client-side.
- **App Review risk:** none
- **Needs device:** no

### MED-10 · polish · Settings puts Support and legal below the delete panel
- **Where:** `src/components/mobile/PhoneSettingsScreen.tsx:107` (`PhoneDeleteAccountPanel`) then `:128` (Support and legal section)
- **Screens:** Settings
- **HIG:** General principle only: keep destructive actions apart from routine ones. Likely also reported by the settings or navigation reviewer.
- **What happens:** Order is settings ledger, account ledger, log out, delete, then help and legal. A person looking for help scrolls past delete.
- **Fix:** Move Support and legal above log out, and leave the delete panel last.
- **App Review risk:** none
- **Needs device:** no

## Deliberate deviations

None confirmed in this area. The unclustered night-map pins, the dark map chrome and the vote arrows are recorded in AGENTS.md, but no finding here turned on them being wrong.

## Refuted

- R1 Profile avatar has empty alt: the cited line (`PhoneProfileScreen.tsx:156`) is a post photo tile, not an avatar. The real avatar at `:319` sits inside a button labelled "Change profile photo". The `alt=""` avatars at `ShortThread.tsx:365`, `ShortThread.tsx:531` and `PlateDetailSheet.tsx:206` are decorative images next to names.
- R2 Feed scroll position lost on back: the finder did not confirm it, and no code evidence was found in `usePostFeed.ts`.
- R3 Rank change has no unit or period: `ChangeMark.tsx:34-36` already has screen-reader text, "up 2 places since your last visit".
- R4 Upload progress bar with no retry: the `role="progressbar"` at `m/post/page.tsx:478` is the composer step indicator, not an upload meter. Upload is all-or-nothing (`:339`), the error message tells the person to try again, and pressing Post again retries.
- R5 Map rotation disabled with no compass: not a defect (the finder said none required). It is a code choice (`RestaurantMap.tsx:1660-1663`), and it is not written in AGENTS.md or DESIGN.md either, so it is not a deliberate-rule entry.

## Already right

- Discover/Friends switch is `min-h-11`: `src/components/mobile/PhoneFeedMapPanel.tsx:469`.
- Map search capsule and source switch are lifted by `--phone-nav-space`: `PhoneMapSearch.tsx:64`.
- Taste radar has `role="img"`, an `aria-label` and a `<desc>` with every value: `src/components/TasteRadar.tsx:85-88`.
- Legend is HTML, so it scales with page text: `TasteRadar.tsx:167`.
- Feed photos fall back to "Food photo" alt text, and multi-photo carousels announce "N photos, swipe to browse": `src/components/feed/PostMediaCarousel.tsx:57`, `:66`.
- Rank-change marks are announced in words: `src/components/mobile/leaderboard/ChangeMark.tsx:34-36`.
- Vote arrows carry `aria-pressed` and clear labels ("Remove upvote"): `src/components/feed/PostActions.tsx:296-300`.
- Phone map stops pan from chaining into the page: `src/app/m/phone.css:173`.
- Attribution contrast is fine, about 5.7:1: `src/app/globals.css:497-500`.

## Needs a real iPhone

- Whether the 29px map buttons are hard to hit one-handed, and whether 44px buttons fit beside the tabs and search capsule.
- What WKWebView does after location is denied: no re-prompt, and whether any message can be shown.
- Whether the map credit is covered by the floating nav or the search capsule.
- Whether VoiceOver reads the net score label and can dismiss the photo overlay.
- Tap accuracy on pins in dense areas at zoom 9 to 15.
