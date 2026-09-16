"use client";

import { useEffect, useRef } from "react";

/**
 * The bottom of a paged feed (probe/PERF-PLAN.md S5).
 *
 * A sentinel that asks for the next page as it scrolls into view — 600px
 * early, so on a normal scroll the page is there before the reader reaches
 * the gap — with a button in it for anyone whose browser has no
 * IntersectionObserver or who wants to pull the next page deliberately.
 * Renders nothing once the feed has run out; `EndOfFeed` takes over then.
 */
export function FeedLoadMore({
  hasMore,
  loading,
  onMore,
}: {
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || loading) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, onMore]);

  if (!hasMore) return null;

  return (
    <div ref={ref} className="flex justify-center py-6">
      {loading ? (
        <p className="mono-label text-pm-grey-text" aria-live="polite">
          Loading more…
        </p>
      ) : (
        <button
          type="button"
          onClick={onMore}
          className="mono-label min-h-11 rounded-full px-5 text-pm-grey-text transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          Show more
        </button>
      )}
    </div>
  );
}
