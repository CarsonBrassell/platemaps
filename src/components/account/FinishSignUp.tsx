"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth, type Account } from "@/lib/auth";
import { PROVIDER_NAME, type PendingSignup } from "@/components/account/SocialButtons";

/**
 * The one screen a brand-new Apple / Google person sees before they have an
 * account: pick a username, tick the box, create it.
 *
 * **No account exists while this is on screen.** The provider sign-in only
 * parked a verified identity on the server for ten minutes. The account is
 * made by the POST below and only with the tick — the same "13 or older and I
 * agree" sentence the email form uses, because consent given through Apple's
 * sheet is consent to Apple, not to PlateMaps's terms.
 *
 * What this screen is allowed to send is deliberately small: a username, the
 * tick, and an email address *only* when the provider gave none. Which
 * provider, which person and which address are read server-side from the
 * parked row behind an httpOnly cookie; nothing here names them.
 *
 * Cancel tells the server to drop the parked row (and, for Apple, to revoke
 * the authorization) so an abandoned attempt does not leave PlateMaps in
 * someone's "Sign in with Apple" list.
 *
 * Two bodies: `phone` is the /m card and the first-open sheet (16px inputs,
 * consent under the button, 44px rows), `desktop` is the `/account` card.
 * The parent supplies the card itself through `className`.
 */

/** Same rule, same wording as the email sign-up forms. The server checks again. */
const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

const INPUT = {
  phone:
    "mb-4 min-h-11 w-full rounded-xl bg-pm-grey-tint/60 px-3.5 py-2.5 text-base transition-colors placeholder:text-zinc-500 focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange",
  desktop:
    "mb-4 min-h-11 w-full rounded-xl bg-pm-grey-tint/60 px-3.5 py-2.5 text-sm transition-colors placeholder:text-zinc-500 focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange",
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; signup: PendingSignup }
  /** Ten minutes passed, or it was already used. Nothing to finish; start again. */
  | { kind: "expired" };

