"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import type {
  FullTastePrefs,
  TasteBasis,
  TasteOp,
  TastePick,
  TasteReason,
} from "@/lib/taste";
import type { Coords } from "@/lib/geo";

/*
 * The client side of "Your taste" (lib/taste.ts, /api/account/taste).
 *
 * Both Discover surfaces read this one hook, so web and phone cannot drift.
 * Signed in, the server stores the prefs (when taste_prefs exists); signed out,
 * or while the table is not migrated, the prefs live in localStorage under
 * pm.taste.v1 and travel in each POST body. The server never stores a signed-out
 * viewer's prefs.
 */
export type { TasteBasis, TasteReason, TastePick, TasteOp };
export type TastePrefs = { loves: string[]; skips: string[] };

type Status = "loading" | "ready" | "error";
type Undo = { label: string; run: () => void } | null;

const KEY = "pm.taste.v1";
const UNDO_MS = 10_000;
const EMPTY: FullTastePrefs = { loves: [], skips: [], been: [], hidden: [] };
/** Most place ids a refresh remembers having shown (the server keeps the same last 240). */
const MAX_EXCLUDE = 240;

type Reply = {
  storage: "server" | "local";
  basis: TasteBasis;
  header: string;
  shortHeader: string;
  prefs: FullTastePrefs;
  picks: TastePick[];
  /** Dish-level test only: the name of this row of picks in the activity log (lib/tasteLog.ts). */
  batch?: string;
};

function readLocal(): FullTastePrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Partial<FullTastePrefs>;
    const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
    return { loves: arr(p.loves), skips: arr(p.skips), been: arr(p.been), hidden: arr(p.hidden) };
  } catch {
    return EMPTY;
  }
}

function writeLocal(p: FullTastePrefs | null) {
  try {
    if (!p || (!p.loves.length && !p.skips.length && !p.been.length && !p.hidden.length)) {
      window.localStorage.removeItem(KEY);
    } else {
      window.localStorage.setItem(KEY, JSON.stringify(p));
    }
  } catch {
    /* private mode or blocked storage: the section still works for the session */
  }
}

const isEmpty = (p: FullTastePrefs) =>
  !p.loves.length && !p.skips.length && !p.been.length && !p.hidden.length;

/** `shown` appended to `seen` without repeats (a repeat moves to the end), the newest `MAX_EXCLUDE` kept. */
function remember(seen: readonly string[], shown: readonly string[]): string[] {
  const ids = new Set(seen);
  for (const id of shown) {
    ids.delete(id);
    ids.add(id);
  }
  return [...ids].slice(-MAX_EXCLUDE);
}

/** What a request came to: its picks are on screen, it ran a refresh out of places, or it did not land. */
type Landed = "shown" | "exhausted" | "failed";

/** Cheap client-side mirror of lib/taste.ts applyOpToPrefs, for instant chips. */
function optimistic(p: FullTastePrefs, op: TasteOp): FullTastePrefs {
  if (op.kind === "reset") return EMPTY;
  const v = op.value ?? "";
  const w = (l: string[]) => l.filter((x) => x !== v);
  switch (op.kind) {
    case "love":
      return p.loves.includes(v) || p.loves.length >= 5
        ? p
        : { ...p, loves: [...p.loves, v], skips: w(p.skips) };
    case "unlove":
      return { ...p, loves: w(p.loves) };
    case "skip":
      return p.skips.includes(v) || p.skips.length >= 5
        ? p
        : { ...p, skips: [...p.skips, v], loves: w(p.loves) };
    case "unskip":
      return { ...p, skips: w(p.skips) };
    case "been":
      return { ...p, been: [...w(p.been), v], hidden: w(p.hidden) };
    case "hide":
      return { ...p, hidden: [...w(p.hidden), v], been: w(p.been) };
    case "unbeen":
      return { ...p, been: w(p.been) };
    case "unhide":
      return { ...p, hidden: w(p.hidden) };
  }
}

/**
 * `limit` caps the row (the server clamps it for the accounts that may send one). `near` limits the picks to the
 * radius around that position; it travels in the POST body, never a URL. `wait: true` means do not ask yet: the
 * status stays "loading" and nothing is sent. A change of `near` (compared by value), of `limit`, or `wait`
 * going back to false starts over: places already shown are forgotten, older replies are dropped, and the
 * picks are fetched again.
 */
