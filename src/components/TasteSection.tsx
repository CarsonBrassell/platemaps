"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { RestaurantCard } from "@/components/RestaurantCard";
import { signInHrefFor } from "@/lib/signInGate";
import { useTaste, type TastePick } from "@/lib/useTaste";

/**
 * "Your taste": the private picks section at the top of Discover. Everything
 * it shows comes from useTaste (one scorer, one payload, so web and phone
 * cannot drift); this file only lays it out. See probe/your-taste/DESIGN.md.
 */
const CHIP =
  "inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange disabled:opacity-40";
const CHIP_ON = `${CHIP} bg-pm-orange text-[#F7F4EC]`;
const CHIP_SUGGEST = `${CHIP} border border-zinc-300 bg-transparent text-pm-grey-text`;
const CHIP_PLAIN = `${CHIP} bg-pm-grey-tint text-pm-grey-text`;
const BTN =
  "text-[13px] font-medium text-zinc-500 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

const MAX_PREFS = 5;
const INVITE_COUNT = 10;
const SUGGEST_COUNT = 5;

export function TasteSection({ cuisines }: { cuisines: string[] }) {
  const taste = useTaste();
  const pathname = usePathname() ?? "/";
  const [editing, setEditing] = useState(false);
  const [all, setAll] = useState(false);
  const [more, setMore] = useState(false);

  if (taste.status === "loading") {
    return (
      <section aria-label="Your taste" aria-busy="true" className="mb-7 h-[430px]">
        <div className="mb-3 px-1">
          <h2 className="mono-label text-zinc-500">Your taste</h2>
        </div>
        <div className="mb-4 flex gap-2 px-1">
          {[88, 72, 64, 80, 70].map((w) => (
            <div
              key={w}
              className="h-9 animate-pulse rounded-full bg-white/70"
              style={{ width: w }}
            />
          ))}
        </div>
        <div className="flex gap-4 overflow-hidden px-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[300px] w-[240px] shrink-0 animate-pulse rounded-2xl bg-white/60"
            />
          ))}
        </div>
      </section>
    );
  }

  const { loves, skips } = taste.prefs;
  const loveFull = loves.length >= MAX_PREFS;
  const skipFull = skips.length >= MAX_PREFS;
  const toggleLove = (c: string) =>
    taste.apply({ kind: loves.includes(c) ? "unlove" : "love", value: c });
  const toggleSkip = (c: string) =>
    taste.apply({ kind: skips.includes(c) ? "unskip" : "skip", value: c });

  const signUp = !taste.signedIn && (
    <p className="mt-3 px-1 text-[13px] text-zinc-500">
      <Link href={signInHrefFor(pathname, "")} className="underline underline-offset-2">
        Sign up to keep your picks across devices
      </Link>
    </p>
  );

  // No signal (or the fetch failed): the compact invite, never fake picks.
  if (taste.status === "error" || taste.basis === "none" || taste.picks.length === 0) {
    const chosen = cuisines.filter((c) => loves.includes(c));
    const rest = cuisines.filter((c) => !loves.includes(c) && !skips.includes(c));
    const shown = more ? rest : rest.slice(0, INVITE_COUNT);
    return (
      <section aria-labelledby="your-taste" className="mb-7">
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
          <h2 id="your-taste" className="mono-label text-zinc-500">
            Your taste
          </h2>
        </div>
        <p className="mb-3 px-1 text-[14px] text-pm-grey-text">
          What do you like? Pick up to 3 and we&apos;ll start finding places.
        </p>
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
        <Link href="/post" className="px-1 text-[13px] text-zinc-500 underline underline-offset-2">
          Post a plate and we&apos;ll learn where you eat
        </Link>
        {signUp}
      </section>
    );
  }

  const suggested = cuisines
    .filter((c) => !loves.includes(c) && !skips.includes(c))
    .slice(0, more ? cuisines.length : SUGGEST_COUNT);
  const picks = taste.picks.slice(0, all ? 24 : 12);

  const card = (p: TastePick, width: string) => (
    <div
      key={p.restaurant.id}
      className={`flex flex-col overflow-hidden rounded-2xl bg-white ${width}`}
    >
      <div className="flex-1">
        <RestaurantCard restaurant={p.restaurant} score={p.plateScore ?? undefined} shape="crop" />
      </div>
      <div className="mt-auto px-3.5 pb-3">
        <p className="truncate text-[13px] text-zinc-500">{p.reason.text}</p>
        <div className="mt-1 flex gap-4">
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
  );

  return (
    <section aria-labelledby="your-taste" className="mb-7">
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <h2 id="your-taste" className="mono-label text-zinc-500">
          Your taste
        </h2>
        <span className="mono-label text-zinc-400">
          {taste.header} ·{" "}
          <button
            type="button"
            aria-expanded={editing}
            onClick={() => setEditing((e) => !e)}
            className="uppercase underline underline-offset-2"
          >
            Edit
          </button>
        </span>
      </div>

      {taste.undo && (
        <div
          role="status"
          className="mb-3 flex items-center justify-between rounded-xl bg-pm-grey-tint px-4 py-2.5 text-[13px] text-pm-grey-text"
        >
          <span>{taste.undo.label}</span>
          <button
            type="button"
            onClick={taste.undo.run}
            className="font-medium text-pm-orange-text underline underline-offset-2"
          >
            Undo
          </button>
        </div>
      )}

      {editing && (
        <div className="mb-4 rounded-2xl bg-white p-5">
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
          <p className="mb-3 text-[13px] text-zinc-500">
            These only change Your taste, not the rest of Discover.
          </p>
          <button type="button" onClick={() => taste.apply({ kind: "reset" })} className={BTN}>
            Reset my taste
          </button>
        </div>
      )}

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

      <div className="mb-2 flex justify-end px-1">
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll((a) => !a)}
          className="mono-label text-zinc-500 underline underline-offset-2"
        >
          {all ? "Show fewer" : "See all"}
        </button>
      </div>

      {all ? (
        <div className="grid grid-cols-2 items-stretch gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {picks.map((p) => card(p, "min-w-0"))}
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-stretch gap-4">{picks.map((p) => card(p, "w-[240px] shrink-0"))}</div>
        </div>
      )}
      {signUp}
    </section>
  );
}
