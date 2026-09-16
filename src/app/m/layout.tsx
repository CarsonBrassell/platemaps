import { Suspense } from "react";
import { QuerySync } from "@/components/QuerySync";
import type { Metadata } from "next";
import { PhoneShell } from "@/components/mobile/PhoneShell";
import { PhoneSplash } from "@/components/mobile/PhoneSplash";
import "./phone.css";

/**
 * The phone version.
 *
 * Nested inside the root layout, so the fonts, the cream ground, the retuned
 * zinc ramp and `AuthProvider` all come for free and are not loaded twice. What
 * this tree replaces is the *layout* — no `Header`, no `MobileNav`, no
 * max-w-7xl page column — not the design system.
 *
 * Nothing here reads the database or reimplements a filter. Every screen under
 * /m calls the same `lib/` functions and the same `/api/*` routes the web
 * version calls; the difference is entirely in the components. That is the
 * whole architecture, and it is worth keeping: two designs over one data layer,
 * not two apps.
 *
 * Reached by URL rather than by user-agent detection, on purpose — a wide
 * screen renders this in a 390px column (phone.css) so it can be designed in a
 * desktop browser. UA-based routing can be layered on top later in
 * `middleware.ts` without any of this moving.
 */

export const metadata: Metadata = {
  title: "PlateMaps",
};

export default function PhoneLayout({ children }: { children: React.ReactNode }) {
  return (
    /* `useSearchParams` needs a Suspense boundary above it or it opts the whole
       tree out of the prerender — and every screen under /m is static, so that
       used to mean the HTML was this shell's fallback and nothing else. It is
       now called once, in QuerySync, under its own boundary; PhoneShell and the
       screens read `?nav=` and the rest through lib/queryString.ts, so the
       HTML carries the page. */
    <>
      <Suspense fallback={null}>
        <QuerySync />
      </Suspense>
      {/* Outside the Suspense boundary on purpose: it must paint with the
          first byte, not wait on whatever the shell is suspended for. It
          mounts once per document, which in the app is once per cold open. */}
      <PhoneSplash />
      <Suspense fallback={<div className="pm-phone-shell" />}>
        <PhoneShell>{children}</PhoneShell>
      </Suspense>
    </>
  );
}
