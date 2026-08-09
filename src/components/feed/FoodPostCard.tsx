"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PostMediaCarousel } from "./PostMediaCarousel";
import { PostActions, type VoteDirection } from "./PostActions";
import { PointsBadge } from "./PointsBadge";
import { StarRating } from "@/components/StarRating";
import { MoreIcon, FlagIcon, EyeOffIcon, FlameIcon } from "@/components/icons";
import { initials, relativeTime, avatarPalette } from "@/lib/format";
import { tagAccent } from "@/data/foodTags";
import { amenityEmoji, vibeChip } from "@/data/reviewScales";
import type { Post } from "./types";

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
  const [status, setStatus] = useState<"live" | "hidden" | "reported" | "deleted">("live");
  const menuRef = useRef<HTMLDivElement>(null);

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
  // Reads either vocabulary the `vibe` column has held — "Lively", or "Food"
  // written back out as "Best at food".
  const roomChip = post.vibe ? vibeChip(post.vibe) : null;

  return (
    <article
      aria-labelledby={`post-${post.id}-title`}
      className={`overflow-hidden rounded-2xl bg-white ${
        highlighted ? "ring-2 ring-pm-orange" : ""
      }`}
    >
      <header className="flex items-center gap-3 px-4 pt-4">
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
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full ${palette.avatarBg} font-mono text-sm font-semibold text-white`}
            >
              {initials(post.authorName)}
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          {/* Handle and timestamp share one row, both machine values, both
              mono — the brief's card opens exactly this way. */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate font-mono text-[13px] font-medium text-zinc-900">
              {handleFor(post.authorName)}
            </span>
            <span className="truncate font-mono text-xs text-zinc-500">{meta}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
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
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* The poster's own words, in the human voice, before the photo. */}
      {post.text && (
        <div className="px-4 pt-3">
          <p
            className={`text-sm leading-relaxed text-zinc-700 ${
              expanded ? "" : "line-clamp-3"
            }`}
          >
            {post.text}
          </p>
          {post.text.length > 140 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-0.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {/* Photo inset from the card edge, both radii visible — the same move
          as the restaurant page's hero. */}
      <div className="relative mx-2.5 mt-3 overflow-hidden rounded-xl">
        <PostMediaCarousel
          media={post.media}
          dishName={post.dishName}
          restaurant={post.restaurant}
        />

        {(post.rating !== undefined || post.price) && (
          <div className="pointer-events-none absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
            {/* Exactly two ways a rating can read, because there are
                exactly two ways to make one: five stars for a restaurant,
                a percentage for a dish. There is deliberately no third
                branch — a 0-10 fallback is what let an impossible "9.2
                stars" render, and the app has no control that produces a
                9.2. Pre-split rows were converted by
                scripts/backfill-rating-kind.mjs. */}
            {post.rating !== undefined && post.ratingKind === "restaurant" && (
              <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1">
                <StarRating rating={post.rating} className="h-3 w-3" />
                <span className="font-mono text-xs font-semibold tabular-nums text-zinc-900">
                  {post.rating}/5
                </span>
              </span>
            )}
            {post.rating !== undefined && post.ratingKind === "dish" && (
              <span className="flex items-baseline gap-1 rounded-full bg-white/95 px-2.5 py-1">
                <span className="font-mono text-xs font-semibold tabular-nums text-zinc-900">
                  {post.rating}%
                </span>
                <span className="font-mono text-[10px] text-zinc-500">would order</span>
              </span>
            )}
            {post.price && (
              <span className="rounded-full bg-white/95 px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-zinc-700">
                {post.price}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Restaurant · dish gets its own line now that the row below it is
          split left-and-right — the dish is a record in this app, so it sets
          in the mono. */}
      <h3
        id={`post-${post.id}-title`}
        className="truncate px-4 pt-2.5 text-[13px] leading-snug"
      >
        {post.restaurant && <span className="text-zinc-600">{post.restaurant}</span>}
        {post.restaurant && post.dishName && <span className="text-zinc-400"> · </span>}
        {post.dishName && (
          <span className="font-mono font-medium text-zinc-900">{post.dishName}</span>
        )}
        {!post.restaurant && !post.dishName && (
          <span className="text-zinc-600">A plate worth sharing</span>
        )}
      </h3>

      {/* The verdict on the left, everything you can do about it on the
          right. PostActions owns the split itself. */}
      <div className="flex items-center px-4 pb-1 pt-1">
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
