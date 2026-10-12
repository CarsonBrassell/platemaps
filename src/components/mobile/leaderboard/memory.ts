import type { Movement, Seat } from "./types";

/**
 * "Since your last visit", kept in this browser only. The table remembers
 * the order it last showed and everyone's points, so the next open can say
 * who moved. Purely a nicety: every access is wrapped, and a private window,
 * blocked storage or a corrupt value all just mean "first visit" — no arrows,
 * no banner, the board itself unchanged.
 */
type Snapshot = { order: string[]; points: Record<string, number> };

const key = (youId: string) => `pm:friends-table:v1:${youId}`;

export function readSnapshot(youId: string): Snapshot | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key(youId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { order, points } = parsed as Partial<Snapshot>;
    if (!Array.isArray(order) || !points || typeof points !== "object") return null;
    return { order: order.filter((id): id is string => typeof id === "string"), points };
  } catch {
    return null;
  }
}

export function writeSnapshot(youId: string, seats: Seat[]) {
  try {
    const snapshot: Snapshot = {
      order: seats.map((s) => s.entry.id),
      points: Object.fromEntries(seats.map((s) => [s.entry.id, s.entry.points])),
    };
    window.localStorage.setItem(key(youId), JSON.stringify(snapshot));
  } catch {
    /* Storage full or blocked: next visit is simply a first visit. */
  }
}

/**
 * Compares the remembered order with tonight's. Positions are compared among
 * the people present both times, so adding or removing a friend never shows
 * up as somebody "climbing". Overtakes need a strict points difference now —
 * a tie that merely sorted differently is not a pass.
 */
export function deriveMovement(prev: Snapshot | null, seats: Seat[], youId: string): Movement | null {
  if (!prev) return null;
  const present = new Set(seats.map((s) => s.entry.id));
  const before = prev.order.filter((id) => present.has(id));
  const known = new Set(before);
  if (!known.has(youId)) return null;
  const now = seats.map((s) => s.entry.id).filter((id) => known.has(id));

  const prevIdx = new Map(before.map((id, i) => [id, i]));
  const nowIdx = new Map(now.map((id, i) => [id, i]));

  const change = new Map<string, number>();
  for (const id of now) {
    const d = (prevIdx.get(id) ?? 0) - (nowIdx.get(id) ?? 0);
    if (d !== 0) change.set(id, d);
  }

  const isNew = new Set(seats.filter((s) => !known.has(s.entry.id)).map((s) => s.entry.id));

  const gained = new Map<string, number>();
  for (const s of seats) {
    const old = prev.points[s.entry.id];
    if (typeof old === "number" && s.entry.points > old) gained.set(s.entry.id, s.entry.points - old);
  }

  const you = seats.find((s) => s.entry.id === youId);
  const youBefore = prevIdx.get(youId) ?? 0;
  const youNow = nowIdx.get(youId) ?? 0;
  const passed: Seat[] = [];
  const passedBy: Seat[] = [];
  for (const s of seats) {
    if (s.isYou || !known.has(s.entry.id) || !you) continue;
    const b = prevIdx.get(s.entry.id) ?? 0;
    const n = nowIdx.get(s.entry.id) ?? 0;
    if (b < youBefore && n > youNow && s.entry.points < you.entry.points) passed.push(s);
    if (b > youBefore && n < youNow && s.entry.points > you.entry.points) passedBy.push(s);
  }

  return { change, isNew, gained, passed, passedBy };
}
