"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";
import type {
  FullTastePrefs,
  TasteBasis,
  TasteOp,
  TastePick,
  TasteReason,
} from "@/lib/taste";

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

type Reply = {
  storage: "server" | "local";
  basis: TasteBasis;
  header: string;
  shortHeader: string;
  prefs: FullTastePrefs;
  picks: TastePick[];
};

/**
 * The device copy of the prefs (pm.taste.v1), empty on the server or when
 * storage is blocked. Exported for lib/useDiscoverQuery.ts: the For me POST
 * carries it as the signed-out viewer's prefs and as the fallback while the
 * server table is missing.
 */
export function readLocalTaste(): FullTastePrefs {
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

/*
 * A revision counter for the picks, shared by every caller of this module.
 *
 * The For me list (?foryou=1, lib/useDiscoverQuery.ts) is ranked on the server
 * from these prefs, and the chips that edit them live in a different component
 * from the grid, so the grid cannot see a tap through `useTaste`'s own state:
 * each call to the hook has its own. This bumps once an op that changes what
 * the ranking is built from has been sent and answered (a signed-in viewer's
 * prefs are on the server by then, which is what the next For me POST reads),
 * and the query keys its request on it. Been / hide are not here on purpose:
 * they take the card off the screen at once and ride in the next page request's
 * `prefs`, so they do not refetch the list under the reader. Their undoes are
 * here, though: an undo has to bring the place back, and the page it left may
 * already have been replaced by one asked for with the pick in its prefs (a
 * filter tap in the seconds between), so there is no card left on screen to
 * un-hide and only a fresh answer has it.
 */
const RETUNES: ReadonlySet<TasteOp["kind"]> = new Set([
  "love",
  "unlove",
  "skip",
  "unskip",
  "unbeen",
  "unhide",
  "reset",
]);
let tasteRevision = 0;
const revisionListeners = new Set<() => void>();

function bumpTasteRev() {
  tasteRevision += 1;
  for (const listener of revisionListeners) listener();
}

function subscribeTasteRev(listener: () => void): () => void {
  revisionListeners.add(listener);
  return () => {
    revisionListeners.delete(listener);
  };
}

/** The revision counter, as a hook. 0 until the first love / unlove / skip / unskip / reset lands. */
export function useTasteRev(): number {
  return useSyncExternalStore(subscribeTasteRev, () => tasteRevision, () => 0);
}

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

export function useTaste(): {
  status: Status;
  basis: TasteBasis;
  header: string;
  shortHeader: string;
  prefs: TastePrefs;
  picks: TastePick[];
  signedIn: boolean;
  apply: (op: TasteOp) => void;
  undo: Undo;
} {
  const { account, resolved } = useAuth();
  const signedIn = !!account;
  const userKey = account ? "in" : "out";

  const [status, setStatus] = useState<Status>("loading");
  const [reply, setReply] = useState<Omit<Reply, "storage"> | null>(null);
  const [undo, setUndo] = useState<Undo>(null);

  const prefsRef = useRef<FullTastePrefs>(EMPTY);
  const picksRef = useRef<TastePick[]>([]);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const gen = useRef(0);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    picksRef.current = reply?.picks ?? [];
  }, [reply]);

  const post = useCallback(
    async (op: TasteOp | null, myGen: number): Promise<void> => {
      const local = readLocalTaste();
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
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Reply;
        if (myGen !== gen.current) return;
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
        });
        setStatus("ready");
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        if (myGen !== gen.current) return;
        // A refused or failed request hides the picks but keeps the local chips.
        setStatus("error");
      }
    },
    [signedIn],
  );

  // Initial load, and again whenever the viewer signs in or out.
  useEffect(() => {
    if (!resolved) return;
    const myGen = ++gen.current;
    const ctl = new AbortController();
    controller.current = ctl;
    const local = readLocalTaste();
    prefsRef.current = local;

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
  }, [resolved, userKey, post]);

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
      chain.current = chain.current
        .then(() => post(op, myGen))
        .then(() => {
          if (RETUNES.has(op.kind)) bumpTasteRev();
        });
    },
    [post],
  );

  const apply = useCallback(
    (op: TasteOp) => {
      // Local copy first, so a signed-out tap survives even if the request fails.
      if (!signedIn) {
        prefsRef.current = optimistic(readLocalTaste(), op);
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
    signedIn,
    apply,
    undo,
  };
}
