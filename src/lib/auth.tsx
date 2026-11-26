"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useHydrated } from "@/lib/useHydrated";
import { signOutNative } from "@/lib/oauthClient";

export type Account = {
  id: string;
  name: string;
  email: string;
  points: number;
  avatarUrl?: string;
  sharePhotosPublicly: boolean;
  favoriteCuisine?: string;
  favoriteRestaurantId?: string;
  hideFromLeaderboard: boolean;
  discoverableByUsername: boolean;
  friendRequestsOpen: boolean;
  /** "Find me from contacts". False until the person turns it on. Mirrors AccountJson. */
  discoverableByContacts: boolean;
  /** Whether the one-time "be found from contacts" question was answered. Mirrors AccountJson. */
  contactsChoiceAnswered: boolean;
  /** A phone is on file and confirmed within 12 months. Mirrors AccountJson. */
  phoneVerified: boolean;
  /** A phone is on file but needs confirming again. Mirrors AccountJson. */
  phoneNeedsReconfirm: boolean;
  /** Last four digits of that phone. Mirrors AccountJson. */
  phoneLast4?: string;
  /**
   * Set only when the server has contacts features switched on. Every
   * contacts surface draws only when this is `true`. Mirrors AccountJson.
   */
  contactsAvailable?: true;
  /** Set only when a phone can be verified here. Gates the phone rows. Mirrors AccountJson. */
  phoneVerifyAvailable?: true;
  /** Whether `email` has been proved reachable. False on every pre-verification account. */
  emailVerified: boolean;
  /** An address asked for but not yet confirmed, if a change is in flight. */
  pendingEmail?: string;
  /** False for an Apple/Google account that never set a password. Mirrors AccountJson. */
  hasPassword: boolean;
  /** Whether the first-post photo notice has been shown. Mirrors AccountJson. */
  photoNoticeSeen: boolean;
  /** Whether the first-run coach tour has run. Mirrors AccountJson. */
  tourSeen: boolean;
  /** Set only for the accounts that get the dish picks. Mirrors AccountJson. */
  forMe?: true;
  /** Set only for the accounts that get the Discover buttons. Mirrors AccountJson. */
  discoverModes?: true;
  profileV2?: true;
  /** Set only for admin accounts (lib/adminGate.ts). Mirrors AccountJson. */
  admin?: true;
};

