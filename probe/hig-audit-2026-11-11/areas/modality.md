# Sheets, alerts, menus and interruptions

10 confirmed (0 critical, 2 major, 7 minor, 1 polish) · 0 deliberate · 2 refuted or duplicate, of 12 reported.

No finding here is likely to cause an App Review rejection on its own. The two majors are work-loss and first-minute stacking. Nothing was found in AGENTS.md or DESIGN.md that covers sheets, menus or confirmations, so no finding is a recorded design choice. HIG pages read: modality, sheets, action-sheets, alerts, menus.

## Findings

### MOD-01 · major · Composer exits throw away the whole post with no confirmation
- **Where:** `src/app/m/post/page.tsx:450` (top-right X is a plain `Link` to /m/feed). Also `src/app/m/post/page.tsx:429` (camera `onClose` pushes /m/feed), `src/app/m/post/page.tsx:789` (bottom "Cancel" on step 1 pushes /m/feed), `src/components/post/CameraCapture.tsx:953` (X, "Leave without posting", calls `onClose` directly).
- **Screens:** /m/post, all five steps (photo, where, dish, rate, detail).
- **HIG:** Modality says to get confirmation before closing when unsaved content could be lost, explain the situation, and offer a way to resolve it such as saving. Sheets say to confirm unsaved changes with an action sheet.
- **What happens:** There are 3 exits and none asks. The file has no storage call and no confirm step (grep for sessionStorage, localStorage, confirm( returns nothing). A taken photo, a picked restaurant and dish, a rating and a typed caption are gone after one tap on a 44 px X. The X sits in the header of every step, including the last one. The /m/drafts route is a different feature (text posts) and does not catch this.
- **Fix:** When any photo, restaurant, dish or caption exists, intercept the 3 exits and show a two-choice sheet: "Discard post" (red) and "Keep editing". With nothing entered, leave as is. Saving a draft to localStorage is the alternative.
- **App Review risk:** low
- **Needs device:** no

### MOD-02 · major · First launch can stack the sign-up sheet on top of the free-food ticket
- **Where:** `src/components/mobile/PhoneSignUpSheet.tsx:75` (arms after `SHOW_DELAY_MS` = 1200, renders `z-[60]`, only checks `QUIET_PREFIXES`). Also `src/components/mobile/freefood/TicketButton.tsx:38` (auto-opens the popup on first visit), `src/components/mobile/freefood/TicketPopup.tsx:48` (`role="dialog"`, `fixed` full screen, `z-50`).
- **Screens:** /m/feed on first launch, signed out, while the event is visible (`freeFoodVisible` is true until the event end, a little over a week from today).
- **HIG:** Modality says to let people dismiss one modal before showing another and to avoid several modal views at once. Sheets say one sheet at a time.
- **What happens:** `TicketButton` is rendered in the feed's top bar for everyone (`PhoneFeedScreen.tsx:599`, no sign-in check) and opens its popup on mount until the seen flag is set. `PhoneSignUpSheet` starts a 1.2 s timer and restarts it on each tap. Nothing tells it a dialog is already open. If the person reads the ticket for more than 1.2 s without tapping, the sign-up sheet opens over it. Both are modal, both appear before any feed content has been seen. A review build opened during the event window would show this.
- **Fix:** Make the sign-up sheet wait while any `[role="dialog"]` is in the document (check on each timer fire, re-arm if one is open). The ticket can keep its first-visit open.
- **App Review risk:** low (not a named guideline, but it is the first screen a reviewer sees)
- **Needs device:** no

### MOD-03 · minor · "Delete post" on the feed card is instant, with no confirm and no Undo
- **Where:** `src/components/mobile/PhoneFeedPostCard.tsx:833` (menu item runs `setMenuOpen(false); setStatus("deleted"); onDelete(post.id)`), `src/components/mobile/PhoneFeedPostCard.tsx:372` (tombstone has no `onUndo`). Also `src/components/feed/usePostFeed.ts:427` (`remove()` filters the post and sends DELETE at once), `src/components/feed/FoodPostCard.tsx:716` (web twin).
- **Screens:** Feed card overflow menu, own posts.
- **HIG:** Alerts say undo can replace confirmation for reversible actions, and that an irreversible action people might trigger by accident deserves a confirm with a specific button title and a Cancel.
- **What happens:** The DELETE call fires on the same tap. The hidden tombstone offers Undo (line 399), the deleted one does not, and the delete cannot be reversed afterwards. The menu item is a single red row that was opened on purpose, which is why this is minor and not major. The same app's `PostOptionsMenu.tsx:159-187` asks twice ("Delete for good" / "Keep it"), so the two delete paths disagree.
- **Fix:** Reuse the arm-then-"Delete for good" pattern from `PostOptionsMenu` in the card menu. Or keep the optimistic removal, wait about 5 s before sending DELETE, and give the tombstone an Undo.
- **App Review risk:** low
- **Needs device:** no

### MOD-04 · minor · Half-typed comments and report notes are lost when a sheet is swiped or tapped away
- **Where:** `src/components/feed/Composer.tsx:33` (text is local `useState("")`), `src/components/feed/ReportSheet.tsx:54` (reason and note are local state), `src/components/feed/Dialog.tsx:315` (backdrop `onMouseDown` closes), `src/components/feed/Dialog.tsx:66-68` (swipe dismiss at 26 percent of the panel or speed 0.5).
- **Screens:** Comment composer in the plate sheet, comments screen and thread; Report sheet.
- **HIG:** Sheets say to confirm with an action sheet when dismissing could lose unsaved changes. Modality says the same for lost content.
- **What happens:** `Dialog` has no dirty-state hook. A swipe past 26 percent, a velocity over 0.5, a tap on the 45 percent charcoal scrim or Escape closes the sheet and clears the text. Comments are short, so the loss is small, but a report note can be longer. The report sheet's close and backdrop tap are one touch away from the text box.
- **Fix:** Add an optional `isDirty` prop to `Dialog`. When true, swipe and scrim tap bounce the panel back and ask "Discard" or "Keep editing". Keep the explicit close button as the confirm point.
- **App Review risk:** low
- **Needs device:** yes (feel of the swipe against the keyboard and an inner scroll area)

### MOD-05 · minor · Three sheets show a grabber that does nothing; the sheets that do swipe have no grabber
- **Where:** `src/components/mobile/PhoneSignUpSheet.tsx:162` (static grabber, backdrop `onMouseDown` only), `src/components/mobile/PhoneFilterSheet.tsx:603` (static grabber, no touch handlers), `src/components/DishSheet.tsx:28` (static grabber, no touch handlers). Contrast with `src/components/feed/Dialog.tsx:195` (full touch dismissal, no grabber anywhere in the file).
- **Screens:** Sign-up, Filters, Dish sheets (grabber, no swipe). Report, Rank ladder, Points info and comments (swipe, no grabber).
- **HIG:** Sheets say a grabber signals that the sheet can be dragged and works with VoiceOver, and that iPhone sheets should support swipe-to-dismiss.
- **What happens:** A person who drags the grabber on the sign-up, filter or dish sheet gets nothing, while the two families of sheet use the opposite affordance. None of these sheets resizes, so Apple's grabber purpose (detents) does not apply.
- **Fix:** Share the touch-dismiss logic from `Dialog` with the three hand-built sheets. Then either keep the grabber on all of them or drop it from the ones that do not resize.
- **App Review risk:** low
- **Needs device:** yes (drag feel)

### MOD-06 · minor · DishSheet has no dialog semantics, Escape, focus handling or scroll lock, and its close button is 32 px
- **Where:** `src/components/DishSheet.tsx:28` (backdrop `onClick`, no `role="dialog"` or `aria-modal`, no key listener, no effect at all). Close button at line 37: `h-8 w-8` (32 px). Used by `src/components/mobile/PhoneDetailScreen.tsx:184`.
- **Screens:** Dish sheet from a restaurant page.
- **HIG:** Modality says to always give an obvious dismiss. General HIG principle (not confirmed on a page here) is a 44 pt minimum target; the project's own floor is `min-h-11` (AGENTS.md).
- **What happens:** The file is 112 lines and has no effect hook. VoiceOver is not told a modal opened and the page behind stays reachable. The close target is 32 px. Safe-area padding is correct (`pb-[env(safe-area-inset-bottom)]`, `max-h-[92dvh]`).
- **Fix:** Render `DishSheet` through `Dialog variant="sheet"`, which brings semantics, focus trap, scroll lock, swipe and a 44 px close in one change. Smaller fix: add `role="dialog" aria-modal="true"`, an Escape listener, and make the close `h-11 w-11`.
- **App Review risk:** low
- **Needs device:** yes (VoiceOver focus)

### MOD-07 · minor · Signed-out "sign in to join in" notice vanishes in 3 seconds and has nothing to tap
- **Where:** `src/components/mobile/PhoneFeedScreen.tsx:749` (`onRequireSignIn` only calls `setBanner`), `src/components/feed/usePostFeed.ts:200` (banner clears after 3000 ms), `src/components/mobile/PhoneFeedScreen.tsx:615` (the fixed pill at `top-[max(0.5rem,env(safe-area-inset-top))]`, `z-50`, `role="status"`). Also `src/components/mobile/PhoneSignUpSheet.tsx:28` ("Not now" is stored forever under `pm-signup-sheet-dismissed`).
- **Screens:** Feed, signed out, after the sheet was dismissed once.
- **HIG:** General HIG principle (no single page quoted): a message that asks for a step should offer the step, and transient text needs enough time to read. Kept minor for that reason.
- **What happens:** After "Not now", a vote or comment attempt shows a 3 s pill with text only. The pill sits over the top bar and cannot be dismissed. The same banner carries errors such as "Couldn't delete that post." for 3 s. `PhoneRivalToast` already has a tap-to-dismiss button and 4.5 to 6 s timing. Place in the feed is kept, which is good.
- **Fix:** Reopen the sign-up sheet for an explicit action (ignore the dismissed flag), or put a "Sign in" button in the pill. Hold error banners about 6 s and add the tap-to-dismiss.
- **App Review risk:** low
- **Needs device:** no

### MOD-08 · minor · Sheet scroll lock is only `body { overflow: hidden }`, which the project's own CSS says is not enough on iOS
- **Where:** `src/components/feed/Dialog.tsx:143`. Also `src/components/mobile/PhoneFilterSheet.tsx:535`, `src/components/mobile/freefood/TicketPopup.tsx:48`, `src/components/DishSheet.tsx` (no lock at all). Evidence of the gap: `src/app/m/phone.css:20-45` and `src/app/m/post/page.tsx:195-206`.
- **Screens:** Any sheet opened over the feed, discover or restaurant pages.
- **HIG:** Modality: content behind a modal should not respond while it is up (general principle).
- **What happens:** The project's own comments say iOS still rubber-bands the document under a fixed overlay, and the fix there is the `html.pm-lock-scroll` class (`overscroll-behavior: none` plus `overflow: hidden`). Only the map and the camera step set that class. The sheets set only the body style. Whether the page behind actually moves in WKWebView can only be seen on a device.
- **Fix:** Have `Dialog`, `PhoneFilterSheet` and `TicketPopup` also toggle `pm-lock-scroll` on `<html>`, counting open sheets so a stacked pair does not release early.
- **App Review risk:** low
- **Needs device:** yes (drag on the scrim over a long feed)

### MOD-09 · minor · Plate-sheet options trigger is 28 px
- **Where:** `src/components/PostOptionsMenu.tsx:140` (`h-7 w-7`, 28 px). Used twice in `src/components/PlateDetailSheet.tsx:955` and `:1016`.
- **Screens:** Opened plate sheet (own posts and others).
- **HIG:** General HIG principle (44 pt controls); the project floor is `min-h-11` (AGENTS.md, not a recorded design choice).
- **What happens:** The round button sits on a photo and is 28 px with no larger hit area. The feed card's own trigger is 44 px (`PhoneFeedPostCard.tsx:806`), so the phone feed is fine. The finder's claims about mixed icons and a missing action sheet did not hold: all three non-owner rows have an icon, and the owner menu is a single row.
- **Fix:** Keep the 28 px look and add an invisible padding or a 44 px wrapper button around it.
- **App Review risk:** none
- **Needs device:** no

### MOD-10 · polish · Block is one tap with no confirm and no Undo on the feed tombstone
- **Where:** `src/components/mobile/PhoneFeedPostCard.tsx:302` (`handleBlock`), tombstone at `:384-392`. Also `src/components/ProfileBlockButton.tsx:54` (toggle with in-place Unblock).
- **Screens:** Feed card menu, other people's profiles.
- **HIG:** Alerts: undo can stand in for a confirm when the action can be reversed.
- **What happens:** The menu row names the person ("Block @name") and the tombstone says where to undo it (Account settings). A code comment says this is deliberate. It is reversible, so the cost of a slip is a trip to settings. The hidden-post tombstone does have Undo, which makes the gap visible. No AGENTS.md or DESIGN.md rule covers it, so this is not a recorded design rule.
- **Fix:** Add `onUndo` to the blocked tombstone (call DELETE /api/blocks), or accept the current behaviour.
- **App Review risk:** none
- **Needs device:** no

## Deliberate deviations

None. No sheet, menu or confirmation rule is written in AGENTS.md or DESIGN.md. The only related code comment (blocked tombstone has no Undo, `PhoneFeedPostCard.tsx:~385`) is not a design-system rule, so MOD-10 stays a finding at polish level.

## Refuted

- R1 "Log out is one tap with no confirmation" (`PhoneSettingsScreen.tsx:101`): not a defect. HIG alerts say to skip alerts for easy-to-undo actions, nothing is lost on sign-out, and the finder's own fix was "leave as is". The button is also spaced away from the destructive delete block.
- R2 "Fixed status banner overlays the header for 3 seconds and cannot be dismissed" (`PhoneFeedScreen.tsx:615`): duplicate of MOD-07. The timing and dismiss points are folded into MOD-07.
- Parts of the finder's popover-menu item dropped: "mixed icons" (every non-owner row has an icon) and "should be an action sheet" (not a rule Apple states for a menu opened from an overflow button). Only the 28 px trigger survived as MOD-09.

## Already right

- `src/components/mobile/PhoneDeleteAccountPanel.tsx:95-111`: delete account is three steps with "Are you sure?", a consequences list, "Keep my account" first, then a password step.
- `src/components/PostOptionsMenu.tsx:159-187`: delete arms in the menu with "Delete for good" (red) and "Keep it".
- `src/components/feed/Dialog.tsx:141-309, 342-399`: Escape, focus move and restore, swipe-down with distance and velocity limits, a 44 px close or back button, 45 percent scrim.
- `src/components/mobile/PhoneSignUpSheet.tsx:28-100, 155-233`: 600 ms stray-tap guard, quiet routes for auth and legal pages, "Not now", safe-area bottom padding, timer restarts on each tap.
- `src/components/mobile/PhoneFriendsScreen.tsx:209-235`: friend removal asks with a second tap, no browser `confirm()`.
- `src/components/mobile/freefood/TicketPopup.tsx:48-72`: the ticket does handle Escape, focus move and restore, `role="dialog"` and `aria-modal`.
- `src/components/mobile/PhoneRivalToast.tsx:147-161`: toast is `role="status"`, times out and has a Dismiss button.
- No `window.alert`, `confirm` or `prompt` in the phone code.
- `src/components/DishSheet.tsx:36`: safe-area bottom padding and `92dvh` cap are correct (the missing parts are in MOD-06).

## Needs a real iPhone

- Whether `body { overflow: hidden }` stops the page behind a sheet from scrolling or bouncing in WKWebView (MOD-08).
- Feel of the swipe-down on `Dialog` with a keyboard up or an inner list scrolled (MOD-04, MOD-05).
- Whether the focused field in the comment composer, report note and sign-up form stays above the keyboard.
- VoiceOver: whether `aria-modal` makes the page behind inert, whether the sheet title is read, and whether `PhoneRivalToast`'s `aria-label="Dismiss"` hides the message text.
- Real first-launch order of splash, ticket popup, sign-up sheet and the system push prompt (MOD-02). The push prompt timing was not read.
- The 600 ms stray-tap guard on the sign-up sheet against a real thumb.
