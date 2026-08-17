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
    url: 'https://platemap-five.vercel.app',
    cleartext: false
  }
};

export default config;
