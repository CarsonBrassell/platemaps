"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { CloseIcon, RefreshIcon } from "@/components/icons";
import { PhoneRestaurantCardGrid } from "@/components/mobile/PhoneRestaurantCardGrid";
import { pickDistanceLabel } from "@/lib/pickDistance";
import { useForMeAccess } from "@/lib/auth";
import type { Coords } from "@/lib/geo";
import { qualityNote } from "@/lib/ratingDisplay";
import { signInHrefFor } from "@/lib/signInGate";
import { useTaste } from "@/lib/useTaste";

/**
 * Phone "Your taste". Same behaviour as TasteSection (web), laid out for a
 * thumb: 44px targets, a snap scroller, and the Edit panel as a bottom sheet
 * in PhoneFilterSheet's shell. See probe/your-taste/DESIGN.md.
 *
 * The accounts on lib/forMeGate.ts get dish-level picks (lib/dishTaste.ts) and
 * no cuisine chips or Edit sheet to tune them: each card carries the reason,
 * the quality line and the distance, with Been here / Not for me under it. For
 * everyone else it is the strip it was, with "Edit" in its header and no
 * distance on the cards.
 */
const CHIP =
  "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange disabled:opacity-40";
const CHIP_ON = `${CHIP} bg-pm-orange text-[#F7F4EC]`;
const CHIP_SUGGEST = `${CHIP} border border-zinc-300 bg-transparent text-pm-grey-text`;
const CHIP_PLAIN = `${CHIP} bg-pm-grey-tint text-pm-grey-text`;
const BTN =
  "min-h-11 text-[13px] font-medium text-zinc-500 underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";
const ROW = "overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/**
 * Dish-picks accounts only: swaps the row for places not shown yet. A 44px
 * target, text in --pm-grey-text because the section sits on the cream ground.
 */
function RefreshButton({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
  return (
    <button
      type="button"
      onClick={refreshing ? undefined : onRefresh}
      aria-disabled={refreshing}
      aria-busy={refreshing}
      title="Show new places you might like"
      className="mono-label flex min-h-11 items-center gap-1.5 text-pm-grey-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange aria-disabled:cursor-wait"
    >
      <RefreshIcon className={refreshing ? "h-3.5 w-3.5 motion-safe:animate-spin" : "h-3.5 w-3.5"} />
      Refresh
    </button>
  );
}

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

function SignUpNudge({ pathname }: { pathname: string }) {
  return (
    <p className="px-4">
      <Link
        href={signInHrefFor(pathname, "")}
        className="inline-flex min-h-11 items-center text-[13px] text-zinc-500 underline underline-offset-2"
      >
        Sign up to keep your picks across devices
      </Link>
    </p>
  );
}

/**
 * Been here / Not for me, under a card. One control for the Your taste strip on
 * phone and web, so the two cannot drift. Each carries the place's name
 * for a screen reader — a row of identical "Been here" buttons says nothing
 * about which one it is — and the name starts with the visible words, which is
 * what keeps the label and the text in agreement.
 */
function PickButtons({
  name,
  onBeen,
  onHide,
}: {
  name: string;
  onBeen: () => void;
  onHide: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-3">
      <button type="button" onClick={onBeen} aria-label={`Been here, ${name}`} className={BTN}>
        Been here
      </button>
      <button type="button" onClick={onHide} aria-label={`Not for me, ${name}`} className={BTN}>
        Not for me
      </button>
    </div>
  );
}

/**
 * "What do you like?" — the cuisine chips, the post-a-plate nudge and the
 * sign-up nudge, for a visitor the app has nothing to go on for. Shown by Your
 * taste when it has no picks; picking a chip is a love, and a love retunes it.
 */
function TastePrompt({
  cuisines,
  taste,
  pathname,
  more,
  onMore,
}: {
  cuisines: string[];
  taste: ReturnType<typeof useTaste>;
  pathname: string;
  more: boolean;
  onMore: () => void;
}) {
  const { loves, skips } = taste.prefs;
  const loveFull = loves.length >= MAX_PREFS;
  const chosen = cuisines.filter((c) => loves.includes(c));
  const rest = cuisines.filter((c) => !loves.includes(c) && !skips.includes(c));
  const shown = more ? rest : rest.slice(0, INVITE_COUNT);

  return (
    <>
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
              onClick={() => taste.apply({ kind: loves.includes(c) ? "unlove" : "love", value: c })}
              className={loves.includes(c) ? CHIP_ON : CHIP_PLAIN}
            >
              {c}
            </button>
          ))}
          {!more && rest.length > INVITE_COUNT && (
            <button type="button" onClick={onMore} className={CHIP_PLAIN}>
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
      {!taste.signedIn && <SignUpNudge pathname={pathname} />}
    </>
  );
}