type AuthContextValue = {
  account: Account | null;
  isSignedIn: boolean;
  loading: boolean;
  /**
   * True once `/api/auth/me` has given an authoritative answer — either a
   * user or `{ user: null }`. Stays false while the only thing that has
   * happened is `UNREACHABLE` (see `fetchAccount`), so a consumer deciding
   * whether to treat `account === null` as "really signed out" (e.g.
   * `RequireSignIn`) can wait for this rather than acting on a network blip.
   * `loading` keeps its existing meaning — this is a separate axis, not a
   * replacement.
   */
  resolved: boolean;
  signUp: (
    name: string,
    email: string,
    password: string,
    agreedToTerms: boolean
  ) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  /**
   * Erase the account. Takes the password because the server re-authenticates
   * before deleting — see /api/account. Resolves to an error string, or null
   * once the account is gone and this context has dropped to signed-out.
   *
   * An account with no password (`hasPassword` false) calls this with none,
   * straight after confirming with Apple or Google; the server spends that
   * confirmation instead.
   */
  deleteAccount: (password?: string) => Promise<string | null>;
  /**
   * Adopt the account a finished Apple/Google sign-in returned — the same
   * `setAccount` a password sign-in ends in. The session cookie is already
   * set by the time the response carrying it arrives.
   */
  completeOAuth: (account: Account) => void;
  refresh: () => Promise<void>;
  updateAvatar: (avatarUrl: string) => Promise<string | null>;
  updateSettings: (
    settings: Partial<{
      sharePhotosPublicly: boolean;
      favoriteCuisine: string | null;
      favoriteRestaurantId: string | null;
      hideFromLeaderboard: boolean;
      discoverableByUsername: boolean;
      friendRequestsOpen: boolean;
      /**
       * Send this only from an explicit tap on "Turn on", "No thanks" or the
       * Settings control. Either value is recorded as the person's answer.
       */
      discoverableByContacts: boolean;
      /** Only ever `true` — the server treats it as a latch, not a switch. */
      photoNoticeSeen: true;
      tourSeen: true;
    }>
  ) => Promise<string | null>;
  /** Rename. Resolves to an error string, or null with the context renamed. */
  changeUsername: (name: string) => Promise<string | null>;
  /**
   * Ask to move the account to `email`. Takes the password because the server
   * re-authenticates — see /api/account/email.
   *
   * Success does **not** mean the address changed: it means a link is on its
   * way to it, and `pendingEmail` now says so. Nothing about the account moves
   * until that link is opened. `notice` carries the development-only note
   * about where the link went when no mailer is configured.
   */
  changeEmail: (
    email: string,
    password: string
  ) => Promise<{ error: string | null; notice?: string; /** HTTP status of a refusal. */ status?: number }>;
  /**
   * Re-send the link to whichever address is waiting on one.
   *
   * `retryAfterSeconds` is set when the server said "too soon" (one link a
   * minute). That is not a failure worth an error message — a link is already
   * on its way — so a caller that has it should count it down instead.
   */
  resendVerification: () => Promise<{
    error: string | null;
    notice?: string;
    retryAfterSeconds?: number;
  }>;
  /**
   * Text a code to `phone` (US numbers). `unavailable` means this deployment
   * cannot verify phones; `retryAfterSeconds` is set when a limit was hit.
   */
  sendPhoneCode: (phone: string) => Promise<PhoneResult>;
  /** Confirm the texted code. On success the account here carries the phone. */
  verifyPhoneCode: (phone: string, code: string) => Promise<PhoneResult>;
  /** Take the phone number off the account. */
  removePhone: () => Promise<PhoneResult>;
  /**
   * Both passwords, because the server re-authenticates before writing. On
   * success every other session is ended too, so the resolved value carries how
   * many were — the caller needs it to say so.
   *
   * Adding a first password to an account that has none passes an empty
   * `currentPassword`; the server ignores it and wants a provider
   * confirmation instead. On success `hasPassword` flips here too.
   *
   * `connectedSignIns` names the Apple / Google sign-ins that can still get
   * into the account after the change (a password change does not remove
   * them). `status` is the HTTP status of a refusal, so a caller can tell a
   * rejected password (400) from a spent confirmation (401).
   */
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{
    error: string | null;
    endedElsewhere: number;
    connectedSignIns?: ("apple" | "google")[];
    status?: number;
  }>;
  /** Ends every session but this one. Resolves to how many were ended. */
  signOutOtherDevices: () => Promise<{ error: string | null; endedElsewhere: number }>;
};

