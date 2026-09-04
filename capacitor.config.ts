import type { CapacitorConfig } from '@capacitor/cli';

/*
 * The site the shipped app loads.
 *
 * **The default is the production domain on purpose.** This string is compiled
 * into the binary, so a build made without thinking about it has to be the
 * correct one — the failure that matters is shipping a test URL to the App
 * Store, not the reverse.
 *
 * Override it for a TestFlight build while platemaps.com still points at
 * Squarespace:
 *
 *   PLATEMAPS_APP_URL=https://platemap-five.vercel.app/m npx cap sync ios
 *
 * That is a real workflow, not a hack: TestFlight has no opinion about the
 * domain, so internal testing does not have to wait on DNS. Just never submit
 * a binary built that way — platemap-five.vercel.app is a hosting-provider
 * subdomain that would then be frozen into v1 for everyone who installed it.
 */
const SITE_URL = process.env.PLATEMAPS_APP_URL ?? 'https://platemaps.com/m';

const config: CapacitorConfig = {
  appId: 'com.platemapsapp.ios',
  appName: 'PlateMaps',
  // The WebView loads the live site via server.url, so webDir is not what
  // boots the app — PlateMaps is server-rendered, not a static export. It is
  // still not dead config: `npx cap sync` copies this directory into the app
  // bundle, and that copy is where server.errorPath below is resolved from.
  // Anything the offline screen needs has to live in public/.
  webDir: 'public',
  server: {
    // /m is Calvin's purpose-built phone experience (own layout, own screens,
    // same lib/ and API routes as the desktop site) — the app should load
    // that, not the desktop site squeezed into a phone-sized WebView.
    //
    // **This string is compiled into the shipped binary.** It is not read from
    // the server at launch, so changing it later costs a new build, a new
    // upload and a new App Review — and every user still on the old version
    // keeps loading the old host until they update. That is the whole reason
    // it moved to the real domain before the first submission rather than
    // after: platemap-five.vercel.app was a hosting-provider subdomain that
    // would have been frozen into v1.
    url: SITE_URL,
    cleartext: false,

    // What the WebView shows when it cannot reach that URL. Without this it
    // paints its own blank white page, and App Review tests in airplane mode
    // — "app displays a blank screen" is a Guideline 2.1 rejection, and one
    // of the more common ones for an app that loads a remote site.
    //
    // Resolved against the bundled copy of webDir, so the file is
    // public/offline.html. That file names the production URL directly to
    // retry, because a local error page cannot reload its way back to a
    // remote site and it sits in a different bundle directory from this
    // config, so it cannot read it. The one consequence is that a temporary
    // PLATEMAPS_APP_URL build sends "Try again" to production rather than to
    // the override — harmless for internal testing, and it self-corrects the
    // moment the default is what ships.
    errorPath: 'offline.html'
  }
};

export default config;
