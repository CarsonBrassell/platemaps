"use client";

import { useCallback, useEffect, useState } from "react";
import { FREE_FOOD_DEVICE_KEY, FREE_FOOD_STARTS_AT, FREE_FOOD_TOTAL_SLICES } from "@/lib/freeFoodEvent";

export type Ticket = { claimedAt: string; activatedAt: string | null };

/**
 * Whether this is the Capacitor iOS app. Client-side, so spoofable; that is
 * acceptable, the server limits (one per phone id, per IP, per account) are
 * the real guard. `pm-dev-native` fakes it locally and is ignored in production.
 */
export function isNativeApp(): boolean {
  try {
    if (process.env.NODE_ENV !== "production" && localStorage.getItem("pm-dev-native") === "1") {
      return true;
    }
  } catch {}
  return (
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ===
    true
  );
}

let sessionDeviceId: string | null = null;

/** A random id kept in localStorage; a per-session one if storage throws. */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(FREE_FOOD_DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(FREE_FOOD_DEVICE_KEY, id);
    }
    return id;
  } catch {
    return (sessionDeviceId ??= crypto.randomUUID());
  }
}

type Reply = { ticket?: Ticket | null; activated?: number; serverNow?: number; error?: string; code?: string };

/**
 * Dev-only rehearsal of the night: `?ffsim=1` once (remembered in localStorage,
 * `?ffsim=0` turns it off) pretends it is 7:42pm on the 19th, you hold an
 * unactivated ticket, and 12 slices are already handed out. Other people
 * activate one every few seconds, all in memory; no request
 * reaches the API. Ignored in production.
 */
export function isTicketSim(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("ffsim");
    if (q === "1") localStorage.setItem("pm-ff-sim", "1");
    if (q === "0") localStorage.removeItem("pm-ff-sim");
    return localStorage.getItem("pm-ff-sim") === "1";
  } catch {
    return false;
  }
}

/** 7:42pm on the night, as a server-clock offset from now. */
const SIM_NOW = FREE_FOOD_STARTS_AT + (2 * 60 + 42) * 60 * 1000;

/** One shared fake crowd, so the popup and the Profile show the same number. */
const sim = {
  started: false,
  activated: 12,
  ticket: { claimedAt: new Date(SIM_NOW - 3 * 3600 * 1000).toISOString(), activatedAt: null } as Ticket | null,
  subs: new Set<() => void>(),
  emit() {
    sim.subs.forEach((f) => f());
  },
  start() {
    if (sim.started) return;
    sim.started = true;
    // Console handle for rehearsing, e.g. skipping to the end of a live ticket.
    (window as unknown as { __ffSim?: typeof sim }).__ffSim = sim;
    const step = () => {
      // Someone at the counter activates theirs, now and then two at once.
      sim.activated = Math.min(FREE_FOOD_TOTAL_SLICES, sim.activated + (Math.random() < 0.25 ? 2 : 1));
      sim.emit();
      setTimeout(step, 2000 + Math.random() * 3000);
    };
    setTimeout(step, 2500);
  },
};

async function call(url: string, method: "GET" | "POST", body?: unknown): Promise<{ ok: boolean; data: Reply }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as Reply;
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "Could not reach PlateMaps. Try again." } };
  }
}

/**
 * The signed-in user's ticket and the actions on it. `offset` is the server's
 * clock minus the phone's, from the last reply, so countdowns read the
 * server's time even on a phone whose clock is off.
 */
export function useEventTicket(enabled: boolean) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [activated, setActivated] = useState<number | null>(null);
  const [simOn, setSimOn] = useState(false);

  const apply = useCallback((d: Reply) => {
    if (d.ticket !== undefined) setTicket(d.ticket);
    if (typeof d.activated === "number") setActivated(d.activated);
    if (typeof d.serverNow === "number") setOffset(d.serverNow - Date.now());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (isTicketSim()) {
      setSimOn(true);
      setOffset(SIM_NOW - Date.now());
      const sync = () => {
        setTicket(sim.ticket);
        setActivated(sim.activated);
      };
      sync();
      setLoaded(true);
      sim.subs.add(sync);
      sim.start();
      return () => {
        sim.subs.delete(sync);
      };
    }
    let alive = true;
    const load = () =>
      call("/api/events/ticket", "GET").then(({ ok, data }) => {
        if (!alive) return;
        if (ok) apply(data);
        setLoaded(true);
      });
    load();
    // The count moves as people activate; keep it roughly current while open.
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [enabled, apply]);

  const act = useCallback(
    async (url: string, body?: unknown) => {
      setBusy(true);
      setError(null);
      const { ok, data } = await call(url, "POST", body ?? {});
      if (ok) {
        apply(data);
        // Activating changes the count; pick up the new total.
        const fresh = await call("/api/events/ticket", "GET");
        if (fresh.ok) apply(fresh.data);
      }
      else setError({ message: data.error ?? "Something went wrong.", code: data.code });
      setBusy(false);
      return ok;
    },
    [apply],
  );

  const claim = useCallback(async () => {
    if (!simOn) return act("/api/events/ticket/claim", { deviceId: getDeviceId() });
    sim.ticket = { claimedAt: new Date(Date.now() + offset).toISOString(), activatedAt: null };
    sim.emit();
    return true;
  }, [act, simOn, offset]);

  const activate = useCallback(async () => {
    if (!simOn) return act("/api/events/ticket/activate");
    if (sim.ticket && !sim.ticket.activatedAt) {
      sim.ticket = { ...sim.ticket, activatedAt: new Date(Date.now() + offset).toISOString() };
      sim.activated = Math.min(FREE_FOOD_TOTAL_SLICES, sim.activated + 1);
      sim.emit();
    }
    return true;
  }, [act, simOn, offset]);

  const slicesLeft = activated === null ? null : Math.max(0, FREE_FOOD_TOTAL_SLICES - activated);

  return { ticket, loaded, offset, busy, error, slicesLeft, simOn, claim, activate };
}

/** Server-corrected "now", ticking every second; null until mounted. */
export function useTicketNow(offset: number): number | null {
  const [tick, setTick] = useState<number | null>(null);
  useEffect(() => {
    setTick(Date.now());
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return tick === null ? null : tick + offset;
}
