"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { EAT, usePostFlash } from "@/lib/postCelebration";

/**
 * The white screen that answers "Post it" — and the mark being eaten off it.
 *
 * Rendered from `PhoneShell` rather than from either screen involved, because
 * it has to outlive the navigation between them — the composer raises it, the
 * feed lowers it, and in between the route changes underneath it. See
 * `lib/postCelebration` for the timing bounds and why it opens on the tap
 * rather than on the response.
 *
 * **It is never unmounted.** Visibility is a class, not a mount, for two
 * reasons: an unmounting element cannot run an exit transition, so the white
 * would cut away rather than peel off the landing; and keeping the `<img>` in
 * the tree means the mark is already decoded when the flash is raised, instead
 * of the one screen whose whole job is to show the logo being the one screen
 * that shows it late. Idle it is `visibility: hidden`, which takes it out of
 * the accessibility tree and off the hit-testing path both.
 *
 * ## The plate
 *
 * `logo-mark.png` is supplied artwork with its own opaque cream background —
 * it is not a keyed-out silhouette, and CLAUDE.md rules out redrawing it into
 * one — so dropped straight onto white it would show as a cream rectangle.
 * The cream disc is the treatment `PhoneFriendsHero` already uses to sit the
 * pin on a colour, and here it earns a second job: it reads as the plate the
 * mark is being eaten off, and it stays behind after the mark is gone.
 *
 * ## Eating it without touching it
 *
 * The bites are **masks, not artwork**. Each one is a radial gradient with a
 * transparent middle composited `intersect` over the last, so the pixels are
 * hidden rather than repainted — `logo-mark.png` is never modified, traced or
 * regenerated, which is the rule that matters most around this file. It also
 * means the bites cost nothing at build time and follow the mark automatically
 * if `npm run logo:build` ever replaces it.
 *
 * The mark already has one bite taken out of its top-right in the supplied
 * artwork, so the first mask widens *that* corner rather than opening a
 * second, unrelated mouth.
 */

/**
 * The mark's own aspect ratio (`logo-mark.png` is 660x865).
 *
 * Mask radii are given as a percentage of width and a *separate* percentage of
 * height, so this is what keeps a bite actually round: a scoop that is 43% of
 * the width has to be 43 x 0.763% of the height to come out circular.
 */
const ASPECT = 660 / 865;

/**
 * One bite is one quarter, and the quarters are exact.
 *
 * The previous version placed four overlapping circles on the mark's
 * quarter-points. Circles cannot tile a square, so each bite ate into the last
 * one's crater: measured against the real ink they removed 49%, 33%, 8% and
 * 10%. Two big mouthfuls, then two that barely showed — which is why the meal
 * read as arbitrary rather than as a pattern.
 *
 * A quarter is now a genuine quarter: a 90 degree conic wedge from the centre,
 * taken clockwise from the top right, where the artwork's own bite already is.
 * Four wedges are 25% each by construction, not by tuning, and the mark empties
 * evenly.
 *
 * The scallops survive that change because they are what makes it a bite rather
 * than a slice. They straddle the wedge's two straight edges, so every cut the
 * mouth leaves behind is a run of round scoops instead of a razor line.
 */
const SCALLOPS_PER_EDGE = 4;
/** Scoop size and how far out along each edge they run, as % of the width. */
const SCALLOP_R = 5.5;
const EDGE_REACH = 62;

type Scoop = { cx: number; cy: number; r: number };

/** A hole shaped like one ellipse — the primitive every scallop is drawn with. */
const scoop = (c: Scoop) =>
  `radial-gradient(ellipse ${c.r.toFixed(2)}% ${(c.r * ASPECT).toFixed(2)}% at ${c.cx.toFixed(2)}% ${c.cy.toFixed(2)}%, transparent 0 99%, #000 100%)`;

/** A hole shaped like a 90 degree wedge, opening clockwise from `fromDeg`. */
const wedge = (fromDeg: number) =>
  `conic-gradient(from ${fromDeg}deg at 50% 50%, transparent 0 90deg, #000 90deg 360deg)`;

/**
 * Conic angles run clockwise from twelve o'clock, which is not how sin and cos
 * are laid out — hence sin on x and -cos on y. The y offset is scaled by the
 * aspect for the same reason the radii are: so the ring of scoops is round in
 * pixels rather than round in percentages.
 */
