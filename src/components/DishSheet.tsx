import { DishPosts } from "@/components/DishPosts";
import type { MapComment } from "@/data/mapComments";

type SheetDish = {
  id: string;
  name: string;
  description?: string;
  price: string;
  pct: number | null;
  total: number;
};

export function DishSheet({
  dish,
  restaurantId,
  restaurantName,
  comments,
  onClose,
  onSeeAll,
}: {
  dish: SheetDish;
  /** Which restaurant's plate this is — the other half of the posts lookup. */
  restaurantId: string;
  /** For the mono byline under the dish name — "$3.25 · TACOS EL GORDO". */
  restaurantName: string;
  /** Seed map bubbles about this specific dish, newest first. */
  comments: MapComment[];
  onClose: () => void;
  onSeeAll: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-pm-charcoal/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      {/* The sheet itself is a slice of the cream page, so the score card and
          the comments card inside it read as white cards on cream — the same
          grammar as everywhere else. */}
      <div
        className="animate-sheet-in max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[#F7F4EC] pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex justify-center pt-2.5">
          <div className="h-1 w-10 rounded-full bg-zinc-300" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-4 pb-6 pt-3">
          <h2 className="font-display text-2xl font-semibold text-zinc-900">{dish.name}</h2>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.14em] text-zinc-500">
            {dish.price} · {restaurantName}
          </p>
          {dish.description && (
            <p className="mt-2 text-sm leading-snug text-zinc-700">{dish.description}</p>
          )}

          {/* The score card: oversized orange mono percentage, denominator in
              small mono beside it. */}
          <div className="mt-4 flex items-center gap-4 rounded-2xl bg-white px-5 py-4">
            {dish.pct !== null ? (
              <>
                <span className="font-mono text-5xl font-bold tabular-nums leading-none text-pm-orange">
                  {dish.pct}%
                </span>
                <span className="font-mono text-xs leading-relaxed text-zinc-500">
                  said good
                  <br />
                  {dish.total.toLocaleString()} {dish.total === 1 ? "vote" : "votes"}
                </span>
              </>
            ) : (
              /* States the gap and stops there. It used to read "be the first",
                 which was an invitation to press the verdict buttons directly
                 below it — those are gone, and the card has nothing to press.
                 The invitation now lives once, in the posts card underneath,
                 where there is something to do about it. */
              <span className="font-mono text-xs text-zinc-500">No ratings yet</span>
            )}
          </div>

          {/* There is no "your verdict" here any more. The two buttons that
              stood between the score card and the posts cast the older yes/no
              tally — "would you order this again" — which is a different
              question from the 0-100 rating everything on this page is built
              from, and it was the only place in the product still asking it.
              The tally itself is untouched: `dishStats` still reads the stored
              yes/no counts as the fallback percent for a plate nobody has
              rated. Nothing writes to it from the UI now. */}

          {/* What people said about this dish, in the sheet itself. Those
              opinions already existed, but only at the very bottom of the page
              mixed in with every other comment about the restaurant — so the
              ones most relevant to the dish you just tapped were the ones you
              had to scroll furthest to find. The card renders unconditionally
              now: it fetches its own posts, so "nobody has posted about this
              plate yet" is an answer it has to be present to give. */}
          <DishPosts
            restaurantId={restaurantId}
            dishName={dish.name}
            seedComments={comments}
            onSeeAll={onSeeAll}
          />
        </div>
      </div>
    </div>
  );
}
