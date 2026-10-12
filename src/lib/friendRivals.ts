"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";
import { POINT_RULES } from "@/lib/points";

/**
 * Where you stand against your friends, in Plate Points — the "who am I
 * chasing" question that makes a post worth more than its 5 points.
 *
 * Read by the composer's rival chip and by the post-landing overtake toast.
 * The friends list is fetched once per session (a module variable survives
 * client navigation, not a reload) and shared by both, so posting costs no
 * extra request on the way out: the composer warms the cache, the toast reads
 * it and then refreshes it.
 *
 * The viewer's own points always come from `useAuth`, never from here, so the
 * standings move the moment the account is refreshed after a post.
 *
 * Nothing here ever says how many friends you have — only who is next to you.
 * Every failure is silent: no friends, a dropped request, signed out — all
 * read as `null`, and the UI that asked simply draws nothing.
 */

export type RivalFriend = { id: string; name: string; avatarUrl?: string; points: number };

export type Standing = RivalFriend & { isYou: boolean };

export type FriendRivals = {
  /** Everyone including you, most points first. */
  standings: Standing[];
  /** Your 1-based place in `standings`. */
  rank: number;
  /** The friend directly above you (fewest points that still beat yours), if any. */
  rival: RivalFriend | null;
  /** How far behind the rival you are. 0 when there is no rival. */
  gap: number;
  /** Points needed to be strictly ahead of the rival: `gap + 1`. */
  toPass: number;
  /** Posts that alone would get you past the rival. 0 when there is no rival. */
  postsNeeded: number;
  /** The friend directly below you, if any. */
  chaser: RivalFriend | null;
  /** How far ahead of the chaser you are. 0 when there is no chaser. */
  lead: number;
};

type Cache = { ownerId: string; friends: RivalFriend[] };

let cache: Cache | null = null;
let inflight: { ownerId: string; promise: Promise<RivalFriend[] | null> } | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function parseFriends(data: unknown): RivalFriend[] {
  const list = (data as { friends?: unknown })?.friends;
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw) => {
    const f = raw as Partial<RivalFriend>;
    if (typeof f?.id !== "string" || typeof f.name !== "string") return [];
    const points = Number(f.points);
    return [
      {
        id: f.id,
        name: f.name,
        avatarUrl: typeof f.avatarUrl === "string" ? f.avatarUrl : undefined,
        points: Number.isFinite(points) ? points : 0,
      },
    ];
  });
}

/**
 * The signed-in viewer's friends, from the session cache unless `force`.
 * Resolves `null` on any failure and never throws.
 */
export function loadFriendRivals(ownerId: string, force = false): Promise<RivalFriend[] | null> {
  if (!force && cache?.ownerId === ownerId) return Promise.resolve(cache.friends);
  if (inflight?.ownerId === ownerId) return inflight.promise;

  const promise = (async () => {
    try {
      const res = await fetch("/api/friends/list", { cache: "no-store" });
      if (!res.ok) return cache?.ownerId === ownerId ? cache.friends : null;
      const friends = parseFriends(await res.json());
      cache = { ownerId, friends };
      emit();
      return friends;
    } catch {
      return cache?.ownerId === ownerId ? cache.friends : null;
    } finally {
      inflight = null;
    }
  })();
  inflight = { ownerId, promise };
  return promise;
}

/** The cached friends for this viewer, without fetching. */
export function cachedFriendRivals(ownerId: string): RivalFriend[] | null {
  return cache?.ownerId === ownerId ? cache.friends : null;
}

function byPointsThenName(a: RivalFriend, b: RivalFriend) {
  return b.points - a.points || a.name.localeCompare(b.name);
}

/**
 * Pure: standings for `me` against `friends`. `null` with no friends.
 *
 * Ties are not "above" you: a friend level with you is someone you have
 * caught, not someone you are chasing, so the rival is the nearest friend
 * strictly ahead and the chaser the nearest strictly behind.
 */
export function computeFriendRivals(
  me: { id: string; name: string; avatarUrl?: string; points: number },
  friends: RivalFriend[],
): FriendRivals | null {
  const others = friends.filter((f) => f.id !== me.id);
  if (others.length === 0) return null;

  const you: Standing = { ...me, isYou: true };
  /* You sort first among a tie — the ladder reads kinder that way and it
     matches "ties aren't above you". */
  const standings: Standing[] = [you, ...others.map((f) => ({ ...f, isYou: false }))].sort(
    (a, b) => b.points - a.points || (a.isYou ? -1 : b.isYou ? 1 : a.name.localeCompare(b.name)),
  );
  const rank = standings.indexOf(you) + 1;

  const above = others.filter((f) => f.points > me.points).sort(byPointsThenName);
  const below = others.filter((f) => f.points < me.points).sort(byPointsThenName);
  const rival = above.length ? above[above.length - 1] : null;
  const chaser = below.length ? below[0] : null;

  const gap = rival ? rival.points - me.points : 0;
  const toPass = rival ? gap + 1 : 0;
  return {
    standings,
    rank,
    rival,
    gap,
    toPass,
    postsNeeded: rival ? Math.ceil(toPass / POINT_RULES.createPost) : 0,
    chaser,
    lead: chaser ? me.points - chaser.points : 0,
  };
}

/**
 * Friends that `before → after` points carried you past: at or above you
 * before, strictly below you after. Closest first is not meaningful here, so
 * the highest one you passed comes first — that is the headline name.
 */
export function friendsPassed(before: number, after: number, friends: RivalFriend[]) {
  return friends
    .filter((f) => f.points >= before && f.points < after)
    .sort(byPointsThenName);
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot() {
  return cache;
}

function getServerSnapshot(): Cache | null {
  return null;
}

/** Force a refetch for whoever is signed in; listeners re-render on arrival. */
export function refreshFriendRivals(ownerId: string) {
  return loadFriendRivals(ownerId, true);
}

/**
 * Your standings among friends, or `null` when signed out, still loading,
 * friendless, or on any fetch failure.
 */
export function useFriendRivals(): FriendRivals | null {
  const { account } = useAuth();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ownerId = account?.id;

  useEffect(() => {
    if (ownerId) void loadFriendRivals(ownerId);
  }, [ownerId]);

  if (!account || !snapshot || snapshot.ownerId !== account.id) return null;
  return computeFriendRivals(
    { id: account.id, name: account.name, avatarUrl: account.avatarUrl, points: account.points },
    snapshot.friends,
  );
}

/** "Sam Lee" → "Sam": the chip and toast have room for one name. */
export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}
