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
 * One bite, and every bite is this bite.
 *
 * **43% of the mark's width, because four of them have to finish it.** Four
 * equal circles cover a rectangle when they sit on its quarter-points with a
 * radius of the quadrant's half-diagonal — 41.2% of the width here. 43 is that
 * with a margin. Anything smaller cannot clear the mark in four, and the
 * previous version papered over exactly that by making its last bite an
 * enormous one that simply wiped whatever was left, which is a deletion rather
 * than a bite.
 *
 * The scallops are what make it a bite rather than a hole punch: eight bumps
 * of a third the radius, straddling the rim, so the edge left behind is a run
 * of round scoops. Fixed count, fixed size, evenly spaced — the bite is
 * congruent every time, only rotated, so no two bites differ in size.
 */
const BITE_R = 43;
const SCALLOPS = 8;
const SCALLOP_R = 0.32;
const SCALLOP_D = 1.02;

type Scoop = { cx: number; cy: number; r: number };

function bite(cx: number, cy: number, spin: number): Scoop[] {
  const out: Scoop[] = [{ cx, cy, r: BITE_R }];
  for (let i = 0; i < SCALLOPS; i++) {
    const a = (i / SCALLOPS) * Math.PI * 2 + spin;
    out.push({
      cx: cx + SCALLOP_D * BITE_R * Math.cos(a),
      /* sin is scaled by the aspect so the offset is circular in pixels, the
         same correction `layer` makes to the radii. */
      cy: cy + SCALLOP_D * BITE_R * Math.sin(a) * ASPECT,
      r: SCALLOP_R * BITE_R,
    });
  }
  return out;
}

/**
 * The four quarter-points, taken clockwise from the top right — which is where
 * the artwork's own bite already is, so the first mouthful widens it rather
 * than opening a second mouth somewhere else.
 *
 * Measured against the real artwork, this leaves 55%, 24%, 13% and then 0% of
 * the mark's ink. It genuinely ends empty; nothing is faded away to hide a
 * remainder.
 */
const BITES = [
  bite(75, 25, 0),
  bite(75, 75, 0.3),
  bite(25, 75, 0.6),
  bite(25, 25, 0.9),
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

  /*
   * The flinch on each chomp.
   *
   * Two identical animations under two class names, alternated by parity. A
   * CSS animation only restarts when its *name* changes, so re-applying one
   * class on every bite would play the shake once and then sit still for the
   * remaining three. Alternating is what re-triggers it without remounting the
   * <img>, which would drop the decoded image and flicker.
   */
  const chomping = step >= 1 && step <= BITES.length;
  const shake = chomping ? (step % 2 ? "post-flash-chomp-a" : "post-flash-chomp-b") : "";

  return (
    <div className={`post-flash ${open ? "post-flash-on" : ""}`} aria-hidden={!open}>
      <span className="post-flash-disc">
        <span
          className={`post-flash-bitten ${shake} ${step >= GONE ? "post-flash-gone" : ""}`}
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
