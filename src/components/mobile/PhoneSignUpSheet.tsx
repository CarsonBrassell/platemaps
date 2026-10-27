"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { OPEN_BROWSING } from "@/lib/signInGate";
import { PhoneProfileAuth } from "@/components/mobile/PhoneProfileAuth";
import { CloseIcon } from "@/components/icons";

/**
 * The first-open sign-up sheet. A signed-out visitor to the phone app gets a
 * bottom sheet asking them to sign up or log in; "Not now" lets them keep
 * browsing the demo (src/lib/signInGate.ts, OPEN_BROWSING).
 *
 * Dismissal is remembered in localStorage so it does not come back on every
 * page. localStorage survives an app relaunch, so it returns after a fresh
 * install or cleared data - and never for a signed-in user. Every storage
 * access is try/catch: private windows and blocked storage throw, and the
 * sheet must still behave (it just asks again next load).
 *
 * The form is the same PhoneProfileAuth the Profile tab renders, so sign-up
 * and login validation, consent and errors are identical. Once the session
 * resolves, `isSignedIn` flips and this unmounts itself.
 *
 * Shell is the PhoneFilterSheet's (fixed scrim, overflow-hidden for the
 * transformed desktop frame, Escape / focus trap / scroll lock).
 */

const STORAGE_KEY = "pm-signup-sheet-dismissed";
/* Auth and legal screens: the sheet would sit on top of the very form it asks
   for, or on a policy page someone is reading before agreeing. */
const QUIET_PREFIXES = [
  "/m/account",
  "/m/terms",
  "/m/privacy",
  "/m/forgot-password",
  "/m/reset-password",
  "/m/verify-email",
];
/* Lets the splash finish before a sheet slides over it. */
const SHOW_DELAY_MS = 1200;

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function remember() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* storage blocked - it will ask again next load, which is acceptable */
  }
}

export function PhoneSignUpSheet() {
  const { isSignedIn, loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  /* Dismissed this session even if storage is blocked, so it cannot reopen on
     the next navigation. */
  const [closed, setClosed] = useState(false);

  const quiet = QUIET_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const eligible = OPEN_BROWSING && !loading && !isSignedIn && !closed && !quiet;

  useEffect(() => {
    if (!eligible || wasDismissed()) {
      setOpen(false);
      return;
    }
    const t = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [eligible]);

  const dismiss = useCallback(() => {
    remember();
    setClosed(true);
    setOpen(false);
  }, []);

  if (!open || !eligible) return null;
  return <Sheet onDismiss={dismiss} />;
}

function Sheet({ onDismiss }: { onDismiss: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const [step, setStep] = useState<"intro" | "signup" | "login">("intro");

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("button")?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onDismiss();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      restore?.focus?.();
    };
  }, [onDismiss]);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center overflow-hidden bg-pm-charcoal/45 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="animate-sheet-in flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white"
      >
        <div className="shrink-0 px-4 pb-1 pt-2.5">
          <div className="mx-auto h-1 w-10 rounded-full bg-zinc-300" />
          <div className="mt-1.5 flex items-center gap-2">
            <h2 id={headingId} className="font-display text-lg font-semibold text-zinc-900">
              {step === "intro" ? "Join PlateMaps" : "Your account"}
            </h2>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close"
              className={`-mr-2 ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-500 ${FOCUS}`}
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
          {step === "intro" ? (
            <>
              <p className="mb-5 text-sm text-zinc-500">
                Post your plates, follow friends and earn Plate Points. You can keep browsing the
                map and feed without an account.
              </p>
              <button
                type="button"
                onClick={() => setStep("signup")}
                className={`mb-2 min-h-11 w-full rounded-full bg-pm-orange px-4 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.97] ${FOCUS}`}
              >
                Sign up
              </button>
              <button
                type="button"
                onClick={() => setStep("login")}
                className={`mb-2 min-h-11 w-full rounded-full bg-pm-grey-tint px-4 text-sm font-medium text-zinc-900 transition-transform active:scale-[0.97] ${FOCUS}`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className={`min-h-11 w-full rounded-full px-4 text-sm text-pm-grey-text ${FOCUS}`}
              >
                Not now
              </button>
            </>
          ) : (
            <>
              {/* key: switching intro -> form picks the chosen tab once. */}
              <PhoneProfileAuth key={step} variant="sheet" initialMode={step} />
              <button
                type="button"
                onClick={onDismiss}
                className={`mt-2 min-h-11 w-full rounded-full px-4 text-sm text-pm-grey-text ${FOCUS}`}
              >
                Not now
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
