"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PostMediaCarousel } from "@/components/feed/PostMediaCarousel";
import { PostActions, type VoteDirection } from "@/components/feed/PostActions";
import { StarRating } from "@/components/StarRating";
import { MoreIcon, FlagIcon, EyeOffIcon, FlameIcon, CloseIcon } from "@/components/icons";
import { relativeTime } from "@/lib/format";
import { tagAccent } from "@/data/foodTags";
import { amenityEmoji, vibeChip } from "@/data/reviewScales";
import type { Post } from "@/components/feed/types";
import { PhoneFeedCardThumb } from "./PhoneFeedCardThumb";

/**
 * The feed's post card, phone version.
 *
 * A fork of `FoodPostCard` for routing (every link in the web card leaves the
 * /m tree, and its friend control is `sm:flex`, so it would render in the 390px
 * desktop preview and never on a real handset) — and now for hierarchy too.
 *
 * ## The card leads with the restaurant
 *
 * The web card leads with the poster's own words and captions them with the
 * subject; this one is a list of places, read top-down:
 *
 * ```
 * Kettner Exchange            88%      ← Fraunces name · mono rust score
 * Hamachi crudo                        ← the dish, rust
 * Crispy edges, the sauce is the       ← the review, sans, clamped to 3
 * whole point, would order twice…
 * @mayaellis · 2h ago · Little Italy   ← mono, muted, machine values only
 * ```
 *
 * Which makes the restaurant the thing you scan for, and the reason the handle
 * came off the photo: the author used to be the first thing on the card, in the
 * top-left of the picture, which put the person above the place on a screen
 * whose whole job is to answer "where should I eat".
 *
 * ## Two photo treatments, and the screen picks
 *
 * `featured` runs the photo full width above the text, which is what the first
 * card in the list gets — the top of a feed is the one place a 16:9 photo pays
 * for the height it costs. Everything below it takes a 76px left thumbnail so
 * a screenful holds four or five plates instead of one and a half. The default
 * is the thumbnail, so a caller that says nothing gets the dense treatment.
 *
 * Everything under the layout — `PostActions`, `PostMediaCarousel`,
 * `StarRating` — is the shared component, not a copy. Votes, hearts, saves,
 * comments, share, the options menu and its three tombstones all behave exactly
 * as they did; this change is where things sit.
 *
 * One thing did not survive the restructure: the author's `PointsBadge`. It is
 * a ~90px chip, and the only row it can sit on is the byline, which has 254px
 * to spend on `@handle · 2h ago · 0.8 miles away` and needs all of it — parked
 * there it truncated the distance off every card in the feed. Points still ride
 * with the name everywhere the name is the subject: /m/u/<id>, /m/account, the
 * leaderboard and the comment threads.
 */

/** Handle shown in the byline — "Maya Ellis" reads as "mayaellis". */
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
          className="min-h-11 shrink-0 rounded-full px-3 font-medium text-pm-orange-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          Undo
        </button>
      )}
    </div>
  );
}

/**
 * The restaurant's name, as a link into the phone restaurant screen when the
 * post carries an id and as plain text when it doesn't.
 *
 * `posts.restaurant_id` is a soft reference (see CLAUDE.md — a data refresh
 * rewrites the id space), so a post can name a restaurant this app can no
 * longer resolve. That case prints the name and links nowhere rather than
 * offering a tap that lands on a 404.
 */
function RestaurantRef({ post, className = "" }: { post: Post; className?: string }) {
  const name = post.restaurant;
  if (!name) return null;
  if (!post.restaurantId) return <span className={className}>{name}</span>;
  return (
    /* Underlined at rest, not on hover. The map bubble's dish reference gets
       away with a hover underline because it has a pointer over it; a phone has
       no hover state at all, so an unmarked link is an invisible one. */
    <Link
      href={`/m/restaurant/${post.restaurantId}`}
      className={`rounded-sm underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${className}`}
    >
      {name}
    </Link>
  );
}

