"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AccountLedger } from "@/components/account/AccountLedger";
import { SettingsLedger } from "@/components/account/SettingsLedger";
import { PhoneDeleteAccountPanel } from "@/components/mobile/PhoneDeleteAccountPanel";
import { useAuth } from "@/lib/auth";

/**
 * Settings, phone version — the twin of the web `/account/settings` page, and
 * the same three blocks in the same order: what the app shows about you, what
 * you do to the account, then the one that ends it.
 *
 * Both ledgers are the web page's own components in their phone variant, so
 * the rows, the values and the round trips are one implementation and only the
 * type sizes differ. That is the whole architecture of this tree (see
 * m/layout.tsx) restated at screen scale: two designs, one data layer.
 *
 * Why a separate screen rather than a sheet over the profile: these rows open
 * to reveal a password field, an email field and a delete flow, and App Store
 * review has to be able to *find* the last of those. A screen with a URL is
 * findable and linkable; a sheet is neither.
 *
 * The profile is the only way in, which is why Back is a plain row at the top
 * rather than a chip floating on artwork — there is no photo here for a chip
 * to float on, and a 44px tan pill on the cream is the same control the detail
 * screen's chip is, minus the scrim it does not need.
 */
export function PhoneSettingsScreen() {
  const { isSignedIn, loading } = useAuth();

  /* The nav variant travels in `?nav=` and every in-app link has to carry it
     or the first tap throws you back to the default. Same rule PhoneNav and
     PhoneProfileScreen follow; it goes when the variant switcher goes. */
  const nav = useSearchParams().get("nav");
  const to = (href: string) => (nav ? `${href}?nav=${nav}` : href);

  /* Nothing renders while the session resolves — the same call the profile
     screen makes. A settings page that flashes "sign in" at somebody who is
     signed in is worse than a beat of cream. */
  if (loading) return <div className="min-h-dvh" />;

  return (
    <div className="min-h-dvh">
      <div className="mx-4 overflow-hidden rounded-2xl bg-white">
        <div className="px-4 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link
            href={to("/m/account")}
            className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-pm-grey-tint px-4 text-sm font-medium text-pm-grey-text transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
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
            Profile
          </Link>

          <h1 className="font-display mb-1 text-[22px] font-semibold leading-tight tracking-tight text-zinc-900">
            Settings
          </h1>

          {isSignedIn ? (
            <>
              <p className="mb-5 text-[13px] leading-snug text-zinc-500">
                What the app shows about you, and what you can do to the account.
              </p>

              <SettingsLedger variant="phone" />

              <AccountLedger variant="phone" />

              <PhoneDeleteAccountPanel />
            </>
          ) : (
            <>
              <p className="mb-5 text-[13px] leading-snug text-zinc-500">
                Sign in to change how your account is set up.
              </p>
              <Link
                href={to("/m/account")}
                className="flex min-h-11 w-full items-center justify-center rounded-full bg-pm-orange px-4 text-sm font-medium text-[#F7F4EC] transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
