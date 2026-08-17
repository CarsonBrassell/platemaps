"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { initials } from "@/lib/format";

type SearchResult = { id: string; name: string; avatarUrl?: string };

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * Find someone by name/handle to friend — the search PhoneFriendsScreen's own
 * box doesn't do, since that one only filters the friends you already have
 * (see its header comment). This one hits `/api/users/search`, a real query
 * over every user.
 *
 * Status per row is read from the three lists the screen already fetched
 * (`friendIds`, `incomingIds`, `outgoingIds`) rather than a second network
 * call per result — the same "handed data, not asked to refetch it"
 * discipline as everywhere else in this tree. Sending a request updates that
 * row's own state optimistically and calls `onSent` so the parent's Requests
 * section — a different rendering of the same outgoing list — picks it up
 * too, rather than the two silently disagreeing until the next reload.
 */
export function PhoneFindFriends({
  friendIds,
  incomingIds,
  outgoingIds,
  onSent,
}: {
  friendIds: string[];
  incomingIds: string[];
  outgoingIds: string[];
  onSent: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [justSent, setJustSent] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // No setState here for the too-short case — the render below already
    // gates on `query.trim().length >= 2`, so a stale `results` from a
    // longer query just won't render once the box is cleared or shortened.
    if (trimmed.length < 2) return;
    const seq = ++requestSeq.current;
    debounceRef.current = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`)
        .then((r) => r.json())
        .then((data: { results: SearchResult[] }) => {
          // A slower earlier request landing after a faster later one would
          // flash stale results for the query that's no longer in the box.
          if (seq === requestSeq.current) setResults(data.results ?? []);
        })
        .catch(() => {
          if (seq === requestSeq.current) setResults([]);
        });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function sendRequest(userId: string) {
    setPendingId(userId);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("failed");
      setJustSent((prev) => new Set(prev).add(userId));
      onSent();
    } catch {
      /* Button just stays as "Add" — nothing changed to roll back. */
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="px-4">
      <p className="mono-label mb-2 text-pm-grey-text">Find friends</p>
      <div
        className={`mb-2 flex min-h-11 items-center gap-2.5 rounded-full bg-white px-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange`}
      >
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
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username..."
          aria-label="Search by username"
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-zinc-900 placeholder:text-zinc-500 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className={`-mr-1.5 flex h-11 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors ${FOCUS}`}
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
      </div>

      {query.trim().length >= 2 && results !== null && (
        <ul className="mb-2 flex flex-col gap-2">
          {results.length === 0 ? (
            <li className="rounded-2xl bg-white px-4 py-4 text-center text-sm text-zinc-500">
              No one matching &ldquo;{query.trim()}&rdquo;
            </li>
          ) : (
            results.map((person) => {
              const isFriend = friendIds.includes(person.id);
              const isIncoming = incomingIds.includes(person.id);
              const isOutgoing = outgoingIds.includes(person.id) || justSent.has(person.id);
              return (
                <li
                  key={person.id}
                  className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-2.5"
                >
                  {person.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={person.avatarUrl}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint font-mono text-sm font-medium text-pm-grey-text">
                      {initials(person.name)}
                    </span>
                  )}
                  <Link
                    href={`/m/u/${person.id}`}
                    className={`font-display min-w-0 flex-1 truncate rounded-lg text-[15px] font-semibold text-zinc-900 ${FOCUS}`}
                  >
                    {person.name}
                  </Link>
                  {isFriend ? (
                    <span className="mono-label shrink-0 text-pm-grey-text">Friends</span>
                  ) : isIncoming ? (
                    <span className="mono-label shrink-0 text-pm-grey-text">Respond above</span>
                  ) : isOutgoing ? (
                    <span className="mono-label shrink-0 text-pm-grey-text">Requested</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => sendRequest(person.id)}
                      disabled={pendingId === person.id}
                      className={`min-h-9 shrink-0 rounded-full bg-pm-orange px-3.5 text-xs font-medium text-[#F7F4EC] transition-transform active:scale-[0.97] disabled:opacity-50 ${FOCUS}`}
                    >
                      Add
                    </button>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
