"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { PointsBadge } from "@/components/feed/PointsBadge";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";

/** Mirrors lib/db.ts's FriendSummary — that module is server-only. */
type Friend = {
  id: string;
  name: string;
  avatarUrl?: string;
  points: number;
};

/** Mirrors lib/db.ts's FriendRequestSummary, same reason. */
type FriendRequest = {
  id: string;
  userId: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
};

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint font-mono text-xs font-medium text-pm-grey-text">
      {initials(name)}
    </div>
  );
}

/**
 * Everything about who you know, on one screen — and nothing else. Requests to
 * answer, and the people you've already added.
 *
 * The plates themselves are not here: friends' posts are the Friend feed tab on
 * /feed, a separate feed with its own reaction. This screen is the graph, that
 * one is the content.
 *
 * The request panel used to live on /account, which meant the only signal that
 * someone had added you was buried under your own points and posts. Requests
 * are about other people, so they moved here with the list.
 *
 * No total is rendered anywhere on this page. Friend counts never display in
 * this product — see the note on getFriends in lib/db.ts.
 */
export default function FriendsPage() {
  const { account, isSignedIn, loading } = useAuth();

  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Which friend has been tapped once for removal — see the two-step note. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    // Signed out renders the prompt below and never reads `friends`, so this
    // leaves it null rather than setting state synchronously in the effect.
    if (!isSignedIn) return;
    Promise.all([
      fetch("/api/friends/list").then((r) => r.json()),
      fetch("/api/friends").then((r) => r.json()),
    ])
      .then(([list, pending]) => {
        setFriends(list.friends ?? []);
        setIncoming(pending.incoming ?? []);
        setOutgoing(pending.outgoing ?? []);
      })
      .catch(() => {
        setFriends([]);
        setError("Couldn't load your friends. Check your connection.");
      });
  }, [isSignedIn]);

  useEffect(load, [load]);

  async function respond(requestId: string, action: "accept" | "decline") {
    setBusyId(requestId);
    try {
      const res = await fetch("/api/friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      if (!res.ok) throw new Error("failed");
      setIncoming((prev) => prev.filter((r) => r.id !== requestId));
      // An accept adds someone to the list below, so it has to be re-read.
      if (action === "accept") load();
    } catch {
      setError("Couldn't answer that request.");
    } finally {
      setBusyId(null);
    }
  }

  /* Two taps, not a browser confirm(): removing someone is quiet and
     irreversible from this side — they'd have to be requested again — and a
     native dialog on a phone is a modal you dismiss without reading. */
  async function remove(userId: string) {
    if (confirmingId !== userId) {
      setConfirmingId(userId);
      return;
    }
    setBusyId(userId);
    const snapshot = friends;
    setFriends((prev) => (prev ? prev.filter((f) => f.id !== userId) : prev));
    try {
      const res = await fetch("/api/friends", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setFriends(snapshot);
      setError("Couldn't remove that friend.");
    } finally {
      setBusyId(null);
      setConfirmingId(null);
    }
  }

  const hasRequests = incoming.length > 0 || outgoing.length > 0;

  /* Filters the list you already have rather than searching for people to
     add — there's no user-search endpoint, and every name here is one the
     server already sent. Substring, not prefix: "alv" should reach Diego
     Alvarez, since a surname is exactly what you'd half-remember. */
  const trimmedQuery = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!friends) return null;
    if (!trimmedQuery) return friends;
    return friends.filter((f) => f.name.toLowerCase().includes(trimmedQuery));
  }, [friends, trimmedQuery]);

  return (
    <div className="mx-auto w-full max-w-7xl pb-12">
      <Header />

      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
        <div className="mb-5">
          <h1 className="font-display text-[26px] font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Friends
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Requests and the people you&apos;ve added — their plates are in the Friend feed
          </p>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-2xl bg-white px-4 py-3 text-sm text-zinc-700">
            {error}
          </p>
        )}

        {!loading && !isSignedIn ? (
          <div className="rounded-2xl bg-white px-6 py-12 text-center">
            <p className="font-display text-base font-semibold text-zinc-900">
              Sign in to see your friends
            </p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-zinc-500">
              Friends&apos; plates get their own feed, and you can leave each other notes.
            </p>
            <Link
              href="/account"
              className="mt-6 inline-flex min-h-11 items-center rounded-full bg-pm-orange px-6 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <>
            {hasRequests && (
              <section aria-labelledby="requests-heading" className="mb-6">
                <p id="requests-heading" className="mono-label mb-2 text-zinc-500">
                  Requests
                </p>
                <div className="flex flex-col gap-2">
                  {incoming.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3"
                    >
                      <Avatar name={r.name} avatarUrl={r.avatarUrl} />
                      <Link
                        href={`/u/${r.userId}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 hover:underline"
                      >
                        {r.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() => respond(r.id, "accept")}
                        disabled={busyId === r.id}
                        className="min-h-11 rounded-full bg-pm-orange px-4 text-xs font-semibold text-[#F7F4EC] transition-transform active:scale-95 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => respond(r.id, "decline")}
                        disabled={busyId === r.id}
                        className="min-h-11 rounded-full bg-pm-grey-tint px-4 text-xs font-medium text-pm-grey-text transition-colors hover:text-zinc-900 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                      >
                        Decline
                      </button>
                    </div>
                  ))}

                  {outgoing.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3"
                    >
                      <Avatar name={r.name} avatarUrl={r.avatarUrl} />
                      <Link
                        href={`/u/${r.userId}`}
                        className="min-w-0 flex-1 truncate text-sm text-zinc-500 hover:underline"
                      >
                        {r.name}
                      </Link>
                      {/* Machine state, so it's set in mono like every other
                          non-prose value on the page. */}
                      <span className="mono-label shrink-0 text-zinc-400">Request sent</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="mb-2 flex items-center justify-between gap-4">
              <p className="mono-label text-zinc-500">Your friends</p>

              {/* Only once there's a list worth filtering. A search box over
                  two names is a control that costs more than it saves. */}
              {friends !== null && friends.length > 1 && (
                <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full bg-white px-4 py-2 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange sm:max-w-56">
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
                    placeholder="Search friends..."
                    aria-label="Search friends"
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                      className="shrink-0 rounded-full text-zinc-400 transition-colors hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
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
              )}
            </div>

            {friends === null ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-[66px] w-full rounded-2xl" />
                ))}
                <span className="sr-only">Loading</span>
              </div>
            ) : friends.length === 0 ? (
              <div className="rounded-2xl bg-white px-6 py-12 text-center">
                <p className="font-display text-base font-semibold text-zinc-900">
                  No friends yet
                </p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-zinc-500">
                  Tap someone&apos;s name on a plate in the feed to add them. Their posts
                  then show up in your Friend feed.
                </p>
                <Link
                  href="/feed"
                  className="mt-6 inline-flex min-h-11 items-center rounded-full bg-pm-orange px-6 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  Go to the feed
                </Link>
              </div>
            ) : shown!.length === 0 ? (
              /* Searched past the end of the list — distinct from having no
                 friends at all, which is the branch above. */
              <div className="rounded-2xl bg-white px-6 py-10 text-center">
                <p className="text-sm text-zinc-500">
                  No friends matching{" "}
                  <span className="font-medium text-zinc-900">{query.trim()}</span>.
                </p>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="mt-3 min-h-11 rounded-full px-4 text-sm text-zinc-600 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {shown!.map((friend) => (
                  <li
                    key={friend.id}
                    className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3"
                  >
                    <Avatar name={friend.name} avatarUrl={friend.avatarUrl} />
                    <Link
                      href={`/u/${friend.id}`}
                      className="min-w-0 flex-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                    >
                      <span className="block truncate text-sm font-medium text-zinc-900">
                        {friend.name}
                      </span>
                      <PointsBadge points={friend.points} className="mt-0.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(friend.id)}
                      onBlur={() => setConfirmingId((id) => (id === friend.id ? null : id))}
                      disabled={busyId === friend.id}
                      aria-label={
                        confirmingId === friend.id
                          ? `Confirm removing ${friend.name}`
                          : `Remove ${friend.name}`
                      }
                      className={`min-h-11 shrink-0 rounded-full px-4 text-xs font-medium transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                        confirmingId === friend.id
                          ? "bg-pm-orange text-[#F7F4EC]"
                          : "bg-pm-grey-tint text-pm-grey-text hover:text-zinc-900"
                      }`}
                    >
                      {confirmingId === friend.id ? "Confirm" : "Remove"}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {account && (
              <p className="mt-6 text-xs text-zinc-400">
                <Link href={`/u/${account.id}`} className="underline hover:text-zinc-600">
                  See your public profile
                </Link>{" "}
                — what these people see when they look you up.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
