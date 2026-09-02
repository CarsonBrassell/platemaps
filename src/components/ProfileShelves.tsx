"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UPVOTE_MILESTONES } from "@/lib/points";
import { ChatIcon } from "@/components/icons";
import { postedDate } from "@/lib/format";
import { PlateDetailSheet, type DetailComment } from "@/components/PlateDetailSheet";

/**
 * The profile's plates, shelved by what they mean right now — plus the
 * roll-call: the choreography that plays when you open the page and
 * reactions have landed since you last looked.
 *
 * ## The shelves
 *
 * Two sections, by status rather than by geometry:
 *
 * - **New reactions** — plates that earned an upvote, comment or heart since
 *   your last visit, each wearing a badge. The badge sits ON the plate because
 *   "which plate are people reacting to?" is the actual question, and a
 *   chronological activity list never answers it at a glance. **What the badge
 *   counts is the plate's whole reaction total** — upvotes + comments + hearts,
 *   lifetime — not the delta that put the plate on this shelf; see `Badge`.
 * - **All posts** — a mini-grid of every plate, with its count and, for dish
 *   ratings, its percent. Genuinely all of them, overlapping the shelf above
 *   on purpose: the shelf is what is happening now, this is the archive, and
 *   a label reading "All posts" has to be true.
 *
 * There used to be a third, "Recent reactions": the plates you had *already*
 * seen reactions on, wearing a quieter tinted count. It is gone. Once the
 * badge started printing a lifetime total, that shelf and this one were
 * showing the same plates with the same numbers on them, separated only by a
 * fill colour and a heading — and the archive below already lists every plate
 * there is. Two shelves that differ only in shade are not two answers.
 * (It in turn replaced a milestone shelf, which could only hold plates past
 * 25/100/500 upvotes and was empty for most accounts. The milestone mark
 * still rides on the card that earned it via `UPVOTE_MILESTONES`; it has not
 * filed a shelf for two rounds now.)
 *
 * ## The roll-call (see the animation rules in globals.css)
 *
 * hold 350ms → badges land one at a time, each with a full-perimeter ring
 * pulse → the section header sums them → the Plate Points total rolls up to
 * its new value. The order is deliberate: acknowledgement before arithmetic,
 * and the sequence ends on what it all *means* (the total and its rank
 * track), per the peak–end rule. Grounded in three researched failures:
 * Duolingo gates its big moments to keep them powerful, so an ordinary
 * upvote here gets a small pop and nothing more; Apple Fitness's celebrations
 * collide and skip, so these beats run strictly one at a time; and a count-up
 * driven only by requestAnimationFrame hangs forever in a backgrounded tab,
 * so the counter carries a timeout floor.
 *
 * ## What is honest here, and how
 *
 * "Since you last looked" is two localStorage keys, the same pattern (and the
 * same per-account scoping, and the same Safari-private-mode fail-quiet) as
 * `lib/navAlerts.ts` — deliberately NOT the nav dot's own key, because both
 * this and the nav write on mount and the read/write race would depend on
 * component order. The points delta is `current − stored total`: an exact
 * number or absent, never reconstructed from event arithmetic. Fresh badges
 * come from `/api/account/activity`, which is author-scoped by construction
 * and takes no userId (see its route comment) — upvotes arrive anonymous and
 * stay that way; a badge is a count, never a name. Keys are written only when
 * the roll-call *finishes*, so an interrupted arrival replays next visit
 * instead of marking itself seen.
 */

/** The fields this surface reads off /api/posts — a subset of db.ts's Post. */
export type ShelfPost = {
  id: string;
  /** Whose plate it is — the detail sheet marks this person's comments OP. */
  userId?: string;
  text: string;
  restaurant?: string;
  dishName?: string;
  rating?: number;
  ratingKind?: "restaurant" | "dish";
  upvoteCount: number;
  /**
   * When it was posted. Printed on the tiles, so the archive reads as a dated
   * record rather than an undated pile — the two questions a plate could not
   * answer without being opened were "did anybody say anything" and "when was
   * this", and both are cheap to print here.
   */
  createdAt: string;
  media?: { url: string; type: "image" | "video"; alt?: string }[];
  /**
   * The full comments, not a count. They already ride along in the
   * /api/posts?mine=1 payload — the profile just used to type them as
   * `{ id }[]` because counting was all it did with them — so the detail
   * sheet costs no extra request to open.
   */
  comments?: DetailComment[];
  /**
   * How many hearts this plate has — the third of the three numbers the badge
   * sums. Author-only by construction: `/api/posts?mine=1` returns your own
   * plates alongside the ones you saved, and only your own carry this (see
   * `getProfilePosts` in lib/db.ts, where the SQL nulls it for anyone else's
   * row). Absent means "not yours to know", which is why the badge reads it as
   * `?? 0` rather than treating a missing count as a reason to hide.
   */
  heartCount?: number | null;
};

