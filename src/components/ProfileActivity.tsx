"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { initials, relativeTime } from "@/lib/format";
import { ChatIcon, HeartIcon, ThumbsUpIcon } from "@/components/icons";

/** Mirrors lib/db.ts's ActivityKind — that module is server-only. */
type ActivityKind = "comment" | "heart" | "upvote";

/** Mirrors lib/db.ts's ActivityEvent, same reason. */
type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  createdAt: string;
  /** Absent on upvotes — the server doesn't send one. See ActorAvatar. */
  actorId?: string;
  actorName?: string;
  actorAvatarUrl?: string;
  postId: string;
  postRestaurant?: string;
  postRestaurantId?: string;
  postDishName?: string;
  postText: string;
  text?: string;
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "comment", label: "Comments" },
  { id: "heart", label: "Likes" },
  { id: "upvote", label: "Upvotes" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const VERB: Record<ActivityKind, string> = {
  comment: "commented on",
  heart: "liked",
  upvote: "upvoted",
};

/** How many rows before the list folds. Six is about a screen on a phone. */
const COLLAPSED_COUNT = 6;

/**
 * A face for a named actor, a plain warm tone circle for an anonymous one.
 *
 * Upvotes arrive with no name at all — not a name this component chooses to
 * hide, one the server never selected — so there are no initials to fall back
 * to and nothing to reveal on hover. The blank circle is the honest render of
 * "somebody, and that's all you get", and it's a tone block rather than a
 * silhouette icon for the same reason missing photos are (DESIGN.md).
 */
function ActorAvatar({ name, avatarUrl }: { name?: string; avatarUrl?: string }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  if (!name) {
    return (
      <div className="h-9 w-9 shrink-0 rounded-full bg-[var(--pm-tone-2)]" aria-hidden="true" />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint font-mono text-[11px] font-medium text-pm-grey-text">
      {initials(name)}
    </div>
  );
}

/**
 * The kind marker, tucked into the avatar's corner so the row leads with the
 * person rather than the reaction. All three sit in the same tan-on-white
 * badge: a heart in a different colour from an upvote would put two more
 * accents on a screen that already spends its orange on the points number.
 *
 * The upvote is the same thumb the vote controls use (DESIGN.md) — one mark
 * for one gesture, so the badge that says "someone upvoted you" and the button
 * they pressed to do it are recognisably the same thing.
 */
function KindBadge({ kind }: { kind: ActivityKind }) {
  return (
    <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white bg-pm-grey-tint text-pm-grey-text">
      {kind === "comment" && <ChatIcon className="h-2.5 w-2.5" />}
      {kind === "heart" && <HeartIcon filled className="h-2.5 w-2.5" />}
      {kind === "upvote" && <ThumbsUpIcon filled className="h-2.5 w-2.5" />}
    </span>
  );
}

/**
 * Which plate this happened to. The restaurant name is the reference people
 * actually recognise, so it leads in Fraunces and links to the spot when the
 * post carried a real restaurant id; the dish is a compact record reference
 * and sets in mono beside it. A post with neither falls back to its own text,
 * which is all there is to identify it by.
 *
 * There is no permalink to link the row itself at — /post is the composer, not
 * a post page — so nothing here pretends to be one.
 */
function PostReference({ event }: { event: ActivityEvent }) {
  const { postRestaurant, postRestaurantId, postDishName, postText } = event;

  if (!postRestaurant && !postDishName) {
    return <span className="truncate text-zinc-500">“{postText}”</span>;
  }

  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      {postRestaurant &&
        (postRestaurantId ? (
          <Link
            href={`/restaurant/${postRestaurantId}`}
            className="truncate font-display font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-2 transition-colors hover:decoration-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            {postRestaurant}
          </Link>
        ) : (
          <span className="truncate font-display font-semibold text-zinc-900">
            {postRestaurant}
          </span>
        ))}
      {postDishName && (
        <span className="truncate font-mono text-xs text-zinc-500">{postDishName}</span>
      )}
    </span>
  );
}

/**
 * What other people did to your plates: comments, likes and upvotes in one
 * chronological list.
 *
 * Hearts are private by design and only ever readable by the post's author —
 * this section is that author view, which is why it lives on /account behind
 * the session and not on the public profile at /u/[id]. Do not lift it there:
 * that page deliberately has no post history at all.
 *
 * The two reactions are named differently on purpose. A heart comes from a
 * friend and says who; an upvote is a verdict on the plate and stays
 * anonymous, rendering as "Someone" with a blank tone circle. That isn't this
 * component being coy — /api/account/activity sends no actor for an upvote at
 * all, so there is nothing here to reveal.
 *
 * The segmented filter is a rank-3 control (tan track, white selected
 * segment, mono labels), not pills — pills here would read as screen nav.
 */
export function ProfileActivity() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/activity")
      .then((res) => res.json())
      .then((data: { activity?: ActivityEvent[] }) => {
        if (cancelled) return;
        setEvents(data.activity ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setEvents([]);
        setError("Couldn't load your activity.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const base = { all: 0, comment: 0, heart: 0, upvote: 0 };
    for (const e of events ?? []) {
      base.all += 1;
      base[e.kind] += 1;
    }
    return base;
  }, [events]);

  const shown = useMemo(() => {
    if (!events) return [];
    return filter === "all" ? events : events.filter((e) => e.kind === filter);
  }, [events, filter]);

  const visible = expanded ? shown : shown.slice(0, COLLAPSED_COUNT);

  return (
    <section aria-labelledby="activity-heading" className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p id="activity-heading" className="mono-label text-zinc-500">
          Activity on your plates
        </p>

        {/* Only worth a filter once there is a mix to filter. */}
        {events !== null && events.length > 1 && (
          <div className="flex rounded-full bg-pm-grey-tint p-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => {
                  setFilter(f.id);
                  setExpanded(false);
                }}
                className={`rounded-full px-2.5 py-1 font-mono text-[11px] tracking-[0.06em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                  filter === f.id
                    ? "bg-white text-zinc-900"
                    : "text-pm-grey-text hover:text-zinc-900"
                }`}
              >
                {f.label}
                <span className="ml-1 tabular-nums text-zinc-500">{counts[f.id]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-pm-grey-tint/50 px-4 py-3 text-sm text-zinc-700">
          {error}
        </p>
      )}

      {events === null ? (
        <div className="flex flex-col gap-1.5" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-14 w-full rounded-xl" />
          ))}
          <span className="sr-only">Loading your activity</span>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl bg-pm-grey-tint/50 p-6 text-center">
          <p className="mb-1 text-sm font-medium">Nothing yet</p>
          <p className="text-sm text-zinc-500">
            When someone comments on, likes or upvotes one of your plates, it shows up here.
          </p>
        </div>
      ) : shown.length === 0 ? (
        /* Filtered past the end — distinct from having no activity at all. */
        <div className="rounded-xl bg-pm-grey-tint/50 px-4 py-6 text-center">
          <p className="text-sm text-zinc-500">
            No {FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} yet.
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {visible.map((event) => (
              <li
                key={event.id}
                className="flex items-start gap-3 rounded-xl bg-pm-grey-tint/40 px-3.5 py-3"
              >
                <div className="relative shrink-0">
                  <ActorAvatar name={event.actorName} avatarUrl={event.actorAvatarUrl} />
                  <KindBadge kind={event.kind} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm text-zinc-600">
                    {event.actorId && event.actorName ? (
                      <Link
                        href={`/u/${event.actorId}`}
                        className="font-medium text-zinc-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                      >
                        {event.actorName}
                      </Link>
                    ) : (
                      /* Not a link and not a name: an upvote is anonymous, so
                         there is nowhere for this to go. */
                      <span className="font-medium text-zinc-900">Someone</span>
                    )}
                    <span>{VERB[event.kind]}</span>
                    <PostReference event={event} />
                  </p>

                  {event.kind === "comment" && event.text && (
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-800">{event.text}</p>
                  )}
                </div>

                <time
                  dateTime={event.createdAt}
                  className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500"
                >
                  {relativeTime(event.createdAt)}
                </time>
              </li>
            ))}
          </ul>

          {shown.length > COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 min-h-11 rounded-full px-1 text-sm text-zinc-600 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              {expanded ? "Show less" : `Show all ${shown.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
