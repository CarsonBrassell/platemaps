# Resubmitting PlateMaps: build 9

Written 2026-10-07 after the build 8 rejection (Guideline 2.1(a): "unable to load app content, and Try Again leads to Safari").

## What was fixed and checked

- **The rejection itself.** `capacitor.config.ts` now has `allowNavigation: ['platemaps.com']`. Before, only URLs starting with `https://platemaps.com/m/feed` counted as part of the app. The sign-in redirect to `/m/account` was sent to Safari, and so was the "Try again" button.
  - Verified on an iPhone 17 Pro Max simulator, Release build, fresh install: the app opens on the sign-up screen and Safari never launches.
  - A control build without the fix reproduces the exact rejection.
  - Relaunch and background/foreground both pass.
- **This Mac was 6 commits behind GitHub.** That included the App Store fixes from Sep 28: iPhone-only build, arm64, privacy manifest, and Terms and Privacy pages that open inside the app. These are now merged locally. Build 9 built from this folder includes them.
- **Push notifications.** The plugin was declared but never linked in build 8, so build 8 had no push at all. Build 9 links it.
  - On the simulator, the native permission dialog appears and a test push doesn't crash the app.
  - Whether a real phone gets notifications depends on steps 1 and 2 below.
- **Privacy.**
  - The manifest now also declares Vercel Analytics and Speed Insights.
  - The camera, photo and location permission messages now describe every feature that uses them.
  - The iPhone build is portrait-only.
  - The privacy policy text now mentions analytics and the push token. That is a website change: it goes live only when this branch is pushed.

## Your steps, in order

### 1. Vercel (5 min)
Go to vercel.com → platemap project → Settings → Environment Variables, filtered to **Production**. Confirm these exist:
- `APNS_TEAM_ID` = `93Q75H5U7Z`
- `APNS_KEY_ID`: the 10-character id of your APNs .p8 key
- `APNS_AUTH_KEY`: the full contents of that .p8 file
- Leave `APNS_ENVIRONMENT` unset. The default is production, which is right for TestFlight and the App Store.
- `RESEND_API_KEY` and `MODERATION_EMAIL`: without these, user reports email nobody. Apple's UGC rule (1.2) expects reports to reach you.

If any APNs value is missing, create the key at developer.apple.com → Keys → "+" → Apple Push Notifications service, then add the three values. Adding env vars needs a redeploy (Deployments → ⋯ → Redeploy).

### 2. Apple Developer portal (2 min)
Go to developer.apple.com → Certificates, IDs & Profiles → Identifiers → `com.platemapsapp.ios`. Make sure **Push Notifications** is ticked.

### 3. Make the reviewer's demo account (10 min)
Sign up on platemaps.com, or in the app, with a dedicated account, e.g. `appreview@…`. Give it a couple of posted plates, a comment and a friend, so the reviewer sees real content straight away. Keep the email and password for step 7.

### 4. Archive in Xcode
1. Open **`ios/App/App.xcworkspace`**, not `.xcodeproj`.
2. Select the **App** target → Signing & Capabilities. Team must be your team (93Q75H5U7Z) with "Automatically manage signing" on, and **Push Notifications** listed as a capability.
3. On the General tab, check Version **1.0** and Build **9**.
4. Set the run destination at the top to **Any iOS Device (arm64)**.
5. Product → **Archive**.
6. When the Organizer opens: **Distribute App** → **App Store Connect** → **Upload** → accept the defaults → Upload.

You don't need to run `npx cap sync`: this folder is already synced. If you pull new code later, re-sync with Node 22 or newer:
`LANG=en_US.UTF-8 PATH=~/.nvm/versions/node/v24.18.0/bin:$PATH npx cap sync ios`

### 5. Wait for processing
App Store Connect emails you when build 9 has finished processing, usually 10–30 minutes. Export compliance is already answered in Info.plist.

### 6. Swap the build
Go to App Store Connect → PlateMaps → the iOS **1.0** version page → **Build** section. Remove build 8 and add build 9.

### 7. App Review Information (same page)
- Tick **Sign-in required**, then enter the demo account's username and password.
- Contact info: your name, phone and email.
- **Notes**: paste this:

> PlateMaps is a social food-review community for San Diego. Members post photos and ratings of individual dishes, follow friends, comment, and earn points. An account is required because every screen is built from member posts and the social graph; please use the demo account above.
>
> Build 9 fixes the issue from the previous review: the sign-in page and the "Try again" button opened Safari instead of loading inside the app. Every page now loads in the app. We tested a fresh install on iPhone 17 Pro Max.
>
> Native features: push notifications for comments, hearts and friend requests; in-app camera for plate photos; photo library; location for "Nearby" (only when tapped).
>
> Safety: users agree at sign-up to Terms with zero tolerance for objectionable content. Posts, comments and users can be reported from the ⋯ menu, and reports are reviewed within 24 hours. Users can be blocked from their profile or any post. Objectionable words are filtered automatically.
>
> Account deletion: Profile → Settings → Delete account. Support: helloplatemaps@gmail.com (Settings → Support & legal).

### 8. URLs and privacy labels (App Information / App Privacy)
- Privacy Policy URL: `https://platemaps.com/privacy`. Don't use `www.`, which has a broken certificate.
- Support URL: `https://platemaps.com/terms#contact`. `/support` redirects to login, and Apple needs a public page.
- Screenshots: iPhone only (6.9"). The build no longer supports iPad.
- App Privacy: set **no tracking**. Declare these data types:

| Category | Data type | Linked to user | Purpose |
|---|---|---|---|
| Contact Info | Name, Email Address | Yes | App Functionality |
| User Content | Photos, Other User Content | Yes | App Functionality |
| Identifiers | User ID, Device ID | Yes | App Functionality |
| Location | Precise Location | Yes | App Functionality |
| Usage Data | Product Interaction | No | Analytics |
| Diagnostics | Performance Data | No | Analytics |

### 9. Reply and resubmit
1. Open the rejection message in App Review (the Resolution Center thread). Reply with the short note below.
2. Go back to the version page and click **Add for Review** / **Resubmit to App Review**.

> Thank you for the report. Build 8 opened its sign-in page in Safari instead of inside the app, which showed our offline screen and sent "Try Again" to Safari. Build 9 fixes this: every page now loads in the app. We verified a fresh install on iPhone 17 Pro Max. A demo account is in the Sign-In Information field.

## Risks still open (not blockers for this fix)

- **5.1.1 login wall (medium).** Discover and restaurant pages need an account. Social apps usually pass with the review note above. The stronger fix is a signed-out read-only browse, by adding paths to `PUBLIC_PREFIXES` in `src/lib/signInGate.ts`.
- **5.2 restaurant photos (medium).** About 3,000 restaurant photos are Google Places images, shown without attribution. Google's terms forbid storing those URLs. Apple rarely catches this on its own, but a complaint would trigger 5.2. The cheapest fix is to show the warm tone block instead of `googleusercontent.com` photos in `RestaurantPhoto.tsx`.
- **Push prompt timing (low).** The system prompt appears right after first sign-in, with no explanation screen first. This is allowed.
