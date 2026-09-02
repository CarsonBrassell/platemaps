"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { QUERY_PARAM } from "@/lib/discoverFilters";

/**
 * Search, on the Discover screen.
 *
 * Discover could be *narrowed* by `?q=` since the filter model was written —
 * `filtersFromSearch` parses it, the heading reads from it, and it renders as
 * a removable chip in the summary row — but nothing on the screen could
 * produce one. The only way to get a term into this page was to submit the
 * feed's search and be navigated here, which meant a visitor standing on 4,792
 * places with a restaurant name in mind had no box to type it in.
 *
 * ## An always-visible field, not a disclosure
 *
 * The feed's search (`PhoneFeedSearch`) hides behind a glyph, and that is right
 * *there*: the feed is a reading surface, its row is shared with the sort
 * switch, and a permanent field would cost a row on a screen whose job is to
 * show plates. Discover is the opposite — it is the finding surface, the
 * question a visitor arrives with is usually a name, and it already spends a
 * row on Filters. So this is a real field, open, with a placeholder that says
 * what it takes.
 *
 * ## The URL is still the query
 *
 * Submitting merges `q` into the params already there rather than replacing
 * them, so a search inside "Pizza · Open now" keeps both. Clearing the box and
 * submitting removes the key, which is the same gesture the summary chip's
 * Clear performs — two ways to the same state, deliberately.
 *
 * `shown` is dropped on every submit: it is the "Show more" cursor, and
 * carrying it into a new result set would page a list the visitor has not
 * seen the start of.
 */

export function PhoneDiscoverSearch({ value = "" }: { value?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Reseeded when the term changes from outside — the chip's Clear, or a
     filter reset. Compared against the last value seen rather than set
     unconditionally, so this cannot fight the caret mid-word. */
  const seen = useRef(value);
  useEffect(() => {
    if (value === seen.current) return;
    seen.current = value;
    setTerm(value);
  }, [value]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const q = term.trim();
    inputRef.current?.blur();
    seen.current = q;

    const next = new URLSearchParams(params.toString());
    if (q) next.set(QUERY_PARAM, q);
    else next.delete(QUERY_PARAM);
    next.delete("shown");

    const query = next.toString();
    router.push(query ? `/m?${query}` : "/m");
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className="flex min-h-11 items-center gap-2.5 rounded-full bg-white px-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange"
    >
      <SearchGlyph />
      <input
        ref={inputRef}
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        enterKeyHint="search"
        autoComplete="off"
        placeholder="Search restaurants, cuisines…"
        aria-label="Search restaurants and cuisines"
        /* 16px, not the 14 this row would suggest: iOS Safari zooms the whole
           page in when a focused field sets below 16px, and a screen that jumps
           scale on a tap reads as a bug. */
        className="min-w-0 flex-1 bg-transparent text-[16px] text-zinc-900 placeholder:text-pm-grey-text focus:outline-none"
      />
      {term && (
        <button
          type="button"
          onClick={() => {
            setTerm("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="-mr-1.5 flex h-11 w-8 shrink-0 items-center justify-center rounded-full text-pm-grey-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </form>
  );
}

/** `components/icons` has no magnifier, and adding one there is a change to a
    shared file this component does not need to make. */
function SearchGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="shrink-0 text-pm-grey-text"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
