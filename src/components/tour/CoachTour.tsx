"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

/**
 * The first-run tour: a walk through the app's own controls, driven by using
 * them.
 *
 * There is no Next button on a move, and that is the whole design. Everything
 * except one control is dimmed, the caption says what that control is for, and
 * the only way forward is to **press the real thing** — which navigates, the
 * way it always does. By the end somebody has not been shown the feed, the map,
 * Discover, Friends, their profile and the composer; they have been to all six.
 *
 * What it says is what PRODUCT.md says the product is. What it deliberately
 * does not mention is Plate Points: PRODUCT.md is explicit that the points
 * economy is a supply-side mechanism and must never be presented as the
 * differentiator, and the screen where somebody is working out what this app is
 * for is the worst possible place to break that.
 *
 * ## Nothing here runs on a clock
 *
 * Every step appears the moment it can and stays until *the person* moves it
 * on — a move by pressing its control, a dwell by pressing "I'm done". An
 * earlier version paced the walk with timers: a pause before each mark, and
 * dwells that expired on their own. Both were wrong for the same reason. A
 * timer is a guess about how long somebody needs, and it is always wrong in
 * one direction — it interrupts the reader and bores the skimmer — where a
 * button is right for both.
 *
 * ## It has to survive navigation, so it lives in the layout
 *
 * Every move ends in a route change, which unmounts whatever page rendered it.
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
 * live. Pressing anything other than the marked control does what it always
 * does, and folds the mark away to a small badge you can tap to bring back.
 * The one exception is a dwell that asks for a single gesture (`lock`), and it
 * says so on its face.
 *
 * ## The anchors, and the fragility that comes with them
 *
 * Targets are found by `data-coach="<key>"` in the live DOM rather than by
 * measuring a component this file imports. That is what lets one tour serve
 * both bodies: `feed`, `discover`, `friends`, `profile` and `post` are marked
 * on the header row, the mobile bar *and* the phone nav, and whichever is on
 * screen resolves — a hidden nav measures 0×0 and is skipped.
 *
 * A control that is on the page but scrolled out of view is scrolled *into*
 * view once, when the step starts, and never again — a spotlight on a card
 * above the fold is a spotlight on nothing, but a spotlight that keeps
 * dragging the page back is a fight.
 *
 * A move whose control is not on the current page at all does not draw on
 * empty ground, but it does not go silent either — that was the old
 * behaviour, and it left somebody who had wandered off the feed mid-walk with
 * a tour that had simply vanished. Now a step that knows where its control
 * lives (`home`) marks the nav button that leads back there, and one that
 * cannot find anything for a couple of seconds says so and offers a way on.
 * The order is still load-bearing: `map` only exists on the feed screen, so
 * the step before it is the one that takes you there, and `feedtab` brings
 * you back for `restaurant`.
 */

/**
 * A beat in the walk. There are two kinds and the shape says which:
 *
 * - **A move** carries a `key` and a `hint`. It marks a real control and waits;
 *   pressing that control is what advances it, and what does the navigating.
 * - **A dwell** carries neither. Nothing is marked and nothing is dimmed — it
 *   hands the screen over ("have a look"), and stays until "I'm done".
 *
 * The alternation is the point. A walk made only of moves marches somebody
 * through six screens without ever letting them stand on one.
 */
type Step = {
  /** Matches `data-coach` in the DOM. Absent on a dwell. */
  key?: string;
  title: string;
  body: string;
  /** What pressing the marked control will do, in the machine voice. */
  hint?: string;
  /**
   * A dwell that wants one gesture and nothing else.
   *
   * `"scroll"` swallows presses until "I'm done" while leaving scrolling —
   * wheel, trackpad, a vertical drag, the keyboard — completely free. It exists
   * because a dwell that says "have a scroll" and then lets you press Profile
   * does not just lose its own point: the step after it expects an anchor on
   * *this* screen, so wandering off mid-dwell can strand the walk on a page
   * where the next mark does not exist.
   *
   * Only for dwells whose instruction is a single gesture. The map and the
   * filters both ask to be *used*, and locking either would be asking somebody
   * to explore a screen they cannot touch.
   */
  lock?: "scroll";
  /**
   * The nav control that leads back to the screen this step's control lives
   * on. Three marks — `map`, `feedtab`, `restaurant` — exist only on the feed
   * screen; if somebody is anywhere else when one of those steps comes up, the
   * Feed button is marked instead, with a hint saying why, and the mark moves
   * to the real control the moment it is back on screen. Pressing the home
   * control never advances the walk — it just navigates, the way it always
   * does.
   */
  home?: string;
};

