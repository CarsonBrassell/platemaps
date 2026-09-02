"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

/**
 * The first-run tour: a walk through the app's own controls, driven by using
 * them.
 *
 * There is no Next button, and that is the whole design. Everything except one
 * control is dimmed, the caption says what that control is for, and the only
 * way forward is to **press the real thing** — which navigates, the way it
 * always does. By the end somebody has not been shown the feed, the map,
 * Discover, Friends, their profile and the composer; they have been to all six.
 *
 * What it says is what PRODUCT.md says the product is. What it deliberately
 * does not mention is Plate Points: PRODUCT.md is explicit that the points
 * economy is a supply-side mechanism and must never be presented as the
 * differentiator, and the screen where somebody is working out what this app is
 * for is the worst possible place to break that.
 *
 * ## It has to survive navigation, so it lives in the layout
 *
 * Every step ends in a route change, which unmounts whatever page rendered it.
 * So this is mounted once in the root layout — `/m` nests under it, so one
 * mount covers both bodies — and the position in the walk is kept in
 * `sessionStorage` rather than in React state alone. A reload mid-tour resumes
 * where it was; closing the tab ends it without latching, and the next visit
 * starts over.
 *
 * ## It points; it does not trap
 *
 * The dim is one SVG rect with a rounded rectangle masked out of it, and the
 * whole overlay is `pointer-events: none` — the app underneath stays entirely
 * live. Two things follow, and both are corrections of the first version.
 *
 * **Nothing is blocked.** Four transparent panes used to ring the hole and eat
 * every press outside it, which made the walk a cage: you could not scroll a
 * card, open a filter or read the screen you had just been sent to look at
 * until you had pressed the one control it wanted. Pressing anything else now
 * does what it always does, and folds the mark away to a small badge you can
 * tap to bring back.
 *
 * **No step interrupts an arrival.** Each one ends by sending somebody to a
 * screen they have never seen, and the mark used to land the instant they got
 * there — being marched through the app rather than shown around it. A step
 * now waits (`LOOK_MS`) before it says anything.
 *
 * ## The anchors, and the fragility that comes with them
 *
 * Targets are found by `data-coach="<key>"` in the live DOM rather than by
 * measuring a component this file imports. That is what lets one tour serve
 * both bodies: `feed`, `discover`, `friends`, `profile` and `post` are marked
 * on the header row, the mobile bar *and* the phone nav, and whichever is on
 * screen resolves — a hidden nav measures 0×0 and is skipped.
 *
 * A step whose anchor is not on the current page renders nothing and waits
 * rather than drawing a spotlight on empty ground. That is why `map` sits
 * immediately after `feed`: the map tab only exists on the feed screen, and the
 * step before it is the one that takes you there.
 */

type Step = {
  /** Matches `data-coach` in the DOM. */
  key: string;
  title: string;
  body: string;
  /** What pressing the marked control will do, in the machine voice. */
  hint: string;
};

const STEPS: Step[] = [
  {
    key: "feed",
    title: "Start at the feed",
    body: "Plates people posted near you, the newest and the hottest first. Each one is a dish somebody actually ordered.",
    hint: "Tap Feed",
  },
  {
    key: "map",
    title: "The same plates, on a map",
    body: "Pins instead of cards, so you can choose by what is close enough to walk to tonight.",
    hint: "Tap the map",
  },
  {
    key: "discover",
    title: "Or go looking",
    body: "Browse restaurants by neighbourhood, cuisine, price, and what is open right now.",
    hint: "Tap Discover",
  },
  {
    key: "friends",
    title: "Your people eat here too",
    body: "Friends get their own feed — and you see their photos, which stay private to everyone else by default.",
    hint: "Tap Friends",
  },
  {
    key: "profile",
    title: "Everything you have kept",
    body: "Your plates, the ones you saved to order later, and what you have earned for posting them.",
    hint: "Tap Profile",
  },
  {
    key: "post",
    title: "Now add one",
    body: "A photo, the dish off the restaurant's real menu, and how good it was. Yours is what somebody else orders tomorrow.",
    hint: "Tap to finish",
  },
];

/** Breathing room between the target's own edge and the edge of the hole. */
const PAD = 8;

/**
 * How long a new screen belongs to the person before the next mark appears.
 *
 * The first step is short because nothing has happened yet — a blank pause on
 * arrival reads as the app being broken, not as an invitation. Every step after
 * it has just moved somebody somewhere new, and that is exactly when they want
 * to look before being told anything.
 */
const SETTLE_MS = 700;
const LOOK_MS = 4500;

/** Where the walk is up to, so a route change does not lose it. */
const STEP_KEY = "pm-coach-step";

