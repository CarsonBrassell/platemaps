/**
 * The PlateMaps mark, drawn as vector rather than loaded from logo.png.
 *
 * The PNG was 322x396 with soft edges left over from the white-background
 * colour-key, so it went visibly blurry at the header's size and worse on a
 * retina screen. Vector is exact at any scale and costs no request.
 *
 * `tone` picks the palette: "light" for the dark header, "dark" for pages
 * with a paper background.
 */
export function BrandMark({
  className = "",
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const pinTop = tone === "light" ? "#f0895c" : "#d96f45";
  const pinBottom = tone === "light" ? "#c2512a" : "#a8471f";
  const plate = tone === "light" ? "#fff7f1" : "#fffdfa";
  const id = tone === "light" ? "pm-pin-light" : "pm-pin-dark";

  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="PlateMaps">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pinTop} />
          <stop offset="100%" stopColor={pinBottom} />
        </linearGradient>
      </defs>

      {/* Map pin. The point lands at y=61 so the mark optically centres. */}
      <path
        d="M32 3c-11.6 0-21 9.2-21 20.6 0 6.5 3.2 12 8.1 17.4 4.3 4.7 9.4 9.5 11.6 14.9a1.4 1.4 0 0 0 2.6 0c2.2-5.4 7.3-10.2 11.6-14.9C49.8 35.6 53 30.1 53 23.6 53 12.2 43.6 3 32 3z"
        fill={`url(#${id})`}
      />

      {/* Plate, with a fork and knife flanking it — the same vocabulary as
          PlateStarIcon so the mark and the points badge feel related. */}
      <circle cx="32" cy="23" r="12.4" fill={plate} opacity="0.28" />
      <circle cx="32" cy="23" r="9" fill={plate} />
      <circle cx="32" cy="23" r="4.4" fill={pinBottom} opacity="0.16" />

      <g stroke={plate} strokeWidth="2" strokeLinecap="round">
        <path d="M18.5 15v6.5" />
        <path d="M21.6 15v6.5" />
        <path d="M20 21.5V32" />
        <path d="M45 15c1.5 2.6 1.5 6.3 0 8.8-.5.9-1.4.7-1.4-.3V15" />
        <path d="M44.2 23.5V32" />
      </g>
    </svg>
  );
}

/**
 * Wordmark. "Plate" sits in the display serif, "Maps" picks up the brand
 * orange, and a short rule underlines the join — enough contrast that the
 * two halves read as one lockup rather than a plain string.
 */
export function WordMark({ tone = "light" }: { tone?: "light" | "dark" }) {
  const base = tone === "light" ? "text-white" : "text-zinc-900";
  const accent = tone === "light" ? "text-pm-orange" : "text-pm-orange-text";

  return (
    <span className="relative inline-flex flex-col leading-none">
      <span className={`font-display font-semibold tracking-[-0.03em] ${base}`}>
        Plate<span className={accent}>Maps</span>
      </span>
      <span
        className={`mt-1 h-[2px] w-8 rounded-full bg-gradient-to-r ${
          tone === "light" ? "from-pm-orange to-transparent" : "from-pm-orange-text to-transparent"
        } transition-all duration-300 group-hover:w-full`}
        aria-hidden="true"
      />
    </span>
  );
}
