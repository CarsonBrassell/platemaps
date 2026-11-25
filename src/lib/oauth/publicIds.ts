/**
 * The public identifiers Apple and Google know this app by.
 *
 * **Constants in source, deliberately not Vercel variables.** None of these is
 * a secret: a client id is printed in every sign-in URL. What they are is
 * *frozen into the iOS binary*: the Google iOS client id is compiled into
 * `ios/App/App/Info.plist` as a URL scheme (its reversed form), and the
 * native plugin is handed the same id from JavaScript at runtime. The pages
 * are served remotely, so if this were an env var, one mistyped character in
 * the Vercel editor would reach every installed build at once, and Google's
 * SDK is reported to crash the app when the two disagree. Committed here, a
 * change goes through review, and `scripts/check-security.mjs` fails the
 * build when the iOS id and the Info.plist scheme drift apart.
 *
 * **Changing GOOGLE_IOS_CLIENT_ID needs a new App Store build.** Old builds
 * keep the old URL scheme.
 *
 * Both Google ids are empty until the clients exist in Google Cloud. Empty
 * means "not configured": `readiness()` in `./providers` reports Google off,
 * the config endpoint says false, and no button is ever drawn.
 *
 * No imports, so the security check can read this file as text.
 *
 * ---------------------------------------------------------------------------
 * TODO(owner), when the Google Cloud clients exist. Do all of this in ONE
 * change, then make a new App Store build:
 *
 *  1. Paste both ids below.
 *  2. Add this block to `ios/App/App/Info.plist`, inside the top-level
 *     `<dict>`. The scheme is the iOS client id written backwards: an id of
 *     `1234-abcd.apps.googleusercontent.com` becomes
 *     `com.googleusercontent.apps.1234-abcd`. Google shows it ready-made as
 *     "iOS URL scheme" on the client's page.
 *
 *       <key>CFBundleURLTypes</key>
 *       <array>
 *         <dict>
 *           <key>CFBundleURLSchemes</key>
 *           <array>
 *             <string>com.googleusercontent.apps.PASTE-THE-PART-BEFORE-.apps.googleusercontent.com</string>
 *           </array>
 *         </dict>
 *       </array>
 *
 *     Nothing else: no GIDClientID key and no GoogleService-Info.plist. The
 *     ids reach Google's SDK from JavaScript (`src/lib/oauthClient.ts`).
 *  3. In `capacitor.config.ts`, add this line to the top level of `config`
 *     (beside `appId`):
 *
 *       appendUserAgent: 'PlateMapsSocial/1',
 *
 *     It is how the remotely served pages tell a build that HAS the URL
 *     scheme from one that does not; see `nativeState` in
 *     `src/lib/oauthClient.ts`. Without it the new build shows no Apple or
 *     Google button at all.
 *  4. Bump the build number and run `npx cap sync ios`.
 *
 * **The block is deliberately absent while the ids are empty.** Google's
 * sign-in sheet finishes by opening that URL scheme, which is why
 * `npm run security:check` fails the build when the iOS id is set and its
 * scheme is not in Info.plist.
 *
 * **A build with the sign-in plugin and no URL scheme does not merely fail
 * at Google sign-in: it crashes.** Google's SDK raises an uncatchable
 * exception for the missing scheme the moment its sheet is asked for. Build
 * 10 is such a build. It is safe only because the pages refuse to offer
 * native sign-in to any build whose user agent lacks the marker in step 3,
 * so never add that marker without the URL scheme (the security check
 * refuses that too), and expect people on build 10 or older to see "update
 * the app" rather than the buttons once sign-in is switched on.
 * ---------------------------------------------------------------------------
 */

/** OAuth client of type "Web application". Also the audience of the token the iOS SDK returns. */
export const GOOGLE_WEB_CLIENT_ID = "";

/** OAuth client of type "iOS", bundle id com.platemapsapp.ios. */
export const GOOGLE_IOS_CLIENT_ID = "";

/** The audience of an identity token Apple mints for the native app. Matches capacitor.config.ts. */
export const APPLE_BUNDLE_ID = "com.platemapsapp.ios";