/** Mirrors the fields read off lib/db.ts's ActivityEvent — server-only module. */
type ActivityEvent = {
  id: string;
  kind: "comment" | "heart" | "upvote";
  createdAt: string;
  postId: string;
};

/**
 * Which reactions you have acknowledged, per plate: a map of post id to the
 * newest activity time you had already been shown when you cleared it.
 *
 * **Acknowledgement is a tap, not a glance.** This was one "shelves-seen"
 * timestamp, written the moment an arrival finished playing — so opening the
 * profile consumed the news whether or not you took any of it in, and coming
 * back from another tab found the shelf silent. The arrival now replays on
 * every visit until you actually clear a plate, and clearing one says nothing
 * about the others. Per-plate rather than one marker, because the plate is
 * the thing you act on.
 *
 * Storing the event time rather than `true` is what keeps this correct as
 * time passes: a plate you cleared this morning badges again this afternoon
 * when somebody new reacts, because only reactions older than your ack are
 * spent.
 */
const ackKey = (userId: string) => `platemaps:reactions-acked:${userId}`;
const pointsKey = (userId: string) => `platemaps:points-seen:${userId}`;

function readAck(userId: string): Record<string, number> {
  try {
    const raw = readStore(ackKey(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    /* Corrupt or unreadable: nothing is acknowledged. Replaying an arrival
       is the safe failure here; silently swallowing one is not. */
    return {};
  }
}

function writeAck(userId: string, map: Record<string, number>) {
  writeStore(ackKey(userId), JSON.stringify(map));
}

/* localStorage throws in Safari private mode and under blocked-cookie
   policies; a replayed arrival is a fine failure and a crashed profile is
   not, so both directions fail quiet — same stance as navAlerts. */
function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** The highest milestone this count has crossed, or null under the first. */
function highestMilestone(upvotes: number) {
  for (let i = UPVOTE_MILESTONES.length - 1; i >= 0; i--) {
    if (upvotes >= UPVOTE_MILESTONES[i].upvotes) return UPVOTE_MILESTONES[i];
  }
  return null;
}

/**
 * Ease-out count-up with a timeout floor. rAF pauses entirely in occluded
 * tabs; without the floor the promise never resolves there and every beat
 * behind it hangs — measured in the prototype, not hypothetical.
 */
function animateCount(
  from: number,
  to: number,
  ms: number,
  onFrame: (value: number) => void,
  onDone: () => void
) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onFrame(to);
    onDone();
  };
  const guard = setTimeout(finish, ms + 250);
  const t0 = performance.now();
  const tick = (now: number) => {
    if (done) return;
    const k = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    onFrame(Math.round(from + (to - from) * eased));
    if (k < 1) requestAnimationFrame(tick);
    else {
      clearTimeout(guard);
      finish();
    }
  };
  requestAnimationFrame(tick);
  return () => {
    done = true;
    clearTimeout(guard);
  };
}

export type RollCallArrival = {
  /** What the Plate Points panel should print right now (animated). */
  displayPoints: number;
  /**
   * Which plates the stagger has reached, keyed by id — the fresh count is
   * still the value, but nothing prints it any more: presence is what a card
   * reads, because the numeral it shows is now its own lifetime total. Kept as
   * counts rather than booleans because `clearBadge` re-derives the chip sum
   * from what is left here, and a set of `true`s cannot be added up.
   */
  shownBadges: Record<string, number>;
  /** Membership: the full fresh counts, fixed at arrival. */
  badgeTotals: Record<string, number>;
  /** Posts whose ring is pulsing right now. */
  pulsing: Record<string, boolean>;
  /** Total fresh reactions once the chip beat has played; null before. */
  chip: number | null;
  /** Exact points earned since last visit, shown once known; null if none. */
  delta: number | null;
  /* The activity read used to also publish `recentIds` (every plate that had
     ever drawn a reaction, newest first) and `reactionCounts` (a lifetime
     total per plate) for the retired "Recent reactions" shelf. Both are gone
     with it: ordering by last reaction has no shelf to order, and the totals
     the badge now prints come off the posts themselves — upvoteCount,
     comments and heartCount are already in the /api/posts payload, so the
     number on a card no longer depends on the activity request resolving. */
  /** Tap a badged plate: acknowledge it, drop it from the chip sum. */
  clearBadge: (postId: string) => void;
};

