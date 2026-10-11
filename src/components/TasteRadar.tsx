import type { TasteMatch } from "@/lib/tasteMatch";

/**
 * The radar behind the Taste match card — hand-drawn SVG, shared by the web and
 * phone cards. There is no chart library in this project and a radar is eight
 * lines of trigonometry, so there isn't going to be one.
 *
 * Pass `them` for the two-person Taste match; leave it off for the one-series
 * "Your flavor profile", which draws only the solid shape.
 *
 * Two series, told apart by more than colour: "You" is a solid orange stroke
 * with round points; the friend is a dashed charcoal stroke with square points.
 * Someone who can't tell orange from charcoal still can tell solid from dashed
 * and circle from square. Labels are in the text colour, never a series colour.
 *
 * Spoke values are percent of each person's own posts, scaled to `axisMax` so
 * the shapes fill the grid instead of huddling in the middle; the legend says
 * what the outer ring is (a label on the chart collides with the top spoke's).
 *
 * Stateless, so it renders on the server with the rest of the card.
 */

const W = 440;
const H = 320;
const CX = W / 2;
const CY = H / 2;
const R = 92;
const RINGS = [0.25, 0.5, 0.75, 1];
const LINE = 15;

/** Labels wider than a spoke has room for wrap at the space nearest the middle. */
function wrap(label: string): string[] {
  if (label.length <= 11 || !label.includes(" ")) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return [label.slice(0, best), label.slice(best + 1)];
}

export function TasteRadar({
  match,
  youLabel = "You",
  themLabel,
}: {
  match: Pick<TasteMatch, "spokes" | "you" | "axisMax"> & Partial<Pick<TasteMatch, "them">>;
  youLabel?: string;
  themLabel?: string;
}) {
  const { spokes, you, them, axisMax } = match;
  const n = spokes.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i: number, frac: number) => ({
    x: CX + Math.cos(angle(i)) * R * frac,
    y: CY + Math.sin(angle(i)) * R * frac,
  });
  const poly = (fracs: number[]) =>
    fracs
      .map((f, i) => {
        const p = point(i, f);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(" ");
  const scale = (values: number[]) => values.map((v) => Math.min(1, v / axisMax));

  const youFrac = scale(you);
  /* No `them` is the single-series mode, your own flavor profile: the friend's
     dashed shape, square points and legend entry all go with it. */
  const themFrac = them ? scale(them) : null;

  const summary = spokes
    .map((s, i) =>
      them
        ? `${s}: ${youLabel} ${Math.round(you[i])}%, ${themLabel} ${Math.round(them[i])}%`
        : `${s}: ${Math.round(you[i])}%`,
    )
    .join("; ");

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={them ? `Cuisine mix, ${youLabel} against ${themLabel}` : "Your cuisine mix"}
        className="mx-auto block h-auto w-full max-w-[440px]"
      >
        <desc>{`Share of ${them ? "each person's" : "your"} posts by cuisine. ${summary}.`}</desc>

        {RINGS.map((f) => (
          <polygon
            key={f}
            points={poly(spokes.map(() => f))}
            fill="none"
            className="stroke-zinc-200"
            strokeWidth={f === 1 ? 1.25 : 1}
          />
        ))}
        {spokes.map((s, i) => {
          const p = point(i, 1);
          return (
            <line key={s} x1={CX} y1={CY} x2={p.x} y2={p.y} className="stroke-zinc-200" strokeWidth={1} />
          );
        })}

        {themFrac && (
          <polygon
            points={poly(themFrac)}
            className="fill-pm-charcoal-light stroke-pm-charcoal-light"
            fillOpacity={0.14}
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinejoin="round"
          />
        )}
        <polygon
          points={poly(youFrac)}
          className="fill-pm-orange stroke-pm-orange"
          fillOpacity={0.2}
          strokeWidth={2.25}
          strokeLinejoin="round"
        />

        {themFrac?.map((f, i) => {
          const p = point(i, f);
          return (
            <rect
              key={`t${i}`}
              x={p.x - 3.5}
              y={p.y - 3.5}
              width={7}
              height={7}
              className="fill-pm-charcoal-light"
            />
          );
        })}
        {youFrac.map((f, i) => {
          const p = point(i, f);
          return <circle key={`y${i}`} cx={p.x} cy={p.y} r={4} className="fill-pm-orange" />;
        })}

        {spokes.map((s, i) => {
          const a = angle(i);
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          const lines = wrap(s);
          const anchor = cos > 0.25 ? "start" : cos < -0.25 ? "end" : "middle";
          const p = point(i, 1);
          const x = p.x + cos * 12;
          /* The baseline sits below the point for the lower half, above it for
             the upper half, so a two-line label grows away from the chart. */
          const y =
            sin < -0.3
              ? p.y + sin * 8 - (lines.length - 1) * LINE
              : sin > 0.3
                ? p.y + sin * 8 + 10
                : p.y + 4 - ((lines.length - 1) * LINE) / 2;
          return (
            <text key={s} x={x} y={y} textAnchor={anchor} fontSize={14} className="fill-zinc-800">
              {lines.map((line, k) => (
                <tspan key={k} x={x} dy={k === 0 ? 0 : LINE}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
      </svg>

      {/* The legend is HTML, not SVG: it wraps on a narrow card and its text
          scales with the page rather than with the chart. */}
      <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-zinc-700">
        <li className="flex items-center gap-2">
          <svg width="26" height="10" aria-hidden="true">
            <line x1="0" y1="5" x2="26" y2="5" className="stroke-pm-orange" strokeWidth={2.25} />
            <circle cx="13" cy="5" r="3.5" className="fill-pm-orange" />
          </svg>
          {youLabel}
        </li>
        {themFrac && (
          <li className="flex items-center gap-2">
            <svg width="26" height="10" aria-hidden="true">
              <line
                x1="0"
                y1="5"
                x2="26"
                y2="5"
                className="stroke-pm-charcoal-light"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
              <rect x="9.5" y="1.5" width="7" height="7" className="fill-pm-charcoal-light" />
            </svg>
            {themLabel}
          </li>
        )}
        <li className="font-mono text-zinc-600">Outer ring {axisMax}%</li>
      </ul>
    </div>
  );
}