function readStep(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.sessionStorage.getItem(STEP_KEY);
  const n = raw === null ? 0 : Number(raw);
  return Number.isInteger(n) && n >= 0 && n < STEPS.length ? n : 0;
}

/**
 * The first element carrying this key that is actually on screen.
 *
 * `getBoundingClientRect` rather than `offsetParent`, because the phone nav's
 * variants and the header row are hidden with `hidden`/`xl:` utilities in
 * different ways, and a zero-area rect is the one signal all of them share.
 */
function findAnchor(key: string): HTMLElement | null {
  const found = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-coach="${key}"]`)
  ).find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return found ?? null;
}

type Rect = { top: number; left: number; width: number; height: number };

export function CoachTour({ onDone }: { onDone: () => void }) {
  const { updateSettings } = useAuth();
  /* Not read, but depended on: a route change has to re-run the effect that
     hunts for the anchor, or the tour keeps measuring the page it left. */
  const pathname = usePathname();

  const [index, setIndex] = useState(readStep);
  const [rect, setRect] = useState<Rect | null>(null);
  const finished = useRef(false);

  const step = STEPS[index] ?? STEPS[0];

  /*
   * Find the marked control and keep its rectangle current.
   *
   * A poll rather than a one-shot measurement, because the thing being waited
   * for is genuinely asynchronous: the anchor may not exist yet (the map tab
   * arrives with the feed screen), and once it does it can still move under a
   * scroll, a rotation, or a nav bar changing size. 120ms is well under the
   * threshold where a hole visibly lags its target.
   */
  useEffect(() => {
    const tick = () => {
      const el = findAnchor(step.key);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const first = window.requestAnimationFrame(tick);
    const id = window.setInterval(tick, 120);
    window.addEventListener("resize", tick);
    window.addEventListener("scroll", tick, true);
    return () => {
      window.cancelAnimationFrame(first);
      window.clearInterval(id);
      window.removeEventListener("resize", tick);
      window.removeEventListener("scroll", tick, true);
    };
  }, [step, pathname]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    window.sessionStorage.removeItem(STEP_KEY);
    // Fire-and-forget. Failing to record it means seeing the tour once more,
    // which is a far smaller cost than a nav press that does not navigate
    // because a settings write is in flight.
    void updateSettings({ tourSeen: true });
    onDone();
  }, [onDone, updateSettings]);

  const advance = useCallback(() => {
    setIndex((i) => {
      const nextIndex = i + 1;
      if (nextIndex >= STEPS.length) {
        finish();
        return i;
      }
      /* Written before the navigation this click is about to cause, because
         after it this component is a different instance on a different page. */
      window.sessionStorage.setItem(STEP_KEY, String(nextIndex));
      return nextIndex;
    });
  }, [finish]);

  /*
   * Advance when the marked control is pressed — not when the overlay is.
   *
   * Delegated on the document in the capture phase rather than bound to the
   * element, so it survives the anchor being replaced under it (the nav
   * re-renders on every route change) without re-binding, and so it runs before
   * the link's own handler starts a navigation.
   */
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.(`[data-coach="${step.key}"]`)) return;
      advance();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [step, advance]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") finish();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [finish]);

  /* The step's control is not on this page yet. Wait rather than draw. */
  if (!rect) return null;

  /* Keyed on the step so arriving at the next one *remounts* the mark, which
     is what resets its "have I spoken yet" and "have they wandered off" state.
     Resetting those from an effect instead would be two extra renders and a
     lint rule's worth of argument for a value that a fresh mount gives free. */
  return (
    <StepMark
      key={index}
      step={step}
      index={index}
      rect={rect}
      onFinish={finish}
    />
  );
}

/**
 * One step's mark: the dim, the hole, the caption — and the badge it folds
 * into when somebody would rather look around first.
 */
function StepMark({
  step,
  index,
  rect,
  onFinish,
}: {
  step: Step;
  index: number;
  rect: Rect;
  onFinish: () => void;
}) {
  /**
   * Whether this step has asked for attention yet.
   *
   * Every step ends by sending somebody to a screen they have never seen, and
   * the first version put the next mark up the instant they arrived — so the
   * walk read as being marched through the app rather than shown around it.
   * A step now lands quietly: the screen is theirs first, and the mark follows.
   */
  const [shown, setShown] = useState(false);

  /** Set by looking around — see the outside-click effect. */
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(
      () => setShown(true),
      index === 0 ? SETTLE_MS : LOOK_MS,
    );
    return () => window.clearTimeout(id);
  }, [index]);

  /*
   * Looking around folds the mark away.
   *
   * Nothing is blocked, so a press outside the mark does whatever it normally
   * does — opens a card, runs a filter, scrolls a menu. This listener only
   * notices that it happened and gets the overlay out of the way, leaving a
   * badge to come back to. Bubble phase and after the fact, so it never
   * interferes with the press it is reacting to.
   */
  useEffect(() => {
    if (!shown || collapsed) return;
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest) return;
      // The caption is the tour's own furniture, and the marked control has its
      // own handler that advances the walk. Neither is "looking around".
      if (target.closest("[data-coach-caption]")) return;
      if (target.closest(`[data-coach="${step.key}"]`)) return;
      setCollapsed(true);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [shown, collapsed, step]);

  /* Landed, but not yet asked. See the note on `shown`. */
  if (!shown) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        /* Clear of both bottom navs — MobileNav's bar is ~76px and PhoneNav's
           arc reserves 96px — so the one place it can sit on either body is
           above them, on the left where neither puts a control. */
        className="fixed bottom-28 left-4 z-[60] flex min-h-11 items-center gap-2 rounded-full bg-pm-charcoal px-4 text-[#F7F4EC] transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        <span className="mono-label">Tour</span>
        <span className="font-mono text-[11px] tabular-nums text-[#F7F4EC]/70">
          {index + 1} / {STEPS.length}
        </span>
      </button>
    );
  }

  const hole = {
    x: rect.left - PAD,
    y: rect.top - PAD,
    w: rect.width + PAD * 2,
    h: rect.height + PAD * 2,
  };

  /* The caption goes on whichever side of the hole has room. Placed by an edge
     rather than by a measured height — anchoring the caption's bottom to the
     hole's top means its own height never has to be known. */
  const below = hole.y + hole.h < window.innerHeight * 0.55;

  return (
    <div
      /*
       * `pointer-events-none` across the whole frame, and nothing under it is
       * ever blocked.
       *
       * This used to carry four transparent panes around the hole that ate
       * every press outside the mark. It made the tour a cage: you could not
       * scroll a card, open a filter or read the thing you had just been sent
       * to look at until you had pressed the one control it wanted. The dim is
       * now a *pointer*, not a gate — the app underneath stays entirely usable,
       * and using it folds the overlay away (see the outside-click effect).
       *
       * `pointer-events-none` on the frame is load-bearing rather than
       * tidiness: a full-viewport div catches clicks across its whole area even
       * with no background, so without it the frame swallows the press meant
       * for the marked control and the walk cannot advance.
       *
       * Not `aria-modal`, deliberately, and that is not an oversight now that
       * it does not trap anything: claiming modality would tell a screen reader
       * the rest of the page is inert when it is fully live.
       */
      className="pointer-events-none fixed inset-0 z-[60] animate-fade-in"
      role="region"
      aria-label="A quick tour of PlateMaps"
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <mask id="coach-hole">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="16" fill="black" />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="var(--pm-charcoal)"
          opacity="0.66"
          mask="url(#coach-hole)"
        />
      </svg>

      <div
        data-coach-caption=""
        className="pointer-events-auto absolute inset-x-4 mx-auto max-w-sm"
        style={below ? { top: hole.y + hole.h + 12 } : { bottom: window.innerHeight - hole.y + 12 }}
      >
        <div className="rounded-2xl bg-white p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[16px] font-semibold leading-tight text-zinc-900">
              {step.title}
            </h2>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
              {index + 1} / {STEPS.length}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-snug text-zinc-500">{step.body}</p>

          {/* Said once, on the first step, because it is a rule about the whole
              walk rather than about this screen — and because nothing else on
              screen announces that the dim is not a wall. */}
          {index === 0 && (
            <p className="mt-2 text-[12px] leading-snug text-zinc-400">
              Nothing here is locked — tap anywhere else to look around, and
              this comes back as a small badge.
            </p>
          )}

          <div className="mt-3.5 flex items-center gap-3">
            <button
              type="button"
              onClick={onFinish}
              className="mono-label min-h-11 rounded-full px-3 text-zinc-400 transition-colors hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Skip
            </button>
            {/* Not a button. The instruction is the affordance — the only way
                on is the real control, and a Next here would be a second way
                that skipped the thing the step is about. */}
            <span className="mono-label ml-auto text-pm-orange-text">{step.hint}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Whether the tour runs, and the once-per-visit latch that stops it reopening
 * mid-session.
 *
 * The ref matters because the account object is replaced on every settings
 * write and every refresh — without it, somebody who skipped would have the
 * tour thrown back up the moment anything touched their account.
 */
export function useCoachTour() {
  const { account } = useAuth();
  const [open, setOpen] = useState(false);
  const offered = useRef(false);

  useEffect(() => {
    if (offered.current || !account || account.tourSeen) return;
    offered.current = true;
    setOpen(true);
  }, [account]);

  return { open, close: () => setOpen(false) };
}
