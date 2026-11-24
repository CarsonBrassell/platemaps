# Navigation, tab bar and search

9 confirmed (0 critical, 0 major, 8 minor, 1 polish) · 1 deliberate · 3 refuted, of 13 reported.

HIG pages fetched: tab-bars, search-fields, searching, toolbars, scroll-views, modality, accessibility. The navigation-bars slug returned 404, so Back-button rules are cited from toolbars. None of these is likely to be an App Review rejection on its own.

## Findings

### NAV-01 · minor · Tabs are plain history pushes: no per-tab state, and the edge swipe crosses tabs
- **Where:** `src/components/mobile/PhoneNav.tsx:298-301` (each tab is a `<Link>`, so every switch is a push), `src/components/mobile/PhoneSwipeBack.tsx:162-164` (only stops when depth is 1). Also `src/components/mobile/PhoneDetailHero.tsx:105-109`.
- **Screens:** all four tabs, and any screen opened from a tab.
- **HIG:** tab-bars. Switching tabs should keep each section's own navigation state, so people return to where they left off.
- **What happens:** Feed, then Discover, then Friends builds three history entries. An edge swipe on the Friends root slides it away and lands on Discover. A restaurant's Back chip calls `router.back()` when `history.length > 1`, so it can land on a different tab than the one it was opened from. Tap Profile, open Settings, tap Feed, tap Profile: you land on the Profile root, not Settings. No per-tab last-path or scroll memory exists under `src/components/mobile` (grep for `scrollTop`/`scrollTo` finds only PullToRefresh, StickyBar and the composer).
- **Fix:** in `PhoneSwipeBack` `onStart`, return when `pathname` is `/m`, `/m/feed`, `/m/friends` or `/m/account` (tab roots). Optional: keep a small `sessionStorage` map of last path per tab and open it on tap.
- **App Review risk:** low
- **Needs device:** yes (check the swipe on a tab root and the Back chip after a cold start or push-notification open, where `history.length` differs)

### NAV-02 · minor · No tap-the-status-bar or re-tap-the-tab to scroll to top
- **Where:** `src/app/m/phone.css:209-233` (`.pm-phone-shell` is `height:100dvh; overflow:clip`), `src/app/m/phone.css:246-250` (`.pm-phone-content` is the only scroller), `src/components/mobile/PhoneNav.tsx:298-310` (click only fires `nav-kick`).
- **Screens:** Feed, Discover, Friends, Profile, restaurant, every scrolling /m screen.
- **HIG:** scroll-views says to support the default scrolling gestures. The tab-bars page says nothing about re-tapping a tab, and no fetched page mentions the status-bar tap, so this rests on that general line plus iOS habit.
- **What happens:** the document never scrolls, so the WKWebView's own scroll view has nothing to move and a status-bar tap does nothing. Re-tapping the current tab only plays the kick animation. A long feed has no quick way back to the top except dragging. No scroll-to-top handler exists anywhere in `src/components/mobile` or `src/app/m`. The comment at `phone.css:38-40` still says the document scrolls; it does not.
- **Fix:** in the `ArcNav` slot `onClick`, if `pathname === item.href`, call `preventDefault()` and `document.querySelector('.pm-phone-content')?.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })`. The real status-bar gesture needs the document to scroll, which is a much larger change.
- **App Review risk:** none
- **Needs device:** yes (confirm the status-bar tap really does nothing in the Capacitor shell)

### NAV-03 · minor · Selected tab is told apart by hue alone
- **Where:** `src/components/mobile/PhoneNav.tsx:307-309` (`text-pm-orange-text` vs `text-pm-grey-text`), icons at `src/components/icons.tsx:123,132` (same stroke in both states).
- **Screens:** tab bar on every screen.
- **HIG:** accessibility. Convey state with more than colour alone, and it names blue-orange and red-green pairs as hard for some people.
- **What happens:** I recomputed both on the bar fill `#EDE8DC`. Selected `#A8481A` is 4.76:1, unselected `#665C4E` is 5.36:1. Each passes on its own, but the two differ from each other by only about 1.13:1 in luminance. There is no weight change, no filled icon, no bullet. `aria-current` is correct, so VoiceOver is fine. DESIGN.md (line 101) gives the header nav a 5px orange bullet for the current page; the phone bar does not.
- **Fix:** add the 5px bullet used by `StripNav` (`PhoneNav.tsx:231-236`) above the current icon, or swap to a heavier or filled icon when `current`.
- **App Review risk:** none
- **Needs device:** no

