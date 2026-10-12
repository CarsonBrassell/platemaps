"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { avatarPalette, initials } from "@/lib/format";
import {
  cachedFriendRivals,
  computeFriendRivals,
  firstName,
  friendsPassed,
  refreshFriendRivals,
  type RivalFriend,
} from "@/lib/friendRivals";
import { formatPoints } from "@/lib/points";
import { usePointsAward } from "@/lib/postCelebration";
import { useQueryParams } from "@/lib/queryString";
import "@/components/mobile/rivals.css";

/**
 * The Friends' Table, said out loud the moment a post's points land.
 *
 * Rendered from `PhoneShell` beside `PhonePointsFly` and keyed off the same
 * store: when the award's token arrives, this compares where you stood a
 * moment ago (`account.points - earned` — the composer refreshed the account
 * before it navigated) against where you stand now, using a fresh friends
 * list. Pass someone and it is a loud orange banner with sparks; pass nobody
 * and it is a quieter one naming the next friend and how many plates it takes.
 *
 * It never blocks: it sits at the top of the frame, has no backdrop, dismisses
 * itself after a few seconds and on any tap. Every failure — signed out, no
 * friends, a dropped request — means nothing is drawn.
 */

/** After the token lands, so the count-up and this do not arrive together. */
const SHOW_DELAY = 350;
const PASSED_MS = 6000;
const CHASE_MS = 4500;
/** Kept in step with `rival-toast-out` in rivals.css. */
const OUT_MS = 260;

type Toast =
  | { kind: "passed"; key: number; passed: RivalFriend[]; total: number }
  | { kind: "chase"; key: number; rival: RivalFriend; toPass: number; postsNeeded: number };

const SPARKS = Array.from({ length: 14 }, (_, i) => i);

function Face({ friend, size }: { friend: RivalFriend; size: string }) {
  return friend.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={friend.avatarUrl} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium text-white ${avatarPalette(friend.name).avatarBg}`}
    >
      {initials(friend.name)}
    </span>
  );
}

export function PhoneRivalToast() {
  const award = usePointsAward();
  const { account } = useAuth();
  const nav = useQueryParams().get("nav");
  const [toast, setToast] = useState<Toast | null>(null);
  const [leaving, setLeaving] = useState(false);
  const handled = useRef<object | null>(null);

  /* Latest account, read inside the timer without making it a dependency —
     the account refreshing must not re-run the comparison. */
  const accountRef = useRef(account);
  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  useEffect(() => {
    if (!award || !award.arrived || handled.current === award) return;
    handled.current = award;
    const earned = award.earned;
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const me = accountRef.current;
        if (!me) return;
        const fresh = await refreshFriendRivals(me.id);
        const friends = fresh ?? cachedFriendRivals(me.id);
        if (cancelled || !friends || friends.length === 0) return;

        const after = me.points;
        const before = after - earned;
        const passed = friendsPassed(before, after, friends);
        const key = Date.now();
        if (passed.length > 0) {
          setLeaving(false);
          setToast({ kind: "passed", key, passed, total: after });
          return;
        }
        const standing = computeFriendRivals(
          { id: me.id, name: me.name, avatarUrl: me.avatarUrl, points: after },
          friends,
        );
        if (!standing?.rival) return;
        setLeaving(false);
        setToast({
          kind: "chase",
          key,
          rival: standing.rival,
          toPass: standing.toPass,
          postsNeeded: standing.postsNeeded,
        });
      } catch {
        /* Silent by design: a celebration that fails is just no celebration. */
      }
    }, SHOW_DELAY);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [award]);

  /* Auto-dismiss: start leaving, then unmount once the exit has played. */
  useEffect(() => {
    if (!toast) return;
    const stay = setTimeout(() => setLeaving(true), toast.kind === "passed" ? PASSED_MS : CHASE_MS);
    return () => clearTimeout(stay);
  }, [toast]);

  useEffect(() => {
    if (!leaving) return;
    const gone = setTimeout(() => {
      setToast(null);
      setLeaving(false);
    }, OUT_MS);
    return () => clearTimeout(gone);
  }, [leaving]);

  const dismiss = () => setLeaving(true);
  const friendsHref = nav ? `/m/friends?nav=${nav}` : "/m/friends";

  return (
    <div className="rival-toast-layer">
      {toast && (
        <div
          key={toast.key}
          role="status"
          className={`rival-toast rival-toast--${toast.kind} ${leaving ? "rival-toast--out" : ""}`}
        >
          {toast.kind === "passed" && (
            <span aria-hidden className="rival-sparks">
              {SPARKS.map((i) => (
                <span key={i} className="rival-spark" style={{ "--i": i } as React.CSSProperties} />
              ))}
            </span>
          )}

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="rival-toast-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            {toast.kind === "passed" ? (
              <>
                <span className="rival-toast-faces">
                  {toast.passed.slice(0, 3).map((f) => (
                    <Face key={f.id} friend={f} size="h-11 w-11" />
                  ))}
                </span>
                <span className="min-w-0 text-left">
                  <span className="mono-label block opacity-80">Friends&rsquo; Table</span>
                  <span className="block font-display text-[19px] font-semibold leading-tight">
                    You passed {firstName(toast.passed[0].name)}
                    {toast.passed.length > 1 && (
                      <>
                        {" "}
                        +<span className="font-mono">{toast.passed.length - 1}</span>
                      </>
                    )}
                    !
                  </span>
                  <span className="block font-mono text-xs tabular-nums opacity-90">
                    {formatPoints(toast.total)} PP
                  </span>
                </span>
              </>
            ) : (
              <>
                <Face friend={toast.rival} size="h-10 w-10" />
                <span className="min-w-0 text-left">
                  <span className="block text-[15px] font-semibold leading-snug">
                    <span className="rival-toast-num font-mono tabular-nums">
                      {formatPoints(toast.toPass)} PP
                    </span>{" "}
                    to pass <span className="font-display">{firstName(toast.rival.name)}</span>
                  </span>
                  <span className="block font-mono text-xs tabular-nums opacity-80">
                    {toast.postsNeeded} more plate{toast.postsNeeded === 1 ? "" : "s"}
                  </span>
                </span>
              </>
            )}
          </button>

          <Link
            href={friendsHref}
            onClick={dismiss}
            className="rival-toast-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            See table
          </Link>
        </div>
      )}
    </div>
  );
}
