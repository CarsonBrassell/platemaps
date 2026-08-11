import Link from "next/link";
import type { ReactNode } from "react";
import { Header } from "@/components/Header";

/**
 * DRAFT SURFACE — the cream page chrome the three variant routes share.
 *
 * The map is the point, so everything above it is deliberately thin: what the
 * variant is, what to look at, and a way back to the index. The "draft" marker
 * is not decoration — these routes are reachable by URL and nothing else says
 * they are not the product.
 */
export function DraftPageShell({
  name,
  tag,
  summary,
  watchFor,
  backLabel = "← All three",
  children,
}: {
  name: string;
  tag: string;
  summary: string;
  /** The specific thing this variant is most likely to fail at. */
  watchFor: string;
  /** Defaults to the three full-field variants this shell was written for; the
   *  shapes gallery overrides it because it is not one of the three. */
  backLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl pb-12">
      <Header />

      <div className="px-4 pt-2 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-center justify-between gap-3">
            <p className="mono-label text-pm-orange-text">Draft · {tag}</p>
            <Link
              href="/drafts/map-search"
              className="mono-label min-h-11 leading-[44px] text-pm-grey-text transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              {backLabel}
            </Link>
          </div>
          <h1 className="font-display text-3xl font-semibold text-zinc-900">{name}</h1>
          <p className="mt-2 text-sm text-pm-grey-text">{summary}</p>
          <p className="mt-2 text-sm text-pm-grey-text">
            <span className="mono-label text-zinc-900">Watch for</span> {watchFor}
          </p>

          <div className="mt-5">{children}</div>

          <p className="mt-4 text-sm text-pm-grey-text">
            The map is live: pan into Gaslamp, Little Italy or North Park to read
            the field over the district heatmap, and out to the county view to
            read it over open water. Bubbles are the seeded map chatter, so no
            sign-in is needed and no vote chips are drawn.
          </p>
        </div>
      </div>
    </div>
  );
}
