"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { BrandMark, WordMark } from "@/components/BrandMark";
import { useAuth } from "@/lib/auth";
import { PASSWORD_HINT, checkPassword } from "@/lib/password";

/**
 * Signed-out profile: create an account or log in.
 *
 * Same two `useAuth` calls the web `/account` page makes (`signUp`, `signIn`)
 * and the same validation copy — the account screen is where signing in happens
 * in both versions, which is why every "Sign in" link elsewhere under /m points
 * at `/m/account`.
 *
 * One deliberate difference from the web form: the Sign up / Log in switch is a
 * **rank-3 segmented control** — tan track, *white* selected segment, mono
 * labels — rather than the orange-filled segment the web form uses. A local
 * switch and the primary action must not wear the same clothes (DESIGN.md's
 * three ranks); with an orange segment above an orange submit button, the
 * screen has two orange fills and neither reads as the thing to press.
 */

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

const inputClass =
  "mb-4 min-h-11 w-full rounded-xl bg-pm-grey-tint/60 px-3.5 py-2.5 text-base transition-colors placeholder:text-zinc-500 focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange";

/**
 * What a field looks like when it is the one to fix.
 *
 * A ring rather than a border: a border would change the box's size and shunt
 * every field below it down by 2px the moment you submitted, which is the
 * worst possible time to move the form someone is reading. `ring` is a
 * box-shadow, so it costs no layout.
 *
 * The tint comes with it because a 1px ring alone is easy to miss on a phone
 * held at arm's length — and the point of this is to be findable at a glance,
 * not to be tasteful. Red is `red-50`/`red-300` rather than `--pm-red`, which
 * is a signal colour for map pins and notification dots; this is the same
 * red-50/red-700 vocabulary the composer and the reset-password pages already
 * use for things that went wrong.
 */
const inputInvalidClass = "bg-red-50 ring-1 ring-red-300";

/** 3-24 characters, letters/numbers/underscore — the rule the hint promises. */
const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

