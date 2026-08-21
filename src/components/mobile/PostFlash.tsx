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
 * Where the mouth goes, in order, as a fraction of the mark's own box.
 *
 * Around the edge first and the middle last, because that is the order a
 * person eats something held in their hand — taking the centre first would
 * leave a ring, which reads as a doughnut rather than as something bitten.
 * The fifth reaches inward on purpose: with all six around the rim the dark
 * fork and knife sat there untouched to the last frame, looking immune while
 * the orange around them disappeared.
 *
 * Radii are percentages so they scale with the disc on a narrower handset —
 * but they resolve against the gradient's ray (farthest-corner, ~130px here),
 * not the mark's width, which is why they look small: 26% ate half the pin in
 * one go.
 */
const BITES = [
  { x: 80, y: 22, r: 17 }, // widens the bite the artwork already has
  { x: 78, y: 56, r: 17 },
  { x: 52, y: 87, r: 18 }, // the pin's point
  { x: 20, y: 52, r: 17 },
  { x: 46, y: 34, r: 21 }, // inward, so the cutlery gets chewed too
  { x: 52, y: 58, r: 34 }, // the last mouthful takes what is left
];

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

  /* Every bite so far, composited into one mask. `intersect` is what makes the
     holes accumulate — the default `add` would union the opaque parts instead
     and fill each previous bite back in. */
  const taken = BITES.slice(0, Math.min(step, BITES.length));
  const mask = taken
    .map((b) => `radial-gradient(circle at ${b.x}% ${b.y}%, transparent 0 ${b.r}%, #000 ${b.r + 1}%)`)
    .join(", ");

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
