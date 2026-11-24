"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import { BellIcon, CloseIcon } from "@/components/icons";
import {
  PlateDetailSheet,
  type CommentVotePatch,
  type DetailComment,
  type PostVotePatch,
} from "@/components/PlateDetailSheet";
import type { ShelfPost } from "@/components/ProfileShelves";
import { avatarPalette, initials, relativeTime } from "@/lib/format";

/**
 * The platter: top-right of the feed's tabs row. A badge counts what has
 * arrived since the last time it was opened; tapping opens the list of what
 * other people did to your plates plus incoming friend requests.
 *
 * Data comes from /api/notifications, which is author-scoped (see its header):
 * upvotes arrive nameless and are grouped per plate here, hearts name the
 * sender only to you. Nothing is invented — if the data layer has no row for
 * it, it does not appear.
 */

type Activity = {
  id: string;
  kind: "comment" | "heart" | "upvote";
  createdAt: string;
  actorName?: string;
  postId: string;
  postRestaurant?: string;
  postRestaurantId?: string;
  postDishName?: string;
  text?: string;
};
type FriendReq = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
};
type Payload = {
  activity: Activity[];
  requests: FriendReq[];
  seenAt: string | null;
};

type Row = {
  key: string;
  kind: "comment" | "heart" | "upvote" | "friend";
  at: string;
  who?: string;
  text: string;
  postId?: string;
  unread: boolean;
  requestId?: string;
};

type Filter = "all" | "comments" | "likes" | "friends";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "comments", label: "Comments" },
  { id: "likes", label: "Likes" },
  { id: "friends", label: "Friends" },
];

function plateName(a: Activity) {
  return a.postDishName ?? a.postRestaurant ?? "plate";
}