/* Deliberately loose. The only email that truly validates is one that receives
   mail, so this catches the shapes that are certainly wrong — no @, nothing
   before it, no dot in the domain — and leaves the rest to the server. A
   stricter regex here would reject real addresses and there is no worse
   failure for a signup form than refusing an address that works. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PhoneProfileAuth() {
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  /* Which boxes to paint red. A list rather than a boolean per field so the
     inputs, the submit handler and the clear-on-edit path all read the same
     one thing, and so a submit can flag two fields at once. */
  const [badFields, setBadFields] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* Same hint the web form shows, same reason — see lib/password.ts. */
  const weakPassword = mode === "signup" && password ? checkPassword(password, { name, email }) : null;

  /** Stop marking a field the moment its value changes. */
  const clear = (field: string) => {
    setBadFields((f) => (f.includes(field) ? f.filter((x) => x !== field) : f));
    if (error) setError("");
  };

  /**
   * Everything wrong with the form, in one pass.
   *
   * One pass rather than a series of early returns, because early returns can
   * only ever report the first problem — you fix the username, submit, and
   * learn the email was wrong too. Collecting them means every box that needs
   * attention turns red at the same time, which is the whole point.
   *
   * Ordering matters for the message: it names the first problem in the
   * order the fields appear on screen, so the sentence and the topmost red
   * box always agree.
   */
  function validate(): { fields: string[]; message: string } {
    const fields: string[] = [];
    const problems: string[] = [];

    if (mode === "signup") {
      if (!name) {
        fields.push("name");
        problems.push("Enter a username.");
      } else if (!USERNAME_RE.test(name)) {
        fields.push("name");
        problems.push(
          "That username won't work — 3-24 characters, letters, numbers and underscores only."
        );
      }
    }

    if (!email) {
      fields.push("email");
      problems.push("Enter your email.");
    } else if (!EMAIL_RE.test(email)) {
      fields.push("email");
      problems.push("That email doesn't look right — check it for a typo.");
    }

    if (!password) {
      fields.push("password");
      problems.push("Enter your password.");
    } else if (mode === "signup") {
      const weak = checkPassword(password, { name, email });
      if (weak) {
        fields.push("password");
        problems.push(weak);
      }
    }

    /* Consent is a real gate, not a formality: `signUp` sends it to the API,
       which refuses a signup without it. It is validated here rather than by
       disabling the button because the checkbox now sits *below* the button —
       a disabled control underneath the thing you have not ticked yet gives
       you nothing to read and nowhere to look. Failing loudly and painting
       the row red says which. */
    if (mode === "signup" && !agreed) {
      fields.push("agreed");
      problems.push("Confirm you are 13 or older and agree to the Terms and Privacy Policy.");
    }

    return { fields, message: problems[0] ?? "" };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBadFields([]);

    const { fields, message } = validate();
    if (fields.length > 0) {
      setBadFields(fields);
      setError(message);
      return;
    }

    setSubmitting(true);
    const result =
      mode === "signup" ? await signUp(name, email, password, agreed) : await signIn(email, password);
    setSubmitting(false);
    if (result) {
      setError(result);
      /* The server knows things the client cannot — that a username is taken,
         that a login is wrong. Match its message to a box so a server-side
         rejection lands the same way a client-side one does, rather than as
         a sentence pointing at nothing. */
      const lower = result.toLowerCase();
      const hit: string[] = [];
      if (lower.includes("username") || lower.includes("name")) hit.push("name");
      if (lower.includes("email")) hit.push("email");
      if (lower.includes("password") || lower.includes("credential")) hit.push("password");
      setBadFields(hit);
    }
  }

  const segment = (value: "signup" | "login", label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => {
        setMode(value);
        setError("");
        setBadFields([]);
      }}
      className={`mono-label min-h-11 flex-1 rounded-full transition-colors ${FOCUS} ${
        mode === value ? "bg-white text-zinc-900" : "text-pm-grey-text"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-dvh px-4 pt-6">
      <div className="mb-5 flex items-center justify-center gap-2">
        <BrandMark className="h-7 w-7" />
        <WordMark tone="dark" />
      </div>

      {/* `noValidate` hands validation to us, and without it none of the red
          below ever appears.

          `type="email"` makes the browser refuse to submit a malformed
          address and show its own popup bubble instead — so `handleSubmit`
          never runs, no field is marked, and the styling here is dead code.
          The native bubble is also the wrong tool for this: it appears on one
          field at a time, it is styled by the OS rather than by us, it cannot
          say anything about the username or the consent box, and on iOS it
          disappears the moment the keyboard moves.

          The input keeps `type="email"` regardless — it is what summons the
          @-key keyboard on a phone, which is the bigger win and is unrelated
          to validation. */}
      <form onSubmit={handleSubmit} noValidate className="rounded-2xl bg-white p-5">
        <div className="mb-5 flex gap-1 rounded-full bg-pm-grey-tint p-1">
          {segment("signup", "Sign up")}
          {segment("login", "Log in")}
        </div>

        <h1 className="font-display mb-1 text-[22px] font-semibold tracking-tight text-zinc-900">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mb-5 text-sm text-zinc-500">
          {mode === "signup"
            ? "Save your favorite San Diego spots and earn Plate Points."
            : "Sign in to see your saved spots and Plate Points."}
        </p>

        {mode === "signup" && (
          <>
            <label htmlFor="phone-auth-name" className="mb-1 block text-sm font-medium text-zinc-700">
              Username
            </label>
            <input
              id="phone-auth-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clear("name");
              }}
              placeholder="carsonb"
              autoComplete="username"
              maxLength={24}
              aria-invalid={badFields.includes("name")}
              className={`${inputClass} ${badFields.includes("name") ? inputInvalidClass : ""}`}
            />
            <p className="-mt-2 mb-4 text-xs text-zinc-500">
              3-24 characters — letters, numbers and underscores only, and it has to be unique.
            </p>
          </>
        )}

        <label htmlFor="phone-auth-email" className="mb-1 block text-sm font-medium text-zinc-700">
          Email
        </label>
        <input
          id="phone-auth-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clear("email");
          }}
          placeholder="name@email.com"
          autoComplete="email"
          aria-invalid={badFields.includes("email")}
          /* 16px minimum on the value itself — anything smaller and iOS Safari
             zooms the page on focus and never zooms back out. */
          className={`${inputClass} ${badFields.includes("email") ? inputInvalidClass : ""}`}
        />

        <label
          htmlFor="phone-auth-password"
          className="mb-1 block text-sm font-medium text-zinc-700"
        >
          Password
        </label>
        <input
          id="phone-auth-password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clear("password");
          }}
          placeholder={mode === "signup" ? "Create a password" : "Your password"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          aria-invalid={badFields.includes("password")}
          className={`${inputClass} ${badFields.includes("password") ? inputInvalidClass : ""}`}
        />

        {mode === "signup" && (
          <p className="-mt-2 mb-4 text-xs leading-snug text-zinc-500">
            {weakPassword ?? PASSWORD_HINT}
          </p>
        )}

        {mode === "login" && (
          <p className="-mt-2 mb-4">
            <Link
              href="/forgot-password"
              className="inline-flex min-h-11 items-center text-xs text-zinc-500 underline underline-offset-2"
            >
              Forgot your password?
            </Link>
          </p>
        )}

        {error && (
          <p role="alert" className="mb-4 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* Not disabled on missing consent any more.
            The checkbox sits below this button now, so a disabled control
            would be greyed out by something the reader has not scrolled to
            yet — a dead button and no stated reason. It stays pressable and
            `validate()` answers, naming the checkbox and turning the row red.
            The gate itself is unchanged: `signUp` sends consent to the API,
            which refuses a signup without it. */}
        <button
          type="submit"
          disabled={submitting}
          className={`min-h-11 w-full rounded-full bg-pm-orange px-4 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.97] disabled:opacity-60 ${FOCUS}`}
        >
          {mode === "signup" ? "Create account" : "Log in"}
        </button>

        {/* The consent gate the web /account page added alongside the Terms
            and Privacy pages. Same requirement, phone-sized: a 44px row rather
            than the web's 16px checkbox line, and the two documents open in a
            new tab so a half-filled form is never lost to reading them.

            It sits under the button because that is where a reader looks for
            the terms they are agreeing to by pressing it — the same place
            every app puts this line. The tint and ring when it is the thing
            to fix are the checkbox's version of a red box. */}
        {mode === "signup" && (
          <label
            className={`mt-4 flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl py-1 text-xs text-zinc-500 ${
              badFields.includes("agreed") ? `${inputInvalidClass} px-2.5` : ""
            }`}
          >
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => {
                setAgreed(event.target.checked);
                clear("agreed");
              }}
              aria-invalid={badFields.includes("agreed")}
              className="mt-0.5 h-5 w-5 shrink-0 accent-pm-orange"
            />
            <span className="leading-relaxed">
              I am 13 or older and I agree to the{" "}
              <Link href="/terms" target="_blank" className="underline underline-offset-2">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        )}
      </form>
    </div>
  );
}