/**
 * Runs the roll-call and owns its state. Call unconditionally (account may
 * be null while auth resolves); pass `postsReady` true once /api/posts has
 * answered so "no posts yet" and "still loading" stay distinguishable.
 */
export function useRollCallArrival(
  account: { id: string; points: number } | null,
  posts: ShelfPost[],
  postsReady: boolean
): RollCallArrival {
  const [displayPoints, setDisplayPoints] = useState<number | null>(null);
  const [shownBadges, setShownBadges] = useState<Record<string, number>>({});
  const [badgeTotals, setBadgeTotals] = useState<Record<string, number>>({});
  const [pulsing, setPulsing] = useState<Record<string, boolean>>({});
  const [chip, setChip] = useState<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const ran = useRef(false);
  /**
   * The activity read, started as early as there is somebody to read it for.
   *
   * **This used to be the second of two round trips in a row.** The roll-call
   * effect is gated on `postsReady`, and the fetch lived inside it, so the
   * sequence was: load the page, wait for /api/posts, *then* start
   * /api/account/activity, then hold 350ms, then finally play. Two latencies
   * stacked end to end before the first badge could land — which is why the
   * arrival looked like it had stopped working: it was still running, several
   * seconds after the plates it decorates had finished drawing, by which
   * point nobody is still watching.
   *
   * Holding the promise rather than the result is what makes it safe to
   * start early: the roll-call still runs exactly once, still runs only after
   * the posts are in (it needs them to know which events are yours), and
   * simply finds this already resolved instead of beginning it. The request
   * now overlaps the posts request rather than following it.
   */
  const activityRef = useRef<Promise<{ activity?: ActivityEvent[] }> | null>(null);
  useEffect(() => {
    if (!account || activityRef.current) return;
    activityRef.current = fetch("/api/account/activity")
      .then((res) => res.json())
      .catch(() => ({}) as { activity?: ActivityEvent[] });
  }, [account]);

  /** Newest activity time per post, for acking a plate forward on tap. */
  const latestRef = useRef<Record<string, number>>({});
  const postsRef = useRef(posts);
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  /* Start the panel at the stored (last seen) total so the count-up rises
     from where you left it instead of flashing the final number and
     snapping backwards. Render-phase adjustment (React's documented
     "adjust state when props change" pattern) rather than an effect: the
     account's first appearance and the first paint are the same commit,
     and an effect would land one painted frame too late. */
  const [initedFor, setInitedFor] = useState<string | null>(null);
  if (account && initedFor !== account.id) {
    setInitedFor(account.id);
    const stored = Number(readStore(pointsKey(account.id)));
    if (stored > 0 && stored < account.points) setDisplayPoints(stored);
  }

  useEffect(() => {
    if (!account || !postsReady || ran.current) return;
    ran.current = true;

    const userId = account.id;
    const livePoints = account.points;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelCount: (() => void) | null = null;
    let cancelled = false;
    const later = (ms: number, fn: () => void) => {
      timers.push(setTimeout(() => !cancelled && fn(), ms));
    };

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* Already in flight since the account resolved — see activityRef. The
       fallback covers the case where this effect somehow runs first. */
    (activityRef.current ??
      fetch("/api/account/activity")
        .then((res) => res.json())
        .catch(() => ({}) as { activity?: ActivityEvent[] }))
      .then((data: { activity?: ActivityEvent[] }) => {
        if (cancelled) return;
        const acked = readAck(userId);
        const storedPoints = Number(readStore(pointsKey(userId))) || 0;
        const mine = new Set(postsRef.current.map((p) => p.id));

        /* Built before any of the branches below return: every path through
           the roll-call — reduced motion, nothing fresh, full theater — still
           owes `clearBadge` somewhere to ack a plate forward to. */
        const latest = new Map<string, number>();
        for (const event of data.activity ?? []) {
          if (!mine.has(event.postId)) continue;
          const at = new Date(event.createdAt).getTime();
          if (at > (latest.get(event.postId) ?? 0)) latest.set(event.postId, at);
        }

        /* Everything not yet acknowledged on that plate, however old it is.
           The first-visit suppression that used to live here is gone on
           purpose: an arrival is now something you dismiss rather than
           something that expires, so a profile opened for the first time
           performs its whole backlog once and then goes quiet as you clear
           it, instead of silently spending it. */
        const totals: Record<string, number> = {};
        for (const event of data.activity ?? []) {
          if (!mine.has(event.postId)) continue;
          if (new Date(event.createdAt).getTime() <= (acked[event.postId] ?? 0))
            continue;
          totals[event.postId] = (totals[event.postId] ?? 0) + 1;
        }
        /* clearBadge needs this to know how far to ack a plate forward. */
        latestRef.current = Object.fromEntries(latest);
        const freshIds = postsRef.current
          .map((p) => p.id)
          .filter((id) => totals[id]);
        const chipTotal = freshIds.reduce((sum, id) => sum + totals[id], 0);
        const earned =
          storedPoints > 0 && storedPoints < livePoints
            ? livePoints - storedPoints
            : null;

        setBadgeTotals(totals);

        /* Only the points total settles here. Badges are NOT consumed by
           having played — that is the whole change: they wait for a tap. */
        const finish = () => {
          writeStore(pointsKey(userId), String(livePoints));
          setDisplayPoints(null); // fall through to the live total
        };

        if (reduced || (freshIds.length === 0 && earned === null)) {
          /* Nothing to perform, or motion is off: final states, instantly. */
          setShownBadges(totals);
          setChip(chipTotal > 0 ? chipTotal : null);
          setDelta(earned);
          finish();
          return;
        }

        /* The roll-call. One queue, no overlaps. */
        let at = 350; // the anticipation hold — the pause is the point
        for (const id of freshIds) {
          later(at, () => {
            setShownBadges((prev) => ({ ...prev, [id]: totals[id] }));
            setPulsing((prev) => ({ ...prev, [id]: true }));
          });
          later(at + 800, () =>
            setPulsing((prev) => ({ ...prev, [id]: false }))
          );
          at += 110;
        }
        at += 240;
        later(at, () => setChip(chipTotal > 0 ? chipTotal : null));
        at += 260;
        later(at, () => {
          setDelta(earned);
          if (earned === null) {
            finish();
            return;
          }
          cancelCount = animateCount(
            livePoints - earned,
            livePoints,
            640,
            (value) => !cancelled && setDisplayPoints(value),
            () => !cancelled && finish()
          );
        });
      })
      .catch(() => {
        /* No activity read, no theater: show the live total and move on.
           The keys stay unwritten, so a transient failure replays later. */
        if (!cancelled) setDisplayPoints(null);
      });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      cancelCount?.();
    };
  }, [account, postsReady]);

  /**
   * Tap a badged plate: acknowledge it, and let it leave the shelf.
   *
   * Two things happen that did not before. The ack is persisted, so this
   * plate stays quiet on your next visit while its neighbours still perform.
   * And it drops out of `badgeTotals`, which is what the shelf memo files
   * on — so the card moves down out of "New reactions" the moment you clear
   * it rather than sitting there greyed out. Membership used to be frozen
   * against the arrival precisely so a card could not move while you were
   * looking at it; that is the point of the gesture now rather than a
   * hazard, because you are the one who moved it.
   */
  const clearBadge = (postId: string) => {
    if (account) {
      const map = readAck(account.id);
      map[postId] = latestRef.current[postId] ?? Date.now();
      writeAck(account.id, map);
    }
    setPulsing((prev) => (prev[postId] ? { ...prev, [postId]: false } : prev));
    setShownBadges((prev) => {
      if (!prev[postId]) return prev;
      const next = { ...prev };
      delete next[postId];
      const remaining = Object.values(next).reduce((sum, n) => sum + n, 0);
      setChip(remaining > 0 ? remaining : null);
      return next;
    });
    setBadgeTotals((prev) => {
      if (!prev[postId]) return prev;
      const next = { ...prev };
      delete next[postId];
      return next;
    });
  };

  return {
    displayPoints: displayPoints ?? account?.points ?? 0,
    shownBadges,
    badgeTotals,
    pulsing,
    chip,
    delta,
    clearBadge,
  };
}

