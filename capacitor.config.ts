import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.platemapsapp.ios',
  appName: 'PlateMaps',
  // webDir is unused at runtime — PlateMaps is server-rendered, not a static
  // export, so the WebView loads the live site directly via server.url
  // instead of bundling local files. Update this once a custom domain
  // replaces the Vercel subdomain.
  webDir: 'public',
  server: {
    // /m is Calvin's purpose-built phone experience (own layout, own screens,
    // same lib/ and API routes as the desktop site) — the app should load
    // that, not the desktop site squeezed into a phone-sized WebView.
    url: 'https://platemap-five.vercel.app/m',
    cleartext: false
  }
};

export default config;