function edgeScoops(edgeDeg: number): Scoop[] {
  const a = (edgeDeg * Math.PI) / 180;
  const out: Scoop[] = [];
  for (let k = 1; k <= SCALLOPS_PER_EDGE; k++) {
    const dist = (k / (SCALLOPS_PER_EDGE + 1)) * EDGE_REACH;
    out.push({
      cx: 50 + dist * Math.sin(a),
      cy: 50 - dist * Math.cos(a) * ASPECT,
      r: SCALLOP_R,
    });
  }
  return out;
}

/** The wedge plus the scoops along both of its straight edges, as mask layers. */
function bite(quarter: number): string[] {
  const from = quarter * 90;
  return [
    wedge(from),
    ...edgeScoops(from).map(scoop),
    ...edgeScoops(from + 90).map(scoop),
  ];
}

/** Clockwise from the top right, one quarter each. */
const BITES = [bite(0), bite(1), bite(2), bite(3)];

const MASKS = BITES.map((_, i) =>
  BITES.slice(0, i + 1).flat().join(", "),
);

/*
 * The store derives the flash's floor from `EAT.bites` while the timers below
 * walk `BITES`, so the two must agree. If they drift the screen comes down
 * mid-chew — the exact failure the derived floor exists to prevent — and it
 * would only show up as a half-eaten logo on a fast connection.
 */
if (process.env.NODE_ENV !== "production" && BITES.length !== EAT.bites) {
  throw new Error(
    `postCelebration EAT.bites (${EAT.bites}) must match PostFlash BITES.length (${BITES.length}).`,
  );
}

/** One step past the last bite is the crumbs going. */
const GONE = BITES.length + 1;

export function PostFlash() {
  const open = usePostFlash();

  /* 0 = whole, 1..6 = that many bites taken, 7 = gone. */
  const [step, setStep] = useState(0);

  /*
   * The meal, as a set of one-shot timers.
   *
   * A timer per step rather than a rAF loop: this is six discrete events, not
   * a continuous curve, and a chomp is *meant* to jump. It also keeps the
   * component to seven renders instead of a hundred and twenty.
   *
   * The `0`-delay timer is what resets a second post back to a whole mark —
   * setting it synchronously here would be a state update inside an effect
   * body, which is the lint rule this codebase has already been bitten by.
   */
  useEffect(() => {
    if (!open) return;
    const timers = [setTimeout(() => setStep(0), 0)];
    for (let i = 1; i <= BITES.length; i++) {
      timers.push(setTimeout(() => setStep(i), EAT.firstBiteAt + (i - 1) * EAT.biteEvery));
    }
    timers.push(
      setTimeout(
        () => setStep(GONE),
        EAT.firstBiteAt + (BITES.length - 1) * EAT.biteEvery + EAT.crumbsAfter,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [open]);

  const mask = step > 0 ? MASKS[Math.min(step, MASKS.length) - 1] : "";

  /*
   * The flinch on each chomp.
   *
   * Two identical animations under two class names, alternated by parity. A
   * CSS animation only restarts when its *name* changes, so re-applying one
   * class on every bite would play the shake once and then sit still for the
   * remaining three. Alternating is what re-triggers it without remounting the
   * <img>, which would drop the decoded image and flicker.
   *
   * **It shakes the plate, not the mark.** On the mark it looked like it was
   * missing the final bite: the fourth mouthful clears the last of the ink, so
   * the shake was playing correctly on an element that no longer had anything
   * in it to move. The plate is still there at that point, so the fourth chomp
   * now registers as the whole thing jolting.
   */
  const chomping = step >= 1 && step <= BITES.length;
  const shake = chomping ? (step % 2 ? "post-flash-chomp-a" : "post-flash-chomp-b") : "";

  return (
    <div className={`post-flash ${open ? "post-flash-on" : ""}`} aria-hidden={!open}>
      <span className={`post-flash-shaker ${shake}`}>
        <span className="post-flash-disc">
          <span
            className={`post-flash-bitten ${step >= GONE ? "post-flash-gone" : ""}`}
            style={
              mask
                ? {
                    maskImage: mask,
                    WebkitMaskImage: mask,
                    maskComposite: "intersect",
                    WebkitMaskComposite: "source-in",
                  }
                : undefined
            }
          >
            {/* The bob is `globals.css`'s, already used on the mark elsewhere —
                a little life in it while it is being eaten. */}
            <BrandMark className="logo-bob h-full w-auto" />
          </span>
        </span>
      </span>

      {/* Emptied rather than removed when idle, so the text is a content
          change the live region actually announces. */}
      <p role="status" className="sr-only">
        {open ? "Posting your plate" : ""}
      </p>
    </div>
  );
}
