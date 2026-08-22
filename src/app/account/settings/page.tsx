"use client";

import Link from "next/link";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { AccountLedger } from "@/components/account/AccountLedger";
import { SettingsLedger } from "@/components/account/SettingsLedger";
import { DeleteAccountPanel } from "@/components/account/DeleteAccountPanel";

/**
 * Settings, web.
 *
 * The two ledgers and the delete panel used to sit in the middle of /account,
 * between your activity and your posts — so the page answered "who am I here"
 * and "how is this account configured" in one scroll, and reaching your own
 * plates meant scrolling past six settings you were not there to change. They
 * are two questions, and this is the second one.
 *
 * Nothing about them changed in the move. Same components, same `variant`
 * default, same round trips through `/api/account/*` and `/api/auth/*`; the
 * order is the order they were in on the profile — what the app shows about
 * you, then what you do to the account, then the one that ends it.
 *
 * A client component for the same reason /account is: `useAuth` owns the
 * session and every row on the page writes through it.
 *
 * The phone twin is `/m/account/settings`. The rows are literally these
 * components in their phone variant — see PhoneSettingsScreen.
 */
export default function SettingsPage() {
  const { isSignedIn, loading } = useAuth();

  return (
    <>
      {/* Full viewport width, same as /account — the desktop nav row needs
          close to 1280px and a max-w-5xl parent does not give it that. */}
      <Header />
      <div className="mx-auto w-full max-w-5xl pb-12">
        {!loading &&
          (isSignedIn ? (
            <div className="mx-4 overflow-hidden rounded-2xl bg-white sm:mx-6">
              <div className="px-5 py-8">
                {/* Back before the title, not after it: this screen is only
                    ever entered from the profile, and the way out is the first
                    thing you want to know is there. Tan pill, the unselected
                    chip treatment the rest of the app uses for a control that
                    goes somewhere ordinary. */}
                <Link
                  href="/account"
                  className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-pm-grey-tint px-4 text-sm font-medium text-pm-grey-text transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
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

                <h1 className="font-display mb-1 text-xl font-semibold text-zinc-900">Settings</h1>
                <p className="mb-6 text-sm text-zinc-500">
                  What the app shows about you, and what you can do to the account.
                </p>

                <SettingsLedger />

                <AccountLedger />

                {/* Dead last, as it was on the profile: you scroll past
                    everything you might have wanted instead first. */}
                <div className="mt-8">
                  <DeleteAccountPanel />
                </div>
              </div>
            </div>
          ) : (
            /* Signed out there is nothing here to configure. Rather than an
               empty ledger, the page says so and points at the one screen that
               can fix it — /account is where the sign-in form lives. */
            <div className="mx-4 rounded-2xl bg-white p-8 text-center sm:mx-6">
              <h1 className="font-display mb-1 text-xl font-semibold text-zinc-900">Settings</h1>
              <p className="mb-5 text-sm text-zinc-500">
                Sign in to change how your account is set up.
              </p>
              <Link
                href="/account"
                className="inline-flex min-h-11 items-center rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] transition-[scale,filter] duration-200 ease-out hover:brightness-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                Sign in
              </Link>
            </div>
          ))}

        {/* The legal footer /account carries, for the same reason it carries
            it: these are documents somebody agreed to and they have to stay
            reachable after signup, not only at the moment of consent. */}
        <div className="mt-10 flex justify-center gap-3 text-xs text-zinc-400">
          <Link href="/terms" className="hover:text-zinc-600 hover:underline">
            Terms of Service
          </Link>
          <span aria-hidden="true">&middot;</span>
          <Link href="/privacy" className="hover:text-zinc-600 hover:underline">
            Privacy Policy
          </Link>
        </div>
      </div>
    </>
  );
}