### NAV-04 · minor · Public profile Back goes to a guessed parent
- **Where:** `src/app/m/u/[id]/page.tsx:90-95` (map has only feed, friends, account) and `:114-119` (fixed `Link`). Callers: `src/components/mobile/PhoneFeedMapPanel.tsx:139` (rewrites `/u/` with no `from`), `src/components/mobile/PhoneFeedPostCard.tsx:453`.
- **Screens:** profile opened from a map bubble, a shared link, or any link that does not tag `from`.
- **HIG:** toolbars. Back should let people retrace their steps; a customised Back must still behave as expected.
- **What happens:** anything without a recognised `from` falls back to "← Discover" at `/m`. Open a profile from a map bubble on Feed and Back takes you to Discover, not the map. The restaurant page and legal pages use `router.back()` when history exists; this one does not. The edge swipe still works, so there are two different "back" results on one screen.
- **Fix:** make the control a small client component that calls `router.back()` when `history.length > 1`, keeping the `from` map as label and fallback only.
- **App Review risk:** none
- **Needs device:** no

### NAV-05 · minor · Composer exits push the feed on top of the composer
- **Where:** `src/app/m/post/page.tsx:391` (post-publish `router.push`), `:453` (X link to `/m/feed`), `:789` (Cancel on step 1 pushes `/m/feed`).
- **Screens:** post composer.
- **HIG:** modality. Make dismissal obvious and clean; a flow should end where it began, not stack its origin on top of itself.
- **What happens:** all three exits add a feed entry above the composer. PhoneSwipeBack then sees the feed as depth 3 (`__pmDepth` increments on arrival, `PhoneSwipeBack.tsx:93-101`), so an edge swipe on the feed re-opens the composer, an emptied one after publishing. The composer keeps the tab bar and shows its own action bar above it (`:780-783`), so it is not a modal flow. Dismissal itself is clear (X, Cancel); the history is the issue.
- **Fix:** `router.replace` for the post-publish redirect; for Cancel and X use `router.back()` with a `replace('/m/feed')` fallback.
- **App Review risk:** none
- **Needs device:** no

### NAV-06 · minor · Back is built four different ways
- **Where:** `src/components/mobile/PhoneDetailHero.tsx:97-111` (white chip on photo, "Back", history-aware), `src/components/mobile/PhoneLegalFrame.tsx:35-59` (tan pill, "Back", history-aware), `src/components/mobile/PhoneSettingsScreen.tsx:56-74` (tan pill "Profile", fixed href), `src/app/m/u/[id]/page.tsx:114-119` (mono text "← Feed", text glyph, fixed href). Composer is a fifth: `post/page.tsx:787-794`.
- **Screens:** restaurant, legal and recovery pages, Settings, public profile, composer.
- **HIG:** toolbars. Use the standard Back button, and if you customise it make it look and behave the same throughout. It also says to prefer the chevron symbol alone and avoid a text label like "Back".
- **What happens:** three shapes (chip, pill, bare text), three label styles, two behaviours (history-aware vs fixed). Only the settings and profile ones use the label as a parent title; the chips say "Back" in words.
- **Fix:** one `PhoneBackButton` (44px, chevron, optional parent title, history-aware with a fixed fallback), used in the five places. This also fixes NAV-04.
- **App Review risk:** none
- **Needs device:** no

### NAV-07 · minor · Missing, deleted or blocked restaurant and profile show the stock Next 404
- **Where:** `src/app/m/restaurant/[id]/page.tsx:37`, `src/app/m/u/[id]/page.tsx:52` and `:70` (blocked profile). `find src/app` returns no `not-found.tsx`, `error.tsx` or `global-error.tsx`.
- **Screens:** restaurant page, public profile, any unknown /m URL.
- **HIG:** general principle only (people should see where they are and have a way out). The tab bar stays, so it is not a dead end.
- **What happens:** Next's default "404 This page could not be found" renders in the default font on white, with no Back control and none of the cream or Fraunces styling. A reviewer testing the block feature (Guideline 1.2) can reach it from a blocked user's old link.
- **Fix:** add `src/app/m/not-found.tsx` and `src/app/m/error.tsx` using `PhoneLegalFrame` with a short Fraunces heading and a link to `/m`. Keep the blocked copy neutral.
- **App Review risk:** low
- **Needs device:** no

### NAV-08 · minor · Discover search Clear empties the field but keeps the old results
- **Where:** `src/components/mobile/PhoneDiscoverSearch.tsx:173-178` (Clear does `setTerm("")` and focus only). Compare `runSearch` at `:90-103`. Same pattern is handled correctly in `PhoneFeedSearch.tsx:110-118` (empty submit clears).
- **Screens:** Discover.
- **HIG:** search-fields. Clear is part of the standard search field, and results should follow the field. The page gives no detail beyond that, so this is a general principle.
- **What happens:** `?q=` stays in the URL and the grid stays filtered under an empty field. This is the exact state the file's own comment at `:117-118` calls "the same lie". The term only comes off by pressing Search on an empty field or using a chip. The button is also 32px wide (`w-8`, height is 44).
- **Fix:** when Clear is tapped and a `q` is applied, call `runSearch()` with the term emptied (it already deletes the param). Widen to `w-11`.
- **App Review risk:** none
- **Needs device:** no

