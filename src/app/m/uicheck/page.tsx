"use client";

/* THROWAWAY — design preview only, delete before committing. Stubs the three
   fetches PhoneFriendsScreen and AuthProvider make so the populated screen can
   be looked at without a session. */

import { PhoneFriendsScreen } from "@/components/mobile/PhoneFriendsScreen";

const YOU = { id: "you", name: "Carson Brassell", points: 1240 };

const FRIENDS = [
  { id: "f1", name: "Maya Ellis", points: 1563 },
  { id: "f2", name: "Diego Alvarez", points: 980 },
  { id: "f3", name: "Priya Nair", points: 640 },
  { id: "f4", name: "Iris Tanaka", points: 305 },
  { id: "f5", name: "Calvin Lensink", points: 88 },
  { id: "f6", name: "Jordan Reyes", points: 12 },
];

const INCOMING = [
  { id: "r1", userId: "u9", name: "Sam Whitfield", createdAt: new Date(Date.now() - 3600e3).toISOString() },
];
const OUTGOING = [
  { id: "r2", userId: "u10", name: "Nina Okafor", createdAt: new Date(Date.now() - 86400e3).toISOString() },
];

const real = globalThis.fetch;

if (typeof window !== "undefined") {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/api/auth/me")) return json({ user: YOU });
    if (url.includes("/api/friends/list")) return json({ friends: FRIENDS });
    if (url.includes("/api/friends")) return json({ incoming: INCOMING, outgoing: OUTGOING });
    return real(input, init);
  }) as typeof fetch;
}

export default function Page() {
  return <PhoneFriendsScreen />;
}
