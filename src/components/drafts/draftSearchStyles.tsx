/**
 * DRAFT SURFACE — motion for the three `/drafts/map-search` variants.
 *
 * Kept in a `<style>` the draft renders rather than in `globals.css` on purpose:
 * nothing about this experiment should end up in the stylesheet every shipped
 * page downloads, and the whole thing disappears with the folder. Exactly one
 * variant mounts per route, so there is never a second copy on the page.
 *
 * Every rule below moves `transform` and `opacity` only — never width, height or
 * a layout property — so the map behind the field never re-lays-out mid
 * animation. Enter is 200ms on `cubic-bezier(0.16, 1, 0.3, 1)`; exit is 130ms
 * (65% of it) on ease-in, because arriving is the part worth watching and
 * leaving is not. Under `prefers-reduced-motion` every one of them collapses to
 * the finished state — the panel still appears and disappears, it just does not
 * travel.
 */
const CSS = `
@keyframes dms-list-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to   { opacity: 1; transform: none; }
}
@keyframes dms-list-out {
  from { opacity: 1; transform: none; }
  to   { opacity: 0; transform: translateY(-4px) scale(0.99); }
}
.dms-list-in  { animation: dms-list-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.dms-list-out { animation: dms-list-out 130ms ease-in both; }

/* The lantern's rest/expanded swap. Two absolutely-positioned layers crossing
   over, anchored to the same right edge — NOT a width transition, which is both
   a layout property and the thing that makes an expanding search field feel
   rubbery. The field appears to grow out of the button because it scales from
   that edge, and its text is off by 4% for 200ms rather than reflowing. */
@keyframes dms-grow-in {
  from { opacity: 0; transform: scaleX(0.96); }
  to   { opacity: 1; transform: none; }
}
@keyframes dms-grow-out {
  from { opacity: 1; transform: none; }
  to   { opacity: 0; transform: scaleX(0.97); }
}
.dms-grow-in  { transform-origin: right center; animation: dms-grow-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.dms-grow-out { transform-origin: right center; animation: dms-grow-out 130ms ease-in both; }

@keyframes dms-fade-in  { from { opacity: 0; } to { opacity: 1; } }
.dms-fade-in { animation: dms-fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both; }

/* The lantern's discoverability answer, and the reason the icon-only rest state
   is allowed at all: the label is real text in the DOM, named by the button, and
   it comes forward on hover AND on keyboard focus. A pointer is never the only
   way to learn what the control is. */
.dms-hint {
  opacity: 0;
  transform: translateX(4px);
  transition: opacity 180ms cubic-bezier(0.16, 1, 0.3, 1), transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
}
.dms-lantern-rest:hover .dms-hint,
.dms-lantern-rest:focus-visible .dms-hint {
  opacity: 1;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .dms-list-in,
  .dms-list-out,
  .dms-grow-in,
  .dms-grow-out,
  .dms-fade-in {
    animation: none;
  }
  .dms-list-out,
  .dms-grow-out {
    opacity: 0;
  }
  .dms-hint {
    transition: none;
  }
}
`;

export function DraftSearchStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