### NAV-09 · polish · Search shows nothing before you type
- **Where:** `src/components/mobile/PhoneDiscoverSearch.tsx:71` (`showing` needs `term.trim().length > 0`). Also `src/components/mobile/PhoneFeedSearch.tsx:156-199` (no suggestions at all) and `src/components/mobile/PhoneMapSearch.tsx:138-188`.
- **Screens:** Discover, Feed and Friends feed, Map.
- **HIG:** searching. Show recent searches and suggestions before typing, and let people clear their history. The same page allows local search inside sections, so having three controls is not itself wrong, and placeholders do state their scope.
- **What happens:** focusing an empty Discover field shows nothing. Feed and Map have no suggestions at all.
- **Fix:** keep the last five submitted terms in `localStorage` and show them with a Clear link in the Discover menu when the field is focused and empty.
- **App Review risk:** none
- **Needs device:** no

## Deliberate deviations

- NAV-D1 · Post a plate is an action in the middle of the tab bar, raised, with no visible label: DESIGN.md line 104 and AGENTS.md ("one orange 'Post a plate' pill holding the middle"). HIG tab-bars says tabs are destinations and actions belong in a toolbar, but the button opens the `/m/post` route and carries `aria-label="Post a plate"` (`PhoneNav.tsx:328-339`). Low review risk.

## Refuted

- R1 · Map search is `type="text"` with `role="searchbox"`: true (`PhoneMapSearch.tsx:146,163`) but harmless. It has its own Clear/Close button (`:173-187`), `enterKeyHint="search"` and an Enter handler. The HIG search-fields page sets no rule that this breaks.
- R2 · Feed screen has no title and mixes a view with two filters: the active tab text names the screen, and the screen-tab treatment (including Map in the same row) is covered by AGENTS.md and the map exception in DESIGN.md. No fetched HIG page backs the claim.
- R3 · Unused nav variants and `?nav=` ship in production: true as dead code (`PhoneNav.tsx:36-47,95-96`), but the pill and strip bars are only reachable by hand-typing `?nav=`. No one meets them, so it is not an HIG issue.

## Already right

- `<nav aria-label="Main">`, `aria-current="page"` on the current tab, visible text label on each of the four tabs: `src/components/mobile/PhoneNav.tsx:302,321`.
- Prefix match keeps a tab lit on its sub-screens, with `/m` excluded: `src/components/mobile/PhoneNav.tsx:102-103`.
- Tab bar clears the home indicator with `env(safe-area-inset-bottom)`, and content reserves the same space: `src/components/mobile/PhoneNav.tsx:323`, `src/app/m/phone.css:189,282-284`.
- Tab slots are `min-h-12` (48px), the raised button is 56px, with orange focus-visible rings: `src/components/mobile/PhoneNav.tsx:307,335`.
- Alert dots are limited to two slots and carry an accessible label, in line with the badge guidance: `src/components/mobile/PhoneNav.tsx:55-72,105-108`.
- Edge swipe reads depth live from the history entry, stands down for dialogs and the map: `src/components/mobile/PhoneSwipeBack.tsx:162-168`.
- Back chips are 44px high and clear the notch; they fall back to a real href with no history: `src/components/mobile/PhoneDetailHero.tsx:97-111`, `src/components/mobile/PhoneLegalFrame.tsx:34-43`.
- Discover and Feed search use `type="search"`, a `role="search"` form, `enterKeyHint="search"`, 16px type (no iOS focus zoom), and Discover has combobox ARIA with typeahead: `src/components/mobile/PhoneDiscoverSearch.tsx:139-171`, `src/components/mobile/PhoneFeedSearch.tsx:174-195`.
- Feed tabs are 44px high with orange underline, bold and colour on the active tab: `src/components/mobile/PhoneFeedTabs.tsx:88-110`.
- Stray web URLs are sent to the /m twin: `src/proxy.ts:56-78`.

## Needs a real iPhone

- Whether a status-bar tap does anything in the Capacitor shell with the inner scroller (NAV-02).
- `history.length` after cold start, a push-notification open and the offline.html error path; it decides the Back chip and swipe behaviour (NAV-01).
- Whether Next restores the inner scroller's position on back.
- Bar position over the home indicator (the 6px nudge at `PhoneNav.tsx:323`) and how the bar reads over content scrolling behind it.
- VoiceOver order for the raised Post button, the feed tablist and the Discover combobox.
- Whether NAV-03 reads clearly in sunlight and with a colour-vision simulator.
