"use client";

import { useEffect, useRef, useState } from "react";
import { PostMediaCarousel } from "./PostMediaCarousel";
import { PostActions } from "./PostActions";
import { VoteRail } from "./VoteRail";
import { MoreIcon, StarIcon, FlagIcon, EyeOffIcon, FlameIcon } from "@/components/icons";
import { relativeTime } from "@/lib/format";
import { tagAccent } from "@/data/foodTags";
import { amenityEmoji, vibeChip } from "@/data/reviewScales";
import type { Post } from "./types";

/**
 * Ratings are mid-migration: the column was widened to NUMERIC(5,1) and the
 * stored values multiplied by ten, but /post still writes 0–10 and the API
 * still rejects anything above it. So the table holds both scales at once —
 * 3.0 next to 96.0. Anything over 10 is read as the 0–100 form so neither
 * kind renders as nonsense while that gets settled.
 */
function outOfTen(rating: number) {
  return rating > 10 ? rating / 10 : rating;
}

/** Handle shown in the byline — "Maya Ellis" reads as "mayaellis". */
function handleFor(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

function Tombstone({ title, body, onUndo }: { title: string; body: string; onUndo?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white/70 px-4 py-4 text-sm">
      <div className="flex-1">
        <p className="font-medium text-zinc-800">{title}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{body}</p>
      </div>
      {onUndo && (
        <button
          type="button"
          onClick={onUndo}
          className="min-h-9 shrink-0 rounded-full px-3 text-xs font-medium text-pm-orange-text transition-colors hover:bg-pm-orange-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          Undo
        </button>
      )}
    </div>
  );
}

/**
 * A feed row, not a photo card.
 *
 * The layout is the community-feed one: a vote column pinned down the left,
 * the writing as the body, and the photo demoted to a thumbnail that expands
 * on tap. Posts stay short enough to scan a screenful at a time, which is the
 * whole point — the previous full-bleed card fit barely one post per screen.
 */
export function FoodPostCard({
  post,
  currentUserId,
  isFollowing,
  highlighted,
  trending,
  votePoints,
  onSave,
  onShare,
  onVote,
  onOpenComments,
  onDelete,
  onToggleFollow,
  onRequireSignIn,
}: {
  post: Post;
  currentUserId: string | null;
  isFollowing: boolean;
  highlighted?: boolean;
  /** Among the hottest plates right now — earns the glowing flame. */
  trending?: boolean;
  /** Points just earned for voting, floated beside the byline. */
  votePoints: number | null;
  onSave: (postId: string) => void;
  onShare: (post: Post) => Promise<string | null>;
  onVote: (postId: string, vote: boolean) => void;
  onOpenComments: (postId: string) => void;
  onDelete: (postId: string) => void;
  onToggleFollow: (userId: string) => void;
  onRequireSignIn: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [status, setStatus] = useState<"live" | "hidden" | "reported" | "deleted">("live");
  const menuRef = useRef<HTMLDivElement>(null);

  const myVote = currentUserId
    ? post.votedYesBy.includes(currentUserId)
      ? true
      : post.votedNoBy.includes(currentUserId)
        ? false
        : null
    : null;
  const saved = currentUserId ? post.savedBy.includes(currentUserId) : false;
  const isOwner = currentUserId === post.userId;
  const topComment = post.comments[post.comments.length - 1];
  const cover = post.media[0];

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

  const roomChip = post.vibe ? vibeChip(post.vibe) : null;
  const meta = [relativeTime(post.createdAt), post.locationLabel].filter(Boolean).join(" · ");

  return (
    <article
      aria-labelledby={`post-${post.id}-title`}
      className={`rounded-xl border bg-white px-3 py-3 shadow-sm transition-colors hover:border-zinc-300 ${
        highlighted
          ? "border-pm-orange ring-2 ring-pm-orange ring-offset-2"
          : trending
            ? "border-orange-200"
            : "border-zinc-200/80"
      }`}
    >
      <div className="flex gap-3">
        <VoteRail
          upvotes={post.votedYesBy.length}
          downvotes={post.votedNoBy.length}
          myVote={myVote}
          canVote={!!currentUserId}
          onVote={(vote) => onVote(post.id, vote)}
          onRequireSignIn={onRequireSignIn}
        />

        <div className="min-w-0 flex-1">
          {/* Byline is one quiet line — the plate is the headline here. */}
          <div className="relative flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="truncate font-medium text-zinc-600">
              {handleFor(post.authorName)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{meta}</span>
            {trending && (
              <span
                className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold uppercase tracking-wide text-pm-orange-text"
                title="Trending right now"
              >
                <FlameIcon className="flame-glow h-3.5 w-3.5" />
                Hot
              </span>
            )}
            {votePoints && (
              <span className="points-float absolute -top-1 right-8 rounded-full bg-pm-orange px-1.5 py-0.5 text-[10px] font-bold text-white">
                +{votePoints}
              </span>
            )}

            <div ref={menuRef} className="relative ml-auto shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Post options"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                <MoreIcon className="h-3.5 w-3.5" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-lg"
                >
                  {currentUserId && !isOwner && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onToggleFollow(post.userId);
                      }}
                      className="flex w-full min-h-11 items-center rounded-lg px-3 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100"
                    >
                      {isFollowing ? "Unfollow" : "Follow"} {handleFor(post.authorName)}
                    </button>
                  )}
                  {isOwner ? (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setStatus("deleted");
                        onDelete(post.id);
                      }}
                      className="flex w-full min-h-11 items-center rounded-lg px-3 text-left text-sm text-red-700 transition-colors hover:bg-red-50"
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
          </div>

          {/* Body and thumbnail sit side by side; the photo is support, not
              the headline. */}
          <div className="mt-1 flex gap-3">
            <div className="min-w-0 flex-1">
              <h3
                id={`post-${post.id}-title`}
                className="font-display text-[17px] font-semibold leading-snug tracking-tight text-zinc-900"
              >
                {post.dishName ?? post.restaurant ?? "A plate worth sharing"}
              </h3>
              {post.restaurant && (
                <p className="truncate text-xs text-pm-orange-text">at {post.restaurant}</p>
              )}

              {post.text && (
                <p
                  className={`mt-1.5 text-sm leading-relaxed text-zinc-700 ${
                    expanded ? "" : "line-clamp-2"
                  }`}
                >
                  {post.text}
                </p>
              )}
              {post.text.length > 110 && (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  className="text-[11px] font-medium text-zinc-400 transition-colors hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  {expanded ? "less" : "more"}
                </button>
              )}
            </div>

            {cover && (
              <button
                type="button"
                onClick={() => setPhotoOpen((o) => !o)}
                aria-expanded={photoOpen}
                aria-label={photoOpen ? "Collapse photo" : "Expand photo"}
                className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-inset ring-zinc-200 transition-transform hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange sm:h-[88px] sm:w-[88px]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover.url}
                  alt={cover.alt || post.dishName || "Food photo"}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                {post.media.length > 1 && (
                  <span className="absolute bottom-1 right-1 rounded bg-pm-charcoal/70 px-1 text-[9px] font-semibold text-white">
                    +{post.media.length - 1}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Rating, price and the chips run as one compact line. */}
          {(post.rating !== undefined || post.price || roomChip || post.tags.length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {post.rating !== undefined && (
                <span className="flex items-baseline gap-0.5 rounded-full bg-pm-orange-tint/70 px-1.5 py-0.5 text-[11px] font-bold text-pm-orange-text">
                  <StarIcon className="h-3 w-3 translate-y-0.5" />
                  {outOfTen(post.rating).toFixed(1)}
                </span>
              )}
              {post.price && (
                <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700">
                  {post.price}
                </span>
              )}
              {roomChip && (
                <span className="flex items-center gap-1 rounded-full bg-pm-charcoal px-1.5 py-0.5 text-[11px] font-medium text-white">
                  {roomChip.emoji && <span aria-hidden="true">{roomChip.emoji}</span>}
                  {roomChip.text}
                </span>
              )}
              {post.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tagAccent(tag)}`}
                >
                  {tag}
                </span>
              ))}
              {post.amenities.slice(0, 2).map((a) => (
                <span
                  key={a}
                  className="flex items-center gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-[11px] text-zinc-500 ring-1 ring-inset ring-zinc-200"
                >
                  <span aria-hidden="true">{amenityEmoji(a)}</span>
                  {a}
                </span>
              ))}
            </div>
          )}

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <PostActions
              commentCount={post.comments.length}
              saved={saved}
              canInteract={!!currentUserId}
              onComment={() => onOpenComments(post.id)}
              onSave={() => onSave(post.id)}
              onShare={() => onShare(post)}
              onRequireSignIn={onRequireSignIn}
            />
            {topComment && (
              <button
                type="button"
                onClick={() => onOpenComments(post.id)}
                className="min-w-0 truncate text-right text-[11px] text-zinc-400 transition-colors hover:text-zinc-700"
              >
                <span className="font-medium">{handleFor(topComment.authorName)}</span>{" "}
                {topComment.text}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tapping the thumbnail drops the full carousel in underneath. */}
      {photoOpen && post.media.length > 0 && (
        <div className="result-in mt-3 overflow-hidden rounded-lg">
          <PostMediaCarousel
            media={post.media}
            dishName={post.dishName}
            restaurant={post.restaurant}
          />
        </div>
      )}
    </article>
  );
}
