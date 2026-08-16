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
    }>
  ) => Promise<string | null>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    setAccount(data.user);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (!cancelled) setAccount(data.user);
      } catch {
        // A failed session lookup means signed-out, not broken — fall through
        // so the app renders instead of sitting on the loading state forever.
      } finally {
        if (!cancelled) setLoading(false);
      }
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
