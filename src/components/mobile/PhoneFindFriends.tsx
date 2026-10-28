"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { avatarPalette, initials } from "@/lib/format";
import { PhoneSectionLabel } from "@/components/mobile/PhoneSectionLabel";
import { VerifiedBadge } from "@/components/VerifiedBadge";

/** Mirrors lib/db.ts's PersonReason — that module is server-only. */
type PersonReason =
  | { kind: "friend" }
  | { kind: "requested" }
  | { kind: "incoming" }
  | { kind: "mutual"; via: string[] }
  | { kind: "sharedPlaces" }
  | { kind: "none" };

/** Mirrors lib/db.ts's UserSearchResult, same reason. */
type Person = { id: string; name: string; avatarUrl?: string; reason: PersonReason };

type FriendLite = { id: string; name: string; avatarUrl?: string };

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

const RECENT_MAX = 6;

function handleFor(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Per-viewer lists kept in this browser only — who you looked up recently and
 * which suggestions you waved off. Conveniences, so every read and write is
 * allowed to fail (private mode, blocked storage) and the screen works the
 * same without them, just without the memory.
 */
function readList<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, list: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* Memory only — see readList. */
  }
}

/**
 * Find someone to friend — a typeahead over every member, from the first
 * letter. PhoneFriendsScreen's own box only filters the friends you already
 * have (see its header comment); this one hits `/api/users/search`, which
 * ranks the person you most likely mean first: friends, then people your
 * friends know, then people you've traded comments with, then name matches.
 * The ranking lives in `searchUsers` in lib/db.ts; nothing here reorders it.
 *
 * Three things make it feel instant rather than like a form:
 *
 * - **Friends answer before the network does.** The screen already holds your
 *   friends list, so the first letter shows matching friends immediately, and
 *   the server's ranked list replaces them when it lands. The server ranks
 *   friends first anyway, so the swap rarely moves anything.
 * - **An empty box isn't empty.** It shows the people you opened from here
 *   recently while the box has focus, and "People you may know" — friends of
 *   friends, then people who rate the places you do — below it.
 * - **Return opens the top result**, the way a search box that's sure of
 *   itself should.
 *
 * Status per row is read from the three lists the screen already fetched
 * (`friendIds`, `incomingIds`, `outgoingIds`) rather than trusting the
 * reason the server sent with the row, so a request you send here and a
 * friend you remove further down agree immediately. Sending a request calls
 * `onSent` so the parent's Requests section picks it up too.
 *
 * **No counts.** A suggestion names up to two of your own friends it's
 * friends with and never says how many — friend counts never display in this
 * product (see PhoneFriendsScreen), and "12 mutual friends" is one.
 */
