"use client";

import { useRef, useState } from "react";
import { StarIcon } from "@/components/icons";

/** One verdict per star, so the number always arrives with a word attached. */
export const STAR_VERDICTS = [
  "Wouldn't go back",
  "Off night",
  "Fine",
  "Really good",
  "One of the best",
] as const;

export function verdictForStars(stars: number) {
  return STAR_VERDICTS[Math.min(STAR_VERDICTS.length, Math.max(1, stars)) - 1];
}

/**
 * Five stars that fill up to whichever one the pointer is over — hover the
 * fourth and the first four light; hover the fifth and all five do. The preview
 * is driven by `hover`, which falls back to the committed `value`, so letting go
 * of the pointer snaps back to what was actually chosen rather than to empty.
 *
 * Focus counts as hover. A keyboard walking the row with the arrow keys sees the
 * same fill sweep a pointer does, which is the whole point of the control.
 *
 * Built as a radiogroup rather than five toggles: the stars are one value with
 * five stops, and roving tabindex keeps the group a single tab stop.
 */
export function StarPicker({
  value,
  onChange,
  labelledBy,
}: {
  /** 0 means nothing chosen yet. */
  value: number;
  onChange: (stars: number) => void;
  labelledBy: string;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * One place to set the rating, because three things have to move together:
   * the value, the preview the fill is drawn from, and focus — which follows the
   * selection so the group keeps exactly one tab stop.
   */
  function commit(next: number) {
    onChange(next);
    setHover(next);
    buttons.current[next - 1]?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Home") {
      e.preventDefault();
      commit(1);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      commit(5);
      return;
    }
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -1
          : 0;
    if (delta === 0) return;
    e.preventDefault();
    // From nothing, either direction should land on a real rating, not on 0.
    commit(Math.min(5, Math.max(1, (value || (delta > 0 ? 0 : 6)) + delta)));
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        onMouseLeave={() => setHover(0)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(0);
        }}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1"
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const lit = star <= shown;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              ref={(el) => {
                buttons.current[star - 1] = el;
              }}
              aria-checked={value === star}
              aria-label={`${star} ${star === 1 ? "star" : "stars"} — ${verdictForStars(star)}`}
              tabIndex={star === (value || 1) ? 0 : -1}
              onClick={() => commit(star)}
              onMouseEnter={() => setHover(star)}
              onFocus={() => setHover(star)}
              className="flex h-12 w-12 items-center justify-center rounded-xl transition-colors hover:bg-pm-orange-tint/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange sm:h-14 sm:w-14"
            >
              <StarIcon
                className={`star-pick h-9 w-9 sm:h-11 sm:w-11 ${
                  lit ? "text-pm-orange" : "text-zinc-300"
                } ${lit && star === shown ? "star-pick-on" : ""}`}
              />
            </button>
          );
        })}
      </div>

      {/* Reserved line: the verdict appearing must not shove the page down. */}
      <p className="mt-2 min-h-6 text-sm" aria-live="polite">
        {shown > 0 ? (
          <>
            <span className="font-semibold text-zinc-900">{verdictForStars(shown)}</span>
            <span className="text-zinc-500"> · {shown} of 5</span>
          </>
        ) : (
          <span className="text-zinc-400">Tap a star</span>
        )}
      </p>
    </div>
  );
}
