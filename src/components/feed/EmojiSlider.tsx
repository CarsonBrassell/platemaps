"use client";

/**
 * A range input that leads with a big reactive emoji.
 *
 * The face is keyed on `value`, so React remounts it on every change and the
 * CSS pop restarts — no state or effect needed to re-fire the animation. The
 * track fill comes from a CSS custom property, since a range input can't be
 * styled with Tailwind alone.
 */
export function EmojiSlider({
  id,
  label,
  hint,
  emoji,
  caption,
  blurb,
  value,
  min,
  max,
  step = 1,
  valueText,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  emoji: string;
  /** Bold text under the emoji — the current stop's name. */
  caption: string;
  /** Optional smaller line under the caption. */
  blurb?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Announced to screen readers instead of the raw number. */
  valueText: string;
  onChange: (next: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-zinc-800">
          {label}
        </label>
        {hint && <span className="text-xs text-zinc-400">{hint}</span>}
      </div>

      <div className="mb-4 flex flex-col items-center text-center">
        <span
          key={value}
          className="emoji-pop select-none text-5xl leading-none"
          role="img"
          aria-hidden="true"
        >
          {emoji}
        </span>
        <p className="font-display mt-2 text-base font-semibold text-zinc-900">{caption}</p>
        {blurb && <p className="mt-0.5 text-xs text-zinc-500">{blurb}</p>}
      </div>

      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
        className="emoji-slider"
        style={{ ["--fill" as string]: `${fill}%` }}
      />
    </div>
  );
}
