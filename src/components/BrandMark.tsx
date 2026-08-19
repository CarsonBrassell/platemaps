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
 * Nothing has ever been redrawn or upscaled here. The one edit made to the
 * artwork since: the fork and the knife were sitting about 7px apart at the
 * source's 165px width, which closed to roughly a pixel at the sizes this
 * renders at, so each was moved 2px outward from the other — their own
 * pixels lifted and re-composited, fringe and all, not repainted. The same
 * move was applied to `logo.png` and to `src/app/icon.png` (a byte-copy of
 * the lockup), since all three carry the same pin at the same pixel scale.
 * `src/app/favicon.ico` is still the create-next-app default and is not this
 * artwork at all.
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
