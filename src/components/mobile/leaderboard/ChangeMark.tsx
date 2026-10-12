import type { BoardCtx } from "./types";

/**
 * ▲2 / ▼1 / NEW since the last visit. Rank-change arrows are not votes and
 * keep their glyphs (see the vote-arrow rule in DESIGN.md). The glyph is
 * decorative; the sentence beside it is what a screen reader hears.
 */
export function ChangeMark({ id, ctx }: { id: string; ctx: BoardCtx }) {
  const m = ctx.movement;
  if (!m) return null;
  if (m.isNew.has(id)) {
    return (
      <span className="lb-pop inline-flex rounded-full bg-pm-charcoal px-1.5 py-px font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-[#F7F4EC]">
        New
      </span>
    );
  }
  const d = m.change.get(id) ?? 0;
  if (!d) return null;
  const up = d > 0;
  return (
    <span
      className={`lb-pop inline-flex items-center gap-px rounded-full px-1.5 py-px font-mono text-[10px] font-semibold tabular-nums ${
        up ? "bg-pm-orange text-[#F7F4EC]" : "bg-pm-grey-tint text-pm-grey-text"
      }`}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span aria-hidden="true">{Math.abs(d)}</span>
      <span className="sr-only">
        {up ? "up" : "down"} {Math.abs(d)} {Math.abs(d) === 1 ? "place" : "places"} since your last visit
      </span>
    </span>
  );
}
