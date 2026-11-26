# Follow-up pass on the live branch

8 confirmed (0 critical, 0 major, 4 minor, 4 polish) · 0 deliberate · 1 refuted · 1 repeat, of 10 reviewed.

The main audit read the working tree on this PC (`eb2db87`, 2026-11-05). The iPhone app loads platemaps.com, which is `origin/main` at `c7d1254`, 35 commits newer. This pass read the phone code that is new or changed on the live branch: the For me and Nearby buttons on Discover, the Your taste section and its picks, the reworked Discover cards, and the admin delete button. It read the code with `git show` and rendered nothing. All line numbers here are live-branch lines unless a line says otherwise. Severity is rated as if each screen were open to everyone; "Who sees it today" says who can.

LIV-03, LIV-04 and LIV-07 are in the Your taste row on Discover, which everyone sees. Most of that code is in the audited tree too, so the main audit missed them, apart from one line of LIV-04 that COL-06 already has. The other 5 are in code that only the live branch has.

## Findings

### LIV-01 · minor · Undo bar sits above the picks grid, so it is off-screen after acting on a lower card
- **Where:** `src/components/mobile/PhoneTastePicks.tsx:109`; `src/components/mobile/PhoneTasteSection.tsx:57`; `src/components/mobile/PhoneTasteSection.tsx:64`
- **Screens:** Discover, For me picks grid: Been here and Not for me on any card below the first screen
- **HIG:** Feedback and Undo and redo: show the result of an action where the person is looking and keep the way back reachable. Accessibility: status changes should be perceivable to assistive tech.
- **What happens:** UndoBar is mounted once, above the grid, at PhoneTastePicks.tsx:109. Ops remove the card at once (useTaste.ts:282-284) and the Undo lasts UNDO_MS = 10_000 (useTaste.ts:30, :296). The grid holds up to 24 picks (limit: 24, :38), is in normal page flow, and the sticky bar only holds search and filters. So after acting on a card two or three screens down, the bar is above the viewport for most of its 10 s. The Undo button (PhoneTasteSection.tsx:64-69) has min-h-11 but no focus-visible ring, which breaks the project floor; the container is role=status but mounts with its text, which VoiceOver may not announce. Removing the last pick swaps to the empty state at :91, which has no UndoBar at all.
- **Fix:** Show the Undo bar pinned above the tab bar (fixed, safe-area aware) while it is live, add focus-visible:outline-2 outline-pm-orange to the Undo button, and keep the empty state able to show it.
- **Who sees it today:** Only the accounts behind the gate see it today. Gate: useDiscoverModes().access for the picks grid; useForMeAccess for the dish-picks row.
- **App Review risk:** low
- **Needs device:** yes
- **Reviewer's note:** Finder's claim that VoiceOver 'often does not announce' is soft (reliability of mount-with-content live regions varies), so it is listed as a risk, not proof. The row version in PhoneTasteSection (Undo at :410) is near the top of a short horizontal strip and is not affected.

### LIV-02 · minor · Location prompt is raised on load for picks accounts, before any tap
- **Where:** `src/lib/useDiscoverQuery.ts:97`; `src/lib/nearby.ts:297`; `src/lib/nearby.ts:334`
- **Screens:** Discover on first open for the dish-picks accounts
- **HIG:** Privacy > Location: ask for permission only when the feature needs it, in context, and explain why; keep working when it is denied.
- **What happens:** useDiscoverQuery.ts:97 calls useNearby({ askOnLoad: true }). In nearby.ts:297-343 the effect calls request() at :334 when the permission state is 'prompt', askOnLoad and access are true, no saved location exists and claimAutoAsk() succeeds. So the iOS location alert appears on the first Discover frame with no tap and no pre-explanation. The code comment (:290-292) shows this is intended for these accounts because every card carries a distance. The other callers keep the tap (comment :94-95). No line in AGENTS.md or DESIGN.md records it as a design decision.
- **Fix:** Keep the on-load ask only after a one-line in-app explanation ('Show distances to places near you') with a Continue button, or defer to the first tap on For me or Nearby.
- **Who sees it today:** Only the accounts behind the gate see it today. Gate: useForMeAccess (askOnLoad only takes effect when it is true)
- **App Review risk:** low
- **Needs device:** yes
- **Reviewer's note:** Corrected from the finder: the picks 'lost' line (PhoneTastePicks.tsx:53-54) does name a way forward ('Add an address in Filters'), so it is not a dead end and is not the same problem as PRV-03. The Nearby button path (PhoneDiscoverScreen.tsx:60) is in context and fine. Only two accounts see the on-load ask today.

