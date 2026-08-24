"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The feed's own search field.
 *
 * It exists for one width. From `sm` up, the header's `RestaurantSearch` *is*
 * the feed's search bar — typing there and pressing Enter writes `?q=` onto
 * `/feed` and this page narrows to it — and a second field on the same screen
 * would be two controls answering one question. Below `sm` that field is
 * `hidden`, and without this there would be no way to type a term at all.
 *
 * ## Why it debounces rather than waiting for Enter
 *
 * The term lives in the URL, so every change is a `router.replace`. Firing that
 * per keystroke is churn; making the reader press Enter to see anything happen
 * on a list that is already in memory is stiffer than the interaction deserves.
 * 250ms is below the point a typist notices and above the gap between
 * characters — the same reasoning, and the same order of magnitude, as the
 * debounce on the header's own field. Enter still commits immediately and
 * dismisses the keyboard, which is what an `enterKeyHint="search"` promises.
 *
 * `value` is the term as the URL currently holds it. It is copied into local
 * state on mount and whenever it changes from outside — clearing the search
 * from the summary line above the feed has to empty the box.
 */
export function FeedSearchField({
  value,
  onSubmit,
}: {
  value: string;
  onSubmit: (q: string) => void;
}) {
  const [term, setTerm] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  /* What the caller was last told. Compared against `value` so an external
     change (a Clear, a fresh search from the header) reseeds the box, while
     the echo of this component's own submit does not fight the caret. */
  const sent = useRef(value);

  useEffect(() => {
    if (value === sent.current) return;
    sent.current = value;
    setTerm(value);
  }, [value]);

  useEffect(() => {
    if (term === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = term;
      onSubmit(term);
    }, 250);
    return () => clearTimeout(timer);
  }, [term, onSubmit]);

  function commit() {
    sent.current = term;
    onSubmit(term);
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
        inputRef.current?.blur();
      }}
      className="flex items-center gap-2.5 rounded-full bg-white px-4 py-1 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange"
    >
      <SearchGlyph className="shrink-0 text-zinc-500" />
      <input
        ref={inputRef}
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        enterKeyHint="search"
        autoComplete="off"
        placeholder="Search plates, places, comments…"
        aria-label="Search the feed"
        /* 16px rather than the 14 the rest of this column uses: iOS Safari
           zooms the page when a focused field sets below 16px, and a screen
           that jumps scale on a tap reads as a bug. */
        className="min-h-11 w-full min-w-0 bg-transparent text-[16px] text-zinc-900 placeholder:text-zinc-500 focus:outline-none"
      />
      {term && (
        <button
          type="button"
          onClick={() => {
            setTerm("");
            sent.current = "";
            onSubmit("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="shrink-0 text-zinc-500 transition-colors hover:text-zinc-900"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </form>
  );
}

/** The magnifier the header and the phone's field both inline — `components/icons`
    still has none, and adding one there is a change to a shared file this
    component doesn't need to make. */
function SearchGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
