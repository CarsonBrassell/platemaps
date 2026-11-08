"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ForMeProfileLine } from "@/components/ForMeProfileLine";
import { CloseIcon } from "@/components/icons";
import { PhoneRestaurantCardGrid } from "@/components/mobile/PhoneRestaurantCardGrid";
import { ReasonText } from "@/components/ReasonText";
import type { DiscoverPage, DiscoverResult } from "@/lib/discover";
import { matchMarksFor } from "@/lib/discoverFilters";
import { useForMeAccess } from "@/lib/auth";
import { distanceLabel, type Coords } from "@/lib/geo";
import type { Nearby } from "@/lib/nearby";
import { packColumns } from "@/lib/photoShape";
import { forMeQualityNote } from "@/lib/ratingDisplay";
import { signInHrefFor } from "@/lib/signInGate";
import { useTaste } from "@/lib/useTaste";

/**
 * Phone "Your taste". Same behaviour as TasteSection (web), laid out for a
 * thumb: 44px targets, a snap scroller, and the Edit panel as a bottom sheet
 * in PhoneFilterSheet's shell. See probe/your-taste/DESIGN.md.
 *
 * Also home to the phone's "For me" list (`PhoneForMeResults`, bottom of the
 * file). It lives here rather than beside `PhoneDiscoverResults` because it is
 * the same controls over a longer list — the Been here / Not for me buttons,
 * the cuisine chips for a visitor with no history, the Edit sheet — and those
 * are private to this file. See probe/for-me/PLAN.md.
 *
 * The strip's For me touches (the "See all" link, the distance on a card, the
 * button labels, the sheet's wording) are for the accounts on lib/forMeGate.ts
 * only; for everyone else it is the strip it was, with "Edit" alone in its
 * header and no distance on the cards.
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
/** How long the For me list's Undo bar stays up — the same 10s `useTaste` gives its own. */
const UNDO_MS = 10_000;
/** How long the For me skeleton waits before it offers a way out (see `ForMeSkeleton`). */
const SLOW_MS = 8_000;

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
  const access = useForMeAccess();
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
            {access
              ? "These only change Your taste and For me, not the rest of Discover."
              : "These only change Your taste, not the rest of Discover."}
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
 * Been here / Not for me, under a card. One control for the Your taste strip
 * and the For me list, so the two cannot drift. Each carries the place's name
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
 * taste when it has no picks and by the For me list when the server answers
 * `basis: "none"`; picking a chip is a love, and a love retunes both.
 */