/* ---------------------------------------------------------------------- */

/** A plate's display name: the dish if named, else the spot, else its words. */
function nameOf(post: ShelfPost) {
  return post.dishName ?? post.restaurant ?? post.text;
}

/**
 * The photo area of a card. These are always the viewer's own plates, so the
 * photo shows unconditionally — the `photosPublic` gate protects other
 * people's posts, and none appear here. Tone block for the photoless, per
 * DESIGN.md; tones cycle by position so neighbours don't repeat.
 */
function CardPhoto({
  post,
  tone,
  className,
}: {
  post: ShelfPost;
  tone: number;
  className: string;
}) {
  const photo = post.media?.find((m) => m.type === "image");
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photo.url} alt="" className={`${className} object-cover`} />
    );
  }
  return (
    <div className={className} style={{ background: `var(--pm-tone-${tone})` }} />
  );
}

/** `▲ 12 · 96%` — the percent only for dish rows; a starred restaurant row's
    4/5 must never print where a percent goes (rating invariant, CLAUDE.md). */
/**
 * The percent, and only for dish rows — a starred restaurant row's 4/5 must
 * never print where a percent goes (rating invariant, CLAUDE.md). Returns
 * null when there is nothing to say, so the caller drops the line rather than
 * printing an empty one.
 *
 * **The upvote count used to lead this line and no longer does.** Once the
 * disc became a lifetime total, a card carried two true numbers that meant
 * different things — a 46 on the photo and a "▲ 27" under it — and nothing
 * on the card said which was which. The disc is the louder mark and the one
 * this shelf is about, so the quieter duplicate went. The archive tiles keep
 * their count: they have no disc, so there it is the only thing a plate says
 * about itself rather than a second opinion.
 */
