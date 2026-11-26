"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "@/components/feed/Dialog";
import { useAuth } from "@/lib/auth";
import { avatarPalette, initials, relativeTime } from "@/lib/format";

/** Mirrors PostUpvoter in lib/db.ts — that module is server-only. */
type Upvoter = {
  id: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
  isFriend: boolean;
};

/**
 * "Upvoted by": everyone who upvoted one plate, in a bottom sheet over
 * whatever opened it (the plate sheet, the notification list), so closing it
 * lands you back where you were.
 *
 * Public, like the count it explains — /api/posts/[id]/upvoters answers
 * anyone. Friends first, then newest first; downvoters never appear.
 */
export function UpvotersSheet({
  postId,
  subject,
  onClose,
}: {
  postId: string;
  /** The plate's name for the header line, e.g. "Birria tacos". */
  subject?: string;
  onClose: () => void;
}) {
  const { account } = useAuth();
  const pathname = usePathname();
  const onPhone = pathname?.startsWith("/m") ?? false;
  const [people, setPeople] = useState<Upvoter[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Portal target only exists after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let live = true;
    fetch(`/api/posts/${postId}/upvoters`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { upvoters: Upvoter[] }) => {
        if (!live) return;
        // Stable sort: newest-first from the server survives inside each group.
        setPeople([...d.upvoters].sort((a, b) => Number(b.isFriend) - Number(a.isFriend)));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [postId]);

  const hrefFor = (id: string) =>
    id === account?.id
      ? onPhone
        ? "/m/account"
        : "/account"
      : onPhone
        ? `/m/u/${id}`
        : `/u/${id}`;

  const count = people?.length;

  if (!mounted) return null;

  return createPortal(
    /* Above the plate sheet (z-70 in NotificationCenter) so it can open on top
       of it. */
    <div className="relative z-[80]">
      <Dialog
        title="Upvoted by"
        variant="sheet"
        onClose={onClose}
        headerBelow={
          subject || count !== undefined ? (
            <p className="truncate pt-0.5 font-mono text-[11px] uppercase tracking-[0.06em] tabular-nums text-zinc-500">
              {subject}
              {subject && count !== undefined && " · "}
              {count !== undefined && (
                <span className="font-medium text-pm-orange-text">
                  {count} {count === 1 ? "upvote" : "upvotes"}
                </span>
              )}
            </p>
          ) : undefined
        }
      >
        <div className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          {failed ? (
            <p role="alert" className="px-5 py-8 text-center text-sm text-zinc-600">
              Couldn&apos;t load who upvoted this. Try again in a moment.
            </p>
          ) : people === null ? (
            <div className="flex flex-col gap-2 px-5 py-4" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-12 w-full rounded-xl" />
              ))}
              <span className="sr-only">Loading who upvoted this</span>
            </div>
          ) : people.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">No upvotes yet.</p>
          ) : (
            <ul className="py-1">
              {people.map((p) => (
                <li key={p.id}>
                  <Link
                    href={hrefFor(p.id)}
                    onClick={onClose}
                    className="flex min-h-14 items-center gap-3 px-5 py-2 hover:bg-pm-grey-tint/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange"
                  >
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatarUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-medium text-white ${avatarPalette(p.name).avatarBg}`}
                      >
                        {initials(p.name)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-zinc-900">
                        {p.name}
                      </span>
                      {p.isFriend && (
                        <span className="mono-label block text-zinc-500">Friend</span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                      {relativeTime(p.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </div>,
    document.body,
  );
}
