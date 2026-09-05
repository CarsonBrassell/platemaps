/**
 * The PlateMaps pin.
 *
 * **The artwork is supplied, not drawn here.** `public/logo-source.webp` is
 * the file Carson provided, byte-for-byte, and every raster in the repo is
 * resized from it by `npm run logo:build` — `public/logo-mark-240.{webp,png}`
 * (what this renders), `public/logo-mark.{webp,png}` and `public/logo.png` at
 * 660x865, `src/app/icon.png` (512² padded),
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
/** The two rasters, and the size each is for. */
const SIZES = {
  /* What every normal call site gets. No ordinary call site draws the mark
     bigger than 96px CSS, so 240 covers all of them at 3x. The two that go
     past it — the phone splash and the post-flash medallion — both ask for
     `full` instead, and anything else that grows past 96px has to do the
     same or it will be visibly soft on a 3x screen. */
  mark: { src: "/logo-mark-240", width: 240, height: 314 },
  /* The post-flash medallion only: its disc is up to 250px square and the mark
     fills its height, which is ~573px of pixels on a 3x phone. The 240 would
     be visibly soft there, and it is the one surface where that matters
     because the whole animation is a close-up of the mark being eaten. */
  full: { src: "/logo-mark", width: 660, height: 865 },
} as const;

export function BrandMark({
  className = "",
  size = "mark",
}: {
  className?: string;
  tone?: "light" | "dark";
  size?: keyof typeof SIZES;
}) {
  const { src, width, height } = SIZES[size];
  return (
    /*
     * WebP first, PNG behind it. This used to load `logo-mark.png` — 660px
     * wide and 196KB — to paint something no bigger than 96px CSS anywhere in
     * the app, so on a cold load the mark could arrive a beat after the header
     * it belongs to. The same pixels at the size they are actually drawn, in
     * WebP, are 7.6KB: about 25x less to fetch before the brand is on screen.
     * `layout.tsx` preloads that file so the fetch starts during parse.
     *
     * A <picture> rather than a bare WebP so a browser without it still gets
     * the mark instead of an empty box. Neither file is redrawn — both come
     * out of `logo:build` from the same supplied source.
     *
     * eager + high priority because this is the one image that should never be
     * deferred: it is above the fold on every screen and it is the thing that
     * says the app has loaded. `width`/`height` keep the box reserved so
     * nothing reflows when it lands.
     */
    /* `contents` is load-bearing, not tidiness. Callers size this by putting
       height classes on the mark and letting the width follow, and preflight's
       `max-width: 100%` resolves that against the parent box. Wrapping the img
       in a laid-out <picture> made that circular — the picture sized to the
       img, the img clamped to the picture — and every mark in the app rendered
       0px wide. Taking the wrapper out of layout puts the img back to being
       the flex/grid child it has always been; format selection is DOM-based
       and does not need a box. */
    <picture className="contents">
      <source srcSet={`${src}.webp`} type="image/webp" />
      { }
      <img
        src={`${src}.png`}
        alt=""
        width={width}
        height={height}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        className={`object-contain ${className}`}
      />
    </picture>
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