type SharedCardProps = {
  post: Post;
  currentUserId: string | null;
  /**
   * Run the photo full width above the text instead of as a left thumbnail.
   * The screen sets it on the first card of the list; every other card is dense
   * by default. A post with no media renders identically either way.
   */
  featured?: boolean;
  /**
   * How far the plate is from the viewer, already formatted (`"0.4 mi"`).
   *
   * Optional and usually absent, and that is not an oversight: a `Post` carries
   * the restaurant's coordinates but nothing carries the *viewer's*, because
   * `lib/nearby.ts` raises the geolocation prompt only on a tap that explains
   * why it is being asked — never on load. So the byline's third slot falls
   * back to `locationLabel`, which answers the same "where" question with
   * something the post actually knows. The prop is here so a caller that has a
   * fix can fill the slot without this card growing a geolocation dependency.
   */
  distance?: string;
  onSave: (postId: string) => void;
  onShare: (post: Post) => Promise<string | null>;
  onOpenComments: (postId: string) => void;
  onDelete: (postId: string) => void;
  onRequireSignIn: () => void;
};

/**
 * `surface` decides which reaction the card offers, and it is a discriminated
 * union for the same reason the web card's is: a friends card cannot be handed
 * a vote handler, a trending flame or a points toast, because those are not
 * fields its variant has. The friends feed's freedom from scoring is a type,
 * not a habit.
 */
type PhoneFeedPostCardProps = SharedCardProps &
  (
    | {
        surface: "discover";
        trending?: boolean;
        reactPoints: number | null;
        onVote: (postId: string, direction: VoteDirection) => void;
      }
    | {
        surface: "friends";
        onReact: (postId: string) => void;
      }
  );

