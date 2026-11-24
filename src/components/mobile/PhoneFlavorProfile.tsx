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


/**
 * The wheel's families. Every flavor sits with its kin and wears the family's
 * colour, so the wheel reads as a few neighbourhoods rather than forty spokes.
 * A flavor nobody listed falls into Carbs and comfort.
 */
const FAMS: [string, string, string[]][] = [
  ["Heat and smoke", "#E2622A", ["Sweet heat", "Smoky", "Spicy", "Charred", "Warm spice"]],
  ["Rich and melty", "#C9952B", ["Cheese", "Creamy", "Buttery", "Rich", "Nutty", "Premium"]],
  ["Meat", "#8E3B46", ["Meat", "Cured", "Poultry", "Offal", "Red meat", "Low and slow", "Braised"]],
  ["Carbs and comfort", "#A9865A", ["Brunch", "Crispy", "Garlic, onion", "Pasta, noodles", "Bread, dough", "Carbs", "Fried", "Brothy", "World foods"]],
  ["Fresh and bright", "#4F8A4B", ["Bitter", "Herbs", "Fruity", "Pickled, tangy", "Greens", "Fresh, light", "Fermented", "Citrus", "Sour"]],
  ["Sea", "#2F7F86", ["Raw fish", "Seafood"]],
  ["Sweets and sips", "#B8578F", ["Sweet", "Drinks", "Dessert"]],
];
/* The word written around the ring, just outside each family's arc, same order
   as FAMS. One short word each: the narrowest family (Sea) spans two spokes. */
const FAM_WORDS = ["Heat", "Rich", "Meat", "Carbs", "Fresh", "Sea", "Sweet"];
const COMFORT = 3;
const famOf = (name: string) => {
  const i = FAMS.findIndex(([, , names]) => names.includes(name));
  return i < 0 ? COMFORT : i;
};

