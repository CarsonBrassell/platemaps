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
 * height, so this is what keeps a "circle" actually circular: a scoop that is
 * 16% of the width has to be 16 x 0.763% of the height to come out round.
 */
const ASPECT = 660 / 865;

/** Deterministic, so the scallops are identical every render and on the server. */
function rnd(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type Scoop = { cx: number; cy: number; r: number };

/**
 * One bite, as a cluster of overlapping scoops.
 *
 * A single circle leaves a clean arc, which reads as a hole punched in the
 * mark rather than as something bitten. A real bite — out of a cookie, which
 * is the reference — is several overlapping tooth-scoops, so its rim is a run
 * of little round bumps. That is also exactly how the bite already in the
 * supplied artwork is drawn, so this matches the brand rather than inventing
 * a second visual language for the same idea.
 *
 * Satellites sit at ~0.66-0.98 of the main radius and are ~0.26-0.48 of it, so
 * they straddle the rim: the parts outside widen the bite, the parts inside do
 * nothing, and what is left is a ragged edge.
 */
function scoops(cx: number, cy: number, r: number, seed: number, n = 6): Scoop[] {
  const out: Scoop[] = [{ cx, cy, r }];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(seed) * 6.28;
    const d = r * (0.66 + 0.32 * rnd(seed + i));
    const rr = r * (0.26 + 0.22 * rnd(seed + i * 7 + 3));
    out.push({ cx: cx + d * Math.cos(a), cy: cy + d * Math.sin(a) * ASPECT, r: rr });
  }
  return out;
}

/**
 * Where the mouth goes, in order, as a fraction of the mark's own box.
 *
 * **On the stroke, not through the middle.** The pin is an outline, so a bite
 * aimed at its centre passes through empty space and takes almost nothing with
 * it — an early pass ate four mouthfuls out of the hollow and left the whole
 * orange ring standing. These walk around the ring itself: top-right (widening
 * the bite the artwork already has), the right flank, the point at the bottom,
 * the left flank. The fifth is the big one that finishes it, and it is centred
 * because by then the ring is what is left of the ring.
 */
const BITES = [
  scoops(73, 18, 16, 1),
  scoops(82, 46, 16, 2),
  scoops(50, 85, 18, 3),
  scoops(20, 44, 16, 4),
  scoops(50, 40, 42, 5, 10),
];

const layer = (c: Scoop) =>
  `radial-gradient(ellipse ${c.r.toFixed(2)}% ${(c.r * ASPECT).toFixed(2)}% at ${c.cx.toFixed(2)}% ${c.cy.toFixed(2)}%, transparent 0 99%, #000 100%)`;

/**
 * Every bite composited into one mask string, precomputed per step.
 *
 * Built once at module load rather than per render: the geometry never changes,
 * and `MASKS[n - 1]` is the mark with n bites out of it. `intersect` is what
 * makes the holes accumulate — the default `add` would union the opaque parts
 * instead and fill each previous bite back in.
 */
const MASKS = BITES.map((_, i) =>
  BITES.slice(0, i + 1)
    .flat()
    .map(layer)
    .join(", "),
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

  return (
    <div className={`post-flash ${open ? "post-flash-on" : ""}`} aria-hidden={!open}>
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

      {/* Emptied rather than removed when idle, so the text is a content
          change the live region actually announces. */}
      <p role="status" className="sr-only">
        {open ? "Posting your plate" : ""}
      </p>
    </div>
  );
}
