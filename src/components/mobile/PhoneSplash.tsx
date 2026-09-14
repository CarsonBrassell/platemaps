import { BrandMark } from "@/components/BrandMark";

/**
 * The mark, held over the app for a beat when it opens, then peeled off the
 * screen like a sticker.
 *
 * ## Why this exists when iOS already has a launch screen
 *
 * The native launch screen (`ios/App/App/Base.lproj/LaunchScreen.storyboard`)
 * covers exactly one thing: the moment between the icon being tapped and the
 * WebView existing. This app then loads a **remote** URL — `server.url` in
 * capacitor.config.ts points at the deployed site — so the launch screen is
 * dismissed while the page itself is still on the wire. Whatever is left of
 * that wait used to be blank. So the native screen's duration is "however
 * long the WebView took", which is not a duration anyone chose, and the gap
 * after it is unbounded.
 *
 * This covers the second half, and being part of the document means it is
 * painted with the first byte rather than after React hydrates.
 *
 * ## The peel, and how it happens without redrawing anything
 *
 * The mark sits on the cream ground for 1.1s. Then its bottom-right edge is
 * pinched up and a fold line sweeps diagonally to the top-left: the part
 * still stuck down shrinks, the flap that has come away grows, standing up
 * off the surface and tilted toward the viewer, with a crease along the fold,
 * its paper back showing the print faintly in reverse, and a shadow falling
 * across the fold onto the part still stuck. The fold moves the way a hand
 * would move it: slow while the edge is being got up, fast through the
 * middle, a small give at the end. Once nothing is left stuck the sticker
 * snaps toward the pull, is carried off the top-left of the screen, and the
 * cream sheet fades to reveal the app underneath.
 *
 * None of that draws a pixel of the mark. CLAUDE.md forbids tracing,
 * redrawing or repainting the artwork, so the whole effect is built from two
 * copies of the same supplied file and things that only *remove* or *move*
 * pixels: both copies are masked to the pin's outline (an alpha silhouette
 * that logo:build computes from the artwork); the stuck part is the mark
 * under a shrinking `clip-path`; the flap is a second copy of the mark
 * rotated about the fold line in 3D (a rigid motion, so nothing is stretched,
 * and past 90° the browser shows its back face, which is the mirrored print)
 * and clipped to the complement; the paper back, its crease and the contact
 * shadow are translucent gradient sheets that slide with the fold, tints and
 * not drawings. `phone.css` owns the geometry and works through the fold-line
 * arithmetic.
 *
 * ## Size, and why this is the `full` raster
 *
 * `h-48` — 192px, about 38% of a 390px screen's width once the mark's own
 * proportions are applied. That is past what the 240px raster can carry: at 3x
 * it would be upscaled nearly twice over, on the one screen whose entire job is
 * showing the logo. `size="full"` is the 660x865 file, which PostFlash already
 * loads on every /m page for the same reason, so this costs no extra bytes —
 * it is a file the phone tree was fetching anyway.
 *
 * The preload in the root layout still points at the 240 file, deliberately:
 * that is the one the headers use, the root layout is shared with the web
 * version, and this <img> is in the first bytes of the document with
 * `fetchpriority="high"`, so it is discovered during parse regardless.
 *
 * ## Why it is CSS and not a timer
 *
 * No state, no `useEffect`, no `mounted` flag. A timer would need the overlay
 * to survive until hydration to hide it, which means it cannot be a server
 * component, and a JS failure would strand it on screen forever. As a pure
 * animation it plays from the first paint, needs no JavaScript at all, and
 * ends at `visibility: hidden` so it leaves the accessibility tree instead of
 * sitting invisibly on top of the app. The peel and the fly-off are more
 * animations on the same clock, so they inherit all of that.
 *
 * `pointer-events: none` the whole way through, so even while it is visible a
 * tap goes to the app underneath — the splash is decoration and must never
 * eat the first interaction.
 *
 * ## When it shows
 *
 * Once per document load, because it mounts with the /m layout and every
 * navigation inside the phone app is client-side — the layout does not
 * remount, so moving between Feed, Discover and Friends does not re-flash it.
 * A cold app launch is a fresh document, which is exactly "first opened".
 */
export function PhoneSplash() {
  return (
    <div className="phone-splash" aria-hidden="true">
      {/* The fly-off animates this wrapper; the peel animates the two layers
          inside it. Same split PostFlash uses: the thing that moves is not the
          thing whose pixels are changing, so nothing fights over `transform`. */}
      <span className="phone-splash-mark">
        {/* The part still stuck to the screen. Its clip shrinks as the fold
            sweeps across. */}
        <span className="phone-splash-stuck">
          <BrandMark size="full" className="h-48 w-auto" />
        </span>
        {/* The flap that has come away: the same file, reflected across the
            fold line and clipped to the peeled region, with a paper-white
            sheet over it. Sized identically so the fold line lands on the
            same pixels in both copies. */}
        <span className="phone-splash-flap">
          <span className="phone-splash-flap-face">
            <BrandMark size="full" className="h-48 w-auto" />
          </span>
        </span>
      </span>
    </div>
  );
}
