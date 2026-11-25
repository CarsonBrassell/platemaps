"use client";

/**
 * The browser's side of Apple / Google sign-in.
 *
 * Same shape as `pushClient.ts`, for the same reason: the site is one bundle
 * for the browser and for the iOS app, and the native sign-in plugin exists
 * in only one of them — and only in app builds new enough to carry it. Every
 * export here answers for all three places (a browser tab, a current app
 * build, an old app build), so no screen needs its own "are we native"
 * branch.
 *
 * **The server decides what is offered** (`/api/auth/oauth/config`), and with
 * nothing configured it says no to everything: `socialAvailability()` then
 * resolves to `{ mode: "none", oldBuild: false }` and no screen draws a
 * button, a row or a hint. That is the shipped state.
 *
 * Two flows, chosen here and nowhere else:
 * - **In the app**: ask the server for a one-time nonce, hand it to the
 *   native sheet, post the signed token back same-origin. The page never
 *   leaves.
 * - **On the website**: ask the server for Google's URL and navigate the
 *   whole tab there. No popup and no Google script, so the CSP is untouched.
 *   Never offered inside the app — a WKWebView is not where Google wants its
 *   sign-in page, and the app has the native sheet.
 *
 * Nothing here ever holds a secret. A password passed to `startOAuth` (for
 * connecting a provider to an account that has one) goes into one request
 * body and is not kept.
 */

import type { Account } from "@/lib/auth";

export type SocialProvider = "google" | "apple";
export type OAuthIntent = "signin" | "link" | "reauth";
/** Mirrors ReauthPurpose in lib/db.ts — that module is server-only. */
export type ReauthPurpose = "delete" | "email" | "password" | "link";
/** The four screens a flow may land back on. The server refuses any other. */
export type OAuthReturnTo = "/account" | "/m/account" | "/account/settings" | "/m/account/settings";

type OAuthConfig = {
  web: { google: boolean };
  native: { pair: boolean; googleWebClientId: string; googleIosClientId: string };
};

/** Everything off — what an unconfigured server says, and what a failed fetch is read as. */
const OFF: OAuthConfig = {
  web: { google: false },
  native: { pair: false, googleWebClientId: "", googleIosClientId: "" },
};

export type SocialAvailability =
  /**
   * Draw nothing. `oldBuild` is the one exception to "nothing": the page is
   * inside an app build that predates the sign-in plugin *and* the server
   * says in-app sign-in is live, so somebody who joined with Apple or Google
   * on a newer build needs telling why there is no button for them here.
   */
  | { mode: "none"; oldBuild: boolean }
  /** The app, plugin present, server ready: Apple and Google together (guideline 4.8). */
  | { mode: "native"; providers: readonly SocialProvider[] }
  /** A browser tab, server ready: Google only. Apple on the website is not built yet. */
  | { mode: "web"; providers: readonly SocialProvider[] };

/* Apple first in the app: the App Store guideline wants it at least as
   prominent as any other option, and "first" is the unarguable reading. */
const NATIVE_PROVIDERS: readonly SocialProvider[] = ["apple", "google"];
const WEB_PROVIDERS: readonly SocialProvider[] = ["google"];

let configPromise: Promise<OAuthConfig> | null = null;

/**
 * Asked once per page load. Only literal `true` turns anything on, so an
 * error page, an old deployment without the route, or a proxy's HTML all read
 * as "off". A failed fetch is forgotten rather than cached, so the next
 * screen to ask tries again instead of inheriting one dropped request.
 */
export function loadOAuthConfig(): Promise<OAuthConfig> {
  if (typeof window === "undefined") return Promise.resolve(OFF);
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const res = await fetch("/api/auth/oauth/config", { cache: "no-store" });
        if (!res.ok) throw new Error("config unavailable");
        const data = (await res.json()) as Partial<OAuthConfig> | null;
        const str = (v: unknown) => (typeof v === "string" ? v : "");
        return {
          web: { google: data?.web?.google === true },
          native: {
            pair: data?.native?.pair === true,
            googleWebClientId: str(data?.native?.googleWebClientId),
            googleIosClientId: str(data?.native?.googleIosClientId),
          },
        };
      } catch {
        configPromise = null;
        return OFF;
      }
    })();
  }
  return configPromise;
}

/**
 * What a build that can really do native sign-in adds to its user agent
 * (`appendUserAgent` in capacitor.config.ts). See `nativeState`.
 */
const SOCIAL_BUILD_MARKER = /PlateMapsSocial\/\d/;

