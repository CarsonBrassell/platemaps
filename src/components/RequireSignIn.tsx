"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { isPublicPath, signInHrefFor } from "@/lib/signInGate";

/**
 * Client-side backstop for `src/proxy.ts`. The proxy only checks whether the
 * session cookie is *present* — it never looks the session up — so it lets
 * two cases through that this component catches instead:
 *
 * - a stale or invalid cookie: the proxy sees a cookie and passes the
 *   request, but `/api/auth/me` answers `{ user: null }`;
 * - `signOut()`: `account` drops to null client-side with no navigation at
 *   all, so the proxy never runs again.
 *
 * Mounted once in `src/app/layout.tsx`, inside `<AuthProvider>`. Renders
 * nothing.
 */
export function RequireSignIn() {
  const { account, resolved } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Wait for an authoritative answer. `resolved` stays false while
    // fetchAccount only got UNREACHABLE — see the comment on it in
    // lib/auth.tsx — and acting on that would sign out someone who is still
    // signed in on the server, off of nothing but a network blip.
    if (!resolved) return;
    if (account) return;
    if (isPublicPath(pathname)) return;

    router.replace(signInHrefFor(pathname, window.location.search));
  }, [resolved, account, pathname, router]);

  return null;
}
