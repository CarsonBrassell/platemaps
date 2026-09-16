"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { publishQuery } from "@/lib/queryString";

/**
 * The one `useSearchParams` call. Rendered inside `<Suspense fallback={null}>`
 * by a static page (or the phone layout, once for every screen under `/m`),
 * it renders nothing and publishes the query string to lib/queryString.ts on
 * every navigation, which is how the rest of the tree reads the URL without
 * opting itself out of the prerender. See that module for why.
 */
export function QuerySync() {
  const raw = useSearchParams().toString();
  useEffect(() => {
    publishQuery(raw);
  }, [raw]);
  // Leaving the page forgets the query, so the next one starts from its own
  // URL (the store falls back to `window.location`) rather than this one.
  useEffect(() => () => publishQuery(null), []);
  return null;
}
