import type { VoteDirection } from "@/components/feed/PostActions";

/**
 * Plays the cast-a-vote animation on one arrow button.
 *
 * Imperative rather than React state, for the same reason `tapFlash` is: the
 * alternative is a `useState` plus a re-key on a control that renders inside
 * every card in the feed, all to drive a class that describes nothing about
 * the component. It also has to survive the button *not* re-rendering — the
 * vote is optimistic, so the parent may not produce a new tree at all.
 *
 * **Only fires when a vote is cast, never when one is taken back.** Undoing is
 * a correction, and a UI that throws a small celebration at a correction reads
 * as sarcastic. The caller decides which case it is; this function just plays.
 *
 * Under `prefers-reduced-motion` the stylesheet drops every keyframe involved,
 * so the class is still added and simply does nothing visible. The timeout
 * still clears it — `animationend` never fires when there is no animation, and
 * a class left on the button forever would block the next replay.
 */

/** Mirrors the longest keyframe in the `.vote-cast-*` rules in globals.css. */
const VOTE_BURST_MS = 300;

export function voteBurst(el: HTMLElement | null, direction: VoteDirection): void {
  if (!el) return;

  const className = direction === "up" ? "vote-cast-up" : "vote-cast-down";

  /* Remove both, force a reflow, then add — this is what replays the
     animation on a second press, and what stops a fast up-then-down leaving
     the previous direction's class behind. */
  el.classList.remove("vote-cast-up", "vote-cast-down");
  void el.offsetWidth;
  el.classList.add(className);

  const clear = () => {
    window.clearTimeout(timer);
    el.removeEventListener("animationend", clear);
    el.classList.remove(className);
  };
  const timer = window.setTimeout(clear, VOTE_BURST_MS + 60);
  /* The button runs three animations at once (mark, streak, ring); the first
     `animationend` to arrive is close enough to the end for a cleanup, and the
     timer is the backstop for the case where none fires at all. */
  el.addEventListener("animationend", clear);
}