function TastePrompt({
  cuisines,
  taste,
  pathname,
  more: sharedMore,
  onMore,
}: {
  cuisines: string[];
  taste: ReturnType<typeof useTaste>;
  pathname: string;
  /** The caller's own "More" state, when it keeps one (Your taste's strip does). */
  more?: boolean;
  onMore?: () => void;
}) {
  const [ownMore, setOwnMore] = useState(false);
  const more = sharedMore ?? ownMore;
  const showMore = () => (onMore ? onMore() : setOwnMore(true));
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
            <button type="button" onClick={showMore} className={CHIP_PLAIN}>
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
  seeAllHref = "/m?foryou=1",
}: {
  cuisines: string[];
  /** Where the reader is, for the distance on each pick; null when unknown. */
  coords?: Coords | null;
  /**
   * Where "See all" goes: the For me list, which is this strip's picks and the
   * rest of the ranking behind them. The screen passes a link built by its own
   * `hrefWith` so `nav` survives the tap; the default is the bare address.
   */
  seeAllHref?: string;
}) {
  const taste = useTaste();
  const access = useForMeAccess();
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

  const signUp = !taste.signedIn && <SignUpNudge pathname={pathname} />;

  if (taste.status === "error" || taste.basis === "none" || taste.picks.length === 0) {
    return (
      <section aria-labelledby="your-taste" className="py-4">
        <h2 id="your-taste" className="mono-label mb-1.5 px-4 text-zinc-500">
          Your taste
        </h2>
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
        {access ? (
          <div className="flex items-center gap-4">
            {/* Not an inline expand: the strip is the top of the For me ranking,
                and the rest of it is one tap away on its own list. */}
            <Link
              href={seeAllHref}
              prefetch={false}
              className="mono-label flex min-h-11 items-center text-zinc-500 underline underline-offset-2"
            >
              See all
            </Link>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mono-label flex min-h-11 items-center text-zinc-500 underline underline-offset-2"
            >
              Edit
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mono-label flex min-h-11 items-center text-zinc-500 underline underline-offset-2"
          >
            Edit
          </button>
        )}
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
                distance={access ? distanceLabel(p.restaurant, coords) : null}
              />
            </div>
            <div className="mt-auto px-2 pb-1">
              <p className="truncate text-[13px] text-zinc-500">{p.reason.short}</p>
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

/**
 * What a For me page waits behind: the header and two columns of blanks, in
 * the wall's own proportions so the real cards land without a jump.
 *
 * A skeleton rather than the cards the static shell already has, because the
 * shell's default order painted under a "For me" chip would read as a
 * personal list that it is not (`pending` in useDiscoverQuery exists for this).
 * It also has to be able to end. The hook leaves `pending` set when the POST
 * fails — it keeps what is on screen and waits for the next query — and on a
 * bare `?foryou=1` there is nothing on screen to keep. So after `SLOW_MS` the
 * skeleton says so and offers the unpersonalised list, rather than pulsing
 * for as long as the reader is willing to look at it.
 */
function ForMeSkeleton({
  escapeHref,
  failed,
  onRetry,
}: {
  escapeHref: string;
  /** The request died (the hook says so); the blanks would never fill. */
  failed: boolean;
  onRetry: () => void;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, []);

  if (failed) {
    return (
      <section aria-label="For me" className="pb-4">
        <div role="alert" className="px-4 py-16 text-center">
          <p className="font-display text-lg text-zinc-900">Couldn&apos;t load your list</p>
          <p className="mx-auto mt-1 max-w-[15rem] text-sm leading-snug text-pm-grey-text">
            Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Try again
          </button>
          <div>
            <Link
              href={escapeHref}
              scroll={false}
              prefetch={false}
              className="mt-1 inline-flex min-h-11 items-center text-[13px] text-pm-grey-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Show all places
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="For me" aria-busy="true" className="pb-4">
      <div className="px-4 pb-3">
        <div className="h-3 w-16 animate-pulse rounded bg-white/70" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded bg-white/70" />
      </div>
      <div className="grid grid-cols-2 items-start gap-2 px-4">
        {[
          [210, 250, 220],
          [250, 210, 240],
        ].map((column, i) => (
          <div key={i} className="grid auto-rows-min content-start gap-2">
            {column.map((height, j) => (
              <div
                key={j}
                className="animate-pulse rounded-xl bg-white/60"
                style={{ height }}
              />
            ))}
          </div>
        ))}
      </div>
      {slow && (
        <p role="status" className="px-4 pt-3 text-[13px] leading-snug text-pm-grey-text">
          This is taking longer than it should.{" "}
          <Link
            href={escapeHref}
            scroll={false}
            prefetch={false}
            className="inline-flex min-h-11 items-center underline underline-offset-2"
          >
            Show all places
          </Link>
        </p>
      )}
    </section>
  );
}

/**
 * One two-across block of the For me list: the Discover wall's card with the
 * reason under the name, and Been here / Not for me under the card. Two blocks
 * make the list — the matches and, after the divider, the tail — each packed
 * on its own, so the tail cannot slip into a gap in the matches' columns and
 * pass for one of them.
 */
function ForMeGrid({
  items,
  filters,
  coords,
  priority,
  onMark,
}: {
  items: DiscoverResult[];
  filters: DiscoverPage["filters"];
  /** Where the reader is, for the distance on each card; null when unknown. */
  coords: Coords | null;
  /** The first two cards of the first block, so the fold isn't lazy-loaded. */
  priority: boolean;
  onMark: (kind: "been" | "hide", restaurant: DiscoverResult) => void;
}) {
  return (
    <div className="grid grid-cols-2 items-start gap-2 px-4">
      {packColumns(items, 2).map((column, i) => (
        <div key={i} className="grid auto-rows-min content-start gap-2">
          {column.map((restaurant, index) => (
            <div key={restaurant.id} className="overflow-hidden rounded-xl bg-white">
              <PhoneRestaurantCardGrid
                restaurant={restaurant}
                score={restaurant.plateScore}
                priority={priority && index < 2}
                matchedCuisine={matchMarksFor(restaurant, filters).cuisine}
                /* Never the seeded downtown-origin string: the server's figure
                   when the page was built for a position, else measured here
                   from the reader's coordinates, else nothing. */
                distance={distanceLabel(restaurant, coords)}
                aspect={
                  filters.aspect && restaurant.aspectScore !== undefined
                    ? {
                        aspect: filters.aspect,
                        score: restaurant.aspectScore.score,
                        praised: restaurant.aspectScore.praised,
                      }
                    : null
                }
                reason={restaurant.reason?.text ?? null}
                friends={restaurant.reason?.friends ?? null}
                quality={forMeQualityNote(restaurant)}
              />
              <div className="px-2 pb-1">
                <PickButtons
                  name={restaurant.name}
                  onBeen={() => onMark("been", restaurant)}
                  onHide={() => onMark("hide", restaurant)}
                />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The phone's "For me" list: Discover ranked for the visitor, in the wall's
 * two uneven columns, each card saying why it is here.
 *
 * `view` is whatever `useDiscoverQuery` has resolved, and it is the personal
 * answer only once `view.forMe` is set — until then (a bare `?foryou=1` lands
 * on the static shell) this draws a skeleton. A text search pauses For me on
 * the server (`forMe.paused`, no reasons); the screen sends that case to the
 * ordinary results, and a paused answer that reaches here is treated as not
 * arrived yet.
 *
 * `forMe.matched` splits the results: the leading run fits the visitor, the
 * rest is the "Also well rated" tail (decision D4). For a visitor the app has
 * nothing on (`basis: "none"`) it is all tail, under the cuisine prompt.
 *
 * Ranking is the server's. `useTaste` is here for the controls only — the
 * chips, the buttons, the Tune sheet. A love, unlove, skip, unskip or reset
 * bumps the revision `useDiscoverQuery` keys on, so the list re-asks by itself;
 * Been here and Not for me do not, so the card is dropped locally (`gone`) and
 * the next answer, which carries the pick in its prefs, leaves it out.
 */
export function PhoneForMeResults({
  view,
  pending,
  viewKey,
  clearHref,
  moreHref,
  escapeHref,
  failed,
  onRetry,
  nearby,
  cuisines,
}: {
  view: DiscoverPage;
  pending: boolean;
  viewKey: string;
  clearHref: string;
  moreHref: string;
  /** The same screen with For me off — the way out of a skeleton that never resolves. */
  escapeHref: string;
  /** The request for this list failed and nothing is in flight (`failed` in useDiscoverQuery). */
  failed: boolean;
  onRetry: () => void;
  /** The query's own `useNearby`; see the note on `PhoneDiscoverResults`. */
  nearby: Nearby;
  /** Every cuisine, for the prompt and the Tune sheet. */
  cuisines: string[];
}) {
  const { filters } = view;
  const info = view.forMe;
  const taste = useTaste();
  const pathname = usePathname() ?? "/m";
  const headingId = useId();
  const [editing, setEditing] = useState(false);

  /* Focus to the list once a new answer lands, not on mount, so a screen reader
     announces it instead of staying on the chip. The position is asked for in
     useDiscoverQuery (For me asks, as does any filter). */
  const listRef = useRef<HTMLDivElement | null>(null);
  const skipNextFocus = useRef(true);
  useEffect(() => {
    if (skipNextFocus.current) {
      skipNextFocus.current = false;
      return;
    }
    listRef.current?.focus();
  }, [viewKey]);

  /* Places the visitor has just waved off. Cleared whenever a new page lands,
     because that page was asked for with the pick already in its prefs. */
  const [seenView, setSeenView] = useState(view);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  if (seenView !== view) {
    setSeenView(view);
    setGone(new Set());
  }

  /* The Undo is this list's own rather than `taste.undo`: that one exists only
     for a place in the Your taste strip's picks, which a For me result usually
     is not. Fixed to the viewport for the same reason the feed's banner is —
     an inline bar would sit up at the top of a list the thumb is a screen or
     three below. */
  const [undo, setUndo] = useState<{ label: string; run: () => void } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const mark = (kind: "been" | "hide", restaurant: DiscoverResult) => {
    taste.apply({ kind, value: restaurant.id });
    setGone((prev) => new Set(prev).add(restaurant.id));
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({
      label:
        kind === "hide" ? `Hidden ${restaurant.name}` : `Marked ${restaurant.name} as been`,
      run: () => {
        if (undoTimer.current) clearTimeout(undoTimer.current);
        setUndo(null);
        setGone((prev) => {
          const next = new Set(prev);
          next.delete(restaurant.id);
          return next;
        });
        taste.apply({ kind: kind === "hide" ? "unhide" : "unbeen", value: restaurant.id });
      },
    });
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };

  if (!info || info.paused) {
    return <ForMeSkeleton escapeHref={escapeHref} failed={failed} onRetry={onRetry} />;
  }

  const { loves, skips } = taste.prefs;
  const matches = view.results.slice(0, info.matched).filter((r) => !gone.has(r.id));
  const tail = view.results.slice(info.matched).filter((r) => !gone.has(r.id));

  return (
    <section aria-labelledby={headingId} aria-busy={pending} className="pb-2">
      <div className="flex items-start justify-between gap-3 px-4 pb-2">
        <div className="min-w-0 pt-1">
          <h2 id={headingId} className="mono-label text-pm-grey-text">
            For me
          </h2>
          {/* The server's sentence about what the list was built from — "Based
              on 3 places you've been" — and absent when it has nothing to say. */}
          {info.header && (
            <p className="mt-1 text-[13px] leading-snug text-pm-grey-text">
              <ReasonText text={info.header} />
            </p>
          )}
          {/* What the list has learned — usual plate, usual distance, top
              cuisines — as one quiet line; absent when it has learned nothing. */}
          {info.profile && (
            <ForMeProfileLine
              profile={info.profile}
              className="mt-1 text-[13px] leading-snug text-pm-grey-text"
            />
          )}
        </div>
        {info.basis !== "none" && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mono-label -mr-2 flex min-h-11 shrink-0 items-center px-2 text-pm-grey-text underline underline-offset-2"
          >
            Tune
          </button>
        )}
      </div>

      {failed && (
        <p role="status" className="px-4 pb-3 text-[13px] leading-snug text-pm-grey-text">
          Couldn&apos;t refresh this list.{" "}
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Try again
          </button>
        </p>
      )}

      {view.results.length === 0 ? (
        <div
          ref={listRef}
          tabIndex={-1}
          className={`px-4 py-16 text-center outline-none transition-opacity focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange ${
            pending ? "opacity-60" : ""
          }`}
        >
          <p className="font-display text-lg text-zinc-900">Nothing matches that</p>
          <p className="mx-auto mt-1 max-w-[15rem] text-sm leading-snug text-pm-grey-text">
            Every row under Filters shows how many places it would return.
          </p>
          <Link
            href={clearHref}
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Clear filters
          </Link>
        </div>
      ) : (
        <div
          ref={listRef}
          tabIndex={-1}
          className={`outline-none transition-opacity focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange ${
            pending ? "opacity-60" : ""
          }`}
        >
          {/* Nothing to go on: ask, rather than hand a stranger a list that
              claims to be theirs. The well-rated places follow regardless, so
              the page is never just a question. */}
          {info.basis === "none" && taste.status !== "loading" && (
            <div className="pb-4">
              <TastePrompt cuisines={cuisines} taste={taste} pathname={pathname} />
            </div>
          )}

          {matches.length > 0 && (
            <ForMeGrid
              items={matches}
              filters={filters}
              coords={nearby.coords}
              priority
              onMark={mark}
            />
          )}

          {/* Filters can leave nothing that fits and still leave places: say so
              before the tail, so the first card below does not pass for a match. */}
          {info.basis !== "none" && matches.length === 0 && tail.length > 0 && (
            <p className="px-4 pb-2 text-[13px] leading-snug text-pm-grey-text">
              Nothing here fits your taste yet.
            </p>
          )}

          {tail.length > 0 && (
            <>
              <div className="flex items-center gap-3 px-4 pb-3 pt-6">
                <h3 className="mono-label shrink-0 text-pm-grey-text">Also well rated</h3>
                <span aria-hidden="true" className="h-px flex-1 bg-pm-grey-tint" />
              </div>
              <ForMeGrid
                items={tail}
                filters={filters}
                coords={nearby.coords}
                priority={matches.length === 0}
                onMark={mark}
              />
            </>
          )}
        </div>
      )}

      {view.total > view.shown && (
        <div className="px-4 pt-4">
          <Link
            href={moreHref}
            /* A full-width white pill: a thumb target, not a text link. */
            className="flex min-h-12 w-full items-center justify-center rounded-full bg-white text-sm font-medium text-zinc-900 transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Show more
            <span className="ml-1.5 font-mono text-xs tabular-nums text-zinc-500">
              {view.shown} / {view.total}
            </span>
          </Link>
        </div>
      )}

      {undo && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(var(--phone-nav-space,0px)+0.75rem)] z-40 flex items-center justify-between rounded-xl bg-pm-charcoal pl-4 text-[13px] text-[#F7F4EC]"
        >
          <span className="truncate">{undo.label}</span>
          <button
            type="button"
            onClick={undo.run}
            className="min-h-11 shrink-0 px-4 font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Undo
          </button>
        </div>
      )}

      {editing && (
        <EditSheet
          cuisines={cuisines}
          loves={loves}
          skips={skips}
          onLove={(c) => taste.apply({ kind: loves.includes(c) ? "unlove" : "love", value: c })}
          onSkip={(c) => taste.apply({ kind: skips.includes(c) ? "unskip" : "skip", value: c })}
          onReset={() => {
            // Reset un-hides and un-beens everything: the cards waved off here
            // and the Undo for the last of them are no longer true.
            if (undoTimer.current) clearTimeout(undoTimer.current);
            setUndo(null);
            setGone(new Set());
            taste.apply({ kind: "reset" });
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  );
}
