import { isVerified } from "@/data/verified";

/**
 * The verified mark, in PlateMaps orange.
 *
 * Renders nothing at all for an unverified account, so a call site is one line
 * beside the name rather than a conditional wrapped around one — which is what
 * keeps it cheap to put on every surface that prints a handle.
 *
 * **Orange, and this is a sanctioned use of the accent.** DESIGN.md rations
 * orange to percentages and vote counts, selected states and the primary
 * action, and the reason is that an accent on twenty things means nothing. A
 * verified mark survives that test on its own terms: there are two of them in
 * the entire app, so it is the rarest orange on any screen it appears on.
 * Blue was never an option — it is Instagram's and Twitter's, and a blue check
 * on a cream app reads as a borrowed asset.
 *
 * The scalloped rosette rather than a plain circled check: at 14px the scallop
 * is what makes the mark legible as *the* verification badge instead of a
 * generic success tick, and the check is cut in the app's cream rather than
 * white so it sits in the same world as the rest of the palette.
 *
 * Sized in `em` so it tracks whatever type it sits beside — the handle is 11px
 * on a phone card and 13px on the web card, and a fixed px badge would be
 * visibly wrong on one of them.
 */
export function VerifiedBadge({
  userId,
  className = "",
}: {
  userId: string | null | undefined;
  className?: string;
}) {
  if (!isVerified(userId)) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Verified"
      /* `inline-block` + `align-[-0.12em]` rather than a flex parent: this
         drops into whatever markup already prints the name, including plain
         inline text, without needing that markup to become a flex row. */
      className={`inline-block h-[1.05em] w-[1.05em] shrink-0 align-[-0.12em] ${className}`}
    >
      <path
        fill="var(--pm-orange)"
        d="M12 1.5l2.4 1.9 3.05-.35 1.2 2.85 2.85 1.2-.35 3.05L23 12l-1.85 2.4.35 3.05-2.85 1.2-1.2 2.85-3.05-.35L12 22.5l-2.4-1.9-3.05.35-1.2-2.85-2.85-1.2.35-3.05L1 12l1.85-2.4L2.5 6.55l2.85-1.2 1.2-2.85 3.05.35z"
      />
      <path
        fill="none"
        stroke="#F7F4EC"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.9 12.3l2.6 2.6 5.4-5.6"
      />
    </svg>
  );
}