function Wheel({ T }: { T: FlavorWheel["wheel"] }) {
  /* gap is the band between the ring and the spokes where the family words sit */
  const n = T.length, c = 205, r0 = 78, k = 88, gap = 26;
  const rad = (d: number) => (d * Math.PI) / 180;
  const at = (deg: number, r: number) => [+(c + Math.cos(rad(deg)) * r).toFixed(2), +(c + Math.sin(rad(deg)) * r).toFixed(2)];
  /* The top three are the first three as scored; the spokes are then regrouped by family. */
  const top3 = new Set(T.slice(0, 3).map(([name]) => name));
  const groups = FAMS.map((_, fi) => T.filter(([name]) => famOf(name) === fi));
  const spokes = groups.flat();
  const step = 360 / n;
  const arcs: { d: string; color: string; word: string; path: string }[] = [];
  let start = 0;
  groups.forEach((g, fi) => {
    if (g.length) {
      const a0 = -90 + (start - 0.38) * step, a1 = -90 + (start + g.length - 1 + 0.38) * step;
      const [x0, y0] = at(a0, r0), [x1, y1] = at(a1, r0);
      /* The word's own path: an arc centred on the family's, just outside the ring.
         On the lower half it runs the other way, so the word is never upside down. */
      const m = (a0 + a1) / 2, low = Math.sin(rad(m)) > 0, rw = low ? r0 + 18 : r0 + 9;
      const [p0, q0] = at(m - 40, rw), [p1, q1] = at(m + 40, rw);
      arcs.push({
        d: `M${x0} ${y0}A${r0} ${r0} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`,
        color: FAMS[fi][1],
        word: FAM_WORDS[fi],
        path: low ? `M${p1} ${q1}A${rw} ${rw} 0 0 0 ${p0} ${q0}` : `M${p0} ${q0}A${rw} ${rw} 0 0 1 ${p1} ${q1}`,
      });
    }
    start += g.length;
  });
  return (
    <svg viewBox="0 -14 410 424" className="my-1 block h-auto w-full" role="img" aria-label={`Flavor wheel: ${T.slice(0, 3).map(([n]) => n).join(", ")} lead`}>
      {arcs.map((arc) => (
        <path key={arc.color} d={arc.d} fill="none" stroke={arc.color} strokeWidth={4} strokeLinecap="round" />
      ))}
      {arcs.map((arc, i) => (
        <g key={arc.word}>
          <path id={`fam-word-${i}`} d={arc.path} fill="none" />
          <text fontSize={12.5} fontWeight={700} fill={arc.color} textAnchor="middle">
            <textPath href={`#fam-word-${i}`} startOffset="50%">{arc.word}</textPath>
          </text>
        </g>
      ))}
      <text x={c} y={c - 8} fontSize={12} fill={GREY} textAnchor="middle" fontWeight={600}>most</text>
      <text x={c} y={c + 8} fontSize={12} fill={GREY} textAnchor="middle" fontWeight={600}>eaters</text>
      {spokes.map(([name, sc, t], i) => {
        const a = -90 + i * step, ca = +Math.cos(rad(a)).toFixed(4), sa = +Math.sin(rad(a)).toFixed(4);
        const early = Math.abs(t) < 1, ng = sc < 0 && !early, top = top3.has(name);
        const len = early ? 5 : Math.abs(sc) * k;
        const r1 = ng ? r0 - 7 : r0 + gap, r2 = ng ? r0 - 7 - len : r0 + gap + len;
        const lr = (ng ? r0 + gap : r2) + 8, flip = ca < 0, x = +(c + ca * lr).toFixed(2), y = +(c + sa * lr).toFixed(2);
        return (
          <g key={name}>
            <line x1={+(c + ca * r1).toFixed(2)} y1={+(c + sa * r1).toFixed(2)} x2={+(c + ca * r2).toFixed(2)} y2={+(c + sa * r2).toFixed(2)} stroke={FAMS[famOf(name)][1]} strokeOpacity={early ? 0.3 : ng ? 0.45 : 1} strokeWidth={top ? 8 : ng ? 5 : 6.5} strokeLinecap="round" />
            <text x={x} y={y} fontSize={top ? 14 : 11.5} fontWeight={top ? 700 : 600} fill={early ? "#857a69" : INK} textAnchor={flip ? "end" : "start"} dominantBaseline="central" transform={`rotate(${flip ? a + 180 : a} ${x} ${y})`}>
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
    <div className="min-h-dvh divide-y divide-[#e4dccb] bg-[#F7F4EC] px-4 pb-8 pt-2">
      <section className="py-5">
        {/* Photo and name sit on the rank card's top edge ("badge on the
            edge", Calvin 2026-11-24); same layout as PhoneProfileScreen. */}
        <div className="mt-12">
          <RankRing
            points={arrival.displayPoints}
            identity={
              <>
                <Link href={settingsHref} aria-label="Settings" className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-pm-grey-text transition-colors hover:bg-pm-grey-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pm-orange">
                  <SettingsIcon className="h-5 w-5" />
                </Link>
                <div className="-mt-[64px] mb-1.5 flex flex-col items-center text-center">
                  {account.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={account.avatarUrl} alt="" className="h-[88px] w-[88px] shrink-0 rounded-full object-cover ring-4 ring-white" />
                  ) : (
                    <span className="font-display flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full text-2xl font-semibold text-zinc-800 ring-4 ring-white" style={{ background: TONES[0] }}>
                      {initials(account.name)}
                    </span>
                  )}
                  <h1 className="font-display mt-2.5 flex max-w-full items-center gap-1.5 text-[22px] font-semibold leading-tight tracking-tight text-zinc-900">
                    <span className="truncate">{account.name}</span>
                    <VerifiedBadge userId={account.id} />
                  </h1>
                </div>
              </>
            }
          />
        </div>
        {postsReady && (
          <div className="mt-2 flex justify-center gap-4 text-[12.5px] text-zinc-600">
            <span><b className="mr-1 font-mono font-semibold text-zinc-900">{myPosts.length}</b>plates</span>
            <span><b className="mr-1 font-mono font-semibold text-zinc-900">{spots}</b>spots</span>
          </div>
        )}
      </section>

      <div className="pt-5">
        <ProfileShelves
          tab
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

      {data && data.wheel.length > 0 && (
        <section className="py-5">
          <div className="rounded-2xl bg-white px-4 py-4">
          <Label>Your flavor wheel</Label>
          <h2 className="font-display mt-1 text-[22px] font-semibold leading-tight text-zinc-900">
            {data.wheel.slice(0, 3).map(([n]) => n + ".").join(" ")}
          </h2>
          <Wheel T={data.wheel} />
          </div>
        </section>
      )}

      {data && data.next.length > 0 && (
        <section className="pb-3 pt-5">
          <Label>Try next</Label>
          <h2 className="font-display mt-1 text-[22px] font-semibold leading-tight text-zinc-900">New mixes of what you go back for</h2>
          <Note />
          {data.next.map((d, i) => (
            <div key={d.dish} className={`py-4 ${i ? "border-t border-[#e4dccb]" : "pt-3"}`}>
              <div className="grid grid-cols-[56px_1fr] items-center gap-3">
                <div className="h-14 w-14 rounded-xl" style={{ background: TONES[(i + 1) % 3] }} />
                <div>
                  <span className="font-display block text-base font-semibold leading-tight text-zinc-900">{d.dish}</span>
                  <span className="mt-0.5 block text-xs text-pm-grey-text">{d.spot}</span>
                </div>
              </div>
              <p className="mt-2.5 text-[12.5px] leading-snug text-zinc-600">{d.ing}</p>
              <Bars fl={d.fl} you={you} />
              <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-[12.5px] leading-snug text-zinc-700">
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
        <button type="button" onClick={signOut} className="min-h-11 w-full rounded-full bg-white px-4 text-sm font-medium text-pm-grey-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pm-orange">
          Log out
        </button>
        {footer}
      </div>
    </div>
  );
}
