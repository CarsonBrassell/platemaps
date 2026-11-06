"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signInHrefFor } from "@/lib/signInGate";
import type { TasteOp } from "@/lib/useTaste";

/**
 * The cuisine chips behind "Your taste", pulled out so the For me list can put
 * the same ones in its Tune panel and its "what do you like?" prompt. One
 * component, so a love picked in either place looks and counts the same: it is
 * the same `useTaste` op underneath (`apply`), and the cap is the server's.
 * See probe/your-taste/DESIGN.md and probe/for-me/PLAN.md.
 */
const CHIP =
  "inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange disabled:opacity-40";
const CHIP_ON = `${CHIP} bg-pm-orange text-[#F7F4EC]`;
const CHIP_SUGGEST = `${CHIP} border border-zinc-300 bg-transparent text-pm-grey-text`;
const CHIP_PLAIN = `${CHIP} bg-pm-grey-tint text-pm-grey-text`;

export const MAX_PREFS = 5;
const INVITE_COUNT = 10;
const SUGGEST_COUNT = 5;

/**
 * Which arrangement of the same chips to draw.
 *
 * - `invite`: love chips only, the first few and a More, for a viewer with no
 *   signal yet.
 * - `row`: the loves already picked (filled) followed by a few suggestions
 *   (outlined), the compact strip above the Your taste cards.
 * - `edit`: every cuisine twice, once under "I love" and once under "Not
 *   into". The caller supplies the panel around it and any footer.
 */
export type TasteChipsMode = "invite" | "row" | "edit";

export function TasteChips({
  mode,
  cuisines,
  loves,
  skips,
  apply,
}: {
  mode: TasteChipsMode;
  cuisines: string[];
  loves: string[];
  skips: string[];
  apply: (op: TasteOp) => void;
}) {
  const [more, setMore] = useState(false);
  const loveFull = loves.length >= MAX_PREFS;
  const skipFull = skips.length >= MAX_PREFS;
  const toggleLove = (c: string) =>
    apply({ kind: loves.includes(c) ? "unlove" : "love", value: c });
  const toggleSkip = (c: string) =>
    apply({ kind: skips.includes(c) ? "unskip" : "skip", value: c });

  if (mode === "invite") {
    const chosen = cuisines.filter((c) => loves.includes(c));
    const rest = cuisines.filter((c) => !loves.includes(c) && !skips.includes(c));
    const shown = more ? rest : rest.slice(0, INVITE_COUNT);
    return (
      <div className="mb-3 flex flex-wrap gap-2 px-1">
        {[...chosen, ...shown].map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={loves.includes(c)}
            disabled={!loves.includes(c) && loveFull}
            onClick={() => toggleLove(c)}
            className={loves.includes(c) ? CHIP_ON : CHIP_PLAIN}
          >
            {c}
          </button>
        ))}
        {!more && rest.length > INVITE_COUNT && (
          <button type="button" onClick={() => setMore(true)} className={CHIP_PLAIN}>
            More
          </button>
        )}
      </div>
    );
  }

  if (mode === "row") {
    const suggested = cuisines
      .filter((c) => !loves.includes(c) && !skips.includes(c))
      .slice(0, more ? cuisines.length : SUGGEST_COUNT);
    return (
      <div className="mb-4 flex flex-wrap gap-2 px-1">
        {loves.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed
            onClick={() => toggleLove(c)}
            className={CHIP_ON}
          >
            {c}
          </button>
        ))}
        {suggested.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={false}
            disabled={loveFull}
            onClick={() => toggleLove(c)}
            className={CHIP_SUGGEST}
          >
            {c}
          </button>
        ))}
        {!more && cuisines.length > SUGGEST_COUNT && (
          <button type="button" onClick={() => setMore(true)} className={CHIP_PLAIN}>
            More
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <p className="mono-label mb-2 text-zinc-500">I love (up to {MAX_PREFS})</p>
      <div className="mb-5 flex flex-wrap gap-2">
        {cuisines.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={loves.includes(c)}
            disabled={skips.includes(c) || (!loves.includes(c) && loveFull)}
            onClick={() => toggleLove(c)}
            className={loves.includes(c) ? CHIP_ON : CHIP_PLAIN}
          >
            {c}
          </button>
        ))}
      </div>
      <p className="mono-label mb-2 text-zinc-500">Not into (up to {MAX_PREFS})</p>
      <div className="mb-5 flex flex-wrap gap-2">
        {cuisines.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={skips.includes(c)}
            disabled={loves.includes(c) || (!skips.includes(c) && skipFull)}
            onClick={() => toggleSkip(c)}
            className={skips.includes(c) ? CHIP_ON : CHIP_PLAIN}
          >
            {c}
          </button>
        ))}
      </div>
    </>
  );
}

/** The quiet nudge for a viewer whose picks live only on this device. */
export function TasteSignUp({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname() ?? "/";
  if (signedIn) return null;
  return (
    <p className="mt-3 px-1 text-[13px] text-zinc-500">
      <Link href={signInHrefFor(pathname, "")} className="underline underline-offset-2">
        Sign up to keep your picks across devices
      </Link>
    </p>
  );
}

/**
 * "What do you like?": the prompt for a viewer with nothing to score yet. Never
 * fake picks — it asks, offers the chips, and points at the other way in (post a
 * plate), then the sign-up nudge. Your taste shows it in place of the carousel
 * and the For me list in place of its matches.
 */
export function TasteInvite({
  cuisines,
  loves,
  skips,
  apply,
  signedIn,
}: {
  cuisines: string[];
  loves: string[];
  skips: string[];
  apply: (op: TasteOp) => void;
  signedIn: boolean;
}) {
  return (
    <>
      <p className="mb-3 px-1 text-[14px] text-pm-grey-text">
        What do you like? Pick up to 3 and we&apos;ll start finding places.
      </p>
      <TasteChips mode="invite" cuisines={cuisines} loves={loves} skips={skips} apply={apply} />
      <Link href="/post" className="px-1 text-[13px] text-zinc-500 underline underline-offset-2">
        Post a plate and we&apos;ll learn where you eat
      </Link>
      <TasteSignUp signedIn={signedIn} />
    </>
  );
}
