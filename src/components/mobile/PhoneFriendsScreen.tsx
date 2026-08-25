"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { PointsBadge } from "@/components/feed/PointsBadge";
import { PhoneFindFriends } from "@/components/mobile/PhoneFindFriends";
import { PhoneFriendsHero } from "@/components/mobile/PhoneFriendsHero";
import { PhoneSectionLabel } from "@/components/mobile/PhoneSectionLabel";
import { PhoneFriendsLeaderboard, rankSeats } from "@/components/mobile/PhoneFriendsLeaderboard";
import { useAuth } from "@/lib/auth";
import { avatarPalette, initials, relativeTime } from "@/lib/format";

/**
 * Friends, phone version.
 *
 * Same screen as `src/app/friends/page.tsx` and the same four calls in the same
 * order — `/api/friends/list` for the people, `/api/friends` for both
 * directions of pending requests, `/api/friends/respond` to answer one,
 * `DELETE /api/friends` to remove someone. Nothing about the graph is
 * reimplemented here; if the two versions ever disagree about who your friends
 * are, someone forked a fetch.
 *
 * Three things are shaped differently for a 390px screen:
 *
 * - **Order is Find friends, Your friends, Leaderboard, then Requests** — the
 *   reverse of the web page's Requests-first layout. Requests still carry the
 *   nav dot regardless of where they sit on the page, so the dot is answered
 *   by opening the screen at all, not by what's above the fold on it.
 * - **Accept/Decline sit on their own row.** Avatar, name and two buttons do
 *   not fit across 390px at a 44px target size without shrinking the buttons to
 *   something you miss with a thumb. So the person is row one and the answer is
 *   row two, full width, side by side.
 * - **Names set in Fraunces.** They are proper names, which is exactly what the
 *   display voice is for (DESIGN.md); the web page's `text-sm font-medium`
 *   predates that rule being applied to list rows.
 *
 * **No total is printed anywhere on this screen**, and none may be added.
 * Friend and follower counts never display in this product — `getFriends` in
 * lib/db.ts deliberately returns rows with no count attached. That is why the
 * "Your friends" label is a label and not a tally.
 */

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

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * Marks the Friends nav dot read, the same way `lib/navAlerts.ts` does when the
 * web `/friends` page is opened.
 *
 * That hook keys on `pathname === "/friends"` and cannot see this tree, so
 * without this the dot would light up and never clear down here. The key format
 * and the per-account scoping are copied from it verbatim — change one, change
 * both.
 *
 * It writes on mount rather than after the request list loads, and writes
 * `Date.now()` rather than the newest request's timestamp: "I opened this page
 * at T" is the same claim, and doing it synchronously means the write always
 * lands before `useNavAlerts`'s own fetch resolves. Reversing that order would
 * paint the dot for a beat on the very screen that answers it. `Math.max`
 * against what is already stored keeps a skewed clock from moving the mark
 * backwards. Fails quiet in Safari private mode, like the original.
 */
function useMarkFriendsSeen(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    const key = `platemaps:nav-seen:${userId}:friends`;
    try {
      const seen = Number(window.localStorage.getItem(key)) || 0;
      window.localStorage.setItem(key, String(Math.max(seen, Date.now())));
    } catch {
      /* ignore */
    }
  }, [userId]);
}

/* Each person's own hue, not one flat grey circle for the whole list — the
   same avatarPalette FoodPostCard already uses, so a friend reads as the
   same color here as they do on their own posts. */