export function PhoneFindFriends({
  viewerId,
  friends,
  friendIds,
  incomingIds,
  outgoingIds,
  onSent,
}: {
  viewerId: string;
  friends: FriendLite[];
  friendIds: string[];
  incomingIds: string[];
  outgoingIds: string[];
  onSent: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; people: Person[] } | null>(null);
  const [suggestions, setSuggestions] = useState<Person[] | null>(null);
  const recentKey = `platemap:recent-people:${viewerId}`;
  const dismissedKey = `platemap:pymk-dismissed:${viewerId}`;
  // Read in the initializer: this block only mounts once auth has resolved on
  // the client (the screen shows a sign-in card until then), so there is no
  // server render of it for storage to disagree with.
  const [recent, setRecent] = useState<FriendLite[]>(() =>
    typeof window === "undefined" ? [] : readList<FriendLite>(recentKey),
  );
  const [dismissed, setDismissed] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readList<string>(dismissedKey),
  );
  const [focused, setFocused] = useState(false);
  const [justSent, setJustSent] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    let live = true;
    fetch("/api/users/search?q=")
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data: { results?: Person[] }) => {
        if (live) setSuggestions(data.results ?? []);
      })
      .catch(() => {
        if (live) setSuggestions([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return;
    const seq = ++requestSeq.current;
    // Short, because the friends-first local answer already covers the gap;
    // the debounce only stops a fast typist sending every letter.
    const timer = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((data: { results?: Person[] }) => {
          // A slower earlier request landing after a faster later one would
          // flash stale results for the query that's no longer in the box.
          if (seq === requestSeq.current) setResults({ q: trimmed, people: data.results ?? [] });
        })
        .catch(() => {
          if (seq === requestSeq.current) setResults({ q: trimmed, people: [] });
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [trimmed]);

  /* Friends whose handle, or any word of whose name, starts with what's typed
     — the same prefix rules as the server's top tiers, so the server's list
     agrees with this one about who belongs at the top. */
  const localMatches = useMemo<Person[]>(() => {
    if (!trimmed) return [];
    const q = fold(trimmed).replace(/\s+/g, " ");
    const qHandle = q.replace(/ /g, "");
    return friends
      .filter((f) => {
        const name = fold(f.name);
        return (
          name.replace(/\s+/g, "").startsWith(qHandle) ||
          ` ${name.replace(/\s+/g, " ")}`.includes(` ${q}`)
        );
      })
      .slice(0, 6)
      .map((f) => ({ ...f, reason: { kind: "friend" } as const }));
  }, [friends, trimmed]);

  const serverFresh = results !== null && results.q === trimmed;
  const shown: Person[] = serverFresh ? results.people : localMatches;
  const waiting = Boolean(trimmed) && !serverFresh;

  const visibleSuggestions = (suggestions ?? []).filter(
    (p) =>
      !dismissed.includes(p.id) &&
      !friendIds.includes(p.id) &&
      !incomingIds.includes(p.id),
  );

  function remember(person: FriendLite) {
    const next = [
      { id: person.id, name: person.name, avatarUrl: person.avatarUrl },
      ...recent.filter((r) => r.id !== person.id),
    ].slice(0, RECENT_MAX);
    setRecent(next);
    writeList(recentKey, next);
  }

  function forget(id: string) {
    const next = recent.filter((r) => r.id !== id);
    setRecent(next);
    writeList(recentKey, next);
  }

  function dismiss(id: string) {
    const next = [...dismissed, id];
    setDismissed(next);
    writeList(dismissedKey, next);
  }

  async function sendRequest(person: FriendLite) {
    setPendingId(person.id);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: person.id }),
      });
      if (!res.ok) throw new Error("failed");
      setJustSent((prev) => new Set(prev).add(person.id));
      if (trimmed) remember(person);
      onSent();
    } catch {
      /* Button just stays as "Add" — nothing changed to roll back. */
    } finally {
      setPendingId(null);
    }
  }

  function statusFor(id: string): "friend" | "incoming" | "requested" | null {
    if (friendIds.includes(id)) return "friend";
    if (incomingIds.includes(id)) return "incoming";
    if (outgoingIds.includes(id) || justSent.has(id)) return "requested";
    return null;
  }

  const profileHref = (id: string) => `/m/u/${id}?from=friends`;

  return (
    <div
      className="px-4"
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        // Moving focus to a row inside this block (tapping a recent name)
        // must not collapse the list out from under the tap.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <PhoneSectionLabel>Find friends</PhoneSectionLabel>
      {/* Warm tone instead of plain white — a small echo of the hero and
          leaderboard cards above and below it, rather than a bare pill
          floating on cream. */}
      <div
        className={`mb-2 flex min-h-11 items-center gap-2.5 rounded-full bg-[var(--pm-tone-2)] px-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 text-pm-orange-text"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown[0]) {
              e.preventDefault();
              remember(shown[0]);
              router.push(profileHref(shown[0].id));
            } else if (e.key === "Escape") {
              setQuery("");
            }
          }}
          placeholder="Search names or @usernames"
          aria-label="Search people by name or username"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-zinc-900 placeholder:text-zinc-500 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className={`-mr-1.5 flex h-11 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors ${FOCUS}`}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {trimmed ? (
        <ul className="mb-2 flex flex-col gap-2" aria-busy={waiting}>
          {shown.length === 0 ? (
            waiting ? null : (
              <li className="rounded-2xl bg-white px-4 py-5 text-center">
                <p className="font-display text-[15px] font-semibold text-zinc-900">
                  No one called &ldquo;{trimmed}&rdquo;
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  Check the spelling, or try the start of their username.
                </p>
              </li>
            )
          ) : (
            shown.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                href={profileHref(person.id)}
                status={statusFor(person.id)}
                pending={pendingId === person.id}
                onOpen={() => remember(person)}
                onAdd={() => sendRequest(person)}
              />
            ))
          )}
        </ul>
      ) : (
        <>
          {focused && recent.length > 0 && (
            <div className="mb-3">
              <p className="mono-label mb-1.5 mt-1 pl-1 text-pm-grey-text">Recent</p>
              <ul className="flex flex-col overflow-hidden rounded-2xl bg-white">
                {recent.map((person) => (
                  <li key={person.id} className="flex items-center gap-3 pl-3.5 pr-1">
                    <Avatar person={person} size="sm" />
                    <Link
                      href={profileHref(person.id)}
                      onClick={() => remember(person)}
                      className={`font-display flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-lg text-[15px] font-semibold text-zinc-900 ${FOCUS}`}
                    >
                      <span className="truncate">{person.name}</span>
                      <VerifiedBadge userId={person.id} />
                    </Link>
                    <button
                      type="button"
                      onClick={() => forget(person.id)}
                      aria-label={`Remove ${person.name} from recent`}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-500 ${FOCUS}`}
                    >
                      <CloseIcon />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {visibleSuggestions.length > 0 && (
            <div className="mb-2">
              <p className="mono-label mb-1.5 mt-1 pl-1 text-pm-grey-text">People you may know</p>
              <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {visibleSuggestions.map((person) => (
                  <SuggestionCard
                    key={person.id}
                    person={person}
                    href={profileHref(person.id)}
                    status={statusFor(person.id)}
                    pending={pendingId === person.id}
                    onAdd={() => sendRequest(person)}
                    onDismiss={() => dismiss(person.id)}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The row's second line: why this person, in words — never a number. */
function reasonText(person: Person): ReactNode {
  const r = person.reason;
  if (r.kind === "mutual") {
    const [a, b] = r.via.map(handleFor);
    return (
      <>
        Friends with <span className="font-mono">@{a}</span>
        {b && (
          <>
            {" "}
            &amp; <span className="font-mono">@{b}</span>
          </>
        )}
      </>
    );
  }
  if (r.kind === "sharedPlaces") return "Rates places you’ve been";
  if (r.kind === "incoming") return "Sent you a request";
  return <span className="font-mono">@{handleFor(person.name)}</span>;
}

function PersonRow({
  person,
  href,
  status,
  pending,
  onOpen,
  onAdd,
}: {
  person: Person;
  href: string;
  status: "friend" | "incoming" | "requested" | null;
  pending: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-2.5">
      <Avatar person={person} size="md" />
      <Link
        href={href}
        onClick={onOpen}
        className={`flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg ${FOCUS}`}
      >
        <span className="font-display flex min-w-0 items-center gap-1 text-[15px] font-semibold leading-tight text-zinc-900">
          <span className="truncate">{person.name}</span>
          <VerifiedBadge userId={person.id} />
        </span>
        <span className="mt-0.5 truncate text-xs text-zinc-500">{reasonText(person)}</span>
      </Link>
      <StatusOrAdd status={status} pending={pending} onAdd={onAdd} />
    </li>
  );
}

function SuggestionCard({
  person,
  href,
  status,
  pending,
  onAdd,
  onDismiss,
}: {
  person: Person;
  href: string;
  status: "friend" | "incoming" | "requested" | null;
  pending: boolean;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  return (
    <li className="relative flex w-[9.25rem] shrink-0 flex-col items-center rounded-2xl bg-white px-3 pb-3 pt-4 text-center">
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Hide ${person.name} from suggestions`}
        className={`absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 ${FOCUS}`}
      >
        <CloseIcon size={12} />
      </button>
      <Link href={href} className={`flex w-full flex-col items-center rounded-lg ${FOCUS}`}>
        <Avatar person={person} size="lg" />
        <span className="font-display mt-2 flex w-full min-w-0 items-center justify-center gap-1 text-[15px] font-semibold leading-tight text-zinc-900">
          <span className="truncate">{person.name}</span>
          <VerifiedBadge userId={person.id} />
        </span>
        <span className="mt-1 line-clamp-2 min-h-[2rem] text-[11px] leading-4 text-zinc-500">
          {reasonText(person)}
        </span>
      </Link>
      <div className="mt-2.5 flex min-h-9 w-full items-center justify-center">
        <StatusOrAdd status={status} pending={pending} onAdd={onAdd} wide />
      </div>
    </li>
  );
}

function StatusOrAdd({
  status,
  pending,
  onAdd,
  wide = false,
}: {
  status: "friend" | "incoming" | "requested" | null;
  pending: boolean;
  onAdd: () => void;
  wide?: boolean;
}) {
  if (status === "friend") return <span className="mono-label shrink-0 text-zinc-500">Friends</span>;
  if (status === "incoming")
    return <span className="mono-label shrink-0 text-zinc-500">Respond below</span>;
  if (status === "requested")
    return <span className="mono-label shrink-0 text-zinc-500">Requested</span>;
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={pending}
      className={`min-h-9 shrink-0 rounded-full bg-pm-orange px-3.5 text-xs font-medium text-[#F7F4EC] transition-transform active:scale-[0.97] disabled:opacity-50 ${wide ? "w-full" : ""} ${FOCUS}`}
    >
      Add
    </button>
  );
}

function Avatar({ person, size }: { person: FriendLite; size: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14 text-base" : size === "md" ? "h-11 w-11 text-sm" : "h-8 w-8 text-xs";
  return person.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.avatarUrl} alt="" className={`${box} shrink-0 rounded-full object-cover`} />
  ) : (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-full font-mono font-medium text-white ${avatarPalette(person.name).avatarBg}`}
    >
      {initials(person.name)}
    </span>
  );
}

function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