function buildRows(data: Payload): Row[] {
  const seen = data.seenAt ? new Date(data.seenAt).getTime() : 0;
  const isNew = (iso: string) => new Date(iso).getTime() > seen;
  const rows: Row[] = [];

  for (const r of data.requests) {
    rows.push({
      key: `req:${r.id}`,
      kind: "friend",
      at: r.createdAt,
      who: r.name,
      text: "wants to be friends",
      unread: isNew(r.createdAt),
      requestId: r.id,
    });
  }

  // Upvotes are nameless, so one row per plate: "3 people upvoted your Birria".
  const ups = new Map<string, Activity[]>();
  for (const a of data.activity) {
    if (a.kind === "upvote") {
      const list = ups.get(a.postId) ?? [];
      list.push(a);
      ups.set(a.postId, list);
      continue;
    }
    rows.push({
      key: a.id,
      kind: a.kind,
      at: a.createdAt,
      who: a.actorName ?? "Someone",
      text:
        a.kind === "comment"
          ? `commented on your ${plateName(a)}${a.text ? `: “${a.text.slice(0, 80)}”` : ""}`
          : `hearted your ${plateName(a)}`,
      postId: a.postId,
      unread: isNew(a.createdAt),
    });
  }
  for (const list of ups.values()) {
    const first = list[0];
    const n = list.length;
    rows.push({
      key: `up:${first.postId}`,
      kind: "upvote",
      at: first.createdAt,
      text: `${n === 1 ? "Someone" : `${n} people`} upvoted your ${plateName(first)}`,
      postId: first.postId,
      unread: list.some((a) => isNew(a.createdAt)),
    });
  }

  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

function Face({ name }: { name?: string }) {
  if (!name) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint text-pm-charcoal">
        <BellIcon className="h-5 w-5" />
      </span>
    );
  }
  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-medium text-white ${avatarPalette(name).avatarBg}`}
    >
      {initials(name)}
    </span>
  );
}

export function NotificationCenter() {
  const { account } = useAuth();
  const signedIn = !!account;
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  const [plate, setPlate] = useState<ShelfPost | null>(null);

  // Portal target only exists after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as Payload);
    } catch {}
  }, []);

  useEffect(() => {
    // Fetching on sign-in is the effect's job; load() sets state when it lands.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (signedIn) void load();
  }, [signedIn, load]);

  const rows = useMemo(
    () => (data ? buildRows(data).filter((r) => !handled.has(r.key)) : []),
    [data, handled],
  );
  const unreadCount = rows.filter((r) => r.unread).length;

  const visible = rows.filter((r) =>
    filter === "all"
      ? true
      : filter === "comments"
        ? r.kind === "comment"
        : filter === "likes"
          ? r.kind === "heart" || r.kind === "upvote"
          : r.kind === "friend",
  );
  const fresh = visible.filter((r) => r.unread);
  const earlier = visible.filter((r) => !r.unread);

  const openCenter = async () => {
    setOpen(true);
    await load();
    // Stamp seen server-side; the payload just loaded keeps its old seenAt so
    // the rows stay highlighted until the next open.
    try {
      await fetch("/api/notifications/seen", { method: "POST" });
    } catch {}
  };

  /* Your plate opens in the same sheet the profile uses, over the list, so
     closing it lands back on the notifications. */
  const openPlate = async (postId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}`, { cache: "no-store" });
      if (res.ok) setPlate(((await res.json()) as { post: ShelfPost }).post);
    } catch {}
  };

  const respond = async (row: Row, action: "accept" | "decline") => {
    setHandled((s) => new Set(s).add(row.key));
    try {
      await fetch("/api/friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: row.requestId, action }),
      });
    } catch {}
  };

  if (!signedIn) return null;

  const label =
    unreadCount > 0 ? `Notifications, ${unreadCount} new` : "Notifications";

  const renderRow = (r: Row) => {
    const body = (
      <>
        <Face name={r.who} />
        <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-pm-charcoal">
          {r.who && <span className="font-semibold">{r.who} </span>}
          {r.text}{" "}
          <span className="font-mono text-[11px] text-zinc-500">
            {relativeTime(r.at)}
          </span>
        </p>
      </>
    );
    return (
      <li
        key={r.key}
        className={`flex items-center gap-3 px-4 py-2.5 ${r.unread ? "bg-pm-orange-tint/50" : ""}`}
      >
        {r.postId ? (
          <button
            type="button"
            onClick={() => void openPlate(r.postId!)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
          >
            {body}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
        )}
        {r.kind === "friend" && (
          <span className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => respond(r, "accept")}
              className="min-h-11 rounded-full bg-pm-orange px-4 text-[12px] font-semibold text-white"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => respond(r, "decline")}
              className="min-h-11 rounded-full bg-pm-grey-tint px-4 text-[12px] font-semibold text-pm-charcoal"
            >
              Hide
            </button>
          </span>
        )}
      </li>
    );
  };

  const overlay =
    open && mounted
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            className="animate-fade-in fixed inset-0 z-[60] flex justify-center bg-black/30 md:items-start md:pt-16"
            onClick={() => setOpen(false)}
          >
            <div
              className="flex h-full w-full max-w-[480px] flex-col bg-white md:h-auto md:max-h-[80vh] md:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  className="flex h-11 w-11 items-center justify-center rounded-full"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
                <h2 className="text-[17px] font-semibold text-pm-charcoal">
                  Notifications
                </h2>
              </div>
              <div className="flex gap-1.5 px-4 py-2.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    aria-pressed={filter === f.id}
                    className={`min-h-9 rounded-full px-3 text-[12px] font-medium ${filter === f.id ? "bg-pm-charcoal text-white" : "bg-pm-grey-tint text-pm-charcoal"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto pb-6">
                {visible.length === 0 ? (
                  <p className="px-4 py-10 text-center text-[13px] text-zinc-500">
                    {data
                      ? "Nothing here yet. Comments, upvotes and friend requests land here."
                      : "Loading…"}
                  </p>
                ) : (
                  <>
                    {fresh.length > 0 && (
                      <>
                        <h3 className="px-4 pb-1 pt-1 text-[13px] font-semibold text-pm-charcoal">
                          New
                        </h3>
                        <ul>{fresh.map(renderRow)}</ul>
                      </>
                    )}
                    {earlier.length > 0 && (
                      <>
                        <h3 className="px-4 pb-1 pt-4 text-[13px] font-semibold text-pm-charcoal">
                          Earlier
                        </h3>
                        <ul>{earlier.map(renderRow)}</ul>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={openCenter}
        aria-label={label}
        data-notification-button
        className="relative -mr-2 ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-pm-charcoal active:bg-pm-grey-tint"
      >
        <BellIcon className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute right-[3px] top-[5px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pm-red px-1 font-mono text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {overlay}
      {plate &&
        mounted &&
        createPortal(
          <div className="relative z-[70]">
            <PlateDetailSheet
              post={plate}
              onClose={() => setPlate(null)}
              onCommentAdded={(comment: DetailComment) =>
                setPlate((p) =>
                  p ? { ...p, comments: [...(p.comments ?? []), comment] } : p,
                )
              }
              onCommentVoted={(commentId: string, patch: CommentVotePatch) =>
                setPlate((p) =>
                  p
                    ? {
                        ...p,
                        comments: (p.comments ?? []).map((c) =>
                          c.id === commentId ? { ...c, ...patch } : c,
                        ),
                      }
                    : p,
                )
              }
              onVoted={(patch: PostVotePatch) =>
                setPlate((p) => (p ? { ...p, ...patch } : p))
              }
            />
          </div>,
          document.body,
        )}
    </>
  );
}