/**
 * Whether this page is inside the app, and whether that build can sign in
 * natively. `hasPlugin` needs two things, and the second is the one that
 * stops a crash.
 *
 * 1. The plugin is registered. The name is the Swift plugin's `jsName`; an
 *    App Store build from before this feature has no such plugin, and calling
 *    into it would reject with "not implemented" — so it is asked about,
 *    never assumed.
 * 2. The build says so in its user agent. A build can carry the plugin and
 *    still lack the Google URL scheme in its Info.plist (build 10 does: it
 *    was made before the Google client ids existed). Google's SDK does not
 *    fail politely there — `GIDSignIn` raises an Objective-C exception for
 *    the missing scheme, which Swift cannot catch, and the app dies on every
 *    tap. The pages are served remotely, so the moment the server turns
 *    native sign-in on, every installed build gets these buttons; nothing
 *    about "is the plugin there" tells a safe build from that one. So the
 *    marker is added to capacitor.config.ts in the same change that adds the
 *    URL scheme (`npm run security:check` refuses one without the other), and
 *    a build without it is treated exactly like one without the plugin: no
 *    buttons, and the "update the app" hint once the server is ready.
 */
async function nativeState(): Promise<{ native: boolean; hasPlugin: boolean }> {
  if (typeof window === "undefined") return { native: false, hasPlugin: false };
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return { native: false, hasPlugin: false };
  return {
    native: true,
    hasPlugin:
      Capacitor.isPluginAvailable("SocialLogin") && SOCIAL_BUILD_MARKER.test(window.navigator.userAgent),
  };
}

export async function socialAvailability(): Promise<SocialAvailability> {
  const [config, { native, hasPlugin }] = await Promise.all([loadOAuthConfig(), nativeState()]);

  if (native) {
    // Both ids are needed to initialise Google's SDK; the server only sends
    // them alongside a true `pair`, and this refuses a half-answer anyway.
    const ready =
      config.native.pair && config.native.googleWebClientId !== "" && config.native.googleIosClientId !== "";
    if (ready && hasPlugin) return { mode: "native", providers: NATIVE_PROVIDERS };
    return { mode: "none", oldBuild: ready && !hasPlugin };
  }

  if (config.web.google) return { mode: "web", providers: WEB_PROVIDERS };
  return { mode: "none", oldBuild: false };
}

/**
 * Boxed on purpose — see the same note in `pushClient.ts`. A raw Capacitor
 * plugin is a Proxy that answers `then`, so returning one from an async
 * function makes the promise try to unwrap it and reject. This package's
 * `SocialLogin` export happens to be a plain wrapper object today, but
 * `SocialLoginBase` beside it is the raw proxy, and one refactor upstream is
 * all it would take; the box costs nothing.
 *
 * Loaded with `import()` and only ever reached after `nativeState()` said the
 * plugin exists, so a browser tab never downloads or evaluates the package
 * (it runs a popup-redirect handler at import that has no business there).
 */
async function plugin() {
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  return { social: SocialLogin };
}

let initialized: Promise<void> | null = null;

/**
 * Once per page load. The ids come from the server's config answer, which is
 * the same source constants the iOS URL scheme is checked against at build
 * time — never from anything typed or stored on the device.
 *
 * `iOSServerClientId` is the *Web* client id: it is what makes Google mint
 * the ID token for the audience the server verifies. `useProperTokenExchange`
 * makes the plugin hand back Apple's one-time authorization code instead of
 * dressing it up as an access token; the server exchanges it. No
 * `apple.redirectUrl` — setting one makes the plugin post the code to that
 * URL itself.
 */
function ensureInitialized(config: OAuthConfig): Promise<void> {
  if (!initialized) {
    initialized = (async () => {
      const { social } = await plugin();
      await social.initialize({
        google: {
          iOSClientId: config.native.googleIosClientId,
          iOSServerClientId: config.native.googleWebClientId,
          mode: "online",
        },
        apple: { useProperTokenExchange: true },
      });
    })().catch((err) => {
      initialized = null;
      throw err;
    });
  }
  return initialized;
}

export type OAuthResult =
  | { status: "signed_in"; account: Account }
  /** A new person: no account exists yet. The finish screen asks for a username and consent. */
  | { status: "needs_signup"; provider: SocialProvider; email: string | null; needsEmail: boolean }
  | { status: "linked" }
  | { status: "reauthed"; purpose: ReauthPurpose }
  /** The person closed the sheet. Not an error; say nothing. */
  | { status: "cancelled" }
  /** The tab is on its way to Google. Nothing more happens on this page. */
  | { status: "redirecting" }
  | { status: "error"; message: string; code?: string };

const GENERIC = "Something went wrong signing in. Try again.";

