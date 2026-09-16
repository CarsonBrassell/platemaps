"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * "Back to discover" — history-aware.
 *
 * A hardcoded `href="/"` meant every arrival lost whatever got the reader
 * here in the first place: filter Discover down to one cuisine, open a
 * restaurant, tap back, land on an unfiltered grid scrolled to the top. When
 * this tab actually has a previous page, `router.back()` returns to that
 * exact state — filters and scroll position included, since they are the
 * browser's own history state, not anything this app has to reconstruct.
 *
 * `window.history.length <= 1` is the signal for "this tab has nowhere to go
 * back to" — a restaurant link opened directly, in a new tab, or as the first
 * page of the session — and only then does the link fall through to its
 * plain `href="/"`, the discover root.
 */
export function BackLink() {
  const router = useRouter();

  return (
    <Link
      href="/"
      onClick={(e) => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full text-sm text-zinc-500 transition-all hover:-translate-x-0.5 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Back to discover
    </Link>
  );
}