export function PhoneFeedPostCard(props: PhoneFeedPostCardProps) {
  const {
    post,
    currentUserId,
    featured = false,
    distance,
    onSave,
    onShare,
    onOpenComments,
    onDelete,
    onRequireSignIn,
  } = props;

  /* Flattened out of the union once, here: narrowing a parameter doesn't
     survive into the event handlers below. */
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
  const reviewRef = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);

  /* Blocking, ported from the web card rather than reinvented: same POST to
     /api/blocks, same optimistic tombstone. The phone card forked from the web
     one before Carson added this, which is exactly the kind of gap a clean
     merge hides — the feature existed on one surface and silently not on the
     other. */
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

  const saved = currentUserId ? post.savedBy.includes(currentUserId) : false;
  const isOwner = currentUserId === post.userId;

  /* The review. Tested for content rather than for null: `text` is nullable and
     a composer submitting an untouched field lands here as "". Resolved up here
     rather than with the rest of the derived strings below because the clamp
     effect depends on it, and the tombstone returns sit between the two. */
  const words = post.text?.trim() ? post.text : null;

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

  /**
   * Whether the three-line clamp is actually cutting the review off.
   *
   * Measured, not guessed from a character count. The count was tried and it
   * cannot be right at both widths: the featured card's text runs the full
   * 358px and a thumbnail card's runs ~254px, and the same threshold that stops
   * a long review being silently truncated on the narrow card prints an inert
   * "Show more" under a three-line review on the wide one. `scrollHeight`
   * against `clientHeight` asks the question the button is actually about.
   *
   * Held still while expanded — with the clamp off the two heights are equal,
   * so re-measuring there would decide the text isn't clamped and take away the
   * "Show less" that is the only way back.
   */
  useEffect(() => {
    const el = reviewRef.current;
    if (!el || expanded) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    /* Re-measured on width changes and, more to the point, once Fraunces and
       the system stack settle — a first pass against the fallback font gets the
       line count wrong on exactly the reviews sitting near the boundary. */
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, words]);

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
  if (status === "blocked") {
    /* No Undo, deliberately, and the same wording the web card uses: blocking
       is not a feed preference you toggle back from a card, it is an account
       setting. Pointing at where it lives is the honest affordance. */
    return (
      <Tombstone
        title={`Blocked ${post.authorName}`}
        body="You won't see posts from this person again. Manage this from Account settings."
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

  /* The place is the headline, always — including on a pre-retirement
     restaurant review, where it already was. A post with no restaurant on it
     leads with its dish rather than printing an empty slot, and then there is
     no second line to print underneath. */
  const hasRestaurant = !!post.restaurant;
  const heading = post.restaurant ?? post.dishName ?? "A plate worth sharing";
  const subheading = hasRestaurant ? (post.dishName ?? null) : null;

  const titleId = `post-${post.id}-title`;
  const subId = `post-${post.id}-dish`;

  const hasPhoto = post.media.length > 0;
  /** The photo runs full width only when the screen asked for it. */
  const showsHero = hasPhoto && featured;
  const showsThumb = hasPhoto && !featured;

  // Reads either vocabulary the `vibe` column has held — "Lively", or "Food"
  // written back out as "Best at food".
  const roomChip = post.vibe ? vibeChip(post.vibe) : null;

  /* The byline: handle, time, distance, and nothing else. Every part is a
     machine value, so all of it is mono (DESIGN.md's type split), and
     `locationLabel` stands in for a distance nobody has measured — see the
     `distance` prop.
   *
   * Three parts is not a stylistic limit, it is the width. A thumbnail card
   * leaves this row about 254px, and "@samwhitaker · 5d ago · 6.2 miles away"
   * already measures ~250px at 11px mono. A fourth segment, or a chip parked at
   * the end of the row, truncates the distance off every card in the feed —
   * which is how the price and the points badge lost their place here. */
  const bylineTail = [
    relativeTime(post.createdAt),
    distance ?? post.locationLabel ?? null,
  ].filter(Boolean) as string[];

  const authorHref = isOwner ? "/m/account" : `/m/u/${post.userId}`;
  const authorLabel = isOwner ? "View your profile" : `View ${post.authorName}'s profile`;

  return (
    <article
      aria-labelledby={subheading ? `${titleId} ${subId}` : titleId}
      className="overflow-hidden rounded-2xl bg-white"
    >
      {/*
        The hero runs flush to the card edge rather than inset the 10px
        DESIGN.md asks for, matching `PhoneRestaurantCard` and for the reason
        stated there: at 358px of card width the inset reads as a mount around a
        picture. Nothing is overlaid on it but the price — the handle that used
        to sit in the top-left has moved down into the byline, where the new
        hierarchy puts the author.
      */}
      {showsHero && (
        <div className="relative">
          <PostMediaCarousel
            media={post.media}
            dishName={post.dishName}
            restaurant={post.restaurant}
          />
          {post.price && (
            <div className="pointer-events-none absolute bottom-3 left-3">
              <span className="rounded-full bg-white/95 px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-zinc-700">
                {post.price}
              </span>
            </div>
          )}
        </div>
      )}

      {/* The thumbnail and the text are one row, so a card without a photo is
          the same block with the left column absent rather than a second
          layout. */}
      <div className={`flex gap-3 px-4 ${showsHero ? "pt-3" : "pt-4"}`}>
        {showsThumb && (
          <PhoneFeedCardThumb
            item={post.media[0]}
            /* `||`, not `??`: `join` on an empty list returns "" rather than
               null, so a post naming neither a dish nor a restaurant would
               otherwise ship an unlabelled photo. */
            alt={
              post.media[0].alt ||
              [post.dishName, post.restaurant && `at ${post.restaurant}`]
                .filter(Boolean)
                .join(" ") ||
              "Food photo"
            }
          />
        )}

        <div className="min-w-0 flex-1">
          {/* Name left, verdict hard right, top-aligned — the same column read
              the map bubble's verdict row establishes, so a screenful of cards
              can be read straight down the right edge as a column of numbers. */}
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0">
              <h3
                id={titleId}
                className="truncate font-display text-[15px] font-semibold leading-tight tracking-tight text-zinc-900"
              >
                {hasRestaurant ? (
                  <RestaurantRef post={post} className="decoration-1 decoration-zinc-300" />
                ) : (
                  heading
                )}
              </h3>
              {/* The dish, in the accent's small-text voice. Fraunces because a
                  dish name is a proper name; --pm-orange-text because small
                  orange type needs the darker token to clear 4.5:1. */}
              {subheading && (
                <p
                  id={subId}
                  className="mt-0.5 truncate font-display text-[13px] font-semibold leading-tight text-pm-orange-text"
                >
                  {subheading}
                </p>
              )}
            </div>

            {/* Trending rides with the name rather than at the end of the
                byline: parked there it cost ~66px of a 254px row and truncated
                the distance off the three hottest plates in the feed. It is a
                badge on the place, so it sits with the place.
             *
             * Glyph only, no "HOT". The word cost another 46px of a column
             * that has ~136px left for the name after the score, which is how
             * "Breakfast Republic" came to render as "Breakfast Repu…" — the
             * headline losing letters to a decoration is the wrong trade. The
             * label is still announced, it just isn't drawn. */}
            {trending && (
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint text-pm-orange-text"
                title="Trending right now"
              >
                <FlameIcon className="h-3 w-3" />
                <span className="sr-only">Trending right now</span>
              </span>
            )}

            {/* The verdict, and under it the price — both machine values, both
                right-aligned, the same pairing THE HITS uses (muted price, bold
                orange percent). The price only lands here when there is no hero
                photo wearing its chip. */}
            <div className="flex shrink-0 flex-col items-end">
              {/* Flat rust rather than the composer meter's heat gradient the
                  web card wears: at 19px bold this is the "large/bold numeral"
                  case --pm-orange is for, and one card in a scanned column
                  reading grey-brown because it scored 38 breaks the column. */}
              {post.rating !== undefined && post.ratingKind === "dish" && (
                <span className="font-mono text-[19px] font-bold leading-tight tabular-nums text-pm-orange">
                  {post.rating}%
                </span>
              )}
              {/* Pre-retirement restaurant reviews still render as the stars
                  they were entered as — never converted to a percent
                  (CLAUDE.md). */}
              {post.rating !== undefined && post.ratingKind === "restaurant" && (
                <span className="flex items-center gap-1.5">
                  <StarRating rating={post.rating} className="h-3.5 w-3.5" />
                  <span className="font-mono text-sm font-semibold tabular-nums text-zinc-900">
                    {post.rating}/5
                  </span>
                </span>
              )}
              {!showsHero && post.price && (
                <span className="mt-0.5 font-mono text-[11px] tabular-nums text-zinc-500">
                  {post.price}
                </span>
              )}
            </div>
          </div>

          {/* The review — prose a person wrote, so system sans, and the one
              thing on this card that is not a name or a number. */}
          {words && (
            <p
              ref={reviewRef}
              className={`mt-1.5 text-[16px] leading-relaxed text-zinc-700 ${
                expanded ? "" : "line-clamp-3"
              }`}
            >
              {words}
            </p>
          )}

          {words && (clamped || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="min-h-11 text-xs font-medium text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}

          {/* The byline owns its whole row. Nothing is allowed to sit beside it
              — see `bylineTail`. */}
          <p
            className={`truncate font-mono text-[11px] tabular-nums text-zinc-500 ${
              words ? "mt-1" : "mt-2"
            }`}
          >
            <Link
              href={authorHref}
              aria-label={authorLabel}
              className="rounded-sm text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              @{handleFor(post.authorName)}
            </Link>
            {bylineTail.length > 0 && ` · ${bylineTail.join(" · ")}`}
          </p>
        </div>
      </div>

      {/* The verdict on the left, everything you can do about it on the right.
          PostActions owns that split; the options menu is added on the end of
          it rather than kept on a line of its own. Full card width rather than
          indented behind the thumbnail — these act on the post, not on the
          block of text beside them. */}
      <div className="flex items-center gap-1 px-4 pb-0.5 pt-1">
        <div className="min-w-0 flex-1">
          {props.surface === "discover" ? (
            <PostActions
              surface="discover"
              voteStyle="pill"
              upvoteCount={post.upvoteCount}
              downvoteCount={post.downvoteCount}
              myVote={post.upvotedByMe ? "up" : post.downvotedByMe ? "down" : null}
              commentCount={post.comments.length}
              saved={saved}
              canInteract={!!currentUserId}
              pointsToast={
                reactPoints ? `+${reactPoints} point${reactPoints === 1 ? "" : "s"}` : null
              }
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
              pointsToast={null}
              onReact={() => onReact?.(post.id)}
              onComment={() => onOpenComments(post.id)}
              onSave={() => onSave(post.id)}
              onShare={() => onShare(post)}
              onRequireSignIn={onRequireSignIn}
            />
          )}
        </div>

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Post options"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <MoreIcon className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              /* An overlay edge, not a grouping border — the one place
                 DESIGN.md allows a ring, and only because this floats over a
                 white card. */
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
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-red-700"
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
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-zinc-700"
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
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-red-700"
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
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-red-700 disabled:opacity-50"
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

      {(post.tags.length > 0 || post.amenities.length > 0 || post.vibe) && (
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
        </div>
      )}

      {/* Nothing below the action row on a bare post, so the card closes there
          — the tags block owns its own bottom padding and this only replaces
          it when that block isn't rendered. */}
      {!(post.tags.length > 0 || post.amenities.length > 0 || post.vibe) && (
        <div className="pb-3" />
      )}
    </article>
  );
}
