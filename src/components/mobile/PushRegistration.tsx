"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { onPushOpened, syncPushRegistration } from "@/lib/pushClient";

/**
 * Mounted once in the /m layout. Renders nothing.
 *
 * Two jobs, both of which are nothing in a browser tab (every function in
 * lib/pushClient.ts checks for the app first):
 *
 * 1. When the signed-in account is known, register this device for push —
 *    silently if permission was already granted, with the system prompt the
 *    first time. Re-runs on sign-in so a new account gets a token bound to
 *    its own session (the previous session's row was cascaded away by the
 *    sign-out).
 *
 * 2. Route a tapped notification. The payload's `url` is a `/m/...` path;
 *    the app is already showing the site, so this is a client navigation,
 *    not a reload.
 */
export function PushRegistration() {
  const { account, loading } = useAuth();
  const router = useRouter();
  const accountId = account?.id ?? null;

  useEffect(() => {
    if (loading || !accountId) return;
    void syncPushRegistration();
  }, [loading, accountId]);

  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | null = null;
    void onPushOpened((url) => router.push(url)).then((handle) => {
      if (!handle) return;
      if (cancelled) void handle.remove();
      else remove = () => void handle.remove();
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [router]);

  return null;
}