/** The server's own sentence when it sent one — it only ever sends fixed strings. */
async function failure(res: Response): Promise<OAuthResult> {
  try {
    const data = (await res.json()) as { error?: unknown; code?: unknown };
    return {
      status: "error",
      message: typeof data.error === "string" ? data.error : GENERIC,
      code: typeof data.code === "string" ? data.code : undefined,
    };
  } catch {
    return { status: "error", message: GENERIC };
  }
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The plugin rejects a closed sheet with this code; the wording check covers Apple's and Google's own errors. */
function isCancellation(err: unknown): boolean {
  const { code, message } = (err ?? {}) as { code?: unknown; message?: unknown };
  if (code === "USER_CANCELLED") return true;
  return typeof message === "string" && /cancell?ed/i.test(message);
}

export type StartOAuthOptions = {
  returnTo: OAuthReturnTo;
  /** Where the visitor was headed. The server runs it through `safeNext`. */
  next?: string | null;
  /** Required with intent "reauth": the one action this confirmation is for. */
  purpose?: ReauthPurpose;
  /** With intent "link" on an account that has a password. Sent once, never kept. */
  password?: string;
};

/**
 * Run one sign-in, connect or confirmation from tap to result. Never throws.
 *
 * Which flow runs is decided here from `socialAvailability()`, not by the
 * caller, so a screen cannot start the website trip inside the app or call a
 * plugin that is not there.
 */
export async function startOAuth(
  provider: SocialProvider,
  intent: OAuthIntent,
  options: StartOAuthOptions
): Promise<OAuthResult> {
  try {
    const availability = await socialAvailability();
    if (availability.mode === "none" || !availability.providers.includes(provider)) {
      return { status: "error", message: "That sign-in option isn't available right now.", code: "unavailable" };
    }

    const begin = await postJson("/api/auth/oauth/begin", {
      provider,
      mode: availability.mode,
      intent,
      purpose: options.purpose,
      returnTo: options.returnTo,
      next: options.next ?? undefined,
      password: options.password,
    });
    if (!begin.ok) return failure(begin);
    const started = (await begin.json()) as { nonce?: unknown; url?: unknown };

    if (availability.mode === "web") {
      /* A script navigation, not a form post, so `form-action 'self'` is not
         involved. The address came from our own server a moment ago; it is
         still checked, because "navigate to whatever the response said" is
         the kind of line that becomes an open redirect the day something
         else can influence that response. */
      if (typeof started.url !== "string" || !started.url.startsWith("https://accounts.google.com/")) {
        return { status: "error", message: GENERIC };
      }
      window.location.assign(started.url);
      return { status: "redirecting" };
    }

    if (typeof started.nonce !== "string" || started.nonce === "") {
      return { status: "error", message: GENERIC };
    }
    const nonce = started.nonce;

    await ensureInitialized(await loadOAuthConfig());
    const { social } = await plugin();

    let idToken: string | null = null;
    let authorizationCode: string | undefined;
    try {
      if (provider === "apple") {
        /* Email only. PlateMaps names people by a handle they choose, so the
           real name is never asked for — which also sidesteps "Apple sends
           the name only on the first sign-in". */
        const { result } = await social.login({
          provider: "apple",
          options: { scopes: ["email"], nonce },
        });
        idToken = result.idToken;
        authorizationCode = result.authorizationCode;
      } else {
        /* No `scopes`: the SDK's defaults already include the email, and it
           adds basic profile regardless. The server reads the id and the
           address from the token and discards the rest. Passing a nonce also
           makes the plugin show the sheet every time rather than silently
           restoring the last Google account, which is what a confirmation
           needs. */
        const { result } = await social.login({ provider: "google", options: { nonce } });
        idToken = result.responseType === "online" ? result.idToken : null;
      }
    } catch (err) {
      if (isCancellation(err)) return { status: "cancelled" };
      // The reason stays on the device's console; it can name the SDK's
      // internals but never a token.
      console.warn("oauth: native sign-in failed:", (err as { message?: unknown } | null)?.message);
      return { status: "error", message: GENERIC };
    }

    if (!idToken) return { status: "error", message: GENERIC };

    const done = await postJson("/api/auth/oauth/native", { provider, idToken, authorizationCode });
    if (!done.ok) return failure(done);

    const data = (await done.json()) as {
      status?: unknown;
      account?: Account;
      provider?: unknown;
      email?: unknown;
      needsEmail?: unknown;
      purpose?: unknown;
    };
    switch (data.status) {
      case "signed_in":
        return data.account ? { status: "signed_in", account: data.account } : { status: "error", message: GENERIC };
      case "needs_signup":
        return {
          status: "needs_signup",
          provider,
          email: typeof data.email === "string" ? data.email : null,
          needsEmail: data.needsEmail === true,
        };
      case "linked":
        return { status: "linked" };
      case "reauthed":
        return { status: "reauthed", purpose: (data.purpose as ReauthPurpose | undefined) ?? options.purpose ?? "link" };
      default:
        return { status: "error", message: GENERIC };
    }
  } catch {
    // A dropped connection, mostly. Whatever it was, the caller gets a
    // sentence rather than an unhandled rejection under a button.
    return { status: "error", message: "Couldn't reach the server. Check your connection and try again." };
  }
}

/**
 * Forget the provider session the native SDKs keep, after PlateMaps signs
 * out or the account is deleted — otherwise the next tap on Continue with
 * Google skips the account chooser and signs the previous person straight
 * back in. Best effort and silent: a browser tab and an old build return
 * before loading anything, and "wasn't signed in" is a rejection the plugin
 * raises for Apple that nobody needs to hear about.
 */
export async function signOutNative(): Promise<void> {
  try {
    const { native, hasPlugin } = await nativeState();
    if (!native || !hasPlugin) return;
    // Nobody can have signed in natively while the server has it switched
    // off, so there is nothing to forget and no reason to load the package
    // or call into native code. Cached, and OFF when the fetch fails.
    const config = await loadOAuthConfig();
    if (!config.native.pair) return;
    const { social } = await plugin();
    await social.logout({ provider: "google" }).catch(() => undefined);
    await social.logout({ provider: "apple", clearCachedUserInfo: true }).catch(() => undefined);
  } catch {
    // Nothing to do, and nothing to tell anyone.
  }
}

// --- Coming back from the website trip -------------------------------------

export type OAuthReturn =
  | { kind: "finish" }
  | { kind: "linked" }
  | { kind: "reauthed"; purpose: ReauthPurpose }
  | { kind: "cancelled" }
  /** `reason` is a raw query value: look it up with `oauthErrorMessage`, never print it. */
  | { kind: "error"; reason: string | null };

const PURPOSES: readonly string[] = ["delete", "email", "password", "link"];

let captured: { path: string; value: OAuthReturn | null } | null = null;

/**
 * What the Google trip left in this page's URL (`?oauth=…`), read once.
 *
 * Read once and remembered, because several panels on one screen each need
 * the answer and the first of them tidies it out of the address bar (see
 * `tidyOAuthReturn`) — a later-mounting panel must not find it gone. The
 * memory is per path, and the hooks that read it forget it when their screen
 * unmounts, so signing out and back in on the same page does not replay a
 * finish screen or a "Connected." that belonged to an earlier visit.
 *
 * Call from a `useState` initialiser or an event, on screens that only render
 * after the session has loaded on the client. It reads `window.location`,
 * which the server render does not have.
 */
export function oauthReturn(): OAuthReturn | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  if (captured && captured.path === path) return captured.value;

  const params = new URLSearchParams(window.location.search);
  const raw = params.get("oauth");
  let value: OAuthReturn | null = null;
  if (raw === "finish" || raw === "linked" || raw === "cancelled") value = { kind: raw };
  else if (raw === "error") value = { kind: "error", reason: params.get("reason") };
  else if (raw === "reauthed") {
    const purpose = params.get("for");
    if (purpose && PURPOSES.includes(purpose)) value = { kind: "reauthed", purpose: purpose as ReauthPurpose };
  }
  captured = { path, value };
  return value;
}

