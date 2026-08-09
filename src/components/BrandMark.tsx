/**
 * The PlateMaps pin, straight from the supplied artwork.
 *
 * Two things were making it look blurry, neither of them resolution:
 *
 * 1. logo.png is the full stacked lockup — pin *and* the PLATE/MAPS wordmark.
 *    Fitting all of that into a 64px square left the pin about 30px tall, so
 *    it read as mush. `logo-mark.png` is the same pixels cropped to just the
 *    pin, which lets it fill the space.
 * 2. The original had ~1,150 semi-transparent edge pixels still composited
 *    against white, left over from having its background keyed out. On the
 *    dark header that halo showed as a pale fuzz around every edge. Those
 *    pixels are un-matted in `logo-mark.png` (see scripts note in the commit).
 *
 * The artwork itself is unchanged — nothing redrawn, nothing upscaled.
 */
export function BrandMark({ className = "" }: { className?: string; tone?: "light" | "dark" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-mark.png"
      alt=""
      width={165}
      height={210}
      className={`object-contain ${className}`}
    />
  );
}

/**
 * Wordmark: the name, whole, in the display serif. The pin artwork beside it
 * already carries the brand orange, so the letters stay in ink — the accent
 * color is reserved for percentages, selection, and the primary action.
 */
export function WordMark({ tone = "light" }: { tone?: "light" | "dark" }) {
  const base = tone === "light" ? "text-white" : "text-zinc-900";

  return (
    <span className={`font-display font-semibold leading-none tracking-[-0.03em] ${base}`}>
      PlateMaps
    </span>
  );
}
