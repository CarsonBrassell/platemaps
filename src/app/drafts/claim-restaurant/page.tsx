import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";

/**
 * DRAFT — restaurant claim flow, static mockup for design review.
 *
 * Nothing here submits or reads data. Three phone steps (form → email code →
 * waiting for review) plus the web version of the form and the waiting state.
 * Input styling matches PhoneProfileAuth so the claim form reads as the same
 * product as sign-up.
 */

const inputClass =
  "mb-4 min-h-11 w-full rounded-xl bg-pm-grey-tint/60 px-3.5 py-2.5 text-base placeholder:text-zinc-500";
const labelClass = "mb-1 block text-sm font-medium text-zinc-700";
const primaryButton =
  "min-h-11 w-full rounded-full bg-pm-orange px-4 text-sm font-semibold text-[#F7F4EC]";

const RESTAURANT = { name: "Luna's Taqueria", area: "North Park · 3021 University Ave" };

function PhoneFrame({ step, title, children }: { step: string; title: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <figcaption className="text-center">
        <p className="mono-label text-pm-orange-text">{step}</p>
        <p className="text-sm text-pm-grey-text">{title}</p>
      </figcaption>
      <div className="h-[720px] w-[360px] overflow-hidden rounded-[40px] border-[10px] border-pm-charcoal bg-background shadow-xl">
        <div className="flex h-full flex-col overflow-y-auto">{children}</div>
      </div>
    </figure>
  );
}

function PhoneTopBar({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 pb-2 pt-4">
      <span className="text-xl text-zinc-900">←</span>
      <p className="mono-label text-pm-grey-text">{label}</p>
    </div>
  );
}

function RestaurantChip() {
  return (
    <div className="mb-5 flex items-center gap-3 rounded-2xl bg-pm-grey-tint p-3">
      <div className="h-11 w-11 shrink-0 rounded-xl bg-pm-orange-tint" />
      <div className="min-w-0">
        <p className="truncate font-semibold text-zinc-900">{RESTAURANT.name}</p>
        <p className="truncate text-xs text-pm-grey-text">{RESTAURANT.area}</p>
      </div>
    </div>
  );
}

function RoleToggle() {
  return (
    <div className="mb-4 flex gap-1 rounded-full bg-pm-grey-tint p-1">
      <span className="mono-label flex min-h-10 flex-1 items-center justify-center rounded-full bg-white text-zinc-900">
        Owner
      </span>
      <span className="mono-label flex min-h-10 flex-1 items-center justify-center rounded-full text-pm-grey-text">
        Manager
      </span>
    </div>
  );
}

function ClaimFields() {
  return (
    <>
      <label className={labelClass}>Your name</label>
      <input className={inputClass} defaultValue="Maria Luna" readOnly />

      <label className={labelClass}>Your role</label>
      <RoleToggle />

      <label className={labelClass}>Business email</label>
      <input className={inputClass} defaultValue="lunastaqueria@gmail.com" readOnly />
      <p className="-mt-2 mb-4 text-xs leading-snug text-zinc-500">
        Use the email customers see on your website, Instagram or Facebook. It
        helps us approve you faster.
      </p>

      <label className={labelClass}>Business phone</label>
      <input className={inputClass} defaultValue="(619) 555-0142" readOnly />

      <label className={labelClass}>Create a password</label>
      <input className={inputClass} placeholder="At least 8 characters" readOnly />

      <label className={labelClass}>
        Where is that email posted? <span className="font-normal text-zinc-500">(optional)</span>
      </label>
      <input className={inputClass} placeholder="instagram.com/lunastaqueria" readOnly />
    </>
  );
}

function CodeBoxes() {
  const digits = ["4", "8", "1", "", "", ""];
  return (
    <div className="mb-5 flex justify-between gap-2">
      {digits.map((d, i) => (
        <span
          key={i}
          className={`flex h-14 w-11 items-center justify-center rounded-xl font-mono text-xl text-zinc-900 ${
            i === 3 ? "bg-white ring-2 ring-pm-orange" : "bg-pm-grey-tint/60"
          }`}
        >
          {d}
        </span>
      ))}
    </div>
  );
}

