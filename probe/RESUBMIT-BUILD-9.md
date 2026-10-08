# Resubmitting PlateMaps: build 9

Updated 2026-10-08. This covers both of Apple's messages:

- **First message:** an information request, sent because the developer account has little review history. Apple wants a screen recording plus written answers.
- **Second message:** the Guideline 2.1(a) rejection of build 8 ("unable to load app content, and Try Again leads to Safari"). This is fixed in build 9.

## Where things stand

| Item | State |
|---|---|
| Safari bug (2.1a) | Fixed and verified on a fresh install in a Release simulator build |
| Account deletion in the app | Present: Profile → Settings → Delete account (`PhoneDeleteAccountPanel.tsx`, `DELETE /api/account`) |
| Report posts, comments and users | Present: ⋯ menu on posts and comments, and on profiles (`ReportButton`/`ReportSheet`) |
| Block users | Present: on profiles and in the post ⋯ menu; unblock is in Settings (`ProfileBlockButton.tsx`) |
| Paid features | None. Plate Points have no cash value and nothing is sold |
| Google restaurant photos | Already gone. The production database has **0** googleusercontent covers |
| Yelp restaurant photos and stars | 2,099 Yelp covers, 21 photos from restaurant websites, and the blended Yelp/Google star rating are still live. Branch `hide-third-party-content` turns all three off. **Your decision**, see step 1 |
| Production deploys | **Blocked.** See step 1 |

## Your steps, in order

### 1. Unblock deploys and decide on third-party content (Claude does this after your yes)

Every Vercel build first runs `npm run security:check`. That check now fails because 5 dependencies have published high or critical vulnerabilities:

- `next` 16.3.5: critical, fixed in 16.4.0
- `@capacitor/ios` 8.5.0: critical, fixed in 8.5.1. This one is inside the iPhone app itself, so build 9 must be archived **after** this upgrade.
- `sharp`, `source-map-js` and `undici`: high, patch fixes available

Until these are upgraded, nothing pushed to GitHub reaches platemaps.com. That includes the privacy policy update pushed on Oct 8. The live site keeps running the last good deploy, so nothing is down.

Claude was not allowed to run the install. Either:
- say "yes, upgrade" in the thread and allow the install when prompted, or
- run this yourself in Terminal:
  ```
  cd ~/dev/platemap
  PATH=~/.nvm/versions/node/v24.18.0/bin:$PATH npm install next@16.4.0 @capacitor/ios@8.5.1
  PATH=~/.nvm/versions/node/v24.18.0/bin:$PATH npm audit fix --omit=dev
  npm run security:check
  ```
  The last command must end with no violations. Then tell the thread, and Claude will rebuild, re-sync iOS, and test before pushing.

**Third-party content.** Apple's question 6 asks for documentary proof of rights to third-party content. There is none for the Yelp photos (the free Yelp API tier they came through has ended) or for photos taken from restaurant websites.
- Recommended: say yes to merging `hide-third-party-content`. Restaurants without your own users' photos then show the warm "no photo yet" block, and the star rating is hidden, so only PlateMaps plate scores remain.
- Both are one-line flags (`SHOW_THIRD_PARTY_PHOTOS` in `src/lib/db.ts`, `SHOW_BLEND_STARS` in `src/lib/ratingDisplay.ts`), so you can turn them back on later.

### 2. Vercel environment variables
In Vercel, open the platemap project → Settings → Environment Variables, filtered to **Production**. Confirm these exist:
- `APNS_TEAM_ID` = `93Q75H5U7Z`
- `APNS_KEY_ID`: the 10-character id of your APNs .p8 key
- `APNS_AUTH_KEY`: the full contents of the .p8 file
- Leave `APNS_ENVIRONMENT` unset; it defaults to production, which is correct for TestFlight and the App Store.
- `RESEND_API_KEY` and `MODERATION_EMAIL`: without these, reports from users go nowhere. Apple expects reports to reach you, and your Terms promise action within 24 hours.