function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-mono text-sm font-medium text-white ${avatarPalette(name).avatarBg}`}
    >
      {initials(name)}
    </div>
  );
}

function SearchIcon() {
  return (
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
  );
}

export function PhoneFriendsScreen() {
  const { account, isSignedIn, loading } = useAuth();

  /* The nav-variant switcher travels in `?nav=` and every link on the screen has
     to carry it or the first tap drops you back to the default. Same trick
     `/m/page.tsx` uses; both halves disappear when the variants are cut to one. */
  const nav = useSearchParams().get("nav");
  const to = (href: string) => (nav ? `${href}?nav=${nav}` : href);

  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Which friend has been tapped once for removal — see the two-step note. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useMarkFriendsSeen(account?.id);

  const load = useCallback(() => {
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

  /* Each friend's standing, from the same `rankSeats` the leaderboard below
     runs — not a second sort. Two sorts of one array is exactly how a list and
     the leaderboard under it end up disagreeing about who is second. Keyed by
     id so a row is a lookup rather than a scan. */
  const rankById = useMemo(() => {
    if (!friends || !account) return null;
    const map = new Map<string, number>();
    for (const seat of rankSeats(friends, account)) map.set(seat.entry.id, seat.rank);
    return map;
  }, [friends, account]);

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
    <div className="min-h-dvh">
      {/* Scrolls away rather than sticking — a 390px screen has ~640 usable
          points and the nav already owns the bottom of them. Matches discover.
          The faces are the list itself, so the card fills in as it loads
          rather than reserving a slot: `friends` is null until then. */}
      <PhoneFriendsHero friends={friends} />

      {error && (
        <p role="alert" className="mx-4 mb-4 rounded-2xl bg-white px-4 py-3 text-sm text-zinc-700">
          {error}
        </p>
      )}

      {/* Three states, and the session has to resolve before the second and
          third can be told apart. The web page renders the signed-in branch
          while `loading`, which on a phone means a labelled, skeletoned list
          visibly flips to a sign-in card a beat later. Unlabelled skeletons say
          the same "wait" without committing to an answer. */}
      {loading ? (
        <div className="flex flex-col gap-2 px-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[74px] w-full rounded-2xl" />
          ))}
          <span className="sr-only">Loading</span>
        </div>
      ) : !isSignedIn ? (
        <div className="mx-4 rounded-2xl bg-white px-6 py-12 text-center">
          {/* Cream disc, matching PhoneFriendsHero: the mark is supplied artwork
              that carries its own cream background, so any other fill shows as a
              rectangle behind it. */}
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F7F4EC]">
            <BrandMark className="h-10 w-auto" />
          </span>
          <p className="font-display text-lg font-semibold text-zinc-900">
            Sign in to see your friends
          </p>
          <p className="mx-auto mt-1.5 max-w-[16rem] text-sm text-zinc-500">
            Friends&apos; plates get their own feed, and you can leave each other notes.
          </p>
          <Link
            href={to("/m/account")}
            className={`mt-6 inline-flex min-h-11 items-center rounded-full bg-pm-orange px-6 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.97] ${FOCUS}`}
          >
            Sign in
          </Link>
        </div>
      ) : (
        <>
          <PhoneFindFriends
            friendIds={friends?.map((f) => f.id) ?? []}
            incomingIds={incoming.map((r) => r.userId)}
            outgoingIds={outgoing.map((r) => r.userId)}
            onSent={load}
          />

          <div className="mb-7 px-4">
            <PhoneSectionLabel>Your friends</PhoneSectionLabel>

            {/* Only once there's a list worth filtering. A search box over two
                names is a control that costs more than it saves. */}
            {friends !== null && friends.length > 1 && (
              <div
                className={`mb-2 flex min-h-11 items-center gap-2.5 rounded-full bg-white px-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange`}
              >
                <SearchIcon />
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
            )}

            {friends === null ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-[74px] w-full rounded-2xl" />
                ))}
                <span className="sr-only">Loading</span>
              </div>
            ) : friends.length === 0 ? (
              <div className="rounded-2xl bg-white px-6 py-12 text-center">
                {/* Cream disc, matching PhoneFriendsHero: the mark is supplied artwork
              that carries its own cream background, so any other fill shows as a
              rectangle behind it. */}
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F7F4EC]">
                  <BrandMark className="h-10 w-auto" />
                </span>
                <p className="font-display text-lg font-semibold text-zinc-900">No friends yet</p>
                <p className="mx-auto mt-1.5 max-w-[17rem] text-sm text-zinc-500">
                  Tap someone&apos;s name on a plate in the feed to add them. Their posts then show
                  up in your Friend feed.
                </p>
                <Link
                  href={to("/m/feed")}
                  className={`mt-6 inline-flex min-h-11 items-center rounded-full bg-pm-orange px-6 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.97] ${FOCUS}`}
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
                  className={`mt-2 min-h-11 rounded-full px-4 text-sm text-zinc-600 underline decoration-zinc-300 underline-offset-2 ${FOCUS}`}
                >
                  Clear search
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {shown!.map((friend) => (
                  <li
                    key={friend.id}
                    className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-2.5"
                  >
                    <Avatar name={friend.name} avatarUrl={friend.avatarUrl} />
                    <Link
                      href={to(`/m/u/${friend.id}`)}
                      className={`min-w-0 flex-1 rounded-lg py-1.5 ${FOCUS}`}
                    >
                      <span className="font-display block truncate text-[16px] font-semibold leading-tight text-zinc-900">
                        {friend.name}
                      </span>
                      {/* Points are a sanctioned number — friend counts are not,
                          and there is deliberately none on this screen. */}
                      <span className="mt-1 flex items-center gap-1.5">
                        <PointsBadge points={friend.points} />
                        {/* A rank is not a count: it says where one person
                            sits, and the leaderboard already prints it. It is
                            here so the list answers "how are they doing"
                            without scrolling to the card that knows. */}
                        {rankById?.get(friend.id) && (
                          <span className="shrink-0 font-mono text-[11px] font-medium tabular-nums text-pm-orange-text">
                            №{rankById.get(friend.id)}
                          </span>
                        )}
                      </span>
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
                      className={`min-h-11 shrink-0 rounded-full px-3.5 text-xs font-medium transition-colors disabled:opacity-50 ${FOCUS} ${
                        confirmingId === friend.id
                          ? "bg-pm-orange text-[#F7F4EC]"
                          : "bg-pm-grey-tint text-pm-grey-text"
                      }`}
                    >
                      {confirmingId === friend.id ? "Confirm" : "Remove"}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {account && (
              <p className="mt-6 text-xs leading-relaxed text-pm-grey-text">
                <Link
                  href={to(`/m/u/${account.id}`)}
                  className={`rounded-sm underline decoration-zinc-300 underline-offset-2 ${FOCUS}`}
                >
                  See your public profile
                </Link>{" "}
                — what these people see when they look you up.
              </p>
            )}
          </div>

          {account && friends && (
            <PhoneFriendsLeaderboard friends={friends} you={account} />
          )}

          {hasRequests && (
            <section aria-labelledby="phone-requests-heading" className="mb-7 px-4">
              <PhoneSectionLabel id="phone-requests-heading">Requests</PhoneSectionLabel>
              <div className="flex flex-col gap-2">
                {/* Incoming sits on the accent tint rather than white: it is the
                    one thing on this screen waiting on an answer, and the tint
                    is what the leaderboard already uses to mark the row that is
                    about you. Outgoing stays white — nothing is being asked. */}
                {incoming.map((r) => (
                  <div key={r.id} className="rounded-2xl bg-pm-orange-tint p-3.5">
                    <p className="mono-label mb-2.5 text-pm-orange-text">
                      Wants a seat at your table
                    </p>
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name} avatarUrl={r.avatarUrl} />
                      <Link
                        href={to(`/m/u/${r.userId}`)}
                        className={`font-display min-w-0 flex-1 truncate rounded-lg text-[16px] font-semibold leading-tight text-zinc-900 ${FOCUS}`}
                      >
                        {r.name}
                      </Link>
                      {/* Machine value, so mono. `zinc-500` is the on-*white*
                          muted step and only clears 3.70:1 on the accent tint
                          this card now sits on; `--pm-grey-text` makes 5.09:1
                          there. Same distinction DESIGN.md draws for cream. */}
                      <time
                        dateTime={r.createdAt}
                        className="shrink-0 font-mono text-[11px] tabular-nums text-pm-grey-text"
                      >
                        {relativeTime(r.createdAt)}
                      </time>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => respond(r.id, "accept")}
                        disabled={busyId === r.id}
                        className={`min-h-11 flex-1 rounded-full bg-pm-orange text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.97] disabled:opacity-50 ${FOCUS}`}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => respond(r.id, "decline")}
                        disabled={busyId === r.id}
                        className={`min-h-11 flex-1 rounded-full bg-white text-sm font-medium text-pm-grey-text transition-colors active:scale-[0.97] disabled:opacity-50 ${FOCUS}`}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}

                {outgoing.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3"
                  >
                    <Avatar name={r.name} avatarUrl={r.avatarUrl} />
                    <Link
                      href={to(`/m/u/${r.userId}`)}
                      className={`font-display min-w-0 flex-1 truncate rounded-lg text-[16px] font-semibold leading-tight text-zinc-500 ${FOCUS}`}
                    >
                      {r.name}
                    </Link>
                    {/* Machine state, so it's set in the label voice like every
                        other non-prose value on the screen. */}
                    <span className="mono-label shrink-0 text-zinc-500">Request sent</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