export function useTaste(opts?: { limit?: number; near?: Coords | null; wait?: boolean }): {
  status: Status;
  basis: TasteBasis;
  header: string;
  shortHeader: string;
  prefs: TastePrefs;
  picks: TastePick[];
  /** Dish-level test only: the name of the row on screen, for lib/usePickLog.ts. */
  batch: string | undefined;
  signedIn: boolean;
  apply: (op: TasteOp) => void;
  /** Dish-level test only: swap the row for places not shown yet. */
  refresh: () => void;
  refreshing: boolean;
  undo: Undo;
} {
  const limit = opts?.limit;
  const wait = opts?.wait === true;
  // By value, so a new object with the same position is not a change.
  const nearKey = opts?.near ? `${opts.near.lat},${opts.near.lng}` : "";
  const { account, resolved } = useAuth();
  const signedIn = !!account;
  const userKey = account ? "in" : "out";

  const [status, setStatus] = useState<Status>("loading");
  const [reply, setReply] = useState<Omit<Reply, "storage"> | null>(null);
  const [undo, setUndo] = useState<Undo>(null);
  const [refreshing, setRefreshing] = useState(false);

  const prefsRef = useRef<FullTastePrefs>(EMPTY);
  const picksRef = useRef<TastePick[]>([]);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const gen = useRef(0);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  // Place ids a refresh has already shown; every request carries them (nothing is sent while it is empty).
  const excludeRef = useRef<string[]>([]);
  const refreshes = useRef(0);
  // What the last load ran with, so a change of near or wait (not a first load) can show "loading" again.
  const lastLoad = useRef<string | null>(null);

  // The row on screen (dish-level test only), so a tap can say which row it was made in.
  const batchRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    picksRef.current = reply?.picks ?? [];
    batchRef.current = reply?.batch;
  }, [reply]);

  const post = useCallback(
    async (op: TasteOp | null, myGen: number, soft = false, batch?: string): Promise<Landed> => {
      const local = readLocal();
      const ctl = controller.current ?? new AbortController();
      controller.current = ctl;
      try {
        const res = await fetch("/api/account/taste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: ctl.signal,
          body: JSON.stringify({
            prefs: local,
            import: signedIn && !isEmpty(local) ? true : undefined,
            op: op ?? undefined,
            batch: op ? batch : undefined,
            exclude: excludeRef.current.length > 0 ? excludeRef.current : undefined,
            limit,
            near: nearKey ? { lat: Number(nearKey.split(",")[0]), lng: Number(nearKey.split(",")[1]) } : undefined,
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Reply;
        if (myGen !== gen.current) return "failed";
        // A refresh that has shown everything is not put on screen: the caller starts over instead of blanking the row.
        if (soft && data.picks.length === 0 && excludeRef.current.length > 0) return "exhausted";
        // Server-held prefs replace the device copy (uploaded once, then cleared);
        // local storage keeps the validated result so the next POST carries it.
        writeLocal(data.storage === "server" ? null : data.prefs);
        prefsRef.current = data.prefs;
        setReply({
          basis: data.basis,
          header: data.header,
          shortHeader: data.shortHeader,
          prefs: data.prefs,
          picks: data.picks,
          batch: data.batch,
        });
        setStatus("ready");
        return "shown";
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return "failed";
        if (myGen !== gen.current) return "failed";
        // A refused or failed request hides the picks but keeps the local chips. A failed refresh keeps the row it had.
        if (!soft) setStatus("error");
        return "failed";
      }
    },
    [signedIn, limit, nearKey],
  );

  // Initial load, and again whenever the viewer signs in or out, or near, limit or wait change.
  useEffect(() => {
    if (!resolved) return;
    const myGen = ++gen.current;
    const ctl = new AbortController();
    controller.current = ctl;
    const local = readLocal();
    prefsRef.current = local;
    // What one viewer was shown is not what the next one has seen.
    excludeRef.current = [];
    const loadKey = `${nearKey}|${limit ?? ""}|${wait}`;
    const changed = lastLoad.current !== null && lastLoad.current !== loadKey;
    lastLoad.current = loadKey;
    if (changed) setStatus("loading");
    // Asked not to start yet: nothing is sent, and the status stays "loading".
    if (wait) return () => ctl.abort();

    if (!signedIn && isEmpty(local)) {
      // Nothing to score: render the chip invite without a request.
      chain.current = chain.current.then(() => {
        if (myGen !== gen.current) return;
        setReply({ basis: "none", header: "", shortHeader: "", prefs: local, picks: [] });
        setStatus("ready");
      });
      return () => ctl.abort();
    }
    chain.current = chain.current.then(() => post(null, myGen));
    return () => ctl.abort();
    // userKey, not signedIn: re-run only on a real auth flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, userKey, post, wait, nearKey, limit]);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const send = useCallback(
    (op: TasteOp) => {
      const myGen = gen.current;
      // Ops are serialized so a local-storage viewer's second tap is built on
      // the first one's result rather than on a stale copy.
      // Read now, not when the request goes out: by then an earlier tap's reply may have swapped the row.
      const batch = batchRef.current;
      chain.current = chain.current.then(() => post(op, myGen, false, batch));
    },
    [post],
  );

  const apply = useCallback(
    (op: TasteOp) => {
      // Local copy first, so a signed-out tap survives even if the request fails.
      if (!signedIn) {
        prefsRef.current = optimistic(readLocal(), op);
        writeLocal(prefsRef.current);
      }

      // Been / hide remove the card at once; the refetch then confirms.
      if ((op.kind === "been" || op.kind === "hide") && op.value) {
        const gone = picksRef.current.find((p) => p.restaurant.id === op.value);
        setReply((r) => (r ? { ...r, picks: r.picks.filter((p) => p.restaurant.id !== op.value) } : r));
        if (gone) {
          const name = gone.restaurant.name;
          if (undoTimer.current) clearTimeout(undoTimer.current);
          setUndo({
            label: op.kind === "hide" ? `Hidden ${name}` : `Marked ${name} as been`,
            run: () => {
              if (undoTimer.current) clearTimeout(undoTimer.current);
              setUndo(null);
              send({ kind: op.kind === "hide" ? "unhide" : "unbeen", value: op.value });
            },
          });
          undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
        }
      } else if (op.kind === "reset") {
        if (undoTimer.current) clearTimeout(undoTimer.current);
        setUndo(null);
      }

      if (op.kind === "love" || op.kind === "unlove" || op.kind === "skip" || op.kind === "unskip" || op.kind === "reset") {
        setReply((r) => (r ? { ...r, prefs: optimistic(r.prefs, op) } : r));
      }
      send(op);
    },
    [signedIn, send],
  );

  const refresh = useCallback(() => {
    if (refreshes.current > 0) return;
    const myGen = gen.current;
    const before = excludeRef.current;
    // Everything on screen now counts as seen, so the next answer is made of places not shown yet.
    excludeRef.current = remember(before, picksRef.current.map((p) => p.restaurant.id));
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(null);
    refreshes.current += 1;
    setRefreshing(true);
    // The same queue as the ops, so a refresh is built on a tap made just before it.
    chain.current = chain.current.then(async () => {
      try {
        let landed = await post(null, myGen, true);
        if (landed === "exhausted") {
          // Every place has been shown: start over from the first set, once.
          excludeRef.current = [];
          landed = await post(null, myGen, true);
        }
        if (landed === "failed" && myGen === gen.current) excludeRef.current = before;
      } finally {
        refreshes.current -= 1;
        setRefreshing(refreshes.current > 0);
      }
    });
  }, [post]);

  const prefs = useMemo<TastePrefs>(
    () => ({ loves: reply?.prefs.loves ?? [], skips: reply?.prefs.skips ?? [] }),
    [reply],
  );

  return {
    status,
    basis: reply?.basis ?? "none",
    header: reply?.header ?? "",
    shortHeader: reply?.shortHeader ?? "",
    prefs,
    picks: reply?.picks ?? [],
    batch: reply?.batch,
    signedIn,
    apply,
    refresh,
    refreshing,
    undo,
  };
}
