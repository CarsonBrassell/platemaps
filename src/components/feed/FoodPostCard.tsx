"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PostMediaCarousel } from "./PostMediaCarousel";
import { PostActions, type VoteDirection } from "./PostActions";
import { heatFor } from "@/components/post/PercentMeter";
import { PointsBadge } from "./PointsBadge";
import { StarRating } from "@/components/StarRating";
import { MoreIcon, FlagIcon, EyeOffIcon, FlameIcon, CloseIcon } from "@/components/icons";
import { initials, relativeTime, avatarPalette } from "@/lib/format";
import { tagAccent } from "@/data/foodTags";
import { amenityEmoji, vibeChip } from "@/data/reviewScales";
import type { Comment, Post } from "./types";

/** Handle shown next to the avatar — "Maya Ellis" reads as "mayaellis". */
function handleFor(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

function Tombstone({ title, body, onUndo }: { title: string; body: string; onUndo?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-6 text-sm">
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

/** Where two users stand — mirrors lib/db.ts's FriendStatus. */
export type FriendStatus = "none" | "friends" | "requested" | "incoming";

type SharedCardProps = {
  post: Post;
  currentUserId: string | null;
  friendStatus: FriendStatus;
  highlighted?: boolean;
  onSave: (postId: string) => void;
  onShare: (post: Post) => Promise<string | null>;
  onOpenComments: (postId: string) => void;
  onDelete: (postId: string) => void;
  /**
   * Only ever called when friendStatus is "none" — see the header button
   * below. Omitted on a screen where every author is already a friend, which
   * is why that button is rendered on the handler's presence too.
   */
  onAddFriend?: (userId: string) => void;
  onRequireSignIn: () => void;
};

/**
 * `surface` is which feed this card is rendering inside of, and it decides
 * which reaction the card offers — a post is never rendered with both. It's a
 * discriminated union for the same reason PostActions' props are: a friends
 * card cannot be handed a vote handler, a trending flame or a points toast,
 * because those aren't fields its variant has. The friends feed's freedom from
 * scoring is then a type, not a habit.
 *
 * Photo visibility is NOT decided here: getDiscoverFeed already strips `media`
 * server-side for a post whose author hasn't opted into public photos, so this
 * component just renders whatever `post.media` it was handed. That keeps the
 * privacy rule enforced at the one place a network payload is actually shaped,
 * rather than duplicated as a second, client-trust-only gate here.
 */
type FoodPostCardProps = SharedCardProps &
  (
    | {
        surface: "discover";
        /** Among the hottest plates right now — earns the glowing flame. */
        trending?: boolean;
        /** Points just earned for upvoting, floated above the action row. */
        reactPoints: number | null;
        /** Up/down. Pressing the direction already held clears the vote. */
        onVote: (postId: string, direction: VoteDirection) => void;
      }
    | {
        surface: "friends";
        /** The heart. Awards nothing and counts nothing — see PostActions. */
        onReact: (postId: string) => void;
      }
  );

export function FoodPostCard(props: FoodPostCardProps) {
  const {
    post,
    currentUserId,
    friendStatus,
    highlighted,
    onSave,
    onShare,
    onOpenComments,
    onDelete,
    onAddFriend,
    onRequireSignIn,
  } = props;

  /* Flattened out of the union once, here, rather than reached through `props`
     inside the JSX: narrowing a parameter doesn't survive into the event
     handlers below, and these read as what they are — a control the other
     surface simply doesn't have. Called with `?.` for the same reason. */
  const onVote = props.surface === "discover" ? props.onVote : null;
  const onReact = props.surface === "friends" ? props.onReact : null;
  const reactPoints = props.surface === "discover" ? props.reactPoints : null;
  const trending = props.surface === "discover" && props.trending;

  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<"live" | "hidden" | "reported" | "deleted" | "blocked">(
    "live",
  );
  const [blocking, setBlocking] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const saved = currentUserId ? post.savedBy.includes(currentUserId) : false;
  const isOwner = currentUserId === post.userId;
  const palette = avatarPalette(post.authorName);
  /* The one comment the card shows. Now that replies exist it has to be a
     top-level one — a reply quoted alone under the photo reads as a response
     to the post itself — and the best-scoring one rather than the newest,
     which is what "top comment" means to anyone opening the thread. */
  const topComment = post.comments
    .filter((c) => c.parentId === null)
    .reduce<Comment | undefined>((best, c) => {
      if (!best) return c;
      const delta = c.upvoteCount - c.downvoteCount - (best.upvoteCount - best.downvoteCount);
      return delta > 0 ? c : best;
    }, undefined);

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

  async function handleBlock() {
    if (blocking) return;
    setBlocking(true);
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: post.userId }),
      });
      if (!res.ok) throw new Error("failed");
      setStatus("blocked");
    } catch {
      setBlocking(false);
    }
  }

  if (status === "deleted") {
    return <Tombstone title="Post deleted" body="This plate is no longer on the feed." />;
  }
  if (status === "blocked") {
    return (
      <Tombstone
        title={`Blocked ${post.authorName}`}
        body="You won't see posts from this person again. Manage this from Account settings."
      />
    );
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

  /* What the plate *is*. Stars belong to the place, so a restaurant review
     names the restaurant even when a dish is given; everything else leads with
     the dish when there is one. */
  const titleIsDish = post.ratingKind !== "restaurant" && !!post.dishName;
  const title = titleIsDish
    ? post.dishName
    : (post.restaurant ?? post.dishName ?? "A plate worth sharing");

  /* The poster's own words are the headline, and the name is the small line
     above them.

     A feed of plates is a feed of opinions: "Crispy crust, spicy honey, worth
     ordering again" is why you stop scrolling, and the dish it is about is the
     caption to that, not the other way round. The words used to sit in small
     grey type below the photo, which is where a card puts the thing nobody is
     expected to read.

     Falls back to the name when a post has none — every post has a subject,
     only most have something to say about it. There is then no orange line, so
     the name is never printed twice.

     Tested for content rather than for null: `text` is a nullable column that a
     composer submitting an untouched field can land in as "", and `?? title`
     would have made that an empty headline. */
  const words = post.text?.trim() ? post.text : null;
  const headline = words ?? title;
  const kicker = words ? title : null;
  const titleId = `post-${post.id}-title`;
  const kickerId = `post-${post.id}-kicker`;

  /* The byline opens with the handle; what follows is only what the headline
     didn't already say. A restaurant review deliberately carries no
     neighbourhood and no "restaurant review" label — the stars say it.
     Price rides here only when there's no photo to wear its chip. */
  const bylineParts = [
    titleIsDish ? post.restaurant : post.dishName,
    relativeTime(post.createdAt),
    post.media.length === 0 ? post.price : null,
  ].filter(Boolean);

  // Reads either vocabulary the `vibe` column has held — "Lively", or "Food"
  // written back out as "Best at food".
  const roomChip = post.vibe ? vibeChip(post.vibe) : null;

  return (
    <article
      // Both lines, in reading order, so the card announces itself as "Hot
      // honey pepperoni pizza, crispy crust and spicy honey…" rather than as a
      // quote from nowhere.
      aria-labelledby={kicker ? `${kickerId} ${titleId}` : titleId}
      className={`overflow-hidden rounded-2xl bg-white ${
        highlighted ? "ring-2 ring-pm-orange" : ""
      }`}
    >
      <header className="px-4 pt-4">
        {/* The dish or the restaurant, small and in the accent — a caption
            above its picture rather than a heading over a section. Fraunces
            because it is a proper name, --pm-orange-text because small orange
            type needs the darker of the two accent tokens to clear 4.5:1. */}
        {kicker && (
          <p
            id={kickerId}
            className="mb-1 truncate font-display text-[13px] font-semibold leading-tight text-pm-orange-text"
          >
            {kicker}
          </p>
        )}

        {/* The words and their verdict share the opening line: dish posts get
            the percent in the composer meter's own heat, restaurant posts get
            their stars. Exactly two branches, same as everywhere else — no
            third scale exists to render.
         *
         * `items-baseline` still, so the number sits on the first line of the
         * headline however many lines it runs to. */}
        <div className="flex items-baseline justify-between gap-3">
          <h3
            id={titleId}
            className={`min-w-0 text-[22px] font-semibold tracking-tight text-zinc-900 ${
              words
                ? // Prose, so it wraps and gets the looser leading; three lines
                  // is where a headline stops being one.
                  `leading-snug ${expanded ? "" : "line-clamp-3"}`
                : "truncate leading-tight"
            }`}
          >
            {headline}
          </h3>
          {post.rating !== undefined && post.ratingKind === "dish" && (
            <span
              data-heat={heatFor(post.rating)}
              className="pct-heat shrink-0 font-mono text-[21px] font-bold leading-tight tabular-nums"
            >
              {post.rating}%
            </span>
          )}
          {post.rating !== undefined && post.ratingKind === "restaurant" && (
            <span className="flex shrink-0 items-center gap-1.5">
              <StarRating rating={post.rating} className="h-3.5 w-3.5" />
              <span className="font-mono text-sm font-semibold tabular-nums text-zinc-900">
                {post.rating}/5
              </span>
            </span>
          )}
        </div>

        {/* Sits with the text it expands, which is now up here. 140 characters
            is roughly where three lines end at this size. */}
        {words && words.length > 140 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-0.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}

        <div className="mt-2 flex items-center gap-2">
          <Link
            href={isOwner ? "/account" : `/u/${post.userId}`}
            aria-label={`View ${post.authorName}'s profile`}
            className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            {post.authorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.authorAvatarUrl}
                alt=""
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full ${palette.avatarBg} font-mono text-[10px] font-semibold text-white`}
              >
                {initials(post.authorName)}
              </span>
            )}
          </Link>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-mono text-xs text-zinc-500">
              <span className="font-medium text-zinc-900">{handleFor(post.authorName)}</span>
              {bylineParts.length > 0 && <> · {bylineParts.join(" · ")}</>}
            </span>
            <PointsBadge points={post.authorPoints} />
            {trending && (
              <span
                className="flex items-center gap-1 rounded-full bg-pm-grey-tint py-0.5 pl-1.5 pr-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-pm-grey-text"
                title="Trending right now"
              >
                <FlameIcon className="h-3 w-3" />
                Hot
              </span>
            )}
          </div>

        {/* Mutual friends only — a one-directional follow isn't a state this
            button can land in. "Incoming" routes to the account page rather
            than accepting inline, since accepting needs the request's id and
            this card only ever received a friendIds/outgoing summary, not the
            full request list. */}
        {currentUserId && !isOwner && friendStatus === "none" && onAddFriend && (
          <button
            type="button"
            onClick={() => onAddFriend(post.userId)}
            className="hidden min-h-9 shrink-0 rounded-full bg-pm-charcoal px-3 text-xs font-medium text-white transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange sm:block"
          >
            Add friend
          </button>
        )}
        {currentUserId && !isOwner && friendStatus === "requested" && (
          <span className="hidden min-h-9 shrink-0 items-center rounded-full bg-pm-grey-tint px-3 text-xs font-medium text-pm-grey-text sm:flex">
            Request sent
          </span>
        )}
        {currentUserId && !isOwner && friendStatus === "incoming" && (
          <Link
            href="/account"
            className="hidden min-h-9 shrink-0 items-center rounded-full bg-pm-orange px-3 text-xs font-medium text-[#F7F4EC] transition-colors hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange sm:flex"
          >
            Respond
          </Link>
        )}
        {currentUserId && !isOwner && friendStatus === "friends" && (
          <span className="hidden min-h-9 shrink-0 items-center rounded-full bg-pm-grey-tint px-3 text-xs font-medium text-pm-grey-text sm:flex">
            Friends
          </span>
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
              className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl bg-white p-1 ring-1 ring-zinc-200"
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
                  <button
                    role="menuitem"
                    disabled={blocking}
                    onClick={() => {
                      setMenuOpen(false);
                      void handleBlock();
                    }}
                    className="flex w-full min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    <CloseIcon className="h-4 w-4 shrink-0" />
                    Block {handleFor(post.authorName)}
                  </button>
                </>
              )}
            </div>
          )}
          </div>
        </div>
      </header>

      {/* Photo only when the post actually has one — with photos scoped to the
          friends tab, most Discover entries won't, and a ledger entry reads as
          headline + words alone. When it exists it stays inset from the card
          edge, both radii visible — the same move as the restaurant page's
          hero. The rating chips that used to sit on the photo are gone: the
          verdict lives in the headline now (rating branches are up there, and
          pre-split rows were converted by scripts/backfill-rating-kind.mjs).
          Only the price still wears a chip. */}
      {post.media.length > 0 && (
        <div className="relative mx-2.5 mt-3 overflow-hidden rounded-xl">
          <PostMediaCarousel
            media={post.media}
            dishName={post.dishName}
            restaurant={post.restaurant}
          />

          {post.price && (
            <div className="pointer-events-none absolute bottom-2.5 left-2.5">
              <span className="rounded-full bg-white/95 px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-zinc-700">
                {post.price}
              </span>
            </div>
          )}
        </div>
      )}

      {/* The poster's words used to sit here, in small grey type under the
          photo. They are the headline now — see `headline` above — and printing
          them twice was the whole reason to take them out of this slot. */}

      {/* The verdict on the left, everything you can do about it on the
          right. PostActions owns the split itself. */}
      <div className="flex items-center px-4 pb-1 pt-2">
        {props.surface === "discover" ? (
          <PostActions
            surface="discover"
            upvoteCount={post.upvoteCount}
            downvoteCount={post.downvoteCount}
            myVote={post.upvotedByMe ? "up" : post.downvotedByMe ? "down" : null}
            commentCount={post.comments.length}
            saved={saved}
            canInteract={!!currentUserId}
            pointsToast={reactPoints ? `+${reactPoints} point${reactPoints === 1 ? "" : "s"}` : null}
            onVote={(direction) => onVote?.(post.id, direction)}
            onComment={() => onOpenComments(post.id)}
            onSave={() => onSave(post.id)}
            onShare={() => onShare(post)}
            onRequireSignIn={onRequireSignIn}
          />
        ) : (
          <PostActions
            surface="friends"
            hearted={post.heartedByMe}
            commentCount={post.comments.length}
            saved={saved}
            canInteract={!!currentUserId}
            // Hearts earn no points — nothing to float here, ever.
            pointsToast={null}
            onReact={() => onReact?.(post.id)}
            onComment={() => onOpenComments(post.id)}
            onSave={() => onSave(post.id)}
            onShare={() => onShare(post)}
            onRequireSignIn={onRequireSignIn}
          />
        )}
      </div>

      <div className="px-4 pb-4">
        {(post.tags.length > 0 || post.amenities.length > 0 || post.vibe) && (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {roomChip && (
              <li className="flex items-center gap-1 rounded-full bg-pm-grey-tint px-2.5 py-1 text-[11px] font-medium text-pm-grey-text">
                {roomChip.emoji && <span aria-hidden="true">{roomChip.emoji}</span>}
                {roomChip.text}
              </li>
            )}
            {post.tags.map((tag) => (
              <li
                key={tag}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${tagAccent(tag)}`}
              >
                {tag}
              </li>
            ))}
            {post.amenities.map((a) => (
              <li
                key={a}
                className="flex items-center gap-1 rounded-full bg-pm-grey-tint px-2.5 py-1 text-[11px] font-medium text-pm-grey-text"
              >
                <span aria-hidden="true">{amenityEmoji(a)}</span>
                {a}
              </li>
            ))}
          </ul>
        )}

        {post.comments.length > 0 && (
          <div className="mt-2.5">
            {post.comments.length > 1 && (
              <button
                type="button"
                onClick={() => onOpenComments(post.id)}
                className="font-mono text-xs text-zinc-500 transition-colors hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                View all {post.comments.length} comments
              </button>
            )}
            {topComment && (
              <p className="mt-1 line-clamp-2 text-sm text-zinc-700">
                <span className="font-mono text-[13px] font-medium text-zinc-900">
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
