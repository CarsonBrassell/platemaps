"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { BrandMark, WordMark } from "@/components/BrandMark";
import { useAuth } from "@/lib/auth";

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

export function PhoneProfileAuth() {
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "signup" && (!name || !email || !password)) {
      setError("Fill in every field to create your account.");
      return;
    }
    if (mode === "login" && (!email || !password)) {
      setError("Enter your email and password.");
      return;
    }
    /* Consent is a real gate, not a formality: `signUp` sends it to the API,
       which refuses a signup without it. The button is disabled too, so this
       only fires for a submit that got past the disabled state. */
    if (mode === "signup" && !agreed) {
      setError("Please agree to the Terms and Privacy Policy to continue.");
      return;
    }
    setSubmitting(true);
    const result =
      mode === "signup" ? await signUp(name, email, password, agreed) : await signIn(email, password);
    setSubmitting(false);
    if (result) setError(result);
  }

  const segment = (value: "signup" | "login", label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => {
        setMode(value);
        setError("");
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

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-5">
        <div className="mb-5 flex gap-1 rounded-full bg-pm-grey-tint p-1">
          {segment("signup", "Sign up")}
          {segment("login", "Log in")}
        </div>

        <h1 className="font-display mb-1 text-[22px] font-semibold tracking-tight text-zinc-900">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mb-5 text-sm text-zinc-500">
          {mode === "signup"
            ? "Save your favorite San Diego spots and earn PM Points."
            : "Sign in to see your saved spots and PM Points."}
        </p>

        {mode === "signup" && (
          <>
            <label htmlFor="phone-auth-name" className="mb-1 block text-sm font-medium text-zinc-700">
              Username
            </label>
            <input
              id="phone-auth-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="carsonb"
              autoComplete="username"
              maxLength={24}
              className={inputClass}
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
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@email.com"
          autoComplete="email"
          /* 16px minimum on the value itself — anything smaller and iOS Safari
             zooms the page on focus and never zooms back out. */
          className={inputClass}
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
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "signup" ? "Create a password" : "Your password"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className={inputClass}
        />

        {/* The consent gate the web /account page added alongside the Terms
            and Privacy pages. Same requirement, phone-sized: a 44px row rather
            than the web's 16px checkbox line, and the two documents open in a
            new tab so a half-filled form is never lost to reading them. */}
        {mode === "signup" && (
          <label className="mb-4 flex min-h-11 cursor-pointer items-start gap-2.5 py-1 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => {
                setAgreed(event.target.checked);
                if (error) setError("");
              }}
              className="mt-0.5 h-5 w-5 shrink-0 accent-pm-orange"
            />
            <span className="leading-relaxed">
              I agree to the{" "}
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

        {error && (
          <p role="alert" className="mb-4 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || (mode === "signup" && !agreed)}
          className={`min-h-11 w-full rounded-full bg-pm-orange px-4 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.97] disabled:opacity-60 ${FOCUS}`}
        >
          {mode === "signup" ? "Create account" : "Log in"}
        </button>
      </form>
    </div>
  );
}
