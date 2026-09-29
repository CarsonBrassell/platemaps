"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The frame for the /m pages that used to be the desktop site: Terms, Privacy,
 * and the three signed-out account screens (forgot, reset, verify).
 *
 * All that goes here is the way out. The content underneath is the same
 * component the desktop page renders (`TermsDocument`, `PrivacyDocument`,
 * `RecoveryForms`), so nothing is written twice and the phone tree simply
 * swaps `Header` for this back chip.
 *
 * Back follows the same rule the restaurant hero's back chip does: when the tab
 * has a previous page, `router.back()` returns to it - the sign-in form with
 * what was typed in it, the profile at its scroll position - and only a tab
 * opened straight onto this page (a link from outside, a cold start) falls
 * through to `fallbackHref`. A hard `href` alone would always land on the
 * profile, which is wrong for someone who came from Settings or the sign-up form.
 */
export function PhoneLegalFrame({
  fallbackHref = "/m/account",
  children,
}: {
  fallbackHref?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="min-h-dvh pb-8">
      <div className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href={fallbackHref}
          onClick={(e) => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              e.preventDefault();
              router.back();
            }
          }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-pm-grey-tint px-4 text-sm font-medium text-pm-grey-text transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </Link>
      </div>
      {children}
    </div>
  );
}
