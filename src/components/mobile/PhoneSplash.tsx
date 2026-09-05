import { BrandMark } from "@/components/BrandMark";

/**
 * The mark, held over the app for a beat when it opens — whole at first, then
 * bitten.
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
 * ## The bite, and how it happens without redrawing anything
 *
 * The pin opens whole — an unbroken teardrop — and 1.5s in the bite is taken
 * out of its top right and the mark flinches. The bite it lands on is the real
 * one: the supplied artwork already has it, so the animation is not *adding* a
 * bite, it is **uncovering** the one that was always there.
 *
 * That inversion is the whole trick, and it is forced by CLAUDE.md: the mark is
 * supplied artwork and must never be traced, redrawn or repainted. Masks can
 * only take pixels away — that is how `PostFlash` eats the mark — and here the
 * pixels needed at the start are ones the artwork does not have, so no mask can
 * produce them. Painting the notch shut would mean drawing a piece of the
 * logo, which is exactly the move this repo has shipped a wrong logo with
 * before.
 *
 * So the whole pin is made **out of the mark itself**. The pin is symmetric
 * about its vertical axis, the bite is a notch on one side of that axis, and
 * the artwork is fully opaque with its own cream ground baked in. A second copy
 * of the same file, mirrored and clipped to the bitten corner, therefore paints
 * the intact left ring over the bitten right one and closes it seamlessly —
 * same pixels, same orange, same anti-aliasing, no new artwork and nothing to
 * regenerate. Removing that copy at 1.5s *is* the bite. `phone.css` owns the
 * clip and documents where its edges are and why.
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
 * sitting invisibly on top of the app. The bite and the flinch are two more
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
      {/* The flinch is on a wrapper rather than on the mark, the same split
          PostFlash uses: the thing that moves is not the thing whose pixels
          are changing, so the two animations cannot fight over `transform`. */}
      <span className="phone-splash-shaker">
        <span className="phone-splash-mark">
          <BrandMark size="full" className="h-48 w-auto" />
          {/* The mirrored copy that fills the bite in. Sized identically so it
              lands exactly on the mark underneath; phone.css mirrors it and
              clips it to the bitten corner. */}
          <span className="phone-splash-patch">
            <BrandMark size="full" className="h-48 w-auto" />
          </span>
        </span>
      </span>
    </div>
  );
}