function PendingStatus() {
  const steps = [
    { label: "Claim sent", done: true },
    { label: "Email confirmed", done: true },
    { label: "PlateMaps review", done: false, current: true },
    { label: "Start posting", done: false },
  ];
  return (
    <ol className="space-y-3">
      {steps.map((s) => (
        <li key={s.label} className="flex items-center gap-3">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              s.done
                ? "bg-pm-orange text-[#F7F4EC]"
                : s.current
                  ? "bg-pm-orange-tint text-pm-orange-text ring-2 ring-pm-orange"
                  : "bg-pm-grey-tint text-pm-grey-text"
            }`}
          >
            {s.done ? "✓" : ""}
          </span>
          <span className={`text-sm ${s.done || s.current ? "text-zinc-900" : "text-pm-grey-text"}`}>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function OwnerSignupLink() {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-pm-orange-border bg-pm-orange-tint/60 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
        <BrandMark className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">Restaurant owner?</p>
        <p className="text-xs text-pm-grey-text">Sign up here to post for your restaurant.</p>
      </div>
      <span className="text-lg text-pm-orange-text">→</span>
    </div>
  );
}

function SignupForm() {
  return (
    <div className="rounded-2xl bg-white p-5">
      <div className="mb-5 flex gap-1 rounded-full bg-pm-grey-tint p-1">
        <span className="mono-label flex min-h-11 flex-1 items-center justify-center rounded-full bg-white text-zinc-900">
          Sign up
        </span>
        <span className="mono-label flex min-h-11 flex-1 items-center justify-center rounded-full text-pm-grey-text">
          Log in
        </span>
      </div>
      <h2 className="font-display mb-1 text-[22px] font-semibold tracking-tight text-zinc-900">
        Create your account
      </h2>
      <p className="mb-5 text-sm text-zinc-500">
        Save your favorite San Diego spots and earn Plate Points.
      </p>
      <label className={labelClass}>Username</label>
      <input className={inputClass} placeholder="tacofan_92" readOnly />
      <label className={labelClass}>Email</label>
      <input className={inputClass} placeholder="you@example.com" readOnly />
      <label className={labelClass}>Password</label>
      <input className={inputClass} placeholder="At least 8 characters" readOnly />
      <button className={primaryButton}>Create account</button>
    </div>
  );
}

const SEARCH_RESULTS = [
  { name: "Luna's Taqueria", area: "North Park · 3021 University Ave", picked: true },
  { name: "Luna Grill", area: "Hillcrest · 1040 University Ave" },
  { name: "Lunita Café", area: "Barrio Logan · 2150 Logan Ave" },
];

export default function ClaimRestaurantDraft() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <p className="mono-label text-pm-orange-text">Draft · claim a restaurant</p>
      <h1 className="font-display text-3xl font-semibold text-zinc-900">Restaurant claim flow</h1>
      <p className="mt-2 max-w-2xl text-sm text-pm-grey-text">
        An owner taps “Own this restaurant?”, fills in the form, confirms the
        email with a code, then waits for manual review. Static mockup, nothing
        submits.
      </p>

      {/* ---------- Entry point ---------- */}
      <section className="mt-8">
        <p className="mono-label mb-3 text-pm-grey-text">Entry point on the restaurant page</p>
        <div className="flex max-w-md items-center justify-between gap-3 rounded-2xl bg-white p-4">
          <div>
            <p className="text-sm font-semibold text-zinc-900">Own this restaurant?</p>
            <p className="text-xs text-pm-grey-text">Claim it to post specials and updates.</p>
          </div>
          <span className="shrink-0 rounded-full border border-pm-orange-border px-4 py-2 text-sm font-semibold text-pm-orange-text">
            Claim
          </span>
        </div>
      </section>

      {/* ---------- Sign-up entry ---------- */}
      <section className="mt-10">
        <p className="mono-label mb-4 text-pm-grey-text">Entry point on sign-up</p>
        <div className="flex flex-wrap justify-center gap-8">
          <PhoneFrame step="Sign-up" title="Owner link under the form">
            <div className="px-4 pb-6 pt-6">
              <div className="mb-5 flex items-center justify-center gap-2">
                <BrandMark className="h-7 w-7" />
                <span className="font-display text-xl font-semibold text-zinc-900">PlateMaps</span>
              </div>
              <SignupForm />
              <OwnerSignupLink />
            </div>
          </PhoneFrame>

          <PhoneFrame step="Find it" title="Pick your restaurant">
            <PhoneTopBar label="Restaurant owner" />
            <div className="px-4 pb-6">
              <h2 className="font-display mb-1 text-[22px] font-semibold tracking-tight text-zinc-900">
                Find your restaurant
              </h2>
              <p className="mb-4 text-sm text-zinc-500">
                Search by name. Pick yours and we’ll set up your owner account.
              </p>
              <input className={inputClass} defaultValue="luna" readOnly />
              <ul className="space-y-2">
                {SEARCH_RESULTS.map((r) => (
                  <li
                    key={r.name}
                    className={`flex items-center gap-3 rounded-2xl p-3 ${
                      r.picked ? "bg-white ring-2 ring-pm-orange" : "bg-white"
                    }`}
                  >
                    <div className="h-11 w-11 shrink-0 rounded-xl bg-pm-orange-tint" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-zinc-900">{r.name}</p>
                      <p className="truncate text-xs text-pm-grey-text">{r.area}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-center text-xs text-zinc-500">
                Not listed? <span className="underline underline-offset-2">Tell us about it</span>
              </p>
              <button className={`${primaryButton} mt-5`}>Continue</button>
            </div>
          </PhoneFrame>
        </div>
        <p className="mx-auto mt-4 max-w-xl text-center text-sm text-pm-grey-text">
          Continue goes to the claim form below. The claim form also asks for a
          password, so an owner signs up and claims in one go.
        </p>
      </section>

      {/* ---------- Phone ---------- */}
      <section className="mt-10">
        <p className="mono-label mb-4 text-pm-grey-text">Phone</p>
        <div className="flex flex-wrap justify-center gap-8">
          <PhoneFrame step="Step 1" title="The claim form">
            <PhoneTopBar label="Claim restaurant" />
            <div className="px-4 pb-6">
              <h2 className="font-display mb-1 text-[22px] font-semibold tracking-tight text-zinc-900">
                Is this your restaurant?
              </h2>
              <p className="mb-4 text-sm text-zinc-500">
                Tell us who you are. We check every claim by hand before you can post.
              </p>
              <RestaurantChip />
              <div className="rounded-2xl bg-white p-4">
                <ClaimFields />
                <button className={primaryButton}>Send claim</button>
              </div>
            </div>
          </PhoneFrame>

          <PhoneFrame step="Step 2" title="Confirm the email">
            <PhoneTopBar label="Claim restaurant" />
            <div className="px-4 pb-6">
              <h2 className="font-display mb-1 text-[22px] font-semibold tracking-tight text-zinc-900">
                Check your email
              </h2>
              <p className="mb-6 text-sm text-zinc-500">
                We sent a 6-digit code to{" "}
                <span className="font-medium text-zinc-900">lunastaqueria@gmail.com</span>.
              </p>
              <div className="rounded-2xl bg-white p-4">
                <CodeBoxes />
                <button className={primaryButton}>Confirm</button>
                <p className="mt-4 text-center text-xs text-zinc-500">
                  Didn’t get it? <span className="underline underline-offset-2">Resend code</span>
                </p>
              </div>
            </div>
          </PhoneFrame>

          <PhoneFrame step="Step 3" title="Waiting for review">
            <PhoneTopBar label="Claim restaurant" />
            <div className="flex flex-1 flex-col px-4 pb-6">
              <div className="mt-6 flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-pm-orange-tint">
                  <BrandMark className="h-8 w-8" />
                </div>
                <p className="mono-label mb-2 text-pm-orange-text">Waiting for review</p>
                <h2 className="font-display mb-2 text-[22px] font-semibold tracking-tight text-zinc-900">
                  We’re checking your claim
                </h2>
                <p className="mb-6 text-sm text-zinc-500">
                  We’ll email you when {RESTAURANT.name} is approved. This usually
                  takes 1–2 days.
                </p>
              </div>
              <RestaurantChip />
              <div className="rounded-2xl bg-white p-4">
                <PendingStatus />
              </div>
              <p className="mt-auto pt-6 text-center text-xs text-zinc-500">
                Questions? <span className="underline underline-offset-2">Contact support</span>
              </p>
            </div>
          </PhoneFrame>
        </div>
      </section>

      {/* ---------- Web ---------- */}
      <section className="mt-14">
        <p className="mono-label mb-4 text-pm-grey-text">Web</p>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl bg-white p-8">
            <h2 className="font-display mb-1 text-2xl font-semibold tracking-tight text-zinc-900">
              Is this your restaurant?
            </h2>
            <p className="mb-5 text-sm text-zinc-500">
              Tell us who you are. We check every claim by hand before you can post.
            </p>
            <RestaurantChip />
            <div className="grid gap-x-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Your name</label>
                <input className={inputClass} defaultValue="Maria Luna" readOnly />
              </div>
              <div>
                <label className={labelClass}>Your role</label>
                <RoleToggle />
              </div>
              <div>
                <label className={labelClass}>Business email</label>
                <input className={inputClass} defaultValue="lunastaqueria@gmail.com" readOnly />
              </div>
              <div>
                <label className={labelClass}>Business phone</label>
                <input className={inputClass} defaultValue="(619) 555-0142" readOnly />
              </div>
            </div>
            <p className="-mt-2 mb-4 text-xs text-zinc-500">
              Use the email customers see on your website, Instagram or Facebook.
              It helps us approve you faster.
            </p>
            <label className={labelClass}>
              Where is that email posted? <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input className={inputClass} placeholder="instagram.com/lunastaqueria" readOnly />
            <button className={`${primaryButton} sm:w-auto sm:px-8`}>Send claim</button>
          </div>

          <div className="rounded-3xl bg-white p-8">
            <p className="mono-label mb-2 text-pm-orange-text">Waiting for review</p>
            <h2 className="font-display mb-2 text-2xl font-semibold tracking-tight text-zinc-900">
              We’re checking your claim
            </h2>
            <p className="mb-6 text-sm text-zinc-500">
              We’ll email you when {RESTAURANT.name} is approved. This usually takes 1–2 days.
            </p>
            <PendingStatus />
          </div>
        </div>
      </section>
    </main>
  );
}
