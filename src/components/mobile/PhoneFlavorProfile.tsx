"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RankRing } from "@/components/RankRing";
import { ProfileShelves, useRollCallArrival, type ShelfPost } from "@/components/ProfileShelves";
import { SettingsIcon } from "@/components/icons";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import type { FlavorWheel } from "@/lib/flavorWheelSnapshots";

/**
 * The Profile tab with the flavor wheel folded in, for the two gated accounts
 * only (lib/forMeGate.ts). PhoneProfileScreen renders this in place of its own
 * overview when `useForMeAccess()` is true; everyone else sees no change.
 *
 * The posts, votes, comments and detail sheet are the live ones, wired the way
 * PhoneProfileScreen wires them. The wheel, the per-plate flavor read and Try
 * next are a SNAPSHOT (lib/flavorWheelSnapshots.ts) fetched from
 * /api/account/flavor-wheel, which only ever returns the caller's own. A plate
 * posted after the snapshot opens without a flavor read rather than a guess.
 *
 * Changing your photo is not on this screen; it lives in the standard profile.
 */

const O = "#c9591f";
const OT = "#a8481a";
const INK = "#2a2622";
const TAN2 = "#b8a88c";
const GREY = "#665c4e";
const TONES = ["var(--pm-tone-1)", "var(--pm-tone-2)", "var(--pm-tone-3)"];

type Flavor = [string, number];

const norm = (x?: string) => (x ?? "").trim().toLowerCase();
function flavorFor(FLAVORS: FlavorWheel["flavors"], p: ShelfPost) {
  const keys = Object.keys(FLAVORS);
  const k =
    keys.find((k) => norm(k) === `${norm(p.restaurant)}|${norm(p.dishName)}`) ??
    (p.dishName ? keys.find((k) => norm(k.split("|")[1]) === norm(p.dishName)) : undefined) ??
    keys.find((k) => norm(k) === `${norm(p.restaurant)}|`);
  return k ? FLAVORS[k] : null;
}


