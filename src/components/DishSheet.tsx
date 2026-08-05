import { relativeTime } from "@/lib/format";
import type { MapComment } from "@/data/mapComments";

type SheetDish = {
  id: string;
  name: string;
  price: string;
  pct: number | null;
  total: number;
};

/** Enough to give a sense of the room without turning the sheet into a feed. */
const VISIBLE_COMMENTS = 3;

export function DishSheet({
  dish,
  myVote,
  comments,
  onVote,
  onClose,
  onSeeAll,
}: {
  dish: SheetDish;
  myVote: "yes" | "no" | undefined;
  /** Comments about this specific dish, newest first. */
  comments: MapComment[];
  onVote: (vote: "yes" | "no") => void;
  onClose: () => void;
  onSeeAll: () => void;
}) {
  const pct = dish.pct ?? 0;
  const radius = 30;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex justify-center pt-2.5">
          <div className="h-1 w-10 rounded-full bg-zinc-200" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-2 flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 pb-6 pt-3">
          <div className="flex items-center gap-4">
            {dish.pct !== null && (
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
                <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
                  <circle cx="32" cy="32" r={radius} fill="none" stroke="#f4f4f5" strokeWidth="6" />
                  <circle
                    cx="32"
                    cy="32"
                    r={radius}
                    fill="none"
                    stroke="#e8875a"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - (pct / 100) * circumference}
                    style={{ transition: "stroke-dashoffset 0.6s ease" }}
                  />
                </svg>
                <span className="absolute text-sm font-bold text-pm-orange-text">{pct}%</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="font-display text-xl font-medium text-zinc-900">{dish.name}</p>
              <p className="mt-0.5 text-sm text-zinc-500">{dish.price}</p>
            </div>
          </div>

          <div className="mt-3">
            {dish.pct !== null ? (
              <span className="text-sm text-zinc-400">
                would get it again &middot; {dish.total.toLocaleString()} ratings
              </span>
            ) : (
              <span className="text-sm text-zinc-400">No ratings yet &mdash; be the first</span>
            )}
          </div>

          <p className="mb-2 mt-5 text-sm font-medium text-zinc-700">Would you get this again?</p>
          <div className="flex gap-2.5">
            <button
              onClick={() => onVote("yes")}
              aria-pressed={myVote === "yes"}
              className={
                myVote === "yes"
                  ? "flex-1 rounded-xl border-2 border-pm-orange bg-pm-orange-tint py-3 text-sm font-semibold text-pm-orange-text transition-transform active:scale-[0.97]"
                  : "flex-1 rounded-xl border-2 border-zinc-200 py-3 text-sm font-semibold text-zinc-600 transition-transform active:scale-[0.97]"
              }
            >
              Yes
            </button>
            <button
              onClick={() => onVote("no")}
              aria-pressed={myVote === "no"}
              className={
                myVote === "no"
                  ? "flex-1 rounded-xl border-2 border-pm-charcoal bg-pm-charcoal py-3 text-sm font-semibold text-white transition-transform active:scale-[0.97]"
                  : "flex-1 rounded-xl border-2 border-zinc-200 py-3 text-sm font-semibold text-zinc-600 transition-transform active:scale-[0.97]"
              }
            >
              No
            </button>
          </div>

          {/* What people said about this dish, in the sheet itself. These
              comments already existed, but only at the very bottom of the page
              mixed in with every other comment about the restaurant — so the
              opinions most relevant to the dish you just tapped were the ones
              you had to scroll furthest to find. */}
          {comments.length > 0 && (
            <div className="mt-6 border-t border-zinc-100 pt-4">
              <p className="mb-3 text-sm font-medium text-zinc-700">
                What people said about this
              </p>
              <ul className="flex flex-col gap-3">
                {comments.slice(0, VISIBLE_COMMENTS).map((comment) => (
                  <li key={comment.id} className="flex flex-col gap-1">
                    <p className="text-sm leading-snug text-zinc-700">
                      {comment.dishPrefix && (
                        <span className="font-medium text-pm-orange-text">
                          {comment.dishPrefix}{" "}
                        </span>
                      )}
                      {comment.text}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      {comment.upvotes !== undefined && <span>{comment.upvotes} upvotes</span>}
                      {comment.createdAt && <span>{relativeTime(comment.createdAt)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
              <button
                onClick={onSeeAll}
                className="mt-3 text-xs font-medium text-pm-orange-text underline decoration-pm-orange-border underline-offset-2 transition-colors hover:text-pm-charcoal"
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
