import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.platemapsapp.ios',
  appName: 'PlateMaps',
  // webDir is unused at runtime — PlateMaps is server-rendered, not a static
  // export, so the WebView loads the live site directly via server.url
  // instead of bundling local files.
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
    cleartext: false
  }
};

export default config;
