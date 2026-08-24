"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Account = {
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
  /** Whether `email` has been proved reachable. False on every pre-verification account. */
  emailVerified: boolean;
  /** An address asked for but not yet confirmed, if a change is in flight. */
  pendingEmail?: string;
};

type AuthContextValue = {
  account: Account | null;
  isSignedIn: boolean;
  loading: boolean;
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
   */
  deleteAccount: (password: string) => Promise<string | null>;
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
  ) => Promise<{ error: string | null; notice?: string }>;
  /** Re-send the link to whichever address is waiting on one. */
  resendVerification: () => Promise<{ error: string | null; notice?: string }>;
  /**
   * Both passwords, because the server re-authenticates before writing. On
   * success every other session is ended too, so the resolved value carries how
   * many were — the caller needs it to say so.
   */
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ error: string | null; endedElsewhere: number }>;
  /** Ends every session but this one. Resolves to how many were ended. */
  signOutOtherDevices: () => Promise<{ error: string | null; endedElsewhere: number }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

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

  async function refresh() {
    const account = await fetchAccount();
    if (account !== UNREACHABLE) setAccount(account);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const account = await fetchAccount();
      if (cancelled) return;
      /* Only a real answer moves the UI. If the server could not be reached at
         all, stay as we are rather than rendering signed-out — see
         fetchAccount. */
      if (account !== UNREACHABLE) setAccount(account);
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
  }

  async function deleteAccount(password: string) {
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) return parseError(res);
    // Same drop as signOut. The server has already cleared the cookie, so this
    // is only catching the client up — but it has to happen before the caller
    // navigates, or the destination renders a frame against an account that no
    // longer exists.
    setAccount(null);
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
    if (!res.ok) return { error: await parseError(res), endedElsewhere: 0 };
    const data = await res.json();
    // No setAccount: nothing the client renders changed. The password isn't in
    // this context and the session survived on purpose.
    return { error: null, endedElsewhere: (data.endedElsewhere as number) ?? 0 };
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
    if (!res.ok) return { error: await parseError(res) };

    // The response carries the account because `pendingEmail` changed on it,
    // which is the only visible result of a successful call.
    const data = await res.json();
    setAccount(data.account);
    return { error: null, notice: data.notice as string | undefined };
  }

  async function resendVerification() {
    const res = await fetch("/api/account/email/send", { method: "POST" });
    if (!res.ok) return { error: await parseError(res) };
    const data = await res.json();
    return { error: null, notice: data.notice as string | undefined };
  }

  async function updateSettings(
    settings: Partial<{
      sharePhotosPublicly: boolean;
      favoriteCuisine: string | null;
      favoriteRestaurantId: string | null;
      hideFromLeaderboard: boolean;
      discoverableByUsername: boolean;
      friendRequestsOpen: boolean;
    }>
  ) {
    const res = await fetch("/api/account/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!res.ok) return parseError(res);
    setAccount(await res.json());
    return null;
  }

  return (
    <AuthContext.Provider
      value={{
        account,
        isSignedIn: !!account,
        loading,
        signUp,
        signIn,
        signOut,
        deleteAccount,
        refresh,
        updateAvatar,
        updateSettings,
        changeUsername,
        changeEmail,
        resendVerification,
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
