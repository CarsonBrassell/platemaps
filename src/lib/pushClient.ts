"use client";

/**
 * The app's side of push — what the phone does with the Capacitor plugin.
 *
 * The site is one bundle for the browser and for the iOS app (the app is a
 * WKWebView pointed at platemaps.com, see capacitor.config.ts). Capacitor
 * injects its bridge into that page, so `@capacitor/core` can tell the two
 * apart at runtime and the push plugin only exists in one of them. Every
 * export here is a no-op in a browser tab; nothing that imports this module
 * needs its own "are we native" branch.
 *
 * The plugin is loaded with `import()` rather than at the top, so the web
 * bundle's critical path does not carry it and a browser never evaluates it.
 *
 * Status vocabulary (what the Settings row renders):
 *   "unsupported"  a browser tab — the row explains and offers nothing
 *   "prompt"       the app, permission never asked
 *   "granted"      permission given; a device token is or will be registered
 *   "denied"       the user said no in the system dialog; only iOS Settings
 *                  can change that, so the row says so instead of a switch
 *   "off"          permission given but the user turned it off in *our*
 *                  settings — the token is deleted server-side and not
 *                  re-registered on launch
 */

import type { PluginListenerHandle } from "@capacitor/core";

export type PushStatus = "unsupported" | "prompt" | "granted" | "denied" | "off";

/** The token the server currently holds for this install, so DELETE can name it. */
const TOKEN_KEY = "pm-push-token";
/** Set when the user turned notifications off in Settings; cleared by turning them on. */
const OFF_KEY = "pm-push-off";
/** Set once the one automatic permission prompt has been shown. */
const ASKED_KEY = "pm-push-asked";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode or storage disabled: push still works for this launch.
  }
}

export async function isNativeApp(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.isNativePlatform();
}

async function plugin() {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return PushNotifications;
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!(await isNativeApp())) return "unsupported";
  const { receive } = await (await plugin()).checkPermissions();
  if (receive === "denied") return "denied";
  if (receive !== "granted") return "prompt";
  return read(OFF_KEY) ? "off" : "granted";
}

/**
 * Registers with APNs and, once the token arrives, with our server. Resolves
 * with the status afterwards. Safe to call on every launch: the server
 * upserts, and APNs returns the same token unless it has rotated.
 *
 * The token comes back through an event rather than a return value, which
 * is why this wires two listeners and takes them down again after one fires.
 */
export async function registerForPush(): Promise<PushStatus> {
  if (!(await isNativeApp())) return "unsupported";
  const push = await plugin();

  const { receive } = await push.requestPermissions();
  write(ASKED_KEY, "1");
  if (receive === "denied") return "denied";
  if (receive !== "granted") return "prompt";

  const token = await new Promise<string | null>((resolve) => {
    const handles: PluginListenerHandle[] = [];
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const h of handles) void h.remove();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 15_000);
    void push.addListener("registration", ({ value }) => finish(value)).then((h) => handles.push(h));
    void push
      .addListener("registrationError", ({ error }) => {
        console.warn("push: registration failed:", error);
        finish(null);
      })
      .then((h) => handles.push(h));
    void push.register();
  });

  if (!token) return "granted";

  const res = await fetch("/api/push/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: "ios" }),
  });
  if (res.ok) {
    write(TOKEN_KEY, token);
    write(OFF_KEY, null);
  }
  return "granted";
}

/**
 * Runs on launch, when signed in. Registers if permission was granted
 * earlier and not switched off here; asks once, the first time, if it has
 * never been asked. A "denied" answer is respected and never re-asked.
 */
export async function syncPushRegistration(): Promise<void> {
  const status = await getPushStatus();
  if (status === "granted") {
    await registerForPush();
  } else if (status === "prompt" && !read(ASKED_KEY)) {
    await registerForPush();
  }
}

/** Settings → Notifications → Off. Deletes the token server-side and remembers the choice. */
export async function disablePush(): Promise<PushStatus> {
  if (!(await isNativeApp())) return "unsupported";
  const token = read(TOKEN_KEY);
  if (token) {
    await fetch("/api/push/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => undefined);
  }
  write(TOKEN_KEY, null);
  write(OFF_KEY, "1");
  return getPushStatus();
}

/** Settings → Notifications → On. Same path as first-time enable. */
export async function enablePush(): Promise<PushStatus> {
  write(OFF_KEY, null);
  return registerForPush();
}

/**
 * The tap on a notification. The payload's `url` (see lib/push.ts) is a
 * path on this site; anything else is ignored so a push can never send the
 * app off-site. Returns the handle so the caller can remove the listener.
 */
export async function onPushOpened(
  handler: (url: string) => void,
): Promise<PluginListenerHandle | null> {
  if (!(await isNativeApp())) return null;
  const push = await plugin();
  return push.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const url = (notification.data as { url?: unknown } | undefined)?.url;
    if (typeof url === "string" && url.startsWith("/m/")) handler(url);
  });
}
