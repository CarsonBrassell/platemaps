"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  CUISINE_PARAM,
  NEIGHBORHOOD_PARAM,
  QUERY_PARAM,
  SCOPE_PARAM,
} from "@/lib/discoverFilters";
import {
  MIN_SUGGEST_QUERY,
  type SuggestAnswer,
  type SuggestScope,
} from "@/lib/suggestTypes";

/**
 * The search dropdown's behaviour, with none of its clothes on.
 *
 * There are two search fields in the product — the header's on the web, the
 * always-open one on the phone's Discover screen — and they must offer the same
 * lines, in the same order, answering the same keys. Styling is allowed to
 * differ and does; *behaviour* is not, so all of it lives here and both fields
 * call it. The lines themselves are drawn by `SuggestMenu`.
 *
 * ## What the dropdown is for
 *
 * A typed word is genuinely ambiguous: "little italy" is a neighbourhood,
 * "birria taco" is a dish, "thai" is a cuisine, "kairoa" is a restaurant. The
 * dropdown is where the visitor says which one they meant, and there is exactly
 * one line per reading with the number of restaurants behind it — Calvin: "one
 * selection for dishes, one selection for restaurants and one selection for
 * food or whatever", and "(cannonball dishes 2 results)". It is deliberately
 * not a list of names: a menu of names has to guess which three of four hundred
 * to print, while a menu of readings answers the question the visitor has and
 * hands the rest to the grid.
 *
 * Pressing Enter without picking is the other answer, and it falls through to
 * the ranked search where names beat cuisines beat dishes. Both halves are
 * Calvin's spec.
 *
 * ## Keyboard
 *
 * Arrows run down the lines, All first. Up past the first lands back on nothing, so
 * there is a way out of the list and back to plain Enter without deleting a
 * letter. Enter commits the highlight or, with nothing highlighted, runs the
 * search. Escape closes without committing.
 */

/** No row highlighted — the state every fresh keystroke returns to. */
export const NONE = -1;

/**
 * One request per settled query, not per keystroke. 150ms is below the point a
 * typist notices and above the gap between characters, so a word typed at speed
 * costs one request instead of six. It matters more here than it looks: the
 * dish reading is a database round trip (lib/suggest.ts).
 */
const DEBOUNCE_MS = 150;

type Options = {
  /** The raw field text, exactly as typed. */
  query: string;
  /** Whether the menu is on screen. Closed costs no request. */
  open: boolean;
  /** Commit one line — the caller navigates, because the href is surface-local. */
  onPick: (scope: SuggestScope) => void;
  /** Enter with nothing highlighted: the ranked search. */
  onSubmit: () => void;
  /** Escape. */
  onClose: () => void;
};

export function useSuggest({ query, open, onPick, onSubmit, onClose }: Options) {
  const [answer, setAnswer] = useState<SuggestAnswer | null>(null);
  const [active, setActive] = useState(NONE);
  const listId = useId();

  const q = query.trim();
  const asking = open && q.length >= MIN_SUGGEST_QUERY;

  /* Reset the highlight the moment the term changes, during render rather than
     in an effect: the second line against "birri" is not the same line once
     the "a" lands, and committing the old index after the list has been
     replaced would navigate somewhere the visitor never looked at. */
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setActive(NONE);
  }

  /*
   * The cleanup both cancels the pending timer and marks the in-flight response
   * stale, which is what stops a slow "th" from landing after a fast "thai".
   * The echoed `query` is checked as well, because the edge cache can serve a
   * response for a term this field has already moved past.
   *
   * A too-short or closed field simply doesn't ask, and the last answer is left
   * in state rather than cleared — `scopes` below is what decides whether it is
   * shown, so nothing here has to set state to hide something.
   */
  useEffect(() => {
    if (!asking) return;

    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/discover/suggest?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data: SuggestAnswer = await res.json();
        if (!stale && data.query === q) setAnswer(data);
      } catch {
        // A dropped request leaves the previous lines on screen, which is a
        // better answer than emptying the list under someone mid-word.
      }
    }, DEBOUNCE_MS);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [q, asking]);

  /* Already ordered by the server — restaurants, cuisines, neighbourhoods,
     dishes, which is the ranked search's own order, so the dropdown never
     implies a priority that Enter would then contradict. Readings with nothing
     behind them never arrive at all. */
  const scopes = useMemo(() => (asking && answer ? answer.scopes : []), [asking, answer]);

  /**
   * True when nothing was matched literally and every line on offer is a
   * correction. It is all-or-nothing by construction — `suggest` in
   * lib/suggest.ts counts literal hits everywhere first and only falls back to
   * the similarity band when there are none — so this is one notice above the
   * list rather than a "Did you mean" repeated on each of four lines.
   */
  const correcting = scopes.length > 0 && scopes.every((s) => s.fuzzy);

  /** A stable id per row, for `aria-activedescendant` on the input. */
  const optionId = (index: number) => `${listId}-option-${index}`;

  function pick(scope: SuggestScope) {
    setActive(NONE);
    onPick(scope);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      // A highlighted line means the visitor arrowed to one reading and meant
      // that one. Everything else — the common case — is the ranked search.
      event.preventDefault();
      const picked = asking ? scopes[active] : undefined;
      if (picked) pick(picked);
      else onSubmit();
      return;
    }

    if (!asking) return;

    if (event.key === "Escape") {
      setActive(NONE);
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, scopes.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, NONE));
    }
  }

  return {
    scopes,
    correcting,
    active,
    setActive,
    listId,
    optionId,
    activeId: active === NONE ? undefined : optionId(active),
    onKeyDown,
    pick,
  };
}