export function FinishSignUp({
  pending,
  variant,
  onClose,
  className = "",
}: {
  /** The summary the app's native flow returned, or "load" after the website trip. */
  pending: PendingSignup | "load";
  variant: "phone" | "desktop";
  /** Cancelled or expired: go back to the ordinary sign-in card. */
  onClose: () => void;
  className?: string;
}) {
  const { completeOAuth } = useAuth();
  const [state, setState] = useState<State>(() =>
    pending === "load" ? { kind: "loading" } : { kind: "ready", signup: pending }
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /* After the website trip this page knows only that somebody is waiting.
     The summary is behind the httpOnly cookie, so it is asked for. */
  useEffect(() => {
    if (pending !== "load") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/oauth/finish", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "expired" });
          return;
        }
        const data = (await res.json()) as { provider?: unknown; email?: unknown; needsEmail?: unknown };
        if (cancelled) return;
        if (data.provider !== "google" && data.provider !== "apple") {
          setState({ kind: "expired" });
          return;
        }
        setState({
          kind: "ready",
          signup: {
            provider: data.provider,
            email: typeof data.email === "string" ? data.email : null,
            needsEmail: data.needsEmail === true,
          },
        });
      } catch {
        if (!cancelled) setState({ kind: "expired" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pending]);

  const phone = variant === "phone";
  const heading = `font-display mb-1 font-semibold text-zinc-900 ${
    phone ? "text-[22px] tracking-tight" : "text-xl"
  }`;
  const quiet = `min-h-11 w-full rounded-full px-4 text-sm text-zinc-500 disabled:opacity-60 ${FOCUS}`;

  if (state.kind === "loading") {
    return (
      <div className={className}>
        <p role="status" className="text-sm text-zinc-500">
          One moment…
        </p>
      </div>
    );
  }

  if (state.kind === "expired") {
    return (
      <div className={className}>
        <h1 className={heading}>That sign-in ran out</h1>
        <p className="mb-5 text-sm text-zinc-500">
          It took too long or was already used, and no account was created. Start again when
          you&rsquo;re ready.
        </p>
        <button
          type="button"
          onClick={onClose}
          className={`min-h-11 w-full rounded-full bg-pm-grey-tint px-4 text-sm font-medium text-zinc-900 ${FOCUS}`}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  const { signup } = state;
  const providerName = PROVIDER_NAME[signup.provider];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!USERNAME_RE.test(name)) {
      setError("Pick a username — 3-24 characters, letters, numbers and underscores only.");
      return;
    }
    if (signup.needsEmail && !EMAIL_RE.test(email.trim())) {
      setError("Enter an email address, and check it for a typo.");
      return;
    }
    if (!agreed) {
      setError("Confirm you are 13 or older and agree to the Terms and Privacy Policy.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/oauth/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          agreedToTerms: agreed,
          // Only when the provider gave none. The server ignores it otherwise
          // and stores a typed address as unverified, always.
          ...(signup.needsEmail ? { email: email.trim() } : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: unknown; code?: unknown } | null;
      if (!res.ok) {
        if (data?.code === "expired") setState({ kind: "expired" });
        else setError(typeof data?.error === "string" ? data.error : "Something went wrong. Try again.");
        setBusy(false);
        return;
      }
      // The session cookie is already set. Adopting the account flips the
      // parent to its signed-in view, which unmounts this screen — so `busy`
      // is deliberately never cleared on this path.
      completeOAuth(data as unknown as Account);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    // Best effort: if this never arrives the parked row expires by itself in
    // ten minutes and is swept (and revoked) then.
    await fetch("/api/auth/oauth/finish", { method: "DELETE" }).catch(() => undefined);
    onClose();
  }

  const consent = (
    <label
      className={
        phone
          ? "mt-4 flex min-h-11 cursor-pointer items-start gap-2.5 py-1 text-xs text-zinc-500"
          : "mb-4 flex cursor-pointer items-start gap-2.5 text-xs text-zinc-500"
      }
    >
      <input
        type="checkbox"
        checked={agreed}
        onChange={(e) => {
          setAgreed(e.target.checked);
          if (error) setError("");
        }}
        className={`mt-0.5 shrink-0 accent-pm-orange ${phone ? "h-5 w-5" : "h-4 w-4"}`}
      />
      <span className="leading-relaxed">
        I am 13 or older and I agree to the{" "}
        <Link
          href={phone ? "/m/terms" : "/terms"}
          target={phone ? undefined : "_blank"}
          className="underline underline-offset-2"
        >
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link
          href={phone ? "/m/privacy" : "/privacy"}
          target={phone ? undefined : "_blank"}
          className="underline underline-offset-2"
        >
          Privacy Policy
        </Link>
        .
      </span>
    </label>
  );

  const alert = error && (
    <p role="alert" className="mb-4 text-sm text-red-700">
      {error}
    </p>
  );

  const submit = (
    <button
      type="submit"
      disabled={busy}
      className={`min-h-11 w-full rounded-full bg-pm-orange px-4 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.97] disabled:opacity-60 ${FOCUS}`}
    >
      {busy ? "One moment…" : "Create account"}
    </button>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className={className}>
      <h1 className={heading}>One last step</h1>
      <p className="mb-5 text-sm text-zinc-500">
        You&rsquo;re joining with {providerName}
        {signup.email && (
          <>
            {" "}
            as <span className="font-mono text-[13px] text-zinc-800">{signup.email}</span>
          </>
        )}
        . Pick a username to finish — nothing is created until you do.
      </p>

      <label htmlFor="finish-signup-name" className="mb-1 block text-sm font-medium text-zinc-700">
        Username
      </label>
      <input
        id="finish-signup-name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (error) setError("");
        }}
        placeholder="yourname"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        maxLength={24}
        disabled={busy}
        className={INPUT[variant]}
      />
      <p className="-mt-2 mb-4 text-xs text-zinc-500">
        3-24 characters — letters, numbers and underscores only, and it has to be unique.
      </p>

      {signup.needsEmail && (
        <>
          <label htmlFor="finish-signup-email" className="mb-1 block text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            id="finish-signup-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError("");
            }}
            placeholder="name@email.com"
            autoComplete="email"
            disabled={busy}
            className={INPUT[variant]}
          />
          <p className="-mt-2 mb-4 text-xs text-zinc-500">
            {providerName} didn&rsquo;t share an address, and it&rsquo;s how you get back in if
            you&rsquo;re ever locked out.
          </p>
        </>
      )}

      {/* Consent sits where each body's email form puts it: above the button
          on the desktop card, under it on the phone. */}
      {!phone && consent}
      {alert}
      {submit}
      {phone && consent}

      <button type="button" onClick={() => void cancel()} disabled={busy} className={`mt-2 ${quiet}`}>
        Cancel
      </button>

      {/* The one warning this screen can give. Somebody who already has an
          email account and hides their address from Apple would otherwise
          make a second, separate account without noticing. */}
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        Already have an account? Cancel, log in, and connect {providerName} in Settings instead.
      </p>
    </form>
  );
}
