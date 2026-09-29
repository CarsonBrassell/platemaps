# App Store readiness check — 2026-09-28

Read-only audit. Build passes (`npm run build`, security prebuild green), `tsc` clean.
platemaps.com/m/feed, /privacy, /terms all 200 on Vercel. www.platemaps.com does not resolve.

## Must fix before submitting
1. Terms + Privacy still say "This document is a template..." — src/app/terms/page.tsx:592-593, src/app/privacy/page.tsx:349. Delete.
2. Terms / Privacy / forgot-password / reset-password / verify-email are desktop pages with the desktop header+nav; opened from /m they strand the user on the desktop site (4.2 risk). Add /m versions or a bare layout. Links: PhoneProfileAuth.tsx:298,354,358; PhoneProfileScreen.tsx:515,522.
3. iPad: TARGETED_DEVICE_FAMILY "1,2" (project.pbxproj:363,384) → needs iPad screenshots. Set "1" for iPhone-only.
4. Podfile.lock lacks CapacitorPushNotifications → on the Mac: `npx cap sync ios && cd ios/App && pod install`.
5. App Store Connect: demo account + password in review notes (sign-in mandatory). Support URL + privacy URL.

## Should fix
- Account delete leaves Blob photos/avatars (db.ts deleteUser never calls del()); contradicts privacy policy.
- Report only covers posts; no report on comments or users (1.2).
- No Contact/Support row inside /m (only email in Terms §21).
- Push permission prompt fires at first launch, not on an action.
- /m/drafts/profile-text-posts reachable in prod; PhoneStub.tsx dead.
- Signed-out links point at desktop /account (CommentsScreen:206, RestaurantComments:126, DishPosts:137, EmptyFeedState:54, ShortThread:256).
- NSPhotoLibraryUsageDescription says "profile" only; posts use it too.
- UIRequiredDeviceCapabilities armv7 → arm64.
- No app-level PrivacyInfo.xcprivacy.
- public/_*.html test pages (12) get bundled into the app.
- aps-environment = development; confirm archive exports production.
- www.platemaps.com doesn't resolve — don't use it for Support/Marketing URL.

## Passes
Account deletion in-app (5.1.1v), block + unblock, slur filter, terms consent at signup, no third-party login (no SIWA needed),
tab bar nav, no payments, permission strings present, offline.html, icon 1024 no alpha, custom splash, server.url = platemaps.com.