/** What the three phone calls resolve to. `error` null means it worked. */
export type PhoneResult = {
  error: string | null;
  /** The server's machine-readable reason, e.g. `"unavailable"` or `"rate-limited"`. */
  code?: string;
  retryAfterSeconds?: number;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** What a request that never got an answer is reported as. */
const OFFLINE = "Couldn't reach the server. Check your connection and try again.";

/** Seconds to wait, from the JSON field or the `Retry-After` header. */
function retryAfter(res: Response, data: Record<string, unknown>): number | undefined {
  const fromBody = data.retryAfterSeconds;
  if (typeof fromBody === "number" && fromBody > 0) return Math.ceil(fromBody);
  const fromHeader = Number(res.headers.get("Retry-After"));
  return Number.isFinite(fromHeader) && fromHeader > 0 ? Math.ceil(fromHeader) : undefined;
}

/** The body of a failed response as an object, or `{}` when it has none. */
async function errorBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await res.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function phoneFailure(res: Response): Promise<PhoneResult> {
  const data = await errorBody(res);
  return {
    error: typeof data.error === "string" ? data.error : "Something went wrong.",
    code: typeof data.code === "string" ? data.code : undefined,
    retryAfterSeconds: retryAfter(res, data),
  };
}

async function parseError(res: Response) {
  try {
    const data = await res.json();
    return data.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

/**
 * Distinguishes "the server says you are signed out" from "the server did not
 * answer", which the two used to be conflated into.
 *
 * The session lookup ran once, and any thrown fetch — a cold app launch before
 * the network is up, a dropped connection, a sleeping serverless function —
 * fell into a catch that left `account` null. The UI reads that as signed out,
 * so a momentary blip logged you out of a session that was perfectly alive on
 * the server and still in the cookie jar.
 */
const UNREACHABLE = Symbol("unreachable");

/**
 * Asks who the caller is, retrying a couple of times before giving up.
 *
 * A `{ user: null }` body is authoritative — that is the server telling us
 * there is no session, and it is returned immediately without retrying.
 * Only a transport failure or a 5xx is retried, because only those are the
 * question going unanswered rather than being answered "no".
 */
async function fetchAccount(): Promise<Account | null | typeof UNREACHABLE> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        return (data.user as Account | null) ?? null;
      }
      /* A 4xx is a real answer from a working server; only a 5xx is worth
         asking again. */
      if (res.status < 500) return null;
    } catch {
      // Fall through to the backoff below.
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return UNREACHABLE;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState(false);

  async function refresh() {
    const account = await fetchAccount();
    if (account !== UNREACHABLE) {
      setAccount(account);
      setResolved(true);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const account = await fetchAccount();
      if (cancelled) return;
      /* Only a real answer moves the UI. If the server could not be reached at
         all, stay as we are rather than rendering signed-out — see
         fetchAccount. */
      if (account !== UNREACHABLE) {
        setAccount(account);
        setResolved(true);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function signUp(
    name: string,
    email: string,
    password: string,
    agreedToTerms: boolean
  ) {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, agreedToTerms }),
    });
    if (!res.ok) return parseError(res);
    setAccount(await res.json());
    return null;
  }

  async function signIn(email: string, password: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return parseError(res);
    setAccount(await res.json());
    return null;
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAccount(null);
    // Also forget the Apple / Google session the app's native SDKs keep, or
    // the next "Continue with Google" would skip the chooser and sign the
    // same person straight back in. A no-op in a browser and in an app build
    // without the plugin; never awaited, never throws.
    void signOutNative();
  }

  async function deleteAccount(password?: string) {
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      // `{}` when there is no password to send — an account without one.
      body: JSON.stringify(password === undefined ? {} : { password }),
    });
    if (!res.ok) return parseError(res);
    // Same drop as signOut. The server has already cleared the cookie, so this
    // is only catching the client up — but it has to happen before the caller
    // navigates, or the destination renders a frame against an account that no
    // longer exists.
    setAccount(null);
    void signOutNative();
    return null;
  }

  async function updateAvatar(avatarUrl: string) {
    const res = await fetch("/api/auth/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl }),
    });
    if (!res.ok) return parseError(res);
    setAccount(await res.json());
    return null;
  }

  async function changeUsername(name: string) {
    const res = await fetch("/api/account/username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return parseError(res);
    setAccount(await res.json());
    return null;
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) return { error: await parseError(res), endedElsewhere: 0, status: res.status };
    const data = await res.json();
    // The password isn't in this context and the session survived on purpose;
    // the one thing that can have changed is that the account now has one.
    setAccount((current) => (current && !current.hasPassword ? { ...current, hasPassword: true } : current));
    const connected: unknown = data.connectedSignIns;
    return {
      error: null,
      endedElsewhere: (data.endedElsewhere as number) ?? 0,
      // Only the two known words are let through to the screen.
      connectedSignIns: Array.isArray(connected)
        ? connected.filter((p): p is "apple" | "google" => p === "apple" || p === "google")
        : [],
    };
  }

  async function signOutOtherDevices() {
    const res = await fetch("/api/account/sessions", { method: "DELETE" });
    if (!res.ok) return { error: await parseError(res), endedElsewhere: 0 };
    const data = await res.json();
    return { error: null, endedElsewhere: (data.endedElsewhere as number) ?? 0 };
  }

  async function changeEmail(email: string, password: string) {
    const res = await fetch("/api/account/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return { error: await parseError(res), status: res.status };

    // The response carries the account because `pendingEmail` changed on it,
    // which is the only visible result of a successful call.
    const data = await res.json();
    setAccount(data.account);
    return { error: null, notice: data.notice as string | undefined };
  }

  /* The helpers from here to updateSettings catch a fetch that never got an
     answer (no connection — common inside the app) and return it as an
     ordinary error. Their callers set a busy flag, await, then clear it; a
     thrown rejection skips the clearing and leaves a button on "Sending…"
     for good with nothing said. */
  async function resendVerification() {
    let res: Response;
    try {
      res = await fetch("/api/account/email/send", { method: "POST" });
    } catch {
      return { error: OFFLINE };
    }
    if (!res.ok) {
      const data = await errorBody(res);
      return {
        error: typeof data.error === "string" ? data.error : "Something went wrong.",
        // Only a 429 means "wait"; the number comes from the body, or from the
        // header when the hourly limiter answered instead of the 60s one.
        retryAfterSeconds: res.status === 429 ? retryAfter(res, data) : undefined,
      };
    }
    const data = await res.json();
    return { error: null, notice: data.notice as string | undefined };
  }

  async function sendPhoneCode(phone: string): Promise<PhoneResult> {
    try {
      const res = await fetch("/api/account/phone/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) return phoneFailure(res);
      return { error: null };
    } catch {
      return { error: OFFLINE };
    }
  }

  async function verifyPhoneCode(phone: string, code: string): Promise<PhoneResult> {
    try {
      const res = await fetch("/api/account/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      if (!res.ok) return phoneFailure(res);
      setAccount(await res.json());
      return { error: null };
    } catch {
      return { error: OFFLINE };
    }
  }

  async function removePhone(): Promise<PhoneResult> {
    try {
      const res = await fetch("/api/account/phone", { method: "DELETE" });
      if (!res.ok) return phoneFailure(res);
      setAccount(await res.json());
      return { error: null };
    } catch {
      return { error: OFFLINE };
    }
  }

  async function updateSettings(
    settings: Partial<{
      sharePhotosPublicly: boolean;
      favoriteCuisine: string | null;
      favoriteRestaurantId: string | null;
      hideFromLeaderboard: boolean;
      discoverableByUsername: boolean;
      friendRequestsOpen: boolean;
      discoverableByContacts: boolean;
      photoNoticeSeen: true;
      tourSeen: true;
    }>
  ) {
    try {
      const res = await fetch("/api/account/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) return parseError(res);
      setAccount(await res.json());
      return null;
    } catch {
      return OFFLINE;
    }
  }

  return (
    <AuthContext.Provider
      value={{
        account,
        isSignedIn: !!account,
        loading,
        resolved,
        signUp,
        signIn,
        signOut,
        deleteAccount,
        completeOAuth: setAccount,
        refresh,
        updateAvatar,
        updateSettings,
        changeUsername,
        changeEmail,
        resendVerification,
        sendPhoneCode,
        verifyPhoneCode,
        removePhone,
        changePassword,
        signOutOtherDevices,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/**
 * Whether this viewer gets the dish picks (lib/forMeGate.ts). False while the
 * account is still loading, so the server render and the first client frame are
 * what every other visitor gets, and for everyone whose account does not carry
 * the flag. Every dish-pick surface asks this and, on false, renders what the page
 * did before the feature.
 *
 * Also false while a subtree is hydrating. The server always renders with no
 * account, and a subtree can hydrate after the account fetch has landed; reading
 * the flag there made the client disagree with the server HTML and React threw a
 * hydration error.
 */
export function useForMeAccess(): boolean {
  const flagged = useAuth().account?.forMe === true;
  return useHydrated() && flagged;
}

/**
 * Whether this viewer gets the For me and Nearby buttons on Discover
 * (lib/forMeGate.ts, lib/discoverModes.ts). Hydration-gated for the same reason
 * as `useForMeAccess`. Display only: the server checks the session's id itself.
 */
export function useDiscoverModesAccess(): boolean {
  const flagged = useAuth().account?.discoverModes === true;
  return useHydrated() && flagged;
}

/**
 * Whether this viewer gets the new phone profile (lib/forMeGate.ts). Hydration-
 * gated for the same reason as `useForMeAccess`.
 */
export function useProfileV2Access(): boolean {
  const flagged = useAuth().account?.profileV2 === true;
  return useHydrated() && flagged;
}

/**
 * Whether this viewer may delete anyone's post or comment (lib/adminGate.ts).
 * Hydration-gated for the same reason as `useForMeAccess`. Display only: the
 * DELETE routes check the session's id themselves.
 */
export function useAdminAccess(): boolean {
  const flagged = useAuth().account?.admin === true;
  return useHydrated() && flagged;
}
