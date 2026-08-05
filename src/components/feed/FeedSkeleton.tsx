/** Placeholder cards shaped like FoodPostCard so the feed doesn't jump on load. */
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm"
        >
          <div className="flex items-center gap-3 p-4">
            <div className="skeleton h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3 w-32 rounded" />
              <div className="skeleton h-2.5 w-20 rounded" />
            </div>
          </div>
          <div className="px-4 pb-3">
            <div className="skeleton h-5 w-2/3 rounded" />
          </div>
          <div className="skeleton aspect-[4/3] w-full" />
          <div className="space-y-2 p-4">
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-4/5 rounded" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading posts…</span>
    </div>
  );
}

export function LeaderboardSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="skeleton h-5 w-5 rounded" />
          <div className="skeleton h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-2.5 w-24 rounded" />
            <div className="skeleton h-2 w-16 rounded" />
          </div>
          <div className="skeleton h-3 w-12 rounded" />
        </div>
      ))}
    </div>
  );
}