const STEPS: Step[] = [
  {
    key: "feed",
    title: "Start at the feed",
    body: "Plates people posted near you, newest and hottest first.",
    hint: "Tap Feed",
  },
  {
    title: "Have a scroll",
    body: "Every card is one dish somebody ordered — not a restaurant. The percent belongs to that plate.",
    lock: "scroll",
  },
  {
    key: "map",
    home: "feed",
    title: "The same plates, on a map",
    body: "Pins instead of cards, so you can pick by what is close enough to walk to tonight.",
    hint: "Tap the map",
  },
  {
    title: "Look around",
    body: "Drag it, pinch it, tap a pin. Brighter pins are the better-rated ones; dim means closed right now.",
  },
  {
    key: "feedtab",
    home: "feed",
    title: "Back to the cards",
    body: "The map and the feed are the same plates drawn two ways.",
    /* "Up top": the phone nav has a Feed button too, and pressing that one
       instead does nothing here — the tab is the control that leaves the map. */
    hint: "Tap Feed, up top",
  },
  {
    key: "restaurant",
    home: "feed",
    title: "Open a plate",
    body: "The orange line on a card is the dish. It opens the restaurant it came from.",
    hint: "Tap a dish",
  },
  {
    title: "Every dish has its own score",
    body: "Nobody types in a rating for the restaurant. Its number is what its plates add up to — weighted by how many people rated each one — so a great place can still hold a weak dish, and you can see which is which.",
  },
  {
    key: "discover",
    title: "Or go looking",
    body: "Browse by neighbourhood, cuisine, price, and what is open right now.",
    hint: "Tap Discover",
  },
  {
    title: "Narrow it down",
    body: "Every filter counts what it would leave you, so you can see the size of a choice before you make it.",
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

/** What the caption says while a step is marking its `home` control instead. */
const HOME_HINTS: Record<string, string> = {
  feed: "Tap Feed to get back",
};

/** Breathing room between the target's own edge and the edge of the hole. */
const PAD = 8;

/**
 * The band at the foot of the viewport that a bottom nav covers — PhoneNav's
 * arc reserves 96px, MobileNav's bar is ~76px. A control whose rect ends in
 * this band is "on screen" by the numbers and under a bar in fact, so it does
 * not count as fully visible.
 */
const NAV_RESERVE = 96;

/**
 * How long a move waits for its control before admitting it cannot find one.
 * Long enough to cover a page still rendering after a navigation — the feed's
 * cards arrive a beat after its shell — and short enough that somebody who has
 * genuinely landed somewhere without the control is not left staring.
 */
const LOST_AFTER_MS = 2500;

/** Where the walk is up to, so a route change does not lose it. */
const STEP_KEY = "pm-coach-step";

/**
 * The signed-out half of the latch.
 *
 * `localStorage` rather than `sessionStorage`, because "I have already had the
 * tour" should outlive the tab the way the account flag does. Wrapped because a
 * browser with storage denied throws on the read, and a tour that crashes the
 * layout is worse than a tour that shows twice.
 */
const SEEN_KEY = "pm-tour-seen";

function readLocalSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeLocalSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage denied. Worth nothing more than seeing the tour again.
  }
}

function readStep(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.sessionStorage.getItem(STEP_KEY);
  const n = raw === null ? 0 : Number(raw);
  return Number.isInteger(n) && n >= 0 && n < STEPS.length ? n : 0;
}

type Visibility = "full" | "part" | "none";

/** How much of a rect a person can actually see and press. */
function visibility(r: DOMRect): Visibility {
  if (r.top >= 0 && r.bottom <= window.innerHeight - NAV_RESERVE) return "full";
  if (r.bottom > 0 && r.top < window.innerHeight) return "part";
  return "none";
}

