type SheetDish = {
  id: string;
  name: string;
  price: string;
  pct: number | null;
  total: number;
};

export function DishSheet({
  dish,
  myVote,
  onVote,
  onClose,
}: {
  dish: SheetDish;
  myVote: "yes" | "no" | undefined;
  onVote: (vote: "yes" | "no") => void;
  onClose: () => void;
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
        </div>
      </div>
    </div>
  );
}
