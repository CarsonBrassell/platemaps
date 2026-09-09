"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { QUERY_PARAM } from "@/lib/discoverFilters";
import { SuggestMenu } from "@/components/SuggestMenu";
import { hrefForScope, useSuggest } from "@/components/useSuggest";
import type { SuggestScope } from "@/lib/suggestTypes";

/**
 * Header search over the restaurant list.
 *
 * ## Two answers, and Enter picks the broad one
 *
 * The dropdown is where an ambiguous word gets *disambiguated*: it offers the
 * term read four ways — as a restaurant, a cuisine, a neighbourhood, a dish —
 * and picking a row commits to that reading. Enter is the other question —
 * "show me everything like this" — and it goes to Discover with the term
 * applied, where the rail, the counts and the grid all narrow to it together,
 * ranked so that names beat cuisines beat dishes.
 *
 * So arrowing into the list is what commits to one reading. Enter with nothing
 * highlighted — which is every Enter typed straight after a word — is the
 * search. lib/suggest.ts holds the readings and why they are ordered that way;
 * components/useSuggest.ts holds the keys and where a pick goes.
 *
 * ## On /feed the broad answer is the feed
 *
 * This is one field standing over the whole product, and the "show me
 * everything like this" it commits to has to mean the screen the reader is
 * looking at. Typing "mexican" here while reading the feed used to leave the
 * feed entirely for a grid of restaurants — a reasonable answer to a question
 * nobody asked, and it made the field look broken on the one screen where the
 * search was most obviously about the plates. On /feed it writes `?q=` onto
 * /feed instead, where it matches captions, dishes, restaurants and the
 * comments on a plate (lib/feedFilters.ts). Everywhere else it still goes to
 * Discover.
 *
 * The dropdown is unchanged on both, with one exception it has to make: a
 * cuisine, neighbourhood or dish row is a *Discover filter*, and those params
 * mean nothing on /feed, so those rows always land on Discover. A restaurant
 * row goes to its own page, as it always did.
 */

export function RestaurantSearch() {
  const router = useRouter();
  const pathname = usePathname();
  /** Which screen the broad answer belongs to — see the header comment. */
  const destination = pathname === "/feed" ? "/feed" : "/";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const showing = open && query.trim().length > 0;

  /**
   * Hand the term to Discover.
   *
   * A soft navigation, so the grid re-renders in place and the field keeps the
   * text that produced it — searching twice in a row shouldn't cost a document
   * load, and the term staying put is what makes the second search an edit of
   * the first.
   *
   * Only `q` goes on the URL: a search from the header is a fresh question, not
   * a narrowing of whatever the last visit had left switched on.
   */
  function submit() {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    inputRef.current?.blur();
    router.push(`${destination}?${QUERY_PARAM}=${encodeURIComponent(q)}`);
  }

  /**
   * Commit one reading off the dropdown.
   *
   * The field is rewritten to the row's own spelling first, and on a correction
   * that is the whole point: picking "Vietnamese" under a typed "vietnemese"
   * has to show what was understood rather than leave the misspelling sitting
   * in the box looking like it worked by accident. Enter never does this — it
   * never auto-corrects — which is why the rewrite lives here and not in
   * `submit`.
   */
  function pickScope(scope: SuggestScope) {
    setQuery(scope.label);
    setOpen(false);
    inputRef.current?.blur();
    // Nothing carried, and always Discover: a search from the header is a fresh
    // question, and a cuisine or dish param is only a filter over there.
    router.push(hrefForScope(scope, "/"));
  }

  const suggest = useSuggest({
    query,
    open: showing,
    onPick: pickScope,
    onSubmit: submit,
    onClose: () => setOpen(false),
  });

  // The width lives on this wrapper rather than on the input so the field can
  // shrink below its preferred size when the header row is tight, instead of
  // holding its size and running under the nav.
  //
  // Held at 224px deliberately: this field is the bulk of the header's right
  // group, and that group is sized to match the left one (brand + city) so the
  // centred nav oval sits between two equal gaps — 134px and 143px at 1280.
  // Widening it here pulls the header out of symmetry, it does not decentre the
  // nav; the grid in Header.tsx owns the centring.
  //
  // 224px is now the width at every size the field is shown at. It used to step
  // up from `w-40` at `lg`, which left 102px of room for a placeholder that
  // measures 134px — so from 640px to 1023px the field read "Search restaura",
  // cut mid-word with no ellipsis. Nothing was gained by the narrower step:
  // below `xl` the nav row is hidden (see Header.tsx), so the header is a
  // two-end flex with the whole middle empty and the extra 64px costs nothing.
  // The pinned width above still describes `xl`, where it does matter.
  return (
    <div ref={wrapRef} className="relative hidden w-56 min-w-0 sm:block">
      <div className="flex items-center gap-2.5 rounded-full bg-white px-4 py-2 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 text-zinc-500"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={suggest.onKeyDown}
          placeholder="Search restaurants…"
          aria-label="Search restaurants, cuisines, neighborhoods and dishes"
          aria-expanded={showing}
          aria-controls={suggest.listId}
          aria-activedescendant={suggest.activeId}
          aria-autocomplete="list"
          role="combobox"
          autoComplete="off"
          className="w-full min-w-0 bg-transparent text-base md:text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            aria-label="Clear search"
            className="shrink-0 text-zinc-500 transition-colors hover:text-zinc-900"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Anchored right, not left: the field now sits in the header's right
          group next to the avatar, and this menu is wider than the field, so a
          left anchor would push it off the right edge of the viewport.

          `max-h` plus a scroll because the correction notice can sit above the
          four lines, and a menu that runs off the bottom of a short window
          hides the row that hands the term to the search. */}
      {showing && (
        <SuggestMenu
          variant="web"
          className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-2xl bg-white py-1.5"
          scopes={suggest.scopes}
          correcting={suggest.correcting}
          active={suggest.active}
          setActive={suggest.setActive}
          listId={suggest.listId}
          optionId={suggest.optionId}
          hrefFor={(scope) => hrefForScope(scope, "/")}
          onPick={suggest.pick}
          query={query.trim()}
          submitLabel={destination === "/feed" ? "Search the feed for" : "Search Discover for"}
          onSubmit={submit}
        />
      )}
    </div>
  );
}
