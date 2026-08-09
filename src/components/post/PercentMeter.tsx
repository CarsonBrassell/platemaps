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
 * this only decides which one applies.
 */
function heatFor(pct: number) {
  if (pct >= 95) return "blazing";
  if (pct >= 80) return "hot";
  if (pct >= 40) return "warm";
  return "cool";
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
          <span
            key={heat === "blazing" || heat === "hot" ? value : "still"}
            className={`font-display block text-4xl font-semibold leading-none tracking-tight tabular-nums ${
              heat === "blazing" || heat === "hot" ? "pct-kick" : ""
            } ${heat === "cool" ? "text-zinc-500" : "text-pm-orange-text"}`}
          >
            {value}%
          </span>
        </p>
      </div>

      <div className="meter-shell" data-heat={heat} style={{ ["--fill" as string]: fill }}>
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
          style={{ ["--fill" as string]: fill }}
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
