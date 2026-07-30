"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Account = { name: string; email: string; password: string };

type AuthContextValue = {
  account: Account | null;
  isSignedIn: boolean;
  signUp: (account: Account) => void;
  signIn: (email: string, password: string) => boolean;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const ACCOUNT_KEY = "platemap-account";
const SESSION_KEY = "platemap-signed-in";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(ACCOUNT_KEY);
    if (stored) setAccount(JSON.parse(stored));
    setIsSignedIn(localStorage.getItem(SESSION_KEY) === "true");
  }, []);

  const signUp = (newAccount: Account) => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(newAccount));
    localStorage.setItem(SESSION_KEY, "true");
    setAccount(newAccount);
    setIsSignedIn(true);
  };

  const signIn = (email: string, password: string) => {
    const stored = localStorage.getItem(ACCOUNT_KEY);
    if (!stored) return false;
    const existing: Account = JSON.parse(stored);
    if (existing.email === email && existing.password === password) {
      localStorage.setItem(SESSION_KEY, "true");
      setAccount(existing);
      setIsSignedIn(true);
      return true;
    }
    return false;
  };

  const signOut = () => {
    localStorage.setItem(SESSION_KEY, "false");
    setIsSignedIn(false);
  };

  return (
    <AuthContext.Provider value={{ account, isSignedIn, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