### LIV-03 · minor · A failed taste request shows the 'What do you like?' prompt, with no failure message
- **Where:** `src/components/mobile/PhoneTasteSection.tsx:358`; `src/components/mobile/PhoneTasteSection.tsx:253`; `src/components/mobile/PhoneTasteSection.tsx:75`
- **Screens:** Discover home, Your taste row when the request fails or returns no picks
- **HIG:** Loading and failure states: say what went wrong and offer a way forward. Feedback: copy should match what the control does.
- **What happens:** Line 358 joins status === 'error', basis === 'none' and picks.length === 0 into one branch that renders TastePrompt (:373). A network failure looks the same as a new user with no taste. PhoneTastePicks.tsx:76-89 handles the same status with a message and a 44px Try again, so the two surfaces disagree. Separately, TastePrompt says 'Pick up to 3' (:253) while MAX_PREFS is 5 (:75, enforced by loveFull at :245).
- **Fix:** Split status === 'error' from the empty case: show 'Couldn't load your picks' with Try again (taste.refresh) as PhoneTastePicks does. Change the copy to 'up to 5' or lower the cap.
- **Who sees it today:** Everyone sees it. Gate: none for the prompt; Refresh in this branch needs useForMeAccess and a signed-in user.
- **In the audited tree too:** `src/components/mobile/PhoneTasteSection.tsx:186`, `:196` and `:25` (audited-tree lines). The main audit has no finding for it.
- **App Review risk:** low
- **Needs device:** no
- **Reviewer's note:** The branch condition and the 'up to 3' copy predate the live-only commits (eb2db87:186 and :196). The main audit has no entry for either, so it stays. Only the Refresh button in this branch (:361-367) is new.

### LIV-04 · minor · Your taste text is zinc-500 or zinc-400 on the cream ground, below 4.5:1
- **Where:** `src/components/mobile/PhoneTasteSection.tsx:408`; `src/components/mobile/PhoneTasteSection.tsx:190`; `src/components/mobile/PhoneTasteSection.tsx:319`; `src/components/mobile/PhoneTasteSection.tsx:363`; `src/components/mobile/PhoneTasteSection.tsx:369`; `src/components/mobile/PhoneTasteSection.tsx:391`; `src/components/mobile/PhoneTasteSection.tsx:402`; `src/components/mobile/PhoneTastePicks.tsx:106`
- **Screens:** Discover home Your taste: heading, short header, Edit link, sign-up nudge; picks grid header
- **HIG:** Accessibility > Color and effects: body-size text needs at least 4.5:1 contrast.
- **What happens:** AGENTS.md:19 says zinc-500 clears 4.5:1 only on white; on cream #F7F4EC it is 4.28:1. Line 408 is text-zinc-400 12px for non-gated accounts (about 2.4:1) and text-zinc-500 12px for gated. The h2 'Your taste' at :319, :363, :369, :391, the Edit link at :402, SignUpNudge at :190 and PhoneTastePicks.tsx:106 are all zinc-500 on the cream page ground. The same rule says use --pm-grey-text (#665C4E, 5.96:1) there.
- **Fix:** Replace text-zinc-400 and text-zinc-500 with text-pm-grey-text on every cream-ground line in both files. Leave the zinc-500 on white card buttons (BTN :32) alone, it passes at 4.83:1.
- **Who sees it today:** Everyone sees it. Gate: none for the row; the picks grid header needs useDiscoverModes().access.
- **In the audited tree too:** `src/components/mobile/PhoneTasteSection.tsx:145`, `:179`, `:192`, `:237`, `:243` and `:248` (audited-tree lines).
- **Overlap with the main audit:** COL-06 already has the short header line (`PhoneTasteSection.tsx:248` in the audited tree). The headings, Edit and the sign-up link are not in the main audit.
- **App Review risk:** low
- **Needs device:** no
- **Reviewer's note:** Most of these lines predate the live-only commits (eb2db87:145, 179, 192, 237, 243, 248); the new ones are :408 gated branch and PhoneTastePicks.tsx:106. RUN-11 is the same class but a different file (PrivacyDocument.tsx:84), so it is not a duplicate.