If an APNs key is missing, create one at developer.apple.com → Keys → "+" → Apple Push Notifications service.

Also confirm that **Push Notifications** is ticked on the `com.platemapsapp.ios` identifier at developer.apple.com → Identifiers.

### 3. Make two accounts
- **Demo account for Apple:** e.g. `appreview@…`. Post two or three plates, comment on something, and add a friend, so the reviewer sees content immediately. Its login goes into App Store Connect, so **never delete it.**
- **Throwaway account for the recording:** you'll create it on camera and delete it on camera.

### 4. Archive build 9 in Xcode (only after step 1 is done)
1. In Terminal, run `cd ~/dev/platemap && git pull`. Claude will have pushed the upgrade.
2. Then sync the iOS project: `LANG=en_US.UTF-8 PATH=~/.nvm/versions/node/v24.18.0/bin:$PATH npx cap sync ios`.
3. Open **`~/dev/platemap/ios/App/App.xcworkspace`** (the workspace, not the `.xcodeproj`).
4. App target → Signing & Capabilities. Team must be 93Q75H5U7Z with automatic signing, and Push Notifications must be listed.
5. On the General tab, check Version **1.0** and Build **9**.
6. Set the destination at the top to **Any iOS Device (arm64)**, then choose Product → **Archive**.
7. In the Organizer, choose **Distribute App** → **App Store Connect** → **Upload**.
8. Wait for Apple's "has completed processing" email.

### 5. Test on your iPhone with TestFlight
1. Update the iPhone to the latest iOS first. Apple asks for that in the recording.
2. In App Store Connect → PlateMaps → **TestFlight** tab, add yourself under **Internal Testing**. Create a group with your Apple ID if there isn't one; internal testers need no Beta App Review.
3. Install the **TestFlight** app on the iPhone, accept the invite, and install build 9.
4. Delete any older PlateMaps from the phone first.
5. Check the following:
   - The app opens on sign-up, not Safari.
   - You can log in.
   - You can post a plate with a photo.
   - The notification prompt appears.
   - From a second account, comment on that plate. A notification should arrive. If none arrives, the APNs keys from step 2 are the cause.

### 6. Record the screen (iPhone, one continuous take)
Turn on Screen Recording in Control Center, then work through this list. Apple wants the recording to start from app launch.

1. Start on the Home Screen and tap PlateMaps. The sign-up screen appears inside the app.
2. **Register:** create the throwaway account. Show ticking the "13 or older / Terms" box, and briefly open Terms of Service and come back.
3. When the notification permission prompt appears, tap Allow.
4. **Feed:** scroll the feed, open a plate, open its comments.
5. **Post a plate:** take a photo with the in-app camera (or choose one from the library), rate it, and post it. Show it appear in the feed.
6. Comment on a post.
7. **Discover:** open Discover, use a filter, tap **Nearby** (allow location), and open a restaurant page.
8. **Map:** open the map and tap a pin.
9. **Report:** on someone else's post, open ⋯ → Report, pick a reason, and send. Do the same on a comment.
10. **Block:** open a user's profile → Block. Then show Settings → Blocked users.
11. **Log out, then log in again** with the same throwaway account.
12. **Delete the account:** Profile → Settings → Delete account. Confirm with the password, and show the app return to sign-up.
13. State in the reply that there are no paid features, so none is shown.

Keep it under about 5 minutes. Trim the start and end in Photos if needed.

