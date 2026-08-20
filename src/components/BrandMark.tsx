/**
 * The PlateMaps pin.
 *
 * **The artwork is supplied, not drawn here.** `public/logo-source.webp` is
 * the file Carson provided, byte-for-byte, and every raster in the repo is
 * resized from it by `npm run logo:build` — `public/logo-mark.png` (which this
 * renders) and `public/logo.png` at 660x865, `src/app/icon.png` (512² padded),
 * `src/app/favicon.ico` (16/32/48) and the iOS `AppIcon-512@2x.png` (1024²,
 * opaque, since app icons may not carry alpha).
 *
 * There was a vector version (`public/logo-mark.svg`) and it is gone. It was a
 * hand-drawn approximation of this same mark, and every attempt to bring it
 * closer — a wider knife, a curved blade, more space between the utensils —
 * shipped a logo that was not the real one. **Never trace, redraw or "improve"
 * the mark.** If it needs to change, a new source file replaces the old one.
 *
 * The PNG keeps the artwork's own cream background rather than a keyed-out
 * matte. That is deliberate: it is within a couple of levels of the app's
 * `--background`, and keying a grainy background is what left a pale halo
 * around every edge the last time this was tried.
 *
 * `logo-mark.png` is cropped to the mark itself, so callers keep sizing it the
 * way they always have — `w-9 h-9` and friends letterbox it inside a square
 * via `object-contain`, which is the intended behaviour.
 */
export function BrandMark({ className = "" }: { className?: string; tone?: "light" | "dark" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-mark.png"
      alt=""
      width={660}
      height={865}
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
