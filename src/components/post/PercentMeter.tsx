"use client";

/** The meter's stops, in the product's own voice rather than a bare number. */
const BANDS: ReadonlyArray<{ from: number; label: string }> = [
  { from: 95, label: "Order it twice" },
  { from: 80, label: "Order this" },
  { from: 60, label: "Worth ordering" },
  { from: 40, label: "Depends on the day" },
  { from: 20, label: "Not the one" },
  { from: 0, label: "Skip it" },
];

export function bandForPercent(pct: number) {
  return BANDS.find((b) => pct >= b.from)!.label;
}

/**
 * How excited the meter should look. The paint for each tier lives in CSS —
 * this only decides which one applies. Exported because the feed card's
 * percent verdict wears the same tiers (`.pct-heat`), and two copies of these
 * thresholds would drift.
 */
export function heatFor(pct: number) {
  if (pct >= 95) return "blazing";
  if (pct >= 80) return "hot";
  if (pct >= 40) return "warm";
  return "cool";
}

/** Where the gradient starts opening up. Below this a rating is drawn flat. */
export const HEAT_RAMP_FLOOR = 80;

/**
 * A perfect score, which gets its own treatment: the gradient keeps its
 * colours and a white streak travels across the glyphs (`.pct-shine`).
 *
 * `>=` rather than `===` because the column is NUMERIC and a rating can
 * arrive as 100.0 — and because a value above 100 should look like a top
 * score rather than falling back to the flat paint.
 */
export function isPerfect(pct: number): boolean {
  return pct >= 100;
}

/**
 * How far a rating has climbed past `HEAT_RAMP_FLOOR`, as 0 → 1.
 *
 * The four `heatFor` tiers are steps, and steps are wrong at the top of the
 * scale: 81 and 99 are both "hot" until 95, so the two plates people actually
 * argue about look identical. This is the continuous companion to that — the
 * paint reads it as `--heat` and spreads the gradient's two stops further
 * apart the higher the number goes, so the effect grows with the rating
 * instead of jumping at a threshold.
 *
 * It is 0 at and below 80 on purpose. A gradient is emphasis, and emphasis on
 * a mediocre plate is noise; below the floor every surface keeps drawing the
 * rating the way it did before. That floor is also what lets the phone card
 * use this at all — see the note there about a column of cards where one
 * renders grey-brown because it scored 38.
 */
export function heatRamp(pct: number): number {
  if (pct <= HEAT_RAMP_FLOOR) return 0;
  return Math.min((pct - HEAT_RAMP_FLOOR) / (100 - HEAT_RAMP_FLOOR), 1);
}

/** Where the grey starts creeping in, and where it has fully arrived. */
export const CHILL_RAMP_CEILING = 60;
export const CHILL_RAMP_FLOOR = 40;

/**
 * The mirror of `heatRamp`, running down the other end of the scale: 0 → 1 as
 * a rating falls from 60 to 40, pulling the paint off the accent and into the
 * warm grey the low end has always resolved to.
 *
 * Why it stops at exactly 40 rather than running on to 0: 40 is where
 * `heatFor` flips `warm` → `cool`, and that flip swaps the stop pair
 * underneath the mix. Landing the ramp at 1 on the boundary makes the swap
 * invisible — at a full mix the base contributes nothing, so 41 and 39 paint
 * the same colour and the tier change stops being a visible step. Below 40 the
 * grey simply holds, which is what already shipped.
 *
 * The two ramps can never fire together: this one is finished at 60 and
 * `heatRamp` does not start until 80. Nothing between is touched, and the
 * middle of the scale keeps looking exactly as it did.
 */
export function chillRamp(pct: number): number {
  if (pct >= CHILL_RAMP_CEILING) return 0;
  if (pct <= CHILL_RAMP_FLOOR) return 1;
  return (CHILL_RAMP_CEILING - pct) / (CHILL_RAMP_CEILING - CHILL_RAMP_FLOOR);
}

/**
 * How hard you'd push this dish on someone else, 0–100%.
 *
 * It rides on a native range input rather than pointer maths on a div: drag
 * anywhere, click to jump, arrow keys, Home/End and touch all come for free and
 * behave the way the platform's own controls do. Only the paint is ours — the
 * track is thick enough to read as a meter you are filling, not a slider you are
 * nudging, and the fill is drawn by the element's own background from a `--fill`
 * custom property, the same trick the composer's emoji sliders use.
 *
 * Steps by 1 so 97 and 98 are sayable, and gets visibly hotter as it climbs:
 * colour deepens, the track breathes, and past 80 a sheen travels across the
 * filled portion.
 */
export function PercentMeter({
  id,
  value,
  onChange,
  label,
}: {
  id: string;
  value: number;
  onChange: (pct: number) => void;
  label: string;
}) {
  const heat = heatFor(value);
  const chill = chillRamp(value);
  const fill = `${value}%`;

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-zinc-800">
          {label}
        </label>
        <p className="text-right">
          {/* Keyed on the value so each step re-fires the kick; only at the
              top end, where the extra emphasis is the point. */}
          {/* The numeral takes the chill as a flat colour rather than the
              meter's gradient: both ends of this mix are readable type
              colours, where the meter's light stop is a fill and would not
              hold at 4.5:1. It used to hard-flip to grey at 40; now it walks
              there from 60, in step with the track under it. */}
          <span
            key={heat === "blazing" || heat === "hot" ? value : "still"}
            style={{ ["--chill" as string]: chill }}
            className={`pct-chill-text font-display block text-4xl font-semibold leading-none tracking-tight tabular-nums ${
              heat === "blazing" || heat === "hot" ? "pct-kick" : ""
            }`}
          >
            {value}%
          </span>
        </p>
      </div>

      <div
        className="meter-shell"
        data-heat={heat}
        style={{ ["--fill" as string]: fill, ["--chill" as string]: chill }}
      >
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={`${value} percent — ${bandForPercent(value)}`}
          className="pct-meter"
          data-heat={heat}
          style={{ ["--fill" as string]: fill, ["--chill" as string]: chill }}
        />
      </div>

      <div className="mt-2 flex items-baseline justify-between text-xs">
        <span className="text-zinc-400">0%</span>
        <span
          className={`font-semibold transition-colors ${
            heat === "blazing" ? "text-pm-orange-text" : "text-zinc-900"
          }`}
        >
          {bandForPercent(value)}
        </span>
        <span className="text-zinc-400">100%</span>
      </div>
    </div>
  );
}