function cardPercent(post: ShelfPost) {
  return post.ratingKind === "dish" && post.rating != null
    ? `${Math.round(post.rating)}%`
    : null;
}

/** The archive tile's line, which still leads with the count. */
function cardMeta(post: ShelfPost) {
  const pct = cardPercent(post);
  return `▲ ${post.upvoteCount}${pct ? ` · ${pct}` : ""}`;
}

/**
 * The second line on a card: how much conversation the plate drew, and the day
 * it was written.
 *
 * Both are things the grid could not say before — a tile reported its score
 * and then made you open it to find out whether anyone had replied, or when
 * you had posted it, which is exactly the pair of questions a profile is
 * scrolled to answer. They ride one line because they are the same kind of
 * fact about the plate: what happened to it, and when.
 *
 * It is a rank below the line above it, and the split is the palette's rather
 * than a preference. Orange is scoped to percentages, vote counts, selected
 * states and the primary action (AGENTS.md) — the score line is the first two
 * and this one is neither, so it takes `zinc-500`. `zinc-500` and not
 * `--pm-grey-text` because these tiles are white cards; the grey token is for
 * labels standing on the cream ground outside them.
 *
 * The count drops out entirely at zero rather than printing `0`. A bare zero
 * beside a speech bubble reads as a conversation that went nowhere, which is a
 * louder claim than the truth — nobody has said anything yet — and the date
 * still carries the line on its own.
 */
/**
 * What `CardActivity` says, in words, for the tile's `aria-label`.
 *
 * Both tiles label their whole button, and an `aria-label` replaces everything
 * inside the element it sits on — so the `sr-only` "comments" in the line
 * below never reaches a screen reader on its own. This is where that line gets
 * spoken, and the two have to say the same thing.
 */
function spokenMeta(post: ShelfPost) {
  const comments = post.comments?.length ?? 0;
  const said = comments > 0 ? `${comments} ${comments === 1 ? "comment" : "comments"}, ` : "";
  return `${said}posted ${postedDate(post.createdAt)}`;
}

function CardActivity({ post }: { post: ShelfPost }) {
  const comments = post.comments?.length ?? 0;
  return (
    /* Wraps rather than truncates. Everything on this line is short enough to
       sit on one at 76px — until a plate is old enough for `postedDate` to
       append its year, and carries comments, at which point the two together
       overrun the tile. Losing the second half of a date to an ellipsis is
       worse than the row standing 11px taller for the handful of plates that
       old, and it is the date that would be cut: the count is first. */
    <span className="mt-0.5 flex flex-wrap items-center gap-x-[3px] font-mono text-[9px] tabular-nums text-zinc-500">
      {comments > 0 && (
        <>
          <ChatIcon className="h-2.5 w-2.5 shrink-0" />
          {/* `mr-1` rather than a middot between the two. The tile is 76px at
              its narrowest and its inner column is 64 — a separator plus its
              two gaps costs 9 of those, which is the difference between
              "3 · Aug 25" fitting and the date truncating to "Aug …". The
              bubble already separates them: it reads as a label on the number
              beside it, so nothing is running together. */}
          <span className="mr-1 shrink-0">
            {comments}
            <span className="sr-only"> {comments === 1 ? "comment" : "comments"}</span>
          </span>
        </>
      )}
      <span>{postedDate(post.createdAt)}</span>
    </span>
  );
}

function MilestoneTag({ upvotes, className }: { upvotes: number; className: string }) {
  return (
    <span
      className={`${className} rounded-full bg-white px-1.5 py-px font-mono text-[9px] font-semibold tabular-nums text-pm-orange-text`}
    >
      {upvotes} ▲
    </span>
  );
}