/**
 * The element carrying this key that somebody can see best.
 *
 * `getBoundingClientRect` rather than `offsetParent`, because the phone nav's
 * variants and the header row are hidden with `hidden`/`xl:` utilities in
 * different ways, and a zero-area rect is the one signal all of them share.
 *
 * Fully visible beats partly visible beats anywhere in the document. Marks like
 * `restaurant` sit on every feed card, so "the first in the DOM" can easily be a
 * card scrolled off the top, and "the first on screen" can be one whose dish
 * line is under the nav bar.
 *
 * `held` is the element the previous tick chose. It keeps priority while it is
 * still fully visible, so a scroll that brings a second card into view does
 * not make the spotlight hop between them.
 */
function findAnchor(key: string, held: HTMLElement | null): HTMLElement | null {
  if (held?.isConnected && held.dataset.coach === key) {
    const r = held.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && visibility(r) === "full") return held;
  }
  const live = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-coach="${key}"]`)
  ).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const full = live.find((el) => visibility(el.getBoundingClientRect()) === "full");
  const part = full ?? live.find((el) => visibility(el.getBoundingClientRect()) === "part");
  return part ?? live[0] ?? null;
}

/** The nearest ancestor that scrolls, or null for the document. */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

/**
 * Scroll a control that is on the page but out of view into it. Returns
 * whether anything was scrolled, so the caller knows to measure again rather
 * than draw the hole where the control *was*.
 *
 * Two kinds of ancestor change the answer. A fixed one means the control is
 * never off screen — it only looks "part" visible because a bottom nav sits in
 * the reserve band — so there is nothing to do. A sticky one means the control
 * rides a bar that hides itself as the page scrolls down (PhoneStickyBar), and
 * that bar declines to re-show for a programmatic scroll of a few pixels — it
 * only reacts to a *person* scrolling up (measured in Chrome, 2026-09-05).
 * What it does honour is being back at depth zero, so the scroller goes to the
 * top, which for a bar that lives at the top of its screen is also the right
 * place to be.
 */
function bringIntoView(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const pos = getComputedStyle(n).position;
    if (pos === "fixed") return false;
    if (pos === "sticky") {
      const scroller = scrollerOf(n);
      if (scroller) scroller.scrollTop = 0;
      else window.scrollTo(0, 0);
      return true;
    }
  }
  el.scrollIntoView({ block: "center" });
  return true;
}

type Rect = { top: number; left: number; width: number; height: number };

/**
 * What the step is pointing at right now: its own control, or — when that is
 * not on this page — the `home` control that leads back to it.
 */
type Target = { kind: "own" | "home"; rect: Rect };

function toRect(r: DOMRect): Rect {
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function sameTarget(a: Target | null, b: Target): boolean {
  return (
    a !== null &&
    a.kind === b.kind &&
    a.rect.top === b.rect.top &&
    a.rect.left === b.rect.left &&
    a.rect.width === b.rect.width &&
    a.rect.height === b.rect.height
  );
}

export function CoachTour({ onDone, fresh }: { onDone: () => void; fresh: boolean }) {
  const { account, updateSettings } = useAuth();
  const pathname = usePathname();

  /* A `?tour=1` replay always starts at the top. The resume key is for a
     reload in the middle of a first run; a replay that honoured it would pick
     up wherever the last abandoned one stopped, which on a signed-in account
     is the only kind there is. */
  const [index, setIndex] = useState(() => (fresh ? 0 : readStep()));
  /* The same number, readable from a handler without a stale closure. `advance`
     used to compute the next step inside a `setIndex` updater and call
     `finish` from there — which runs `onDone`, the parent's setState, in the
     middle of a render, and runs twice under strict mode. A ref keeps the
     arithmetic in the handler where side effects belong. */
  const indexRef = useRef(index);
  const [target, setTarget] = useState<Target | null>(null);
  /* The situation a step has given up finding its control in — see the
     timer below. Compared against the current one rather than reset by an
     effect, so arriving on a new page or step starts the wait over for free. */
  const [lostIn, setLostIn] = useState<string | null>(null);
  const held = useRef<HTMLElement | null>(null);
  const nudged = useRef<string | null>(null);
  const finished = useRef(false);

  const step = STEPS[index] ?? STEPS[0];
  /* One step on one page. Everything that should happen once per "arrival" —
     the scroll-into-view, the lost timer — is keyed on this. */
  const situation = `${index}@${pathname}`;

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
    const key = step.key;
    if (!key) return;
    const home = step.home;
    const tick = () => {
      const own = findAnchor(key, held.current);
      held.current = own;
      if (own) {
        const r = own.getBoundingClientRect();
        if (visibility(r) !== "full" && nudged.current !== situation) {
          nudged.current = situation;
          // Measure again next tick, once the scroll has happened.
          if (bringIntoView(own)) return;
        }
        const next: Target = { kind: "own", rect: toRect(r) };
        setTarget((prev) => (sameTarget(prev, next) ? prev : next));
        return;
      }
      /* Not on this page. Point at the way back — unless the way back is
         where we already are, in which case the control is missing for some
         other reason (an empty feed, a page still rendering) and marking Feed
         on the feed would be a lie. */
      const fallback = home ? findAnchor(home, null) : null;
      if (fallback && fallback.getAttribute("aria-current") !== "page") {
        const next: Target = { kind: "home", rect: toRect(fallback.getBoundingClientRect()) };
        setTarget((prev) => (sameTarget(prev, next) ? prev : next));
        return;
      }
      setTarget((prev) => (prev === null ? prev : null));
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
  }, [step, situation]);

  /* The grace period. It always runs; it only matters while nothing is found. */
  useEffect(() => {
    if (!step.key) return;
    const id = window.setTimeout(() => setLostIn(situation), LOST_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [step, situation]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    window.sessionStorage.removeItem(STEP_KEY);
    /* Both halves of the latch, and the local one unconditionally: a signed-in
       person who later signs out should not be handed the tour again. */
    writeLocalSeen();
    // Fire-and-forget. Failing to record it means seeing the tour once more,
    // which is a far smaller cost than a nav press that does not navigate
    // because a settings write is in flight. Skipped when signed out, where
    // the write is a guaranteed 401.
    if (account) void updateSettings({ tourSeen: true });
    onDone();
  }, [account, onDone, updateSettings]);

  const advance = useCallback(() => {
    const next = indexRef.current + 1;
    if (next >= STEPS.length) {
      finish();
      return;
    }
    /* Written before the navigation this press is about to cause, because after
       it this component is a different instance on a different page. */
    window.sessionStorage.setItem(STEP_KEY, String(next));
    indexRef.current = next;
    setIndex(next);
  }, [finish]);

  /*
   * Advance when the marked control is pressed — not when the overlay is.
   *
   * Delegated on the document in the capture phase rather than bound to the
   * element, so it survives the anchor being replaced under it (the nav
   * re-renders on every route change) without re-binding, and so it runs before
   * the link's own handler starts a navigation.
   *
   * Only ever the step's own key. While a step is pointing at its `home`
   * control, pressing that just navigates; the walk advances when the real
   * control is pressed on the page it leads to.
   */
  useEffect(() => {
    const key = step.key;
    if (!key) return;
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.(`[data-coach="${key}"]`)) return;
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

  const lost = step.key !== undefined && target === null && lostIn === situation;

  /* A move whose control is not on this page yet. Wait rather than draw — but
     only for the grace period; after that the mark renders in its "lost"
     form. A dwell has nothing to point at and is never held up by this. */
  if (step.key && !target && !lost) return null;

  const detour = target?.kind === "home";
  const markKey = detour ? step.home : step.key;
  const hint = detour && step.home ? (HOME_HINTS[step.home] ?? step.hint) : step.hint;

  /* Keyed on the situation — step *and* page — so arriving at the next step,
     or on another screen, *remounts* the mark, which is what resets its
     "have they wandered off" state. The page is part of it because a mark
     folded away by a tap on the nav must not stay folded on the screen that
     tap opened: the way back is the one thing worth showing there. Resetting
     it from an effect instead would be an extra render and a lint rule's
     worth of argument for a value that a fresh mount gives free. */
  return (
    <StepMark
      key={situation}
      step={step}
      index={index}
      rect={target?.rect ?? null}
      markKey={markKey}
      hint={hint}
      onAdvance={advance}
      onFinish={finish}
    />
  );
}

/**
 * One step's mark: the dim, the hole, the caption — and the badge it folds
 * into when somebody would rather look around first.
 *
 * `rect` null on a move means the control could not be found anywhere and the
 * grace period is up: the caption renders in the dwell's form, says so, and
 * offers a Next — the one place in the walk that has one, because the
 * alternative is a step nobody can complete.
 */
function StepMark({
  step,
  index,
  rect,
  markKey,
  hint,
  onAdvance,
  onFinish,
}: {
  step: Step;
  index: number;
  rect: Rect | null;
  /** The `data-coach` key of whatever the hole is drawn around right now. */
  markKey?: string;
  hint?: string;
  onAdvance: () => void;
  onFinish: () => void;
}) {
  /** Set by looking around — see the outside-click effect. */
  const [collapsed, setCollapsed] = useState(false);

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
    // Never on a dwell: it dims nothing and blocks nothing, so there is no
    // overlay in the way to fold — and folding it would hide the one line
    // telling them what they are meant to be doing while they do it. Nor on
    // a lost mark, for the same reason: it is already a caption, not a wall.
    if (!step.key || !rect || collapsed) return;
    const key = markKey;
    // A real tap on the previous step's control advances the walk in the
    // capture phase, and the browser flushes React between the phases of a
    // user-initiated event — so this mark can be mounted and listening before
    // that same tap reaches the bubble phase, where it looks like a press
    // outside the new mark and folds it away on arrival. Any press that began
    // before this listener existed is not "looking around" on this step.
    const armedAt = performance.now();
    function onClick(e: MouseEvent) {
      if (e.timeStamp <= armedAt) return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest) return;
      // The caption is the tour's own furniture, and the marked control has its
      // own handler that advances the walk (or, on a detour, navigates back to
      // where the walk continues). Neither is "looking around".
      if (target.closest("[data-coach-caption]")) return;
      if (key && target.closest(`[data-coach="${key}"]`)) return;
      setCollapsed(true);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [collapsed, markKey, rect, step]);

  /*
   * The scroll lock: presses are swallowed at the document, in the capture
   * phase, before anything under them can react. A tap on a card or a nav
   * button does nothing until "I'm done"; the caption's own buttons are let
   * through.
   *
   * This used to be a full-screen pane with `touch-action: pan-y`, on the
   * theory that the browser would hand a vertical pan through to the page.
   * It does — to the pane's *own* scroll chain, which is the document, and the
   * document does not scroll under `/m`: `.pm-phone-content` does, and it is
   * not an ancestor of anything mounted in the root layout. So the step that
   * said "have a scroll" was the one step on which scrolling did not work
   * (measured in Chrome, 2026-09-05). Swallowing clicks touches no gesture at
   * all, which is the whole point of a lock that asks for one.
   */
  useEffect(() => {
    if (step.lock !== "scroll") return;
    function swallow(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-coach-caption]")) return;
      e.preventDefault();
      e.stopPropagation();
    }
    document.addEventListener("click", swallow, true);
    return () => document.removeEventListener("click", swallow, true);
  }, [step]);

  /*
   * A dwell: a line at the foot of the screen and nothing else.
   *
   * No dim and no hole, deliberately. A dwell exists to hand the screen over,
   * and dimming a screen you are asking somebody to explore is a contradiction
   * — there is nothing to point at, so pointing furniture would only be in the
   * way. It reads as a caption on the app rather than a layer over it, and it
   * stays until "I'm done".
   *
   * A lost move borrows the same form: the same caption, a line saying the
   * control is not here, and Next in place of "I'm done".
   */
  if (!step.key || !rect) {
    const lost = step.key !== undefined;
    return (
      <div
        data-coach-caption=""
        className="fixed inset-x-4 bottom-28 z-[60] mx-auto max-w-sm animate-fade-in"
      >
        <div className="rounded-2xl bg-pm-charcoal p-4 text-[#F7F4EC]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[16px] font-semibold leading-tight">
              {step.title}
            </h2>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#F7F4EC]/60">
              {index + 1} / {STEPS.length}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-snug text-[#F7F4EC]/75">{step.body}</p>

          {/* Says out loud that presses are being held. A tap that silently
              does nothing reads as a broken app; a tap that does nothing
              after being told so reads as a rule. */}
          {step.lock === "scroll" && (
            <p className="mono-label mt-2.5 text-[#F7F4EC]/45">
              Scrolling only until you&rsquo;re done
            </p>
          )}

          {lost && (
            <p className="mono-label mt-2.5 text-[#F7F4EC]/45">
              That one is not on this screen
            </p>
          )}

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={onFinish}
              className="mono-label min-h-11 rounded-full px-3 text-[#F7F4EC]/50 transition-colors hover:text-[#F7F4EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Skip
            </button>
            {/* The only way a dwell moves on. Orange because it is this
                screen's primary action, and a filled pill rather than the
                move's bare hint text because here it is a button that does
                something, not a description of one somewhere else. */}
            <button
              type="button"
              onClick={onAdvance}
              className="ml-auto min-h-11 rounded-full bg-pm-orange px-5 text-sm font-semibold text-[#F7F4EC] transition-transform hover:brightness-105 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7F4EC]"
            >
              {lost ? "Next" : "I’m done"}
            </button>
          </div>
        </div>
      </div>
    );
  }

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
     hole's top means its own height never has to be known.

     Clamped, because the hole tracks its control wherever that goes, and a
     control half-scrolled off the top would otherwise take the caption with
     it. The clamps keep roughly a caption's height inside the viewport, above
     the nav band at the foot and below the edge at the top. */
  const vh = window.innerHeight;
  const below = hole.y + hole.h < vh * 0.55;
  const style = below
    ? { top: Math.max(8, Math.min(hole.y + hole.h + 12, vh - NAV_RESERVE - 200)) }
    : { bottom: Math.max(NAV_RESERVE, Math.min(vh - hole.y + 12, vh - 200)) };

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
        style={style}
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
            <span className="mono-label ml-auto text-pm-orange-text">{hint}</span>
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
 * ## It does not wait for a login
 *
 * A signed-out visitor is the *most* first-run person there is — somebody who
 * has just opened the app and is deciding what it is for. Gating the tour on an
 * account meant the one audience it was written for never saw it, and it made
 * the thing untestable locally without signing in first. So the latch has two
 * halves: the account flag when there is an account, `localStorage` when there
 * is not. Signing in later hands over to the account flag, which is the
 * durable one.
 *
 * `loading` is waited on deliberately. Firing on the first render would open
 * the tour for a signed-in returner in the moment before `/api/auth/me`
 * answers, which is exactly the "seen it, do not show me again" case.
 */
export function useCoachTour() {
  const { account, loading } = useAuth();
  const [closed, setClosed] = useState(false);
  /* `?tour=1` replays it on demand — the only way back once either latch is
     set, and how this gets looked at without clearing site data. Read off
     `window` rather than `useSearchParams`, which would opt the whole root
     layout out of static rendering — and read *once*, in the initializer,
     because the first move navigates to a URL without the flag, and a replay
     that re-read it there would close itself on its own first step for
     anyone whose latch is already set. The server sees `false`; nothing is
     rendered from it until `loading` clears, so the pair of renders that has
     to match still does. */
  const [forced] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("tour") === "1"
  );

  /*
   * Derived every render rather than latched into state by an effect.
   *
   * An effect that calls `setOpen` is a second render for something the first
   * one already knew, and it is exactly the cascade the lint rules here refuse.
   * Deriving is also what makes closing stick without a second mechanism: both
   * latches are written before `close` runs, so the next render reads them and
   * agrees. `closed` covers only the gap where neither latch applies — a
   * `?tour=1` replay, which by construction ignores them.
   *
   * Reading `window` during render is safe here because `loading` starts true:
   * the server render and the first client render — the pair that has to match
   * — both bail out above this line.
   */
  if (loading) return { open: false, fresh: false, close: () => setClosed(true) };

  const seen = account ? account.tourSeen : readLocalSeen();

  return { open: !closed && (forced || !seen), fresh: forced, close: () => setClosed(true) };
}
