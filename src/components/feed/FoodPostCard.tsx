"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PostMediaCarousel } from "./PostMediaCarousel";
import { PostActions } from "./PostActions";
import { PointsBadge } from "./PointsBadge";
import { MoreIcon, StarIcon, FlagIcon, EyeOffIcon, FlameIcon } from "@/components/icons";
import { initials, relativeTime, avatarPalette } from "@/lib/format";
import { tagAccent } from "@/data/foodTags";
import type { Post } from "./types";

/** Handle shown next to the avatar — "Maya Ellis" reads as "mayaellis". */
function handleFor(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

function Tombstone({ title, body, onUndo }: { title: string; body: string; onUndo?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white/70 px-5 py-6 text-sm">
      <div className="flex-1">
        <p className="font-medium text-zinc-800">{title}</p>
        <p className="mt-0.5 text-zinc-500">{body}</p>
      </div>
      {onUndo && (
        <button
          type="button"
          onClick={onUndo}
          className="min-h-11 shrink-0 rounded-full px-3 font-medium text-pm-orange-text transition-colors hover:bg-pm-orange-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          Undo
        </button>
      )}
    </div>
  );
}

export function FoodPostCard({
  post,
  currentUserId,
  isFollowing,
  highlighted,
  trending,
  pointsToast,
  onLike,
  onSave,
  onShare,
  onOpenComments,
  onDelete,
  onToggleFollow,
}: {
  post: Post;
  currentUserId: string | null;
  isFollowing: boolean;
  highlighted?: boolean;
  /** Among the hottest plates right now — earns the glowing flame. */
  trending?: boolean;
  pointsToast: string | null;
  onLike: (postId: string) => void;
  onSave: (postId: string) => void;
  onShare: (post: Post) => Promise<string | null>;
  onOpenComments: (postId: string) => void;
  onDelete: (postId: string) => void;
  onToggleFollow: (userId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<"live" | "hidden" | "reported" | "deleted">("live");
  const menuRef = useRef<HTMLDivElement>(null);

  const liked = currentUserId ? post.likedBy.includes(currentUserId) : false;
  const saved = currentUserId ? post.savedBy.includes(currentUserId) : false;
  const isOwner = currentUserId === post.userId;
  const palette = avatarPalette(post.authorName);
  const topComment = post.comments[post.comments.length - 1];

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  if (status === "deleted") {
    return <Tombstone title="Post deleted" body="This plate is no longer on the feed." />;
  }
  if (status === "reported") {
    return (
      <Tombstone
        title="Thanks for the report"
        body="We'll take a look at this post. It's hidden from your feed."
      />
    );
  }
  if (status === "hidden") {
    return (
      <Tombstone
        title="Post hidden"
        body="You won't see this plate in your feed."
        onUndo={() => setStatus("live")}
      />
    );
  }

  const meta = [relativeTime(post.createdAt), post.locationLabel].filter(Boolean).join(" · ");

  return (
    <article
      aria-labelledby={`post-${post.id}-title`}
      className={`card-lift overflow-hidden rounded-2xl border bg-white shadow-sm ${
        highlighted
          ? "border-pm-orange ring-2 ring-pm-orange ring-offset-2"
          : trending
            ? "border-orange-200"
            : "border-zinc-200/80"
      }`}
    >
      <header className="flex items-center gap-3 px-4 pt-4">
        <Link
          href={`/account`}
          aria-label={`View ${post.authorName}'s profile`}
          className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          {post.authorAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.authorAvatarUrl}
              alt=""
              className="h-10 w-10 rounded-full object-cover ring-2 ring-white"
            />
          ) : (
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full ${palette.avatarBg} text-sm font-semibold text-white`}
            >
              {initials(post.authorName)}
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="truncate text-sm font-medium text-zinc-800">
              {handleFor(post.authorName)}
            </span>
            <PointsBadge points={post.authorPoints} />
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-500">{meta}</p>
        </div>

        {currentUserId && !isOwner && (
          <button
            type="button"
            onClick={() => onToggleFollow(post.userId)}
            aria-pressed={isFollowing}
            className={`hidden min-h-9 shrink-0 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange sm:block ${
              isFollowing
                ? "bg-pm-grey-tint text-pm-grey-text hover:bg-zinc-200"
                : "bg-pm-charcoal text-white hover:brightness-110"
            }`}
          >
            {isFollowing ? "Following" : "Follow"}
          </button>
        )}

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Post options"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <MoreIcon className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-lg"
            >
              {isOwner ? (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setStatus("deleted");
                    onDelete(post.id);
                  }}
                  className="flex w-full min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm text-red-700 transition-colors hover:bg-red-50"
                >
                  Delete post
                </button>
              ) : (
                <>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setStatus("hidden");
                    }}
                    className="flex w-full min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100"
                  >
                    <EyeOffIcon className="h-4 w-4 shrink-0" />
                    Hide this post
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setStatus("reported");
                    }}
                    className="flex w-full min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm text-red-700 transition-colors hover:bg-red-50"
                  >
                    <FlagIcon className="h-4 w-4 shrink-0" />
                    Report post
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Dish leads the card — it outranks the poster in the hierarchy. */}
      <div className="px-4 pb-3 pt-2.5">
        <div className="flex items-start gap-2">
          <h3
            id={`post-${post.id}-title`}
            className="font-display flex-1 text-[21px] font-semibold leading-tight tracking-tight text-zinc-900"
          >
            {post.dishName ?? post.restaurant ?? "A plate worth sharing"}
          </h3>
          {trending && (
            <span
              className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 py-0.5 pl-1 pr-2 text-[11px] font-bold uppercase tracking-wide text-pm-orange-text ring-1 ring-inset ring-orange-200"
              title="Trending right now"
            >
              <FlameIcon className="flame-glow h-4 w-4" />
              Hot
            </span>
          )}
        </div>
        {post.restaurant && (
          <p className="mt-1 text-sm text-zinc-600">
            at <span className="font-medium text-pm-orange-text">{post.restaurant}</span>
          </p>
        )}
      </div>

      <div className="relative">
        <PostMediaCarousel
          media={post.media}
          dishName={post.dishName}
          restaurant={post.restaurant}
        />

        {(post.rating !== undefined || post.price) && (
          <>
            {/* Scrim so the pills stay legible over a bright photo. */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-pm-charcoal/55 to-transparent"
              aria-hidden="true"
            />
            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5">
              {post.rating !== undefined && (
                <span className="flex items-baseline gap-1 rounded-full bg-white/95 px-2.5 py-1 shadow-sm backdrop-blur-sm">
                  <StarIcon className="h-3.5 w-3.5 translate-y-0.5 text-pm-orange" />
                  <span className="text-sm font-bold text-zinc-900">
                    {post.rating.toFixed(1)}
                  </span>
                  <span className="text-[10px] font-medium text-zinc-500">/10</span>
                </span>
              )}
              {post.price && (
                <span className="rounded-full bg-pm-charcoal/80 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  {post.price}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="pt-1.5">
        <PostActions
          liked={liked}
          likeCount={post.likedBy.length}
          commentCount={post.comments.length}
          saved={saved}
          canInteract={!!currentUserId}
          pointsToast={pointsToast}
          onLike={() => onLike(post.id)}
          onComment={() => onOpenComments(post.id)}
          onSave={() => onSave(post.id)}
          onShare={() => onShare(post)}
        />
      </div>

      <div className="px-4 pb-4">
        {post.text && (
          <p
            className={`text-sm leading-relaxed text-zinc-700 ${
              expanded ? "" : "line-clamp-3"
            }`}
          >
            {post.text}
          </p>
        )}
        {post.text.length > 140 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-0.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}

        {post.tags.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <li
                key={tag}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tagAccent(tag)}`}
              >
                {tag}
              </li>
            ))}
          </ul>
        )}

        {post.comments.length > 0 && (
          <div className="mt-3 border-t border-zinc-100 pt-2.5">
            {post.comments.length > 1 && (
              <button
                type="button"
                onClick={() => onOpenComments(post.id)}
                className="text-xs text-zinc-500 transition-colors hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                View all {post.comments.length} comments
              </button>
            )}
            {topComment && (
              <p className="mt-1 line-clamp-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">
                  {handleFor(topComment.authorName)}
                </span>{" "}
                {topComment.text}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