/**
 * Everything one plate has drawn: upvotes + comments + hearts.
 *
 * The three are summed rather than listed because the badge is a glance, not
 * a breakdown — the detail sheet behind the card is where the kinds separate.
 * Hearts are the one term that can be missing: they are author-only (see
 * `heartCount`), so on a payload that doesn't carry them this quietly counts
 * the two public halves rather than refusing to render, which is the right
 * failure for a number whose job is "roughly how much attention is this".
 */
function reactionTotal(post: ShelfPost) {
  return post.upvoteCount + (post.comments?.length ?? 0) + (post.heartCount ?? 0);
}

/**
 * The count on a plate — the solid orange disc from the approved prototype.
 * Cream numeral on the orange fill sits under the 14px-medium line the color
 * table draws for that pairing; Calvin approved this exact badge on screen
 * repeatedly, so it ships as a documented exception: it is a one-to-three-digit
 * count in a bold mono, not a line of copy, and the white ring keeps it
 * separable on any photo. If it ever has to carry more than a number, it loses
 * the orange. `badge-arrive` is the squash-stretch pop.
 *
 * **The number is the plate's lifetime reaction total, not the delta that put
 * it on the shelf.** A disc reading "2" told you how much news there was and
 * nothing about the plate under it, so the two plates on the shelf were
 * indistinguishable whether one had thirty reactions and the other three. The
 * shelf still *files* on the delta — being here means something happened since
 * you last looked — but what the disc reports is where the plate stands. That
 * split is also why the retired tinted variant had to go: with a lifetime
 * total on the solid disc there was no second number left for it to print.
 */
function Badge({ count }: { count: number }) {
  return (
    <span className="badge-arrive absolute right-2.5 top-2.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-pm-orange px-1 font-mono text-[10px] font-bold tabular-nums text-[#F7F4EC]">
      {count}
    </span>
  );
}

function ShelfCard({
  post,
  tone,
  revealed,
  pulsing,
  onOpen,
}: {
  post: ShelfPost;
  tone: number;
  /**
   * Whether the roll-call has reached this plate yet. The badge is a total
   * now, so it is not the arithmetic that is being staggered — it is the
   * acknowledgement, one plate at a time, which is what the sequence was
   * always for. See the reveal note in `ProfileShelves`.
   */
  revealed: boolean;
  pulsing: boolean;
  onOpen: () => void;
}) {
  /**
   * A white card with the plate inset inside it — the frame from the
   * approved prototype, and the reason the shelves sit in a cream well:
   * these cards read because the ground behind them is cream, exactly the
   * white-on-cream grouping DESIGN.md prescribes. Dropped onto the
   * profile's own white card they were invisible, which is the bug this
   * shape had for one round. Do not restore a white ground under them.
   *
   * Geometry matches the prototype: 112px card, 6px inset, 76px plate,
   * badge and milestone tag inside the frame rather than hanging off it.
   */
  const milestone = highestMilestone(post.upvoteCount);
  /* No zero disc. A plate reaches this shelf by having unacknowledged
     activity, so the total is normally at least 1 — but if the sum ever comes
     back 0 (a heart un-hearted between the two requests, a payload without
     heartCount on a plate whose only reaction was a heart), an orange "0" is a
     worse answer than no badge: it claims attention and then denies it in the
     same mark. Silence is the honest state for nothing-to-report. */
  const reactions = reactionTotal(post);
  const showBadge = revealed && reactions > 0;
  const body = (
    <>
      {/* The ring pulse, hugging the whole card — every edge, one beat. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 rounded-xl ${pulsing ? "ring-pulse" : ""}`}
      />
      <span className="relative block">
        <CardPhoto post={post} tone={tone} className="block h-[76px] w-full rounded-lg" />
        {milestone && (
          <MilestoneTag upvotes={milestone.upvotes} className="absolute bottom-1.5 left-1.5" />
        )}
      </span>
      {showBadge && <Badge count={reactions} />}
      <span className="mt-1.5 line-clamp-2 block min-h-[27px] font-display text-[11.5px] font-semibold leading-tight text-zinc-900">
        {nameOf(post)}
      </span>
      {/* Dropped entirely rather than rendered empty: a restaurant-rated
          plate has no percent, and an empty line still costs its leading,
          which would leave those cards standing a few pixels taller than
          their neighbours in the same grid row for nothing. */}
      {cardPercent(post) && (
        <span className="mt-0.5 block font-mono text-[9.5px] tabular-nums text-pm-orange-text">
          {cardPercent(post)}
        </span>
      )}
      <CardActivity post={post} />
    </>
  );

  /* Width comes from the grid cell now, not from the card. These shelves
     used to scroll sideways, which hid plates off the right edge behind a
     gesture nobody performs on a profile — and on a phone it put the thing
     you came to look at one swipe away from being seen at all. They wrap
     instead: three across at phone width, more as the viewport allows, all
     of them on screen and reachable by scrolling the page you are already
     scrolling. */
  const shell = "relative rounded-xl bg-white p-1.5 pb-2";

  /* Every card opens; a badged one also spends its badge on the way in.
     Opening the plate IS reading the news about it, so there is no separate
     dismiss gesture to learn and no way to end up with a badge you have
     already looked behind.

     The label has to carry both halves of what the card is saying, because
     the disc alone no longer distinguishes them: the plate is here because
     something is new, and the number on it is the running total. A reader who
     hears only "14 reactions" learns nothing about why this plate is on a
     shelf called New reactions. */
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        showBadge
          ? `${nameOf(post)}, ${spokenMeta(post)}, new activity, ${reactions} ${reactions === 1 ? "reaction" : "reactions"} in total — open`
          : `${nameOf(post)}, ${spokenMeta(post)} — open`
      }
      className={`${shell} w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange`}
    >
      {body}
    </button>
  );
}

