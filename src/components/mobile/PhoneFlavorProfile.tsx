"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RankRing } from "@/components/RankRing";
import { ProfileShelves, useRollCallArrival, type ShelfPost } from "@/components/ProfileShelves";
import { SettingsIcon } from "@/components/icons";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useAuth, useProfileV2Access } from "@/lib/auth";
import { initials } from "@/lib/format";
import type { FlavorWheel } from "@/lib/flavorWheelSnapshots";
import { FlavorConstellation } from "@/components/mobile/FlavorConstellation";
import type { EaterType } from "@/lib/eaterType";

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
const TAN2 = "#b8a88c";
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


/** Eater-type tile tint, one per flavor group (probe/personality-types/mockup.html). */

/* One-weight line marks for the eater types, drawn in the accent. An emoji in a tinted tile read as stock. */
const EATER_MARK: Record<string, React.ReactNode> = {
  enthusiast: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /><path d="M7 9.6l.9-1.2M15.2 7.2l1.4.5M17.3 13.4l-.2 1.4M8.4 16.6l-1-.9M13.2 17.4l1.4-.2" /></>,
  nurturer: <><rect x="9.8" y="4" width="4.4" height="3" rx=".7" /><rect x="4" y="7" width="16" height="3.6" rx="1.8" /><rect x="3.2" y="10.6" width="17.6" height="3.6" rx="1.8" /><rect x="4" y="14.2" width="16" height="3.6" rx="1.8" /><path d="M5 20.4h14" /></>,
  investigator: <path d="M12 3c1 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2 .9-3.4 2-4.5.3 1.6 1 2.4 2 2.8C10.6 9 10.8 5.6 12 3z" />,
  devotee: <><path d="M14.5 4.5a5.5 5.5 0 0 1 5 5c.3 3.3-2.6 5.6-6 5.2l-3.2-.4-.9-3.1C8.6 7.6 11.2 4.2 14.5 4.5z" /><path d="M9.9 14.1 7.2 16.8" /><circle cx="5.6" cy="17" r="1.6" /><circle cx="7" cy="18.9" r="1.6" /></>,
  individualist: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5.6" /><path d="M12 6.4v11.2M7.2 9.2l9.6 5.6M16.8 9.2l-9.6 5.6" /></>,
  purist: <><path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14z" /><path d="M5 19l8.5-8.5" /></>,
  challenger: <><path d="M15 7.2c3 .9 4.6 3.9 3.6 7.4C17.4 18.9 13 21 5.5 20.4c4.2-1.2 6.4-3.6 7-7.2.4-2.6.8-5 2.5-6z" /><path d="M15 7.2c-.1-2 .9-3.3 3-3.7" /></>,
  loyalist: <><path d="M3.5 11h17c0 4.7-3.8 8.5-8.5 8.5S3.5 15.7 3.5 11z" /><path d="M8.5 11l4.3-8M12 11l4.3-7.5" /></>,
};
const PLATE_MARK = <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /></>;

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
  const v2 = useProfileV2Access();
  const [myPosts, setMyPosts] = useState<ShelfPost[]>([]);
  const [postsReady, setPostsReady] = useState(false);
  const [data, setData] = useState<FlavorWheel | null>(null);
  const [eater, setEater] = useState<EaterType | null>(null);
  const [wheelOpen, setWheelOpen] = useState(false);
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
      .then((d: { wheel: FlavorWheel | null; eaterType?: EaterType | null }) => {
        if (cancelled) return;
        setData(d.wheel);
        setEater(d.eaterType ?? null);
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
      <section className={v2 ? "pb-4 pt-3" : "py-5"}>
        {/* Photo and name sit on the rank card's top edge ("badge on the
            edge", Calvin 2026-11-24); same layout as PhoneProfileScreen.
            New layout is Calvin-only for now (isProfileV2User). */}
        {!v2 && (
          <>
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
                <p className="mt-0.5 truncate font-mono text-[12.5px] text-pm-grey-text">{account.email}</p>
              </div>
              <Link href={settingsHref} aria-label="Settings" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-pm-grey-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pm-orange">
                <SettingsIcon className="h-5 w-5" />
              </Link>
            </div>
            <div className="mt-4">
              <RankRing points={arrival.displayPoints} />
            </div>
            {postsReady && (
              <div className="mt-2 flex justify-center gap-4 text-[12.5px] text-zinc-600">
                <span><b className="mr-1 font-mono font-semibold text-zinc-900">{myPosts.length}</b>plates</span>
                <span><b className="mr-1 font-mono font-semibold text-zinc-900">{spots}</b>spots</span>
              </div>
            )}
          </>
        )}
        {v2 && (
        <div className="mt-10">
          <RankRing
            points={arrival.displayPoints}
            identity={
              <>
                <Link href={settingsHref} aria-label="Settings" className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-pm-grey-text transition-colors hover:bg-pm-grey-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pm-orange">
                  <SettingsIcon className="h-5 w-5" />
                </Link>
                <div className="-mt-[52px] mb-1 flex flex-col items-center text-center">
                  {account.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={account.avatarUrl} alt="" className="h-[72px] w-[72px] shrink-0 rounded-full object-cover ring-4 ring-white" />
                  ) : (
                    <span className="font-display flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full text-xl font-semibold text-zinc-800 ring-4 ring-white" style={{ background: TONES[0] }}>
                      {initials(account.name)}
                    </span>
                  )}
                  <h1 className="font-display mt-2 flex max-w-full items-center gap-1.5 text-[20px] font-semibold leading-tight tracking-tight text-zinc-900">
                    <span className="truncate">{account.name}</span>
                    <VerifiedBadge userId={account.id} />
                  </h1>
                </div>
              </>
            }
          >
            {postsReady && (
              <div className="mt-2 flex justify-center gap-4 text-[12.5px] text-zinc-600">
                <span><b className="mr-1 font-mono font-semibold text-zinc-900">{myPosts.length}</b>plates</span>
                <span><b className="mr-1 font-mono font-semibold text-zinc-900">{spots}</b>spots</span>
              </div>
            )}
            {data && data.wheel.length > 0 && (
              <>
                {/* Compact by default (Calvin 2026-11-24: too much scrolling to
                    reach posts): one row with the type and top three flavors;
                    the wheel always shows (Calvin asked); the reading opens on tap. */}
                <div className="-mx-5 mb-3 mt-3 h-px bg-[#ece6dc]" />
                <button
                  type="button"
                  aria-expanded={wheelOpen}
                  onClick={() => setWheelOpen((o) => !o)}
                  className="-mx-2 grid min-h-11 w-[calc(100%+16px)] grid-cols-[40px_1fr_auto] items-center gap-3 rounded-2xl px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pm-orange"
                >
                  <span
                    aria-hidden
                    className="grid h-10 w-10 place-items-center text-pm-orange"
                  >
                    <svg viewBox="0 0 24 24" className="h-[30px] w-[30px]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                      {(eater && EATER_MARK[eater.key]) ?? PLATE_MARK}
                    </svg>
                  </span>
                  <span className="min-w-0">
                    <span className="font-display block truncate text-[17px] font-semibold leading-tight text-zinc-900">{eater?.name ?? "Your flavor wheel"}</span>
                    <span className="mono-label mt-1 block truncate text-zinc-500" style={{ fontSize: 10, letterSpacing: "0.08em" }}>{data.wheel.slice(0, 3).map(([n]) => n).join(" · ")}</span>
                  </span>
                  <span className="flex items-center gap-1 text-[12px] font-semibold text-pm-orange-text">
                    {wheelOpen ? "Less" : "Why"}
                    <svg aria-hidden viewBox="0 0 12 12" className={`h-3 w-3 transition-transform motion-reduce:transition-none ${wheelOpen ? "rotate-180" : ""}`}>
                      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
                {wheelOpen && eater && <p className="mt-2 text-[13.5px] leading-snug text-zinc-600">{eater.read}</p>}
                <FlavorConstellation data={data} />
              </>
            )}
          </RankRing>
        </div>
        )}
      </section>

      <div className={v2 ? "pt-4" : "pt-5"}>
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

      {!v2 && data && data.wheel.length > 0 && (
        <section className="py-5">
          <div className="rounded-2xl bg-white px-4 py-4">
            <Label>Your flavor wheel</Label>
            <h2 className="font-display mt-1 text-[22px] font-semibold leading-tight text-zinc-900">
              {data.wheel.slice(0, 3).map(([n]) => n + ".").join(" ")}
            </h2>
            <FlavorConstellation data={data} />
          </div>
        </section>
      )}

      {data && data.next.length > 0 && (
        <section className="pb-3 pt-5">
          <Label>Try next</Label>
          <h2 className="font-display mt-1 text-[22px] font-semibold leading-tight text-zinc-900">New mixes of what you go back for</h2>
          <Note />
          {data.next.map((d, i) => (
            <div key={d.dish} className={v2 ? `rounded-2xl bg-white p-4 ${i ? "mt-3" : "mt-4"}` : `py-4 ${i ? "border-t border-[#e4dccb]" : "pt-3"}`}>
              <div className="grid grid-cols-[56px_1fr] items-center gap-3">
                <div className="h-14 w-14 rounded-xl" style={{ background: TONES[(i + 1) % 3] }} />
                <div>
                  <span className="font-display block text-base font-semibold leading-tight text-zinc-900">{d.dish}</span>
                  <span className={`mt-0.5 block text-xs ${v2 ? "text-zinc-500" : "text-pm-grey-text"}`}>{d.spot}</span>
                </div>
              </div>
              <p className="mt-2.5 text-[12.5px] leading-snug text-zinc-600">{d.ing}</p>
              <Bars fl={d.fl} you={you} />
              <p className={`mt-3 rounded-xl px-3 py-2.5 ${v2 ? "bg-[#F7F4EC]" : "bg-white"} text-[12.5px] leading-snug text-zinc-700`}>
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
