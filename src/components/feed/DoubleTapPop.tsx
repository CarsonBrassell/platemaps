import { HeartIcon, VoteArrowUpIcon } from "@/components/icons";

/**
 * The big mark that blooms over a plate when it's double-tapped — a heart on
 * Friends, the up arrow on Discover — then fades. Purely decorative: the
 * button in the action row is what changes state and announces it, so this
 * is hidden from assistive tech and never catches a pointer.
 *
 * Sized to the container it's dropped in (`absolute inset-0`), so it centres
 * on the photo when a card has one and on the card itself when it doesn't.
 * Remounted on every `popKey` so a second double-tap replays it from the
 * start rather than being lost inside the first one's fade.
 */
export function DoubleTapPop({ kind, popKey }: { kind: "heart" | "upvote"; popKey: number }) {
  if (!popKey) return null;
  return (
    <div
      key={popKey}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
    >
      <span className="heart-pop flex drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
        {kind === "heart" ? (
          <HeartIcon filled className="h-20 w-20 text-pm-red" />
        ) : (
          <VoteArrowUpIcon filled className="h-20 w-20 text-pm-orange" />
        )}
      </span>
    </div>
  );
}
