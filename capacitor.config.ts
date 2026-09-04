import type { CapacitorConfig } from '@capacitor/cli';

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
    url: 'https://platemaps.com/m',
    cleartext: false,

    // What the WebView shows when it cannot reach that URL. Without this it
    // paints its own blank white page, and App Review tests in airplane mode
    // — "app displays a blank screen" is a Guideline 2.1 rejection, and one
    // of the more common ones for an app that loads a remote site.
    //
    // Resolved against the bundled copy of webDir, so the file is
    // public/offline.html. It hardcodes this same URL to retry, because a
    // local error page cannot reload its way back to a remote site; if the
    // url above ever changes, change it there too.
    errorPath: 'offline.html'
  }
};

export default config;
