# Privacy, permissions and notifications

8 confirmed (0 critical, 0 major, 4 minor, 4 polish) · 0 deliberate · 0 refuted, of 8 reported. One finding was narrowed (PRV-01): the profile half of it was wrong.

## Findings

### PRV-01 · minor · Plate detail sheet has no Report post or Block on other people's plates
- **Where:** `src/components/PlateDetailSheet.tsx:955` (also :1016, :1053). Contrast `src/components/mobile/PhoneFeedPostCard.tsx:866-883`.
- **Screens:** Plate detail sheet opened from the map, restaurant pages and profile shelves. Comments screens (Block only).
- **HIG:** No HIG page states this. It is App Review Guideline 1.2 (user content needs a way to report it and block abusers). The HIG privacy page only says people should stay in control of what they share and see.
- **What happens:** `PostOptionsMenu` is rendered only when `handleDelete` exists (`PlateDetailSheet.tsx:707`), which is set only for the viewer's own plate, so the menu has one row: Delete post. For someone else's plate the sheet offers Report on comments only (`:516`). The only places that offer Report post are the two feed cards (`PhoneFeedPostCard.tsx:866`, `FoodPostCard.tsx`). `ReportSheet` is imported nowhere else. Block on a person lives on their profile; there is no Block next to a comment.
  - The finder said the profile has no Report user. That is wrong: `ProfileBlockButton.tsx:60-66` renders `ReportButton kind="user"` beside Block, and `/m/u/[id]/page.tsx:194` uses it. Comments are reportable in `CommentsScreen.tsx:421`, `ShortThread.tsx:571` and the sheet. The September check's "no report on comments or users" is fixed.
  - What is left: a photo post seen from the map or a restaurant page cannot be reported without going to the feed.
- **Fix:** For non-owners, show the same three-dot menu with Report post (open the existing `ReportSheet` with the post id) and Block. Reuse the calls from `PhoneFeedPostCard`.
- **App Review risk:** medium. Feed, profile and comment reporting exist, so a reviewer will probably find one route, but plate photos shown elsewhere have none.
- **Needs device:** no