### LIV-05 · polish · For me and Nearby clear applied filters silently and the page never names the mode
- **Where:** `src/components/mobile/PhoneFilterBar.tsx:97`; `src/components/mobile/PhoneDiscoverScreen.tsx:59`; `src/components/mobile/PhoneDiscoverScreen.tsx:130`; `src/components/mobile/PhoneDiscoverScreen.tsx:276`
- **Screens:** Discover filter rail: For me and Nearby mode buttons
- **HIG:** Feedback: tell people when an action changes their data or view. Accessibility: do not depend on colour alone for state.
- **What happens:** Turning a mode on runs navigate(searchFromFilters(raw, NO_FILTERS), null) when filters are applied (PhoneDiscoverScreen.tsx:59), wiping chips and query with no message. The h1 stays as the generic heading (:272-273) and the count line is hidden in picks mode (:276). A removable chip also named 'Nearby' exists (:130-135), so the same word labels a mode button and a filter chip. On vs off differs by fill (orange vs grey tint, PhoneFilterBar.tsx:39-40), both font-medium.
- **Fix:** Show a short note ('Filters cleared') or keep the filters; rename one of the two Nearby controls; put the mode in the heading or a polite live region.
- **Who sees it today:** Only the accounts behind the gate see it today. Gate: useDiscoverModes().access (one account)
- **App Review risk:** none
- **Needs device:** no
- **Reviewer's note:** Corrected from the finder: both mode buttons already have aria-pressed (PhoneFilterBar.tsx:101, :109), so the 'toggles should expose state' claim is wrong, and a filled orange pill against a light grey one is a luminance change, not colour alone. The comment at PhoneDiscoverScreen.tsx:50-52 shows clearing filters is intended; only the silence is the issue. Downgraded to polish.

### LIV-06 · polish · Admin delete: every button just says Delete, failure is not announced, shelf delete reverts silently
- **Where:** `src/components/feed/AdminDeleteButton.tsx:53`; `src/components/ProfileShelves.tsx:1164`; `src/components/feed/CommentsScreen.tsx:434`; `src/components/feed/ShortThread.tsx:450`; `src/components/PlateDetailSheet.tsx:528`
- **Screens:** Comments, short thread, plate detail sheet (admin only); profile plate sheet delete
- **HIG:** Alerts: confirm destructive actions and say what will be deleted. Accessibility > VoiceOver: labels identify their target; report failures.
- **What happens:** The two-step confirm is good (:53-83, 'Delete for good' / 'Keep', 44px, focus ring in TEXT_BUTTON :7). But no caller passes label, so a thread of comments reads 'Delete' repeatedly with no name and no aria-label. A failure only changes the button text to 'Couldn't delete. Retry' (:60) with no role=alert, and the confirm and idle branches are different elements, so focus drops to the page body. The source comment (:15) says a comment delete takes every reply with it, but the UI never says so. ProfileShelves.tsx:1164-1173 restores the post on failure with no message.
- **Fix:** Add aria-label with the target (for example 'Delete comment by <name>'), put the failure text in a role=alert region, say 'also deletes replies' on comment confirm, and show a message when the shelf delete reverts.
- **Who sees it today:** Only admin accounts see it. Gate: useAdminAccess.
- **App Review risk:** none
- **Needs device:** yes
- **Reviewer's note:** Corrected paths: the finder cited src/components/mobile/ProfileShelves.tsx, CommentsScreen.tsx and ShortThread.tsx, which do not exist in c7d1254; the live files are the paths listed. Hover-only states are harmless, not a defect. Downgraded to polish: admin-only, one account.