function Wheel({ T }: { T: FlavorWheel["wheel"] }) {
  const n = T.length, c = 205, r0 = 78, k = 104;
  const rad = (d: number) => (d * Math.PI) / 180;
  return (
    <svg viewBox="0 -14 410 424" className="my-1 block h-auto w-full" role="img" aria-label={`Flavor wheel: ${T.slice(0, 3).map(([n]) => n).join(", ")} lead`}>
      <circle cx={c} cy={c} r={r0} fill="none" stroke={GREY} strokeWidth={1.5} strokeDasharray="3 4" />
      <text x={c} y={c - 8} fontSize={12} fill={GREY} textAnchor="middle" fontWeight={600}>most</text>
      <text x={c} y={c + 8} fontSize={12} fill={GREY} textAnchor="middle" fontWeight={600}>eaters</text>
      {T.map(([name, sc, t], i) => {
        const a = -90 + (i * 360) / n, ca = +Math.cos(rad(a)).toFixed(4), sa = +Math.sin(rad(a)).toFixed(4);
        const early = Math.abs(t) < 1, ng = sc < 0 && !early, top = i < 3;
        const len = early ? 5 : Math.abs(sc) * k;
        const r1 = ng ? r0 - 5 : r0 + 7, r2 = ng ? r0 - 5 - len : r0 + 7 + len;
        const stroke = top ? O : ng ? GREY : early ? "#d9cdb6" : t >= 2 ? INK : TAN2;
        const lr = (ng ? r0 + 7 : r2) + 8, flip = ca < 0, x = +(c + ca * lr).toFixed(2), y = +(c + sa * lr).toFixed(2);
        return (
          <g key={name}>
            <line x1={+(c + ca * r1).toFixed(2)} y1={+(c + sa * r1).toFixed(2)} x2={+(c + ca * r2).toFixed(2)} y2={+(c + sa * r2).toFixed(2)} stroke={stroke} strokeWidth={ng ? 5 : 6.5} strokeLinecap="round" />
            <text x={x} y={y} fontSize={top ? 14 : 11.5} fontWeight={600} fill={top ? OT : early ? "#857a69" : ng ? GREY : INK} textAnchor={flip ? "end" : "start"} dominantBaseline="central" transform={`rotate(${flip ? a + 180 : a} ${x} ${y})`}>
              {name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}


function Bars({ fl, you: YOU }: { fl: Flavor[]; you: Set<string> }) {
  return (
    <div className="mt-3 grid gap-2.5">
      {[...fl].sort((a, b) => b[1] - a[1]).map(([name, v]) => {
        const you = YOU.has(name);
        return (
          <div key={name} className={`grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 text-[13px] ${you ? "font-semibold text-pm-orange-text" : "text-zinc-800"}`}>
            <span>{name}</span>
            <b className="font-mono text-xs font-medium">{v}</b>
            <i className="col-span-2 block h-[3px] rounded-full bg-[#efe6d4]">
              <u className="block h-full rounded-full" style={{ width: `${v * 10}%`, background: you ? O : TAN2 }} />
            </i>
          </div>
        );
      })}
    </div>
  );
}


const Label = ({ children }: { children: React.ReactNode }) => <p className="mono-label text-zinc-500">{children}</p>;
const Note = () => (
  <p className="mt-1 text-xs text-zinc-500">
    Orange = flavors you lean toward. Out of <span className="font-mono">10</span>.
  </p>
);


function PostFlavor({ post, data, you: YOU }: { post: ShelfPost; data: FlavorWheel; you: Set<string> }) {
  const f = flavorFor(data.flavors, post);
  if (!f) return null;
  const fed = f.fl.filter(([n, v]) => YOU.has(n) && v >= 3);
  return (
    <div className="rounded-2xl bg-[#F7F4EC] px-4 pb-4 pt-3.5">
      <Label>What&apos;s on the plate</Label>
      <p className="mt-1.5 text-sm leading-snug text-zinc-700">{f.read}</p>
      <div className="mt-4">
        <Label>Flavor by flavor</Label>
        <Bars fl={f.fl} you={YOU} />
      </div>
      {fed.length > 0 && (
        <div className="mt-4">
          <Label>Fed your wheel</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {fed.map(([n]) => (
              <span key={n} className="rounded-full bg-pm-orange-tint px-3 py-1 text-[12.5px] font-semibold text-pm-orange-text">{n}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


export function PhoneFlavorProfile({ settingsHref, footer }: { settingsHref: string; footer?: React.ReactNode }) {
  const { account, signOut } = useAuth();
  const [myPosts, setMyPosts] = useState<ShelfPost[]>([]);
  const [postsReady, setPostsReady] = useState(false);
  const [data, setData] = useState<FlavorWheel | null>(null);
  const arrival = useRollCallArrival(account, myPosts, postsReady);
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    fetch("/api/posts?mine=1")
      .then((res) => res.json())
      .then((d: { posts: ShelfPost[] }) => {
        if (cancelled) return;
        setMyPosts(d.posts.filter((p) => p.userId === account.id));
        setPostsReady(true);
      })
      .catch(() => {});
    fetch("/api/account/flavor-wheel")
      .then((res) => res.json())
      .then((d: { wheel: FlavorWheel | null }) => {
        if (!cancelled) setData(d.wheel);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [account]);
  const patchPost = (postId: string, fn: (p: ShelfPost) => ShelfPost) =>
    setMyPosts((prev) => prev.map((p) => (p.id === postId ? fn(p) : p)));
  const you = useMemo(() => new Set((data?.wheel ?? []).filter(([, s, t]) => s > 0 && t >= 1).map(([n]) => n)), [data]);
  if (!account) return null;
  const spots = new Set(myPosts.map((p) => p.restaurant)).size;

  return (
    <div className="min-h-dvh divide-y divide-[#f0ebe0] bg-white px-4 pb-8 pt-2">
      <section className="py-5">
        <div className="flex items-center gap-3.5">
          {account.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="font-display flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-zinc-800" style={{ background: TONES[0] }}>
              {initials(account.name)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display flex items-center gap-1.5 text-[22px] font-semibold leading-tight text-zinc-900">
              <span className="truncate">{account.name}</span>
              <VerifiedBadge userId={account.id} />
            </h1>
            <p className="mt-0.5 truncate font-mono text-[12.5px] text-zinc-500">{account.email}</p>
          </div>
          <Link href={settingsHref} aria-label="Settings" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint text-pm-grey-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pm-orange">
            <SettingsIcon className="h-5 w-5" />
          </Link>
        </div>
        <div className="mt-4 border-t border-[#f0ebe0] pt-3">
          <RankRing points={arrival.displayPoints} />
        </div>
        {postsReady && (
          <div className="mt-2 flex justify-center gap-4 text-[12.5px] text-zinc-600">
            <span><b className="mr-1 font-mono font-semibold text-zinc-900">{myPosts.length}</b>plates</span>
            <span><b className="mr-1 font-mono font-semibold text-zinc-900">{spots}</b>spots</span>
          </div>
        )}
      </section>

      {data && data.wheel.length > 0 && (
        <section className="py-5">
          <Label>Your flavor wheel</Label>
          <h2 className="font-display mt-1 text-[22px] font-semibold leading-tight text-zinc-900">
            {data.wheel.slice(0, 3).map(([n]) => n + ".").join(" ")}
          </h2>
          <Wheel T={data.wheel} />
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11.5px] text-zinc-600">
            {[[O, "Top three"], [INK, "Clearly you"], [TAN2, "Leaning"], [GREY, "Less than most"]].map(([c, l]) => (
              <span key={l} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}</span>
            ))}
          </div>
        </section>
      )}

      <div className="pt-5 [&_#profile-archive_button.bg-white]:bg-pm-grey-tint">
        <ProfileShelves
          posts={myPosts}
          arrival={arrival}
          onCommentAdded={(postId, comment) =>
            patchPost(postId, (p) => ({ ...p, comments: [...(p.comments ?? []), comment] }))
          }
          onCommentVoted={(postId, commentId, patch) =>
            patchPost(postId, (p) => ({
              ...p,
              comments: (p.comments ?? []).map((c) => (c.id === commentId ? { ...c, ...patch } : c)),
            }))
          }
          onPostVoted={(postId, patch) => patchPost(postId, (p) => ({ ...p, ...patch }))}
          sheetExtra={data ? (p) => <PostFlavor post={p} data={data} you={you} /> : undefined}
        />
      </div>

      {data && data.next.length > 0 && (
        <section className="pb-3 pt-5">
          <Label>Try next</Label>
          <h2 className="font-display mt-1 text-[22px] font-semibold leading-tight text-zinc-900">New mixes of what you go back for</h2>
          <Note />
          {data.next.map((d, i) => (
            <div key={d.dish} className={`py-4 ${i ? "border-t border-[#f0ebe0]" : "pt-3"}`}>
              <div className="grid grid-cols-[56px_1fr] items-center gap-3">
                <div className="h-14 w-14 rounded-xl" style={{ background: TONES[(i + 1) % 3] }} />
                <div>
                  <span className="font-display block text-base font-semibold leading-tight text-zinc-900">{d.dish}</span>
                  <span className="mt-0.5 block text-xs text-pm-grey-text">{d.spot}</span>
                </div>
              </div>
              <p className="mt-2.5 text-[12.5px] leading-snug text-zinc-600">{d.ing}</p>
              <Bars fl={d.fl} you={you} />
              <p className="mt-3 rounded-xl bg-[#F7F4EC] px-3 py-2.5 text-[12.5px] leading-snug text-zinc-700">
                {d.from.map(([f, dish], j) => (
                  <span key={f}>
                    <b className="font-semibold text-pm-orange-text">{f}</b> like your {dish}{j < d.from.length - 1 ? ", " : "."}
                  </span>
                ))}
              </p>
            </div>
          ))}
        </section>
      )}

      <div className="pt-5">
        <button type="button" onClick={signOut} className="min-h-11 w-full rounded-full bg-pm-grey-tint px-4 text-sm font-medium text-pm-grey-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pm-orange">
          Log out
        </button>
        {footer}
      </div>
    </div>
  );
}