### PRV-02 · minor · Camera permission prompt is raised underneath the "who sees your photos" dialog
- **Where:** `src/components/post/PhotoPrivacyNotice.tsx:29-35` (the file's own comment), mounted at `src/app/m/post/page.tsx:812`. Camera start at `src/components/post/CameraCapture.tsx:215`.
- **Screens:** Composer, first plate for an account that has not answered the notice.
- **HIG:** privacy: ask when the person uses the feature, one request at a time, and let context explain the request. Pre-permission screens, when used, get one Continue button.
- **What happens:** The notice is a layer over a live viewfinder. The comment says that on an account that never granted the camera, the permission prompt arrives with the notice. In a WKWebView that may be the iOS alert on top of a custom dialog about photos, with no way to tell which question the Allow button answers.
- **Fix:** Start the camera stream only after the notice is answered or dismissed (use the existing `onAnswer` and `onDismiss`), so one question is on screen at a time.
- **App Review risk:** low
- **Needs device:** yes. Check what order the alerts arrive in on a fresh install and whether the iOS camera alert appears at all before the web page asks.
- **Note:** the finder also called the "Recommended" pill on Everyone a nudge. The HIG privacy page forbids incentives for granting access, not a labelled option, and the default stays friends-only. Dropped.

### PRV-03 · minor · Location-denied states use browser wording and dead-end
- **Where:** `src/components/feed/NearbyFeedGate.tsx:74` (denied), `:97` (unsupported); `src/components/MyLocation.tsx:109` (disabled), `:118`, `:119`.
- **Screens:** Feed Nearby tab, map location button.
- **HIG:** privacy: people can change a choice later in Settings, so respect it and say where. The page gives no detailed denial wording, so this is a general principle.
- **What happens:** In the app the copy says "Allow location for this site in your browser or phone settings", "Location is blocked for this site", "this browser has nothing to offer". There is no site or browser in the app, and Settings > PlateMaps > Location is not named. The denied gate has no button. The map button is `disabled` (`MyLocation.tsx:109`). A typed-place fallback exists (`nearby.setSavedLocation`, `src/lib/nearby.ts:144`), but the denied screen does not offer it. For comparison, the Settings notifications row does name the iOS path (`SettingsLedger.tsx:429`).
- **Fix:** When `isNativeApp()` is true, say "Turn on Location for PlateMaps in Settings > PlateMaps > Location". Add a secondary "Enter a place" button that opens the existing filter-sheet flow. Use "this device" in place of site and browser.
- **App Review risk:** low
- **Needs device:** yes. Check which prompt shows (iOS alert, page alert, or both) and whether a denial sticks across launches.

### PRV-04 · minor · "Download my data" is a plain download link that may do nothing in the web view
- **Where:** `src/components/account/AccountLedger.tsx:326-333`; `src/app/api/account/export/route.ts:32`.
- **Screens:** Account > Your data (phone account screen).
- **HIG:** general principle only. Data export and deletion should work inside the app. I did not find an HIG rule for export.
- **What happens:** The link is `<a href="/api/account/export" download>` and the route answers with `Content-Disposition: attachment`. The comment says the browser's download handling is the whole feature. The shell has no Share, Filesystem or Browser plugin (package.json). WKWebView does not give a download UI on its own; the result may be a silent no-op or a raw JSON page with no way back.
- **Fix:** Test on a device. If it fails, fetch the JSON in the page and pass it to `navigator.share({ files })`, or show it in an /m view with Copy, or email it to the account address.
- **App Review risk:** low. Account deletion is in the app, which is what 5.1.1(v) asks for.
- **Needs device:** yes. Tap it in the installed build.

### PRV-05 · polish · Push permission alert lands on top of the success feedback with no lead-in
- **Where:** `src/lib/pushClient.ts:156` (calls `registerForPush`, which calls `requestPermissions` at :95). Fired from `src/app/m/post/page.tsx:378`, `src/components/feed/usePostFeed.ts:363`, `ShortThread.tsx:246`, `PhoneFriendsScreen.tsx:200`, `PhoneFindFriends.tsx:227`, `PhoneProfileFriendButton.tsx:69`, `PlateDetailSheet.tsx:734`.
- **Screens:** Composer after posting, comments, friend requests.
- **HIG:** managing-notifications says permission is required before sending and does not say when to ask. Its "explain what you will send" advice is about marketing notifications. privacy says ask in context and use a single-Continue screen only when extra context is essential.
- **What happens:** The ask is tied to a real action (post, comment, friend request), which fits the HIG. It is shown only once (`ASKED_KEY`) and never at launch (the September item "prompt at first launch" is fixed: `PushRegistration.tsx:11-16`). What is left is polish: the system alert has no lead-in and appears over the points and "posted" feedback. The finder's claim that the HIG says people "should" be told what they will receive was too strong for these non-marketing alerts.
- **Fix:** Optional. Wait for the success animation to finish. If a lead-in is wanted, one line with one Continue button, shown once.
- **App Review risk:** none
- **Needs device:** yes. See how the alert lands over the animation.

### PRV-06 · polish · Support row is a bare mailto to a personal Gmail address
- **Where:** `src/components/mobile/PhoneSettingsScreen.tsx:13`, `:129`.
- **Screens:** Settings > Support and legal.
- **HIG:** general principle. App Review 1.5 wants support that is easy to reach. No HIG page cited.
- **What happens:** The row is a link to `mailto:helloplatemaps@gmail.com` labelled "Contact & support" with no address shown. With no Mail account on the phone, the tap shows nothing useful. Terms and Privacy name the same address.
- **Fix:** Show the address as secondary text on the row and offer Copy. Longer term, a platemaps.com address or an /m/support page.
- **App Review risk:** low
- **Needs device:** yes (a phone with no Mail account).

### PRV-07 · polish · Free-slice promotion shows no rules or Apple disclaimer
- **Where:** `src/components/mobile/freefood/TicketPopup.tsx:159` (ticket card); `src/components/mobile/freefood/InviteFriends.tsx:28`; `src/lib/freeFoodEvent.ts:25`.
- **Screens:** Free food ticket popup, invite block.
- **HIG:** not an HIG item. It is App Review 5.3 (promotions: rules, named sponsor, Apple not a sponsor). 5.3 is aimed at sweepstakes and contests; this is a first-come giveaway with no entry or purchase, so the rule may not apply strictly.
- **What happens:** The popup names the partner, date and 150-slice cap, but I found no eligibility, "one per person", "while supplies last" or Apple line in the file (Grep for "Apple", "rules", "supplies" found nothing).
- **Fix:** One small footer line under the ticket card with the limit and "Apple is not a sponsor of or involved in this promotion", plus a link to short rules.
- **App Review risk:** low
- **Needs device:** no

### PRV-08 · polish · Notification settings are one On/Off switch
- **Where:** `src/components/account/SettingsLedger.tsx:436-453`.
- **Screens:** Settings > Push notifications.
- **HIG:** managing-notifications requires an in-app settings screen separate from the permission request. The app has one. Per-type switches are not required by the page.
- **What happens:** One On/Off covers four kinds (comment, reply, heart, friend request, listed at :431). Someone who finds hearts noisy must silence everything. The denied state correctly names Settings > PlateMaps > Notifications (:429).
- **Fix:** Optional per-type toggles stored server-side and checked before sending; keep the master switch.
- **App Review risk:** none
- **Needs device:** no

## Deliberate deviations
None. AGENTS.md and DESIGN.md cover visual rules, not privacy or notification behaviour.

## Refuted
None whole. Part of PRV-01 (no Report user on profiles) was wrong and is removed: `ProfileBlockButton.tsx:60` renders it.

## Already right
- Purpose strings are specific, sentence case, active voice, end in periods: `ios/App/App/Info.plist:27-32`.
- No microphone or tracking: `audio:false` at `src/components/post/CameraCapture.tsx:1005`; `NSPrivacyTracking` false in `ios/App/App/PrivacyInfo.xcprivacy`.
- Location never asked at launch; low accuracy: `src/lib/nearby.ts:211`, `:236-250`.
- Push silent at launch, registers only if already granted: `src/components/mobile/PushRegistration.tsx:11-16`, `src/lib/pushClient.ts:143-150`. Asked once only: `pushClient.ts:156-160`.
- In-app notification switch with a correct "Off in iOS Settings" state: `src/components/account/SettingsLedger.tsx:419-431`.
- Camera denial has an accurate message and a library fallback: `src/components/post/CameraCapture.tsx:616`.
- Photos redrawn through a canvas, which drops EXIF location: `src/lib/image.ts:10-12`.
- Report post and Block on the phone feed card: `src/components/mobile/PhoneFeedPostCard.tsx:866-883`. Report user beside Block: `src/components/ProfileBlockButton.tsx:60`. Report on comments: `CommentsScreen.tsx:421`, `ShortThread.tsx:571`.
- Blocked-users list with undo; delete-account panel; Terms and Privacy reachable signed out: `src/components/mobile/PhoneSettingsScreen.tsx:107`, `:129-140`.

## Needs a real iPhone
- Whether location and camera each show one alert or two (iOS plus page), and whether a choice is remembered.
- Order of the camera alert and the photo notice on a fresh install (PRV-02).
- What "Download my data" does in the shell (PRV-04).
- Whether `aps-environment` is switched to production by the distribution archive (`ios/App/App/App.entitlements`).
- How the push alert lands over the post-success animation, and what comment text shows on the lock screen.
- What the mailto row does with no Mail account.
