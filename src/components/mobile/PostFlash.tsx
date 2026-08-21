"use client";

import { BrandMark } from "@/components/BrandMark";
import { usePostFlash } from "@/lib/postCelebration";

/**
 * The white screen that answers "Post it".
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
 * ## The disc
 *
 * `logo-mark.png` is supplied artwork with its own opaque cream background —
 * it is not a keyed-out silhouette, and CLAUDE.md rules out redrawing it into
 * one — so dropped straight onto white it would show as a cream rectangle.
 * The cream disc is the treatment `PhoneFriendsHero` already uses to sit the
 * pin on a colour, and it turns that background into the shape instead of an
 * artifact: a medallion on white, with the pin's orange the only real colour
 * on the screen.
 */
export function PostFlash() {
  const open = usePostFlash();

  return (
    <div className={`post-flash ${open ? "post-flash-on" : ""}`} aria-hidden={!open}>
      <span className="post-flash-disc">
        {/* The bob is `globals.css`'s, already used on the mark elsewhere. It
            carries the hold: the punch lands in under half a second and the
            request usually has not come back yet, so without it the screen is
            a still frame for the rest of the wait. */}
        <BrandMark className="logo-bob h-[56%] w-auto" />
      </span>

      {/* Emptied rather than removed when idle, so the text is a content
          change the live region actually announces. */}
      <p role="status" className="sr-only">
        {open ? "Posting your plate" : ""}
      </p>
    </div>
  );
}