### LIV-07 · polish · Taste loading skeleton can widen the page for everyone except the picks accounts
- **Where:** `src/components/mobile/PhoneTasteSection.tsx:337`
- **Screens:** Discover home, Your taste while loading
- **HIG:** Layout: content should fit the screen width without unintended horizontal scrolling.
- **What happens:** Three w-[170px] skeleton cards plus gaps and px-4 come to about 558px, wider than any iPhone. overflow-hidden is added only when access is true (:337); the comment at :330-336 says everyone else keeps the old row and that it can widen .pm-phone-content, so a sideways swipe moves the whole screen during loading.
- **Fix:** Use the same overflow-hidden class for everyone.
- **Who sees it today:** Everyone sees it. Gate: none (clip applies for useForMeAccess only)
- **In the audited tree too:** `src/components/mobile/PhoneTasteSection.tsx:156` (audited-tree lines). The main audit has no finding for it.
- **App Review risk:** none
- **Needs device:** yes
- **Reviewer's note:** The unclipped row predates the live-only commits (eb2db87:160); the staged fix is a recorded intent in the code comment, so this is a known rollout gap, not a design choice.

### LIV-08 · polish · Pick impressions and opens are logged; privacy page only says 'usage data' in general
- **Where:** `src/lib/usePickLog.ts:99`; `src/lib/usePickLog.ts:183`; `src/components/legal/PrivacyDocument.tsx:132`
- **Screens:** Privacy page; picks row and grid for the dish-picks accounts
- **HIG:** Privacy: be open about what is collected and keep the App Store privacy details accurate (App Review 5.1.1, 5.1.2 as a general principle).
- **What happens:** usePickLog posts seen batches (:99) and opened ids (:183) to /api/account/taste/event after a card is half on screen for 1 s (HALF/DWELL_MS :21-22). PrivacyDocument.tsx:113-121 names taste picks and Been here / Not for me, and :132-134 covers 'usage data (pages and features you use)', but nothing says which suggestions you saw or opened are recorded. The file is unchanged since eb2db87.
- **Fix:** Add one sentence under 'Information collected automatically': which suggestions you see and open are recorded to improve them. Confirm the App Store privacy label lists Usage Data.
- **Who sees it today:** Only the accounts behind the gate see it today. Gate: useForMeAccess (usePickLog is off otherwise)
- **App Review risk:** low
- **Needs device:** no
- **Reviewer's note:** Corrected: the finder's sameAs PRV-01 is wrong (PRV-01 is Report/Block on plates). The generic 'usage data' line gives partial cover, so severity drops to polish. The App Store label itself could not be checked here.

## Refuted on review (1)

- **LIV-R2 · Refresh hint is title-only and new picks arrive silently** `src/components/mobile/PhoneTasteSection.tsx:40`  
  Refuted: the control has a visible text name, so the title is not load-bearing. The remaining point (no live-region message after the swap) is a general principle only.

## Repeats of findings in the main audit (1)

