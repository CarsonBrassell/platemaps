/**
 * The composer's tap acknowledgment, and the short hold that makes it visible.
 *
 * **The hold is the point, not the keyframes.** Picking a restaurant or a dish
 * calls `go(index + 1)` the instant it is tapped, so the button unmounts on the
 * same frame — an animation on it had nowhere to play. Any acknowledgment here
 * has to delay the advance by roughly its own length or it does not exist.
 *
 * `TAP_FLASH_MS` is deliberately shorter than the 300ms animation: the first
 * orange beat and the ring both land inside 200ms, and the rest is the bloom
 * fading out, which the outgoing step can play over. Waiting the full 300 makes
 * the composer feel like it is thinking.
 *
 * Written against the DOM rather than as React state on purpose. The
 * alternative is a `useState` + re-key on every one of a dozen rows and chips
 * across two composers, all to drive a class that describes nothing about the
 * component — and a list row's flash must survive the row not re-rendering.
 *
 * **Motion is never load-bearing** (DESIGN.md). Under `prefers-reduced-motion`
 * the class is still added — the stylesheet turns the animation off there — and
 * `then` runs immediately with no hold at all, so someone who has asked for
 * less motion gets a faster composer rather than a stalled one.
 */

/** How long the advance waits so the acknowledgment is seen. */
export const TAP_FLASH_MS = 200;

/** Mirrors the `.tap-flash` rule in globals.css. Change both together. */
const FLASH_DURATION_MS = 300;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * Flashes `el` orange, then runs `then`.
 *
 * Pass the element from the event (`e.currentTarget`) rather than a ref — the
 * handler already has it, and it is always the button that was tapped even when
 * the click landed on a child span.
 */
export function tapFlash(el: HTMLElement | null, then?: () => void): void {
  if (el) {
    /* Removing and forcing a reflow before re-adding is what replays the
       animation on a second tap of the same element; without it the class is
       already present and the browser does nothing. */
    el.classList.remove("tap-flash");
    void el.offsetWidth;
    el.classList.add("tap-flash");

    /* Cleared by whichever comes first, and the timer is not belt-and-braces:
       under `prefers-reduced-motion` the stylesheet sets `animation: none`, so
       `animationend` never fires at all and the class — plus its listener —
       would live forever. A backgrounded tab does the same thing. The element
       keeps working either way, since the remove/reflow/re-add above replays
       from whatever state it is in, but nothing should be left holding a class
       that describes an animation that already finished. */
    const clear = () => {
      window.clearTimeout(timer);
      el.removeEventListener("animationend", clear);
      el.classList.remove("tap-flash");
    };
    const timer = window.setTimeout(clear, FLASH_DURATION_MS + 60);
    el.addEventListener("animationend", clear);
  }

  if (!then) return;
  if (!el || prefersReducedMotion()) {
    then();
    return;
  }
  window.setTimeout(then, TAP_FLASH_MS);
}
