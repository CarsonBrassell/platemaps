import { ThumbsUpIcon } from "@/components/icons";
import { relativeTime } from "@/lib/format";
import type { MapComment } from "@/data/mapComments";

type SheetDish = {
  id: string;
  name: string;
  description?: string;
  price: string;
  pct: number | null;
  total: number;
};

/** Enough to give a sense of the room without turning the sheet into a feed. */
const VISIBLE_COMMENTS = 3;

export function DishSheet({
  dish,
  restaurantName,
  myVote,
  comments,
  onVote,
  onClose,
  onSeeAll,
}: {
  dish: SheetDish;
  /** For the mono byline under the dish name — "$3.25 · TACOS EL GORDO". */
  restaurantName: string;
  myVote: "yes" | "no" | undefined;
  /** Comments about this specific dish, newest first. */
  comments: MapComment[];
  onVote: (vote: "yes" | "no") => void;
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
              <span className="font-mono text-xs text-zinc-500">
                No votes yet — be the first
              </span>
            )}
          </div>

          <p className="mono-label mb-2 mt-5 text-zinc-500">Your verdict</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => onVote("yes")}
              aria-pressed={myVote === "yes"}
              className={
                myVote === "yes"
                  ? "min-h-11 w-full rounded-full bg-pm-orange py-3 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                  : "min-h-11 w-full rounded-full bg-pm-grey-tint py-3 text-sm font-semibold text-pm-grey-text transition-transform hover:text-zinc-900 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              }
            >
              Good — I&apos;d get it again
            </button>
            <button
              onClick={() => onVote("no")}
              aria-pressed={myVote === "no"}
              className={
                myVote === "no"
                  ? "min-h-11 w-full rounded-full bg-pm-orange py-3 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                  : "min-h-11 w-full rounded-full bg-pm-grey-tint py-3 text-sm font-semibold text-pm-grey-text transition-transform hover:text-zinc-900 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              }
            >
              Not for me
            </button>
          </div>

          {/* What people said about this dish, in the sheet itself. These
              comments already existed, but only at the very bottom of the page
              mixed in with every other comment about the restaurant — so the
              opinions most relevant to the dish you just tapped were the ones
              you had to scroll furthest to find. */}
          {comments.length > 0 && (
            <div className="mt-4 rounded-2xl bg-white px-5 py-4">
              <p className="mono-label mb-3 text-zinc-500">What people said</p>
              <ul className="flex flex-col gap-3">
                {comments.slice(0, VISIBLE_COMMENTS).map((comment) => (
                  <li key={comment.id} className="flex flex-col gap-1">
                    <p className="text-sm leading-snug text-zinc-700">{comment.text}</p>
                    <div className="flex items-center gap-2.5 font-mono text-xs text-zinc-500">
                      {comment.upvotes !== undefined && (
                        <span className="inline-flex items-center gap-1">
                          <ThumbsUpIcon className="h-3 w-3" />
                          {comment.upvotes}
                        </span>
                      )}
                      {comment.createdAt && <span>{relativeTime(comment.createdAt)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
              <button
                onClick={onSeeAll}
                className="mt-3 font-mono text-xs font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                {comments.length > VISIBLE_COMMENTS
                  ? `See all ${comments.length} comments`
                  : "See all comments"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