export function ProfileShelves({
  posts,
  arrival,
  onCommentAdded,
}: {
  posts: ShelfPost[];
  arrival: RollCallArrival;
  /**
   * A comment written from the detail sheet, handed up to whoever owns
   * `posts` — this component does not own that array and cannot patch it.
   * Both callers (the web profile and the phone one) append it to their own
   * copy, which is what puts the reply in the thread and takes the tile's
   * comment count up by one at the same time.
   */
  onCommentAdded?: (postId: string, comment: DetailComment) => void;
}) {
  const { badgeTotals, shownBadges, pulsing, chip, delta, clearBadge } = arrival;

  /* Membership is frozen against the arrival's totals, not the live badge
     state — clearing a badge must not teleport the card to another shelf
     while you're looking at it. */
  /**
   * One shelf and an archive.
   *
   * The shelf files on the delta and nothing else: a plate is here because
   * something landed on it since you last looked, which is the one question a
   * profile is opened to ask and the one thing the archive below cannot say.
   * Everything else it might have shown — how much a plate has drawn, how
   * recently — the cards themselves now carry, on their badge and in their
   * meta line, so a second shelf would only be the same plates in a different
   * order under a heading that promised more than it delivered.
   *
   * "All posts" is genuinely all of them, deliberately overlapping the shelf
   * above. The shelf is a highlight reel of what is happening now; the grid is
   * the complete archive, and a label reading "All posts" has to be true or it
   * is worse than no label.
   */
  const { fresh, all } = useMemo(
    () => ({ fresh: posts.filter((post) => badgeTotals[post.id]), all: posts }),
    [posts, badgeTotals]
  );

  /* Which plate is open, by id rather than by object, so the card the sheet
     is showing stays the one in `posts` as that array refreshes. */
  const [openId, setOpenId] = useState<string | null>(null);
  const openPost = openId ? posts.find((p) => p.id === openId) ?? null : null;

  const open = (post: ShelfPost) => {
    setOpenId(post.id);
    if (badgeTotals[post.id]) clearBadge(post.id);
  };

  if (posts.length === 0) return null;

  return (
    /**
     * The shelves sit straight on the page's cream ground.
     *
     * They had a grey well for one round, back when the profile was one big
     * white card and a white plate frame on it was invisible. The profile no
     * longer has that white ground — it is cream now, like /m/friends — so
     * white-on-cream is doing the grouping exactly as DESIGN.md prescribes,
     * and a well here would only be a second ground competing with the page.
     *
     * The contrast rule follows the ground rather than the habit: `zinc-500`
     * clears 4.5:1 on a white card but only 4.28:1 on cream, so every muted
     * label out here on the ground is `--pm-grey-text`. Labels *inside* a
     * card are on white and stay `zinc-500`.
     */
    <section aria-label="Your plates" className="mb-6">
      {fresh.length > 0 && (
        <>
          {/* Wraps as a unit at phone width — `justify-between` alone broke
              "+12 SINCE LAST VISIT" across two lines mid-phrase at 390px. */}
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            {/* Ink, matching the archive label below — see the note there for
                why the separation is carried by colour and space rather than
                by a rule or a heavier weight. */}
            <p className="mono-label text-zinc-900">
              New reactions
              {/* This chip stays the count of what is NEW — it is not the sum
                  of the discs below, and it should not become one. It is the
                  number attached to the words "New reactions", the number the
                  ack keys track, and the number that goes down as you clear
                  plates; the discs answer a different question about a
                  different scope. The two live at different sizes precisely so
                  they don't read as a subtotal and its parts: a small pill on
                  a label line, versus a disc on a photo. */}
              {chip !== null && (
                <span className="badge-arrive ml-2 inline-flex items-center rounded-full bg-pm-orange px-2 py-px font-mono text-[10px] font-semibold tabular-nums text-[#F7F4EC]">
                  {chip}
                </span>
              )}
            </p>
            {delta !== null && (
              <p className="mono-label whitespace-nowrap text-pm-orange-text">
                +{delta} since last visit
              </p>
            )}
          </div>
          {/* `shownBadges` is now a reveal schedule rather than a set of
              numbers to print, and the stagger survives the change on purpose.
              A count-up would not have: watching a lifetime 47 tick over is
              a celebration of history, and the roll-call is deliberately not
              that (see the Duolingo note in the header — ordinary events get
              a small pop, nothing more). What the sequence performs is which
              plates got attention, one at a time, and that is still news even
              when the numeral on each is a standing total. Its membership is
              still the delta; only the digits inside changed. */}
          <div className="mb-7 grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-1.5">
            {fresh.map((post, i) => (
              <ShelfCard
                key={post.id}
                post={post}
                tone={(i % 3) + 1}
                revealed={shownBadges[post.id] !== undefined}
                pulsing={!!pulsing[post.id]}
                onOpen={() => open(post)}
              />
            ))}
          </div>
        </>
      )}

      {all.length > 0 && (
        <>
          {/* Section labels carry the separation, since the shape rules give
              them nothing else to work with: grouping here is white-on-cream
              and never an outline, so a rule under this label is not
              available (DESIGN.md, "Shape"). Ink rather than `--pm-grey-text`,
              and more air above than below, so the label reads as the start of
              something rather than as a caption floating between two grids.

              No weight utility alongside `mono-label` — the class is unlayered
              in globals.css and hard-sets `font-weight: 500`, so a
              `font-semibold` here would be silently dropped (AGENTS.md). The
              step up is colour and spacing, which is all that is on offer. */}
          <p className="mono-label mb-2.5 text-zinc-900">
            {`All posts · ${all.length}`}
          </p>
          {/* The archive. Quieter than a shelf card — no name, no badge, no
              milestone tag — but it carries the same count and percent the
              cards do, because a plate with no news still has a score and
              hiding it made these read as decoration rather than as posts.
              `cardMeta` is the single source for that string, so the percent
              stays dish-only here exactly as it is up there. */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">
            {all.map((post, i) => (
              <button
                type="button"
                key={post.id}
                onClick={() => open(post)}
                aria-label={`${nameOf(post)}, ${post.upvoteCount} ${
                  post.upvoteCount === 1 ? "upvote" : "upvotes"
                }, ${spokenMeta(post)} — open`}
                className="rounded-xl bg-white p-1.5 pb-1.5 text-left transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                <CardPhoto
                  post={post}
                  tone={((i + 2) % 3) + 1}
                  className="block aspect-square w-full rounded-lg"
                />
                {/* Orange, not zinc-500. Both halves of this line are things
                    the accent is explicitly for — AGENTS.md scopes it to
                    "percentages/vote counts, selected states, and the primary
                    action", and this line is the first two. It also lands the
                    tile on the same colour as the percent in PlateDetailSheet,
                    which is the sheet the tile opens into.

                    `--pm-orange-text` rather than `--pm-orange`: this is 9.5px
                    type, and the palette splits the accent by size for exactly
                    that reason — the fill orange is for large numerals only.

                    The `▲` here is a *report*, not a control, so orange does
                    not claim you pressed it — the filled vote arrow is what
                    means that, and it lives on the feed cards. */}
                <span className="mt-1 block font-mono text-[9.5px] tabular-nums text-pm-orange-text">
                  {cardMeta(post)}
                </span>
                <CardActivity post={post} />
              </button>
            ))}
          </div>
        </>
      )}

      {openPost && (
        <PlateDetailSheet
          post={openPost}
          onClose={() => setOpenId(null)}
          onCommentAdded={(comment) => onCommentAdded?.(openPost.id, comment)}
        />
      )}
    </section>
  );
}
