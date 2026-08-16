"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloseIcon } from "@/components/icons";
import { QUERY_PARAM } from "@/lib/discoverFilters";

/**
 * Search, as a control that floats at the bottom-right of the screen.
 *
 * It used to sit in the header, which is where a desktop puts it and where a
 * phone shouldn't: the top-right corner is the furthest point on the screen
 * from a thumb holding the device. Down here it mirrors the map's
 * Discover/Friends switch across the bottom edge — the two controls that ride
 * over the map bracket it, and both sit in the band a thumb actually reaches.
 *
 * Closed it is a 48px disc. Open it becomes a full-width field on the same
 * line, because a search field that opened at the far corner would be a 48px
 * box you cannot type a restaurant name into.
 *
 * Submitting goes to Discover with `?q=`, the same thing the web header's
 * search does — a search is a fresh question, not a narrowing of whatever
 * Discover was last left on. `filtersFromSearch` promotes a term that names a
 * real cuisine or neighbourhood into that filter, so searching "thai" lands on
 * Discover with Thai lit in the rail rather than on a text match.
 */
export function PhoneFeedSearch({
  /**
   * Which ground it is sitting on. The map is a dark exception to the cream
   * world (AGENTS.md), so the control has to be legible against night tiles
   * there and against cream everywhere else — same shape, two skins.
   */
  tone = "cream",
}: {
  tone?: "map" | "cream";
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /* Focus follows the disclosure — a field that appears and does not take the
     caret costs a second tap on a phone, where the keyboard is the point. */
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const q = term.trim();
    if (!q) return;
    inputRef.current?.blur();
    router.push(`/m?${QUERY_PARAM}=${encodeURIComponent(q)}`);
  }

  const onMap = tone === "map";

  return (
    /*
     * Sits on the nav's own clearance so it rides just above it, and tracks
     * that variable rather than a copied number so the two cannot drift apart.
     * `pointer-events-none` on the frame with `auto` on the control is what
     * keeps the empty half of this row from swallowing taps meant for the map
     * underneath it.
     */
    <div
      className="pointer-events-none fixed inset-x-0 z-30 px-4"
      style={{ bottom: "calc(var(--phone-nav-space) + 0.25rem)" }}
    >
      {open ? (
        <form
          role="search"
          onSubmit={submit}
          className={`pointer-events-auto flex items-center gap-2 rounded-full py-1 pl-4 pr-1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange ${
            onMap ? "bg-black/60 backdrop-blur-md" : "bg-white"
          }`}
        >
          <SearchGlyph className={onMap ? "shrink-0 text-[#d3dae1]" : "shrink-0 text-pm-grey-text"} />
          <input
            ref={inputRef}
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Search restaurants, cuisines…"
            aria-label="Search restaurants"
            /* 16px, not the 14 the rest of this row would suggest: iOS Safari
               zooms the whole page in when a focused field sets below 16px,
               and a map that jumps scale on a tap reads as a bug. */
            className={`min-h-11 w-full min-w-0 bg-transparent text-[16px] focus:outline-none ${
              onMap
                ? "text-[#F7F4EC] placeholder:text-[#8b939c]"
                : "text-zinc-900 placeholder:text-pm-grey-text"
            }`}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close search"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
              onMap ? "text-[#d3dae1]" : "text-pm-grey-text"
            }`}
          >
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </form>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Search restaurants"
            aria-expanded={false}
            className={`pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange motion-reduce:transition-none ${
              onMap ? "bg-black/60 text-[#F7F4EC] backdrop-blur-md" : "bg-white text-zinc-700"
            }`}
          >
            <SearchGlyph />
          </button>
        </div>
      )}
    </div>
  );
}

/** The same glyph the header and `RestaurantSearch` inline — `components/icons`
    has no magnifier, and adding one there is a change to a shared file this
    component doesn't need to make. */
function SearchGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
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
