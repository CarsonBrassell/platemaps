import type { ReactNode } from "react";

/**
 * A section heading on the phone's cream ground, with an orange tick in front.
 *
 * The Friends screen's four headings were identical grey mono labels, which
 * made everything below the hero read as one undifferentiated column. The tick
 * is the smallest mark that says "a section starts here".
 *
 * It is a 3px square, not the global nav's 5px round bullet, and the
 * difference is deliberate: that bullet means "the page you are on", and
 * borrowing it for a heading would blur an idiom already doing another job.
 *
 * Shared rather than repeated because the four labels live in three files —
 * the screen owns two, `PhoneFindFriends` and `PhoneFriendsLeaderboard` own
 * one each — and a heading style that only three of the four wear reads as an
 * oversight rather than a system.
 *
 * `.mono-label` is unlayered in globals.css and outranks Tailwind's font
 * utilities, so this sets colour and layout only; a weight alongside it would
 * be silently discarded.
 */
export function PhoneSectionLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="mono-label mb-2 flex items-center gap-2 text-pm-grey-text">
      <span aria-hidden="true" className="h-[3px] w-[3px] shrink-0 rounded-[1px] bg-pm-orange" />
      {children}
    </p>
  );
}