- **LIV-R1 · Card distance, plate-score and aspect text is 9-10px** `src/components/mobile/PhoneRestaurantCardGrid.tsx:173`  
  Refuted part: the finder says the quality line is zinc-500 on cream at 4.28:1. The card is bg-white (PhoneRestaurantCardGrid.tsx:96 and the picks wrapper PhoneTastePicks.tsx:114), so zinc-500 is 4.83:1 and passes. The 9px and 10px sizes are old code (eb2db87:132, 159, 184, 199). Same as TYP-02.

## What the live branch changes for findings in the main audit

- **TYP-02:** Slightly wider in c7d1254: gated accounts see distance in the existing 10px rows (PhoneRestaurantCardGrid.tsx:173, 185, 198). The 9px plate-score (:226) and 9px aspect pill (:241) are unchanged old code.
- **MOT-02:** The Taste skeleton animate-pulse moved from PhoneTasteSection.tsx:151/160 to :325 and :341, and a new unguarded animate-pulse skeleton is at PhoneTastePicks.tsx:67. The new Refresh spinner is guarded (motion-safe at PhoneTasteSection.tsx:50).

## Already right

- src/components/mobile/PhoneTasteSection.tsx:27-33 - chip and BTN classes carry min-h-11 and the orange focus-visible ring
- src/components/mobile/PhoneTasteSection.tsx:216-221 - Been here / Not for me carry the place name in aria-label
- src/components/mobile/PhoneTasteSection.tsx:45-50 - Refresh has aria-disabled, aria-busy and motion-safe:animate-spin
- src/components/mobile/PhoneTasteSection.tsx:307-310 - row scrolls to start after a refresh
- src/components/mobile/PhoneTasteSection.tsx:100-101 - edit sheet closes on Escape
- src/components/mobile/PhoneTastePicks.tsx:76-89 - error state has a message and a 44px Try again, separate from the empty state
- src/components/mobile/PhoneTastePicks.tsx:53-54 - the lost-location line names a next step (Add an address in Filters)
- src/components/mobile/PhoneFilterBar.tsx:101,109 - mode buttons expose aria-pressed and use min-h-11 with the orange focus ring (:38)
- src/components/feed/AdminDeleteButton.tsx:53-83 - two-step destructive confirm with Keep as the easy way out
- src/components/QualityLine.tsx:13 - count sits in a mono span inside readable prose
- src/components/mobile/PhoneRestaurantCardGrid.tsx:210,218 - reason and quality lines are 11px on a white card (quality zinc-500 on white is 4.83:1)

## Needs a real iPhone

- Undo bar in the picks grid: act on a card deep in the list on a gated account and see whether Undo is on screen and whether VoiceOver reads it
- iOS location alert timing on first open of Discover for a dish-picks account
- VoiceOver reading of the Delete buttons in a comment thread with an admin account, and where focus lands after confirm and after a failed delete
- Sideways swipe during the Your taste skeleton on a non-gated account
- Mode buttons on a gated account: filters cleared message, heading, and how VoiceOver names the Nearby chip and Nearby button

## Not covered

- Rendered appearance of picks cards and the mode buttons (no browser or screenshots allowed)
- Real Dynamic Type behaviour
- Server routes, the /api/account/taste/event payload and the App Store privacy label
- Whether the 13px/12px taste text counts against the 11 pt floor at larger text sizes
- Reduce Motion behaviour on a device; animate-pulse skeletons at PhoneTasteSection.tsx:325,341 and PhoneTastePicks.tsx:67 were seen without a motion guard

## Changed on the live branch but desktop-only, so skipped

- src/components/DiscoverBrowser.tsx
- src/components/DiscoverFilters.tsx
- src/components/OurPicks.tsx
- src/components/TasteSection.tsx
- src/components/TasteChips.tsx
- src/components/TastePickCard.tsx
- src/components/TastePicksGrid.tsx
- src/components/RestaurantCard.tsx (web only; phone grid imports only its AspectHighlight type)
- src/components/mobile/PhoneRestaurantCard.tsx (new reason prop unused; component appears unused)