/**
 * Take `oauth`, `reason` and `for` out of the address bar, leaving everything
 * else (`next`, `nav`) alone. Without this a reload, or a link copied from
 * the bar, replays "Connected." or re-arms a delete panel. Call from an
 * effect; `oauthReturn()` keeps answering from memory afterwards.
 */
export function tidyOAuthReturn(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("oauth")) return;
  url.searchParams.delete("oauth");
  url.searchParams.delete("reason");
  url.searchParams.delete("for");
  // `null` state is the documented way to do this under the App Router,
  // which patches replaceState and keeps useSearchParams in step.
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/** Drop the remembered value once it has been acted on (a confirmation spent, a finish screen closed). */
export function forgetOAuthReturn(): void {
  if (typeof window === "undefined") return;
  captured = { path: window.location.pathname, value: null };
}

// --- What is connected to this account ---------------------------------------

/** Mirrors the rows of GET /api/account/identities. */
export type LinkedIdentity = { provider: SocialProvider; email: string | null };

/**
 * The signed-in account's connected sign-in methods. Resolves to `null` when
 * the question could not be asked (signed out, offline), which callers must
 * not read as "none connected".
 */
export async function loadIdentities(): Promise<LinkedIdentity[] | null> {
  try {
    const res = await fetch("/api/account/identities", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { identities?: unknown };
    if (!Array.isArray(data.identities)) return null;
    return data.identities
      .filter(
        (row): row is { provider: SocialProvider; email?: unknown } =>
          !!row && typeof row === "object" && ((row as { provider?: unknown }).provider === "google" || (row as { provider?: unknown }).provider === "apple")
      )
      .map((row) => ({ provider: row.provider, email: typeof row.email === "string" ? row.email : null }));
  } catch {
    return null;
  }
}
