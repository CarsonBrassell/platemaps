"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UPVOTE_MILESTONES } from "@/lib/points";

/**
 * The profile's plates, shelved by what they mean right now — plus the
 * roll-call: the choreography that plays when you open the page and
 * reactions have landed since you last looked.
 *
 * ## The shelves
 *
 * Three sections, by status rather than by geometry:
 *
 * - **New reactions** — plates that earned an upvote, comment or heart since
 *   your last visit, each wearing a badge with the count. The badge sits ON
 *   the plate because "which plate are people reacting to?" is the actual
 *   question, and a chronological activity list never answers it at a glance.
 * - **Recent reactions** — plates people have reacted to, most recent first,
 *   for the reactions you have already seen. It excludes anything badged
 *   above, so the two shelves never show the same plate twice: one is "since
 *   you last looked", this one is "lately". It replaced a milestone shelf,
 *   which could only hold plates past 25/100/500 upvotes, said the same thing
 *   on every visit, and was empty for most accounts. The milestone mark still
 *   rides on the card that earned it (`UPVOTE_MILESTONES`) — it just no
 *   longer decides which shelf a plate lands on.
 * - **All posts** — a mini-grid of every plate, with its count and, for dish
 *   ratings, its percent. Genuinely all of them, overlapping the shelves
 *   above on purpose: the shelves are what is happening now, this is the
 *   archive, and a label reading "All posts" has to be true.
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
  text: string;
  restaurant?: string;
  dishName?: string;
  rating?: number;
  ratingKind?: "restaurant" | "dish";
  upvoteCount: number;
  media?: { url: string; type: "image" | "video"; alt?: string }[];
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
  /** Per-post fresh-reaction counts, as revealed so far by the stagger. */
  shownBadges: Record<string, number>;
  /** Membership: the full fresh counts, fixed at arrival. */
  badgeTotals: Record<string, number>;
  /** Posts whose ring is pulsing right now. */
  pulsing: Record<string, boolean>;
  /** Total fresh reactions once the chip beat has played; null before. */
  chip: number | null;
  /** Exact points earned since last visit, shown once known; null if none. */
  delta: number | null;
  /**
   * Post ids that have ever drawn a reaction, most-recently-reacted first.
   *
   * Falls out of the activity read the roll-call already performs, so the
   * "Recent reactions" shelf costs no extra request. Unlike `badgeTotals`
   * this ignores the seen-marker entirely — it is "what has been happening
   * on your plates", which is true on every visit, where the badges are
   * "what happened since you last looked", which is usually nothing.
   */
  recentIds: string[];
  /**
   * Lifetime reaction count per post, from the same read.
   *
   * What the quiet pill on a Recent-reactions card prints. It is deliberately
   * NOT the same number as `badgeTotals`: that one is unseen-since-last-visit
   * and wears solid orange, this one is "how much this plate has drawn, ever"
   * and wears the tint. Keeping the solid accent exclusive to genuinely new
   * things is what stops the shelf from looking permanently unread.
   */
  reactionCounts: Record<string, number>;
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
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const ran = useRef(false);
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

    fetch("/api/account/activity")
      .then((res) => res.json())
      .then((data: { activity?: ActivityEvent[] }) => {
        if (cancelled) return;
        const acked = readAck(userId);
        const storedPoints = Number(readStore(pointsKey(userId))) || 0;
        const mine = new Set(postsRef.current.map((p) => p.id));

        /* Set before any of the branches below return: every path through
           the roll-call — reduced motion, nothing fresh, full theater —
           still owes the shelves their ordering. */
        const latest = new Map<string, number>();
        const counts: Record<string, number> = {};
        for (const event of data.activity ?? []) {
          if (!mine.has(event.postId)) continue;
          const at = new Date(event.createdAt).getTime();
          if (at > (latest.get(event.postId) ?? 0)) latest.set(event.postId, at);
          counts[event.postId] = (counts[event.postId] ?? 0) + 1;
        }
        setRecentIds(
          [...latest.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
        );
        setReactionCounts(counts);

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
    recentIds,
    reactionCounts,
    clearBadge,
  };
}

/* ---------------------------------------------------------------------- */

/** A plate's display name: the dish if named, else the spot, else its words. */
/* How many plates the "Recent reactions" shelf will hold. It is a highlight
   reel sitting above a grid of everything, so it scrolls a little and then
   stops rather than becoming a second archive. */
const RECENT_SHELF_MAX = 8;

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
function cardMeta(post: ShelfPost) {
  const pct =
    post.ratingKind === "dish" && post.rating != null
      ? ` · ${Math.round(post.rating)}%`
      : "";
  return `▲ ${post.upvoteCount}${pct}`;
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
 * The count that landed on a plate — the solid orange disc from the approved
 * prototype. Cream numeral on the orange fill sits under the 14px-medium
 * line the color table draws for that pairing; Calvin approved this exact
 * badge on screen repeatedly, so it ships as a documented exception: it is
 * a one-to-three-digit count in a bold mono, not a line of copy, and the
 * white ring keeps it separable on any photo. If it ever has to carry more
 * than a number, it loses the orange. `badge-arrive` is the squash-stretch
 * pop.
 */
function Badge({ count }: { count: number }) {
  return (
    <span className="badge-arrive absolute right-2.5 top-2.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-pm-orange px-1 font-mono text-[10px] font-bold tabular-nums text-[#F7F4EC]">
      {count}
    </span>
  );
}

/**
 * The count on a plate whose reactions you have already seen.
 *
 * Same corner and same shape as `Badge` so the card keeps its silhouette
 * whichever shelf it is on, but the tint instead of the solid fill and no
 * arrival animation — nothing just happened, so nothing should pop. That
 * separation is the whole point: solid orange means "new", tint means
 * "this plate has been getting reactions".
 */
function QuietCount({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute right-2.5 top-2.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-pm-orange px-1 font-mono text-[10px] font-bold tabular-nums text-[#F7F4EC]"
    >
      {count}
    </span>
  );
}

function ShelfCard({
  post,
  tone,
  badge,
  quietCount = 0,
  pulsing,
  onClear,
}: {
  post: ShelfPost;
  tone: number;
  badge: number;
  /** Lifetime reactions, shown only when there is no fresh badge to show. */
  quietCount?: number;
  pulsing: boolean;
  onClear?: () => void;
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
      {badge > 0 ? (
        <Badge count={badge} />
      ) : (
        quietCount > 0 && <QuietCount count={quietCount} />
      )}
      <span className="mt-1.5 line-clamp-2 block min-h-[27px] font-display text-[11.5px] font-semibold leading-tight text-zinc-900">
        {nameOf(post)}
      </span>
      <span className="mt-0.5 block font-mono text-[9.5px] tabular-nums text-zinc-500">
        {cardMeta(post)}
      </span>
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

  if (onClear && badge > 0) {
    return (
      <button
        type="button"
        onClick={onClear}
        aria-label={`${nameOf(post)}, ${badge} new ${badge === 1 ? "reaction" : "reactions"} — tap to clear`}
        className={`${shell} text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange`}
      >
        {body}
      </button>
    );
  }
  return <div className={shell}>{body}</div>;
}

export function ProfileShelves({
  posts,
  arrival,
}: {
  posts: ShelfPost[];
  arrival: RollCallArrival;
}) {
  const {
    badgeTotals,
    shownBadges,
    pulsing,
    chip,
    delta,
    recentIds,
    reactionCounts,
    clearBadge,
  } = arrival;

  /* Membership is frozen against the arrival's totals, not the live badge
     state — clearing a badge must not teleport the card to another shelf
     while you're looking at it. */
  /**
   * Two shelves and an archive.
   *
   * **Recency replaced milestones here.** A milestone shelf can only ever
   * hold the handful of plates that crossed 25 upvotes, it says the same
   * thing on every visit, and for most accounts it is empty — so the middle
   * of the profile was either missing or frozen. "Recent reactions" answers
   * the question the page is actually opened to ask, and it changes as
   * people react. The milestone mark itself still rides on the card that
   * earned it; it just no longer files the shelf.
   *
   * "All posts" is genuinely all of them, deliberately overlapping the
   * shelves above. The shelves are a highlight reel of what is happening
   * now; the grid is the complete archive, and a label reading "All posts"
   * has to be true or it is worse than no label.
   */
  const { fresh, recent, all } = useMemo(() => {
    const byId = new Map(posts.map((post) => [post.id, post]));
    const fresh = posts.filter((post) => badgeTotals[post.id]);
    const recent = recentIds
      .filter((id) => byId.has(id) && !badgeTotals[id])
      .map((id) => byId.get(id)!)
      .slice(0, RECENT_SHELF_MAX);
    return { fresh, recent, all: posts };
  }, [posts, badgeTotals, recentIds]);

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
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <p className="mono-label text-pm-grey-text">
              New reactions
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
          <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-1.5">
            {fresh.map((post, i) => (
              <ShelfCard
                key={post.id}
                post={post}
                tone={(i % 3) + 1}
                badge={shownBadges[post.id] ?? 0}
                pulsing={!!pulsing[post.id]}
                onClear={() => clearBadge(post.id)}
              />
            ))}
          </div>
        </>
      )}

      {recent.length > 0 && (
        <>
          <p className="mono-label mb-2 text-pm-grey-text">Recent reactions</p>
          <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-1.5">
            {recent.map((post, i) => (
              <ShelfCard
                key={post.id}
                post={post}
                tone={((i + 1) % 3) + 1}
                badge={0}
                quietCount={reactionCounts[post.id] ?? 0}
                pulsing={false}
              />
            ))}
          </div>
        </>
      )}

      {all.length > 0 && (
        <>
          <p className="mono-label mb-2 text-pm-grey-text">
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
              <div key={post.id} className="rounded-xl bg-white p-1.5 pb-1.5">
                <CardPhoto
                  post={post}
                  tone={((i + 2) % 3) + 1}
                  className="block aspect-square w-full rounded-lg"
                />
                <span className="mt-1 block font-mono text-[9.5px] tabular-nums text-zinc-500">
                  {cardMeta(post)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