export function PhoneTasteSection({
  cuisines,
  coords = null,
  served,
}: {
  cuisines: string[];
  /** Where the reader is, for the distance on each pick; null when unknown. */
  coords?: Coords | null;
  /** Restaurant id to the distance the grid card printed, so a place reads the same in both. */
  served?: ReadonlyMap<string, string>;
}) {
  const taste = useTaste();
  const access = useForMeAccess();
  const pathname = usePathname() ?? "/m";
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const wasRefreshing = useRef(false);

  // A refresh lands at the start of the row, not wherever the old one was scrolled to.
  useEffect(() => {
    if (wasRefreshing.current && !taste.refreshing) rowRef.current?.scrollTo({ left: 0 });
    wasRefreshing.current = taste.refreshing;
  }, [taste.refreshing]);

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

  const signUp = !taste.signedIn && <SignUpNudge pathname={pathname} />;

  if (taste.status === "error" || taste.basis === "none" || taste.picks.length === 0) {
    return (
      <section aria-labelledby="your-taste" className="py-4">
        {access && taste.signedIn ? (
          <div className="mb-1.5 flex items-center justify-between gap-3 px-4">
            <h2 id="your-taste" className="mono-label text-zinc-500">
              Your taste
            </h2>
            <RefreshButton refreshing={taste.refreshing} onRefresh={taste.refresh} />
          </div>
        ) : (
          <h2 id="your-taste" className="mono-label mb-1.5 px-4 text-zinc-500">
            Your taste
          </h2>
        )}
        <TastePrompt
          cuisines={cuisines}
          taste={taste}
          pathname={pathname}
          more={more}
          onMore={() => setMore(true)}
        />
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
        {/* The picks come from the reader's posts: nothing to tune, only to refresh. */}
        {access && taste.signedIn && (
          <RefreshButton refreshing={taste.refreshing} onRefresh={taste.refresh} />
        )}
        {!access && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mono-label flex min-h-11 items-center text-zinc-500 underline underline-offset-2"
          >
            Edit
          </button>
        )}
      </div>
      <p className={access ? "mb-3 mt-1 px-4 text-[12px] text-zinc-500" : "-mt-2 mb-2 px-4 text-[12px] text-zinc-400"}>{taste.shortHeader}</p>

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

      {!access && (
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
      )}

      <div
        ref={rowRef}
        className={`${ROW} mt-2 flex snap-x snap-mandatory items-stretch gap-2 scroll-px-4 px-4${access ? ` motion-safe:transition-opacity${taste.refreshing ? " opacity-60" : ""}` : ""}`}
      >
        {taste.picks.slice(0, 12).map((p) => (
          <div
            key={p.restaurant.id}
            className="flex w-[170px] shrink-0 snap-start flex-col overflow-hidden rounded-xl bg-white"
          >
            <div className="flex-1">
              {access ? (
                <PhoneRestaurantCardGrid
                  restaurant={p.restaurant}
                  score={p.plateScore ?? undefined}
                  distance={pickDistanceLabel(p.restaurant, coords, served)}
                  reason={p.reason.short}
                  reasonLines={3}
                  quality={qualityNote(p.restaurant.rating, p.restaurant.reviewCount)}
                />
              ) : (
                <PhoneRestaurantCardGrid
                  restaurant={p.restaurant}
                  score={p.plateScore ?? undefined}
                  distance={null}
                />
              )}
            </div>
            <div className="mt-auto px-2 pb-1">
              {!access && <p className="truncate text-[13px] text-zinc-500">{p.reason.short}</p>}
              {access ? (
                <PickButtons
                  name={p.restaurant.name}
                  onBeen={() => taste.apply({ kind: "been", value: p.restaurant.id })}
                  onHide={() => taste.apply({ kind: "hide", value: p.restaurant.id })}
                />
              ) : (
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
              )}
            </div>
          </div>
        ))}
      </div>
      {signUp}

      {!access && editing && (
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
