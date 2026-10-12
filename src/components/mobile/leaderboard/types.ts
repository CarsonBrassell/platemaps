/** One person at the Friends' Table — a friend, or the viewer. */
export type Entry = { id: string; name: string; avatarUrl?: string; points: number };

/** A ranked position: `gap` is the points to the seat directly above (0 at №1). */
export type Seat = { entry: Entry; rank: number; gap: number; isYou: boolean };

/** What changed since the viewer last opened the table (see `memory.ts`). */
export type Movement = {
  /** Places climbed (positive) or dropped (negative), by entry id. */
  change: Map<string, number>;
  /** People who were not at the table last visit. */
  isNew: Set<string>;
  /** Plate Points earned since last visit, by entry id (only gains). */
  gained: Map<string, number>;
  /** Friends you overtook, highest first. */
  passed: Seat[];
  /** Friends who overtook you, highest first. */
  passedBy: Seat[];
};

/** Everything a seat needs from the board, passed down once. */
export type BoardCtx = {
  seats: Seat[];
  youSeat: Seat;
  openId: string | null;
  toggle: (id: string) => void;
  slotRef: (rank: number) => (el: HTMLElement | null) => void;
  moverRef: (id: string) => (el: HTMLElement | null) => void;
  movement: Movement | null;
  reduced: boolean;
  /** The viewer's climb animation has landed — time for sparks. */
  landed: boolean;
};
