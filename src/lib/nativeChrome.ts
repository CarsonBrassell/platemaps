/**
 * Native chrome the WebView cannot reach with CSS: the iOS status bar's text
 * colour (HIG #3) and the system Larger Text setting (HIG #10).
 *
 * Same shape as pushClient.ts: every plugin is loaded with `import()` behind
 * `Capacitor.isNativePlatform()`, so in a browser tab each call is a no-op and
 * the web bundle never pulls a plugin in. Failures are swallowed — a status bar
 * left the wrong colour is cosmetic, and must never break the screen that asked.
 */

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Light status-bar text over the night map, dark text everywhere else. The app
 * is light-only, so "off" is an explicit dark-on-light, not the system default
 * (which would follow the phone into dark mode and go white on cream).
 */
export async function setStatusBarOnDark(onDark: boolean): Promise<void> {
  if (!(await isNative())) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: onDark ? Style.Dark : Style.Light });
  } catch {
    /* cosmetic — see the module note */
  }
}

/**
 * Apply the phone's Larger Text setting to the WebView. A WKWebView ignores it
 * by default; this reads the preferred ratio (1 at the default size, so nothing
 * moves for most people) and sets it as the page's text zoom. Re-applied when
 * the app comes back to the foreground, which is where the setting gets changed.
 * Returns the cleanup for the listener.
 */
export function followLargerText(): () => void {
  let stopped = false;
  const apply = async () => {
    if (stopped || !(await isNative())) return;
    try {
      const { TextZoom } = await import("@capacitor/text-zoom");
      const { value } = await TextZoom.getPreferred();
      if (!stopped) await TextZoom.set({ value });
    } catch {
      /* unsupported or denied — the page stays at its designed size */
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void apply();
  };
  void apply();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisible);
  };
}
