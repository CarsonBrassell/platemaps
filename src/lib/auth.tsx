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
  refresh: () => Promise<void>;
  updateAvatar: (avatarUrl: string) => Promise<string | null>;
  updateSettings: (
    settings: Partial<{
      sharePhotosPublicly: boolean;
      favoriteCuisine: string | null;
      favoriteRestaurantId: string | null;
    }>
  ) => Promise<string | null>;
  deleteAccount: (password: string) => Promise<string | null>;
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

  async function updateSettings(
    settings: Partial<{
      sharePhotosPublicly: boolean;
      favoriteCuisine: string | null;
      favoriteRestaurantId: string | null;
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

  async function deleteAccount(password: string) {
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) return parseError(res);
    setAccount(null);
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
        refresh,
        updateAvatar,
        updateSettings,
        deleteAccount,
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
