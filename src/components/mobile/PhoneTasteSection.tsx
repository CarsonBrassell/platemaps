"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { CloseIcon } from "@/components/icons";
import { PhoneRestaurantCardGrid } from "@/components/mobile/PhoneRestaurantCardGrid";
import { signInHrefFor } from "@/lib/signInGate";
import { useTaste } from "@/lib/useTaste";

/**
 * Phone "Your taste". Same behaviour as TasteSection (web), laid out for a
 * thumb: 44px targets, a snap scroller, and the Edit panel as a bottom sheet
 * in PhoneFilterSheet's shell. See probe/your-taste/DESIGN.md.
 */
const CHIP =
  "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange disabled:opacity-40";
const CHIP_ON = `${CHIP} bg-pm-orange text-[#F7F4EC]`;
const CHIP_SUGGEST = `${CHIP} border border-zinc-300 bg-transparent text-pm-grey-text`;
const CHIP_PLAIN = `${CHIP} bg-pm-grey-tint text-pm-grey-text`;
const BTN =
  "min-h-11 text-[13px] font-medium text-zinc-500 underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";
const ROW = "overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const MAX_PREFS = 5;
const INVITE_COUNT = 10;
const SUGGEST_COUNT = 3;

function EditSheet({
  cuisines,
  loves,
  skips,
  onLove,
  onSkip,
  onReset,
  onClose,
}: {
  cuisines: string[];
  loves: string[];
  skips: string[];
  onLove: (c: string) => void;
  onSkip: (c: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const headingId = useId();
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const loveFull = loves.length >= MAX_PREFS;
  const skipFull = skips.length >= MAX_PREFS;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center overflow-hidden bg-pm-charcoal/45 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="animate-sheet-in flex max-h-[86dvh] w-full flex-col rounded-t-2xl bg-white"
      >
        <div className="shrink-0 px-4 pb-1 pt-2.5">
          <div className="mx-auto h-1 w-10 rounded-full bg-zinc-300" />
          <div className="mt-1.5 flex items-center gap-2">
            <h2 id={headingId} className="font-display text-lg font-semibold text-zinc-900">
              Your taste
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[var(--phone-nav-space,1rem)] pt-1">
          <p className="mono-label mb-2 text-zinc-500">I love (up to {MAX_PREFS})</p>
          <div className="mb-5 flex flex-wrap gap-2">
            {cuisines.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={loves.includes(c)}
                disabled={skips.includes(c) || (!loves.includes(c) && loveFull)}
                onClick={() => onLove(c)}
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
                onClick={() => onSkip(c)}
                className={skips.includes(c) ? CHIP_ON : CHIP_PLAIN}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="mb-2 text-[13px] text-zinc-500">
            These only change Your taste, not the rest of Discover.
          </p>
          <button type="button" onClick={onReset} className={BTN}>
            Reset my taste
          </button>
        </div>
      </div>
    </div>
  );
}

export function PhoneTasteSection({ cuisines }: { cuisines: string[] }) {
  const taste = useTaste();
  const pathname = usePathname() ?? "/m";
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);

  if (taste.status === "loading") {
    return (
      <section aria-label="Your taste" aria-busy="true" className="h-[400px] pb-4 pt-2">
        <div className="px-4">
          <h2 className="mono-label text-zinc-500">Your taste</h2>
        </div>
        <div className="mt-3 flex gap-2 px-4">
          {[88, 72, 64].map((w) => (
            <div
              key={w}
              className="h-11 animate-pulse rounded-full bg-white/70"
              style={{ width: w }}
            />
          ))}
        </div>
        <div className="mt-2 flex gap-2 px-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[260px] w-[170px] shrink-0 animate-pulse rounded-2xl bg-white/60"
            />
          ))}
        </div>
      </section>
    );
  }

  const { loves, skips } = taste.prefs;
  const loveFull = loves.length >= MAX_PREFS;
  const toggleLove = (c: string) =>
    taste.apply({ kind: loves.includes(c) ? "unlove" : "love", value: c });
  const toggleSkip = (c: string) =>
    taste.apply({ kind: skips.includes(c) ? "unskip" : "skip", value: c });

  const signUp = !taste.signedIn && (
    <p className="px-4">
      <Link
        href={signInHrefFor(pathname, "")}
        className="inline-flex min-h-11 items-center text-[13px] text-zinc-500 underline underline-offset-2"
      >
        Sign up to keep your picks across devices
      </Link>
    </p>
  );

  if (taste.status === "error" || taste.basis === "none" || taste.picks.length === 0) {
    const chosen = cuisines.filter((c) => loves.includes(c));
    const rest = cuisines.filter((c) => !loves.includes(c) && !skips.includes(c));
    const shown = more ? rest : rest.slice(0, INVITE_COUNT);
    return (
      <section aria-labelledby="your-taste" className="py-4">
        <h2 id="your-taste" className="mono-label mb-1.5 px-4 text-zinc-500">
          Your taste
        </h2>
        <p className="mb-3 px-4 text-[13px] text-pm-grey-text">
          What do you like? Pick up to 3 and we&apos;ll start finding places.
        </p>
        <div className={`${ROW} px-4`}>
          <div className="flex w-max gap-2 pb-1">
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
        </div>
        <Link
          href="/m/post"
          className="mt-2 inline-flex min-h-11 items-center px-4 text-[13px] text-zinc-500 underline underline-offset-2"
        >
          Post a plate and we&apos;ll learn where you eat
        </Link>
        {signUp}
      </section>
    );
  }

  const suggested = cuisines
    .filter((c) => !loves.includes(c) && !skips.includes(c))
    .slice(0, more ? cuisines.length : SUGGEST_COUNT);

  return (
    <section aria-labelledby="your-taste" className="pb-4 pt-2">
      <div className="flex items-center justify-between gap-3 px-4">
        <h2 id="your-taste" className="mono-label text-zinc-500">
          Your taste
        </h2>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mono-label flex min-h-11 items-center text-zinc-500 underline underline-offset-2"
        >
          Edit
        </button>
      </div>
      <p className="-mt-2 mb-2 px-4 text-[12px] text-zinc-400">{taste.shortHeader}</p>

      {taste.undo && (
        <div
          role="status"
          className="mx-4 mb-2 flex items-center justify-between rounded-xl bg-pm-grey-tint pl-4 text-[13px] text-pm-grey-text"
        >
          <span className="truncate">{taste.undo.label}</span>
          <button
            type="button"
            onClick={taste.undo.run}
            className="min-h-11 px-4 font-medium text-pm-orange-text underline underline-offset-2"
          >
            Undo
          </button>
        </div>
      )}

      <div className={`${ROW} px-4`}>
        <div className="flex w-max gap-2 pb-1">
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
      </div>

      <div className={`${ROW} mt-2 flex snap-x snap-mandatory items-stretch gap-2 scroll-px-4 px-4`}>
        {taste.picks.slice(0, 12).map((p) => (
          <div
            key={p.restaurant.id}
            className="flex w-[170px] shrink-0 snap-start flex-col overflow-hidden rounded-xl bg-white"
          >
            <div className="flex-1">
              <PhoneRestaurantCardGrid
                restaurant={p.restaurant}
                score={p.plateScore ?? undefined}
              />
            </div>
            <div className="mt-auto px-2 pb-1">
              <p className="truncate text-[13px] text-zinc-500">{p.reason.short}</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => taste.apply({ kind: "been", value: p.restaurant.id })}
                  className={BTN}
                >
                  Been here
                </button>
                <button
                  type="button"
                  onClick={() => taste.apply({ kind: "hide", value: p.restaurant.id })}
                  className={BTN}
                >
                  Not for me
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {signUp}

      {editing && (
        <EditSheet
          cuisines={cuisines}
          loves={loves}
          skips={skips}
          onLove={toggleLove}
          onSkip={toggleSkip}
          onReset={() => taste.apply({ kind: "reset" })}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  );
}
