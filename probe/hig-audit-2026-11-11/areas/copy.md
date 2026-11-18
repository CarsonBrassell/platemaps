# Writing and tone

13 confirmed (0 critical, 0 major, 7 minor, 6 polish) · 0 deliberate · 0 refuted, of 13 reported.

AGENTS.md and DESIGN.md say nothing about copy wording, so no finding here is a recorded design decision. Apple's Writing page (error messages say what to do; one label per step in a flow; verb-led buttons; "tap" not "click"; one capitalization style per element type) and Alerts page (avoid Yes/No labels; confirm uncommon, irreversible destructive actions; specific verb labels; a clear Cancel) were fetched and checked. One claim from the finder was not on those pages: that Apple "uses sign in". It is dropped from CPY-09 and the severity is held down.

## Findings

### CPY-01 · minor · Owner's Delete post on the phone feed card fires on one tap
- **Where:** `src/components/mobile/PhoneFeedPostCard.tsx:836` (menu row calls `setStatus("deleted")` then `onDelete(post.id)`); tombstone at `:373` has no `onUndo` (the Hide tombstone at `:399` does). Same one-tap pattern at `src/components/feed/FoodPostCard.tsx:718` (desktop twin, out of scope). Delete runs at once in `src/components/mobile/PhoneProfileScreen.tsx:241`.
- **Screens:** Phone feed, profile plate list (owner's own posts).
- **HIG:** Alerts: confirm uncommon destructive actions that cannot be undone, in case of an accidental tap; give a clear safe exit.
- **What happens:** Open the three-dot menu, tap one row, the DELETE is sent. No confirm, no Undo. The app already has the right pattern: `src/components/PostOptionsMenu.tsx:159-186` turns the row into "Delete for good" / "Keep it". The plate detail sheet uses that menu, so the same action behaves two ways. Reach is limited (own posts only, two taps deep), so minor.
- **Fix:** Reuse the `PostOptionsMenu` two-step in `PhoneFeedPostCard` (row becomes `Delete for good` plus `Keep it`). Or give the "Post deleted" tombstone an Undo that holds the DELETE for about 5 seconds.
- **App Review risk:** low
- **Needs device:** no

### CPY-02 · minor · Location copy says "this site" and "your browser" inside an iPhone app
- **Where:** `src/components/feed/NearbyFeedGate.tsx:74` ("Allow location for this site in your browser or phone settings") and `:95` ("this browser has nothing to offer one"); `src/components/MyLocation.tsx:118` ("Location is blocked for this site"), `:120` ("This browser has no location"); `src/components/post/CameraCapture.tsx:617` ("This browser doesn't offer a camera").
- **Screens:** Feed > Nearby, map location button, post camera step.
- **HIG:** Writing: say plainly what to do to fix a problem; use plain language for the device in hand.
- **What happens:** The denied state is the common one. It never says Settings > PlateMaps > Location. The camera blocked copy at `CameraCapture.tsx:616` does give the iOS path ("Settings under PlateMaps → Camera"), so the two permissions are handled differently. In the Capacitor shell nobody thinks of this as a browser.
- **Fix:** Denied: "Location is off for PlateMaps. Open Settings > PlateMaps > Location and choose While Using the App." Button label: "Location is off. Turn it on in Settings". Unsupported: "This device can't share its location." Drop "site" and "browser" from phone strings.
- **App Review risk:** low
- **Needs device:** yes (check what WKWebView reports when location is denied, and that the Settings path is right)

### CPY-03 · minor · Raw JS error names and messages shown as the failure text
- **Where:** `src/components/post/CameraCapture.tsx:344-345` and `:1011` set `` `${err.name}: ${err.message}` ``; printed at `:660-662` in `font-mono text-[10px] text-white/40`. `src/components/AvatarCropper.tsx:96` and `:235` show `err.message` as is. `src/components/mobile/PhoneProfileScreen.tsx:284` does the same for the profile photo.
- **Screens:** Post > camera step; profile photo pick and crop.
- **HIG:** Writing: tell people what to do to fix an error. Alerts: titles and text must be specific and neutral, not an error code.
- **What happens:** People see strings like `NotAllowedError: Permission denied` at 10 px and 40 percent white, and browser decode or canvas messages as the only explanation. Code comments call this deliberate ("for whoever is debugging", "the reason, not a guess"); the HIG case is still sound. The camera screen already has a plain headline above it ("Camera's off"), so the raw line adds only noise.
- **Fix:** Map `NotAllowedError`, `NotFoundError`, `NotReadableError` and `OverconstrainedError` to one plain sentence each. Log the raw string, or hide it behind a "Details" tap. For image errors, show "Couldn't read that image. Try a different photo." for decode failures and "Couldn't save that photo. Try again." for upload failures.
- **App Review risk:** low
- **Needs device:** yes (which error names WKWebView actually throws on denied or busy camera)

### CPY-04 · minor · Failure messages name the failure but give no next step; network wording varies
- **Where:** `src/components/feed/ShortThread.tsx:175`, `:221`; `src/components/feed/usePostFeed.ts:293`, `:423`; `src/components/PlateDetailSheet.tsx:788`, `:836` ("Couldn't save your vote."); `src/components/mobile/PhoneFriendsScreen.tsx:203`, `:229`. Network variants: "Couldn't reach the server" in `src/components/account/RecoveryForms.tsx:58`, `:165`, `:313`; "Couldn't reach PlateMaps" in `ShortThread.tsx:249`, `ReportSheet.tsx:77`; "Something went wrong reaching PlateMaps" at `src/components/mobile/PhoneFeedScreen.tsx:647`.
- **Screens:** Voting, comments, friends list, password reset.
- **HIG:** Writing: say what to do to fix an error. Keep one language pattern throughout.
- **What happens:** 9 vote and friends strings say what failed and stop. Sibling strings do add a step ("Couldn't delete that post. Try again.", "Check your connection."). Three different network phrasings appear, one of them naming "the server". The bare "Something went wrong." strings at `RecoveryForms.tsx:162`, `:300` and `useEventTicket.ts:169` are only fallbacks when the API sends no message, so they matter less.
- **Fix:** One pattern: "Couldn't <do X>. Check your connection and try again." Use "PlateMaps", never "the server". Make the fallbacks specific ("Couldn't send the reset link. Try again.").
- **App Review risk:** none
- **Needs device:** no

### CPY-05 · minor · Delete-account confirm uses a generic title and Yes/No-style labels
- **Where:** `src/components/mobile/PhoneDeleteAccountPanel.tsx:95` ("Are you sure?"), `:125` ("Yes, delete my account"), `:164` ("Delete my account"); entry button `:90` ("Delete account"). Desktop twin `src/components/account/DeleteAccountPanel.tsx:91`.
- **Screens:** Settings > Delete account.
- **HIG:** Alerts: avoid Yes/No; use a short verb label that names the result; titles should be specific, not generic.
- **What happens:** The body (`:99-103`) is excellent. It lists what goes and says it cannot be undone. Only the title and the "Yes," label are off, and the verb phrase changes between steps ("Delete account", "Delete my account").
- **Fix:** Title "Delete your account?". Buttons "Keep account" / "Delete account", the same phrase at all three steps. Leave the body alone.
- **App Review risk:** none
- **Needs device:** no

### CPY-06 · minor · No singular form: "1 reviews", "Rated by 1 locals"
- **Where:** `src/components/mobile/PhoneDetailHero.tsx:216-217`; `src/components/mobile/PhoneDetailHits.tsx:91`. Desktop twin `RestaurantHeader.tsx:146` (out of scope).
- **Screens:** Restaurant detail.
- **HIG:** Writing: text should read naturally (general HIG principle; also matters for localization).
- **What happens:** Neither string has a singular branch, though `PhoneDetailHero.tsx:185-186` handles "rating/ratings" and "plate/plates" on the same screen. A restaurant with one rating gives "Rated by 1 locals". No guard hides the line at small counts.
- **Fix:** Add `=== 1 ? "review" : "reviews"` and `=== 1 ? "local" : "locals"`, or one shared `plural()` helper in `src/lib/format.ts`.
- **App Review risk:** none
- **Needs device:** no

### CPY-07 · minor · One thing, several names (heart / like, plate / post, Friend feed / Friends feed, PP)
- **Where:** `src/components/PlateDetailSheet.tsx:878` ("likes") against `src/components/feed/PostActions.tsx:172` ("Heart this plate") and `SettingsLedger.tsx:429`; "Friends feed" tab `src/components/mobile/PhoneFeedTabs.tsx:40` against "Friend feed" in `PhoneFriendsHero.tsx:77` and `PhoneFriendsScreen.tsx:397`; "No posts match" `PhoneFeedScreen.tsx:702` and "delete that post" `PhoneProfileScreen.tsx:250` against "plate" elsewhere; "PP" in `src/components/mobile/leaderboard/parts.tsx:127` against "Plate Points" / "points".
- **Screens:** Feed, plate detail, friends, profile, leaderboard.
- **HIG:** Writing: keep a list of common terms and reuse the same words.
- **What happens:** The reaction is a "heart" in the action bar and a "like" in the count under it. The friends feed has two names, one tap apart. "PP" is never expanded for screen readers or newcomers. "Post" and "plate" mix as nouns.
- **Fix:** Pick: heart for friends, upvote for public, never "like". "Plate" as the noun, "post" only as the verb. One name: "Friends feed". Spell out "Plate Points" on first use per screen, or add an sr-only expansion for "PP".
- **App Review risk:** none
- **Needs device:** no

### CPY-08 · polish · Friend removal swaps to a bare "Confirm"
- **Where:** `src/components/mobile/PhoneFriendsScreen.tsx:469`; reset on blur at `:456`; logic `:209-216`.
- **Screens:** Friends.
- **HIG:** Alerts: the confirming button should be a specific verb that names the result.
- **What happens:** The second-tap label is "Confirm" in a 12 px pill. The aria-label is better ("Confirm removing {name}"), but sighted people see only "Confirm". The code comment (`:205-208`) records the two-tap choice on purpose; only the label is weak. Removal is easy to undo by sending a new request, so polish.
- **Fix:** Label the armed state "Remove friend?" or "Tap again to remove".
- **App Review risk:** none
- **Needs device:** yes (check VoiceOver reads the longer aria-label, and that blur does not disarm on a tap elsewhere too early)

### CPY-09 · polish · "Log in" and "Sign in" both used
- **Where:** `src/components/mobile/PhoneProfileAuth.tsx:238` and `:348` ("Log in") against `:247` ("Sign in to see your saved spots"); `src/components/mobile/PhoneSignUpSheet.tsx:206` ("Log in"); `src/components/account/RecoveryForms.tsx:180` ("Sign in"); `src/components/mobile/PhoneFeedScreen.tsx:675`, `:749` ("Sign in"); `src/lib/signInGate.ts:154-157` ("Sign up to ...").
- **Screens:** Profile tab (signed out), sign-up sheet, reset-password, signed-out feed.
- **HIG:** Writing: use the same label for the same step across a flow. (The finder's claim that Apple "uses sign in" was not confirmed on the page.)
- **What happens:** The same screen has a "Log in" tab and a "Sign in to ..." sentence. Both words reach the same form. Nothing is blocked.
- **Fix:** Use "Sign in" for the tab, submit button and sheet button. Keep "Sign up" and "Create account".
- **App Review risk:** none
- **Needs device:** no

### CPY-10 · polish · Settings descriptions read like developer notes
- **Where:** `src/components/account/SettingsLedger.tsx:188` and `:206`.
- **Screens:** Settings > Taste.
- **HIG:** Writing: plain language; describe what the setting does.
- **What happens:** ":188" says the value is "Stored against the same cuisine list Discover filters by, so it can be used for taste matching later." ":206" says "same reason as the cuisine above." The first promises a feature that is not built. The second points at another row.
- **Fix:** Cuisine: "Shown on your profile." Restaurant: "Pick from restaurants on the map. Shown on your profile."
- **App Review risk:** none
- **Needs device:** no

### CPY-11 · polish · Coach tour: UK idiom and spelling, "I'm done" vs "Next"
- **Where:** `src/components/tour/CoachTour.tsx:130` ("Have a scroll"), `:168` ("neighbourhood"), `:710` (`{lost ? "Next" : "I’m done"}`); `src/components/MyLocation.tsx:117` ("Centre on my location"); long body at `:163`.
- **Screens:** First-run tour, map.
- **HIG:** Writing: plain wording, no colloquialisms; Next ... Done style labels in a flow; match the market's spelling (US, San Diego).
- **What happens:** The rest of the app uses US spelling. The last step button says "I’m done" while the others say "Next". Step 163 runs 41 words.
- **Fix:** "Scroll the feed", "neighborhood", "Center on my location", "Next" then "Done". Trim `:163` to one sentence.
- **App Review risk:** none
- **Needs device:** yes (Dynamic Type wrapping of the long tour bodies)

### CPY-12 · polish · Nearby empty state tells people to switch tabs but has no button
- **Where:** `src/components/mobile/PhoneFeedScreen.tsx:683-684`. Literal "5 mi" in the title; the gate at `src/components/feed/NearbyFeedGate.tsx:74` builds it from `NEARBY_RADIUS_MI`.
- **Screens:** Feed > Nearby (empty).
- **HIG:** Writing: give a clear next step (general HIG principle).
- **What happens:** Sibling empty states carry a primary button. This one says "Switch to Trending or New" and offers none. The radius is typed twice, so a change to the constant would leave this title wrong.
- **Fix:** Add a "Show Trending" action that sets the sort. Import `NEARBY_RADIUS_MI` for the title.
- **App Review risk:** none
- **Needs device:** no

### CPY-13 · polish · Three dots vs ellipsis, and relative time that stops at days
- **Where:** `src/components/mobile/freefood/TicketPopup.tsx:143` ("Claiming..."); `src/components/mobile/PhoneFriendsScreen.tsx:350` ("Search friends..."); `src/lib/format.ts:90-94` (`relativeTime` ends at `Nd ago`); used through `src/components/TimeAgo.tsx:47` on feed cards, comments and friends.
- **Screens:** Free-food ticket, friends search, feed and comment timestamps.
- **HIG:** Writing: apply one punctuation and capitalization style consistently.
- **What happens:** Other loading labels use the ellipsis character ("Finding you…", "Opening…"). `format.ts:133-136` itself says "324d ago" is poor, and a day formatter already exists for profiles. Posts never expire, so old posts can reach cards. The finder's "Open Profile" Title Case point does not hold: that button is CSS uppercase mono (`TicketPopup.tsx:122`), so the source case never shows.
- **Fix:** Use "…" in both strings. Past 7 days, fall back to the existing day formatter ("Nov 3").
- **App Review risk:** none
- **Needs device:** no

## Deliberate deviations

None. AGENTS.md and DESIGN.md contain no copy rules.

## Refuted

None. Sub-claims dropped: (a) "Apple uses 'sign in'" (not on the fetched page; kept as a consistency point only), (b) "Open Profile" Title Case (CSS uppercase hides the source case), (c) "Something went wrong." is mostly an API-error fallback, not a hard-coded dead end, so it is weighted less in CPY-04.

## Already right

- Permission purpose strings are specific and short: `ios/App/App/Info.plist:28`, `:30`, `:32`.
- Delete-account body lists what is lost and says it cannot be undone; "Keep my account" is a clear exit: `src/components/mobile/PhoneDeleteAccountPanel.tsx:95-113`.
- No visible copy says "click" (only code listeners): `src/components/tour/CoachTour.tsx:644` and a grep of `src/components/mobile`.
- Camera-blocked state gives the problem, an "Allow camera" button, the iOS Settings path and an alternative: `src/components/post/CameraCapture.tsx:610-659`.
- Offline page is plain and actionable, with "Try again": `public/offline.html:152-155`.
- Feed empty states give a reason and a verb-led button: `src/components/mobile/PhoneFeedScreen.tsx:658-697`.
- Sign-up sheet states the benefit and has a neutral "Not now": `src/components/mobile/PhoneSignUpSheet.tsx:187-212`.
- Hide post has an Undo tombstone: `src/components/mobile/PhoneFeedPostCard.tsx:395-399`; plate detail delete has a "Delete for good" / "Keep it" step: `src/components/PostOptionsMenu.tsx:159-186`.

## Needs a real iPhone

- Which error names and messages WKWebView actually shows for denied, busy or missing camera and for failed image decode (CPY-03).
- Whether location-denied text matches what iOS actually offers in Settings > PlateMaps > Location (CPY-02).
- VoiceOver reading of aria-labels that differ from visible text, for example "Confirm removing {name}" (CPY-08).
- Wrapping and truncation of tour bodies, settings descriptions and banners at large Dynamic Type sizes (CPY-11).
- Reading comfort of the legal pages (`PrivacyDocument.tsx`, `TermsDocument.tsx`): line length, heading scan. Not reviewed from code.
- Server-supplied `data.error` strings, push payload text and email copy live outside this scope and were not judged.