/**
 * The facet param a line becomes, when it becomes one — `?cuisine=`,
 * `?neighborhood=`, or nothing.
 *
 * Exported because the phone's field asks the same question for a different
 * reason: a pick that turned into a filter has to *empty* the box, since the
 * chip above the grid is where it reads back now, while a pick that stayed a
 * text search has to leave the term in it or the field and the URL disagree.
 * One predicate, so those two answers cannot drift apart.
 */
export function facetParamFor(scope: SuggestScope): string | null {
  if (!scope.value) return null;
  if (scope.kind === "cuisine") return CUISINE_PARAM;
  if (scope.kind === "neighborhood") return NEIGHBORHOOD_PARAM;
  return null;
}

/**
 * Where picking a line goes, and there are four answers.
 *
 * **All** goes to `?q=…&in=all`, the ranked search over every reading. Not a
 * bare `?q=`, which is what Enter produces and is *not* the same page: a bare
 * term that names a cuisine is promoted into `?cuisine=Thai` by `promote` in
 * lib/discoverFilters.ts, so it would land on 178 places under a line that
 * counted 723. `in=all` narrows nothing and exists only to say "already
 * chosen — do not promote" (`ALL_SCOPE`). It is a line rather than only a key
 * because the default was otherwise the one answer with nothing on screen
 * naming it.
 *
 * **One restaurant** is a place, not a narrowing, and gets its own page —
 * typing a name to go somewhere is the commonest thing this field is used for
 * and it was one click before the dropdown existed.
 *
 * **One cuisine or one neighbourhood** goes to the facet param the rail already
 * speaks (`?cuisine=Thai`), so the filter lights up and can be taken off again.
 * That is the whole point of the dropdown: the visitor has just told us "little
 * italy" was a neighbourhood rather than a phrase to text-match.
 *
 * **Everything else** — several cuisines, any dish line — goes to the ranked
 * search *scoped* to that reading (`?q=…&in=dish`). There is no single facet
 * value for "the two cuisines that look like this", and `in=` is the honest URL
 * for it: the same relevance ladder, filtered to the field that matched
 * (`scopeOf` in lib/textMatch.ts). Dish lines land here always, because
 * `?dish=` is an equality on menu wording and this line is asking the looser
 * question the count was measured with.
 *
 * `scope.term`, not the typed text: a corrected dish searches for the
 * correction, which is the only spelling the grid can find (see `term` on
 * SuggestScope). A facet pick drops `?q=` entirely — the typed term and the
 * picked filter are two readings of the same intent, so keeping both would AND
 * a misspelling against the correct filter and return an empty grid, the exact
 * failure Calvin reported. `shown` goes for the usual reason: it is the "Show
 * more" cursor, and carrying it into a new result set pages a list nobody has
 * seen the start of.
 *
 * `carry` is what the surface wants kept. The phone's field merges into the
 * filters already on screen; the web header's is a fresh question and passes
 * nothing. Both were true before this dropdown existed and stay true.
 */
export function hrefForScope(scope: SuggestScope, base: string, carry?: URLSearchParams): string {
  if (scope.kind === "restaurant" && scope.value) return `/restaurant/${scope.value}`;

  const next = new URLSearchParams(carry?.toString() ?? "");
  next.delete(QUERY_PARAM);
  next.delete(SCOPE_PARAM);
  next.delete("shown");

  const facet = facetParamFor(scope);
  if (facet) {
    next.set(facet, scope.value as string);
  } else {
    next.set(QUERY_PARAM, scope.term);
    /* Including `in=all`, which narrows to nothing and is still not the same
       URL as a bare `?q=`: it is what tells the grid not to promote the term
       into a filter (`ALL_SCOPE` in lib/discoverFilters.ts). Dropping it would
       send "thai" to the 178 places whose cuisine is Thai, under a line that
       counted 723. */
    next.set(SCOPE_PARAM, scope.kind);
  }

  const query = next.toString();
  return query ? `${base}?${query}` : base;
}