### 7. App Store Connect
1. Open PlateMaps → the iOS **1.0** version.
2. Under **Build**, remove build 8 and add build 9.
3. Under **App Review Information**, tick **Sign-in required** and enter the demo account's login. Paste the full reply below into **Notes**.
4. In App Information and App Privacy:
   - Privacy Policy URL: `https://platemaps.com/privacy` (no `www`)
   - Support URL: `https://platemaps.com/terms#contact`
   - Screenshots: iPhone only (6.9")
5. App Privacy labels: no tracking. Declare these:

| Category | Data type | Linked | Purpose |
|---|---|---|---|
| Contact Info | Name, Email Address | Yes | App Functionality |
| User Content | Photos, Other User Content | Yes | App Functionality |
| Identifiers | User ID, Device ID | Yes | App Functionality |
| Location | Precise Location | Yes | App Functionality |
| Usage Data | Product Interaction | No | Analytics |
| Diagnostics | Performance Data | No | Analytics |

### 8. Reply to Apple
In App Store Connect → the rejected submission → **App Review** messages, reply with the full text below and **attach the screen recording** (.mov or .mp4).

### 9. Submit
Back on the 1.0 version page, click **Add for Review**, then **Submit for Review**.

---

## The reply (paste into both the App Review message and the Notes field)

> Hello, and thank you for reviewing PlateMaps.
>
> **Build 9 fixes the issue from our last review.** Build 8 opened its sign-in page in Safari instead of loading it inside the app, which showed our offline screen and sent "Try Again" to Safari. In build 9 every page loads inside the app. We verified this with a fresh install.
>
> **1. Screen recording.** Attached. It was recorded on an iPhone running the latest iOS and starts at app launch. It shows registration, posting, comments, Discover, the map, reporting a post and a comment, blocking a user, logging out and back in, and deleting the account. PlateMaps has no paid features, in-app purchases or subscriptions.
>
> **2. Purpose and audience.** PlateMaps is a food community for San Diego. Instead of rating whole restaurants, members photograph and rate individual dishes, so people can see which plates are worth ordering. They can browse a feed of dishes from friends and the community, find restaurants by cuisine, neighborhood and distance, comment and upvote, and earn Plate Points that rank them on a leaderboard. Points have no cash value and cannot be redeemed. The app is for adults and teens aged 13 and over in the San Diego area who eat out. Users must confirm they are at least 13 when signing up.
>
> **3. Setup and login.** An account is required, because the app is built around members' posts and friends. Please use the demo account in the Sign-In Information field. It already has posts, a comment and a friend. You can also create a new account from the Sign Up tab with any email address; no verification code is needed.
> - Account deletion: Profile → Settings → Delete account.
> - Reporting: the ⋯ menu on any post or comment, and on any profile.
> - Blocking: the Block button on a profile, or the ⋯ menu on a post. Unblock is under Settings.
> - Support: helloplatemaps@gmail.com, also under Settings → Support & legal.
>
> **4. External services.**
> - Vercel: hosting for the app's web content and API, photo storage, and cookieless page-view and performance analytics.
> - Neon: Postgres database.
> - Apple Push Notification service: notifications.
> - Resend: transactional email, such as password resets and moderation reports.
> - OpenStreetMap: restaurant listings and map data under ODbL, with attribution shown on the map.
> - OpenFreeMap: map tiles.
> - Nominatim: address search.
> - OpenRouteService: walking distance when you tap Nearby; your location is sent only for that request.
>
> No advertising or tracking SDKs are used.
>
> **5. Regional differences.** None in functionality. The content covers restaurants in San Diego County, and the app works the same in every region where it is offered.
>
> **6. Third-party content.** Restaurant names, addresses, hours and menus are factual business information. The base listings come from OpenStreetMap under the Open Database License, with attribution shown on the map. All food photos and ratings in the app are created by our users, who grant us a license under our Terms of Service. We also have a DMCA agent and takedown process (Terms, section on copyright). The app shows no third-party photos or third-party ratings. All brand assets, including the name and logo, are our own.

**Before sending item 6:** it is only true once the `hide-third-party-content` change is live (step 1). If you keep the Yelp photos and stars, Apple will ask for your Yelp license instead, and there isn't one.

## Risks still open
- **5.1.1 login wall (medium).** Content can't be seen without an account. Social apps usually pass with the explanation in item 3.
- **Push prompt timing (low).** The prompt appears right after first sign-in, with no explanation screen first. This is allowed.
