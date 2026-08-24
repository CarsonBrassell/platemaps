"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PostMediaCarousel } from "./PostMediaCarousel";
import { PostActions, type VoteDirection } from "./PostActions";
import { chillRamp, heatFor, heatRamp, isPerfect } from "@/components/post/PercentMeter";
import { PointsBadge } from "./PointsBadge";
import { StarRating } from "@/components/StarRating";
import { MoreIcon, FlagIcon, EyeOffIcon, FlameIcon, CloseIcon } from "@/components/icons";
import { initials, relativeTime, avatarPalette } from "@/lib/format";
import { tagAccent } from "@/data/foodTags";
import { amenityEmoji, vibeChip } from "@/data/reviewScales";
import type { Post } from "./types";

/** Handle shown next to the avatar — "Maya Ellis" reads as "mayaellis". */
function handleFor(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * The author's face, at the one size this card uses it.
 *
 * Rendered in two places that are never both on screen for the same post: on
 * the photo when there is one, in the meta row when there isn't.
 */
function Avatar({ name, url, bg }: { name: string; url?: string; bg: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-6 w-6 rounded-full object-cover" />
  ) : (
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-full ${bg} font-mono text-[10px] font-semibold text-white`}
    >
      {initials(name)}
    </span>
  );
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

  /*
   * Where the two names point.
   *
   * The restaurant goes to its page; the dish opens that page with its sheet
   * already up, which is the `?dish=` deep link `RestaurantDetail` has read
   * since the map's bubbles started using it.
   *
   * `restaurantId` is preferred over `placeId` and the difference matters. The
   * first is what the composer wrote — the author's own claim about which place
   * this was. The second is `resolvePostRefs` matching a typed name against the
   * corpus, which is good enough to search on and good enough to fall back to,
   * but is a guess. A link is an assertion, so the author's answer wins.
   *
   * Either can be absent: `posts.restaurant_id` is a soft reference by design
   * (a data refresh rewrites the id space), so a post can name a place this app
   * can no longer resolve. That case prints the name and links nowhere rather
   * than offering a tap that lands on a 404 — the same rule the phone card's
   * RestaurantRef already follows.
   *
   * `dishId` is absent more often still: `posts.dish_name` is free text with no
   * id column behind it, so a dish only resolves when what someone typed
   * matches a line on that restaurant's menu. Unresolved, the dish links to the
   * restaurant page anyway — landing on the place with no sheet open is a
   * weaker answer than the sheet, and a much better one than a dead word.
   */
  const placeId = post.restaurantId ?? post.placeId;
  const restaurantHref = placeId ? `/restaurant/${placeId}` : null;
  const dishHref = placeId
    ? post.dishId
      ? `/restaurant/${placeId}?dish=${post.dishId}`
      : restaurantHref
    : null;

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
  const titleId = `post-${post.id}-title`;
  const kickerId = `post-${post.id}-kicker`;

  /*
   * The subject line under the words: the dish in the accent, then the
   * restaurant beside it — "Cheese board @ Vin de Syrah".
   *
   * Both names used to be somewhere else and neither was near the other: the
   * dish was a small orange kicker *above* the headline and the restaurant was
   * six rows down in the mono foot byline. What a plate is and where it was
   * are one fact, and they now read as one.
   *
   * Whichever name the headline already took is dropped here rather than
   * printed twice — that only happens on a post with no words, where the
   * headline falls back to the name. There is no third case: a post with words
   * shows both, a post without shows the other one.
   */
  const lineDish = headline === post.dishName ? null : post.dishName;
  const lineRestaurant = headline === post.restaurant ? null : post.restaurant;

  /* When it was, printed at the foot of the card — the footnote to the plate,
     where the top of the card is for the plate and the person.
   *
     The dish and the restaurant used to lead this line and no longer do: they
     are up on the subject line under the words, where they can be tapped.
     Printing them twice on one card was the cost of the old arrangement, not a
     feature of it. Price rides here only when there's no photo to wear its
     chip. */
  const bylineParts = [
    relativeTime(post.createdAt),
    post.media.length === 0 ? post.price : null,
  ].filter(Boolean);

  // Reads either vocabulary the `vibe` column has held — "Lively", or "Food"
  // written back out as "Best at food".
  const roomChip = post.vibe ? vibeChip(post.vibe) : null;

  /* Whether the photo leads the card, which decides two things below: where the
     words sit relative to it, and where the author's name is printed.
   *
   * With a photo the plate is what stops the scroll, so it goes first and the
   * handle rides in its top-left corner; the verdict, the words and the dish
   * then read as the caption underneath. With no photo there is nothing to
   * overlay, so the name goes back into the meta row and the card is words the
   * whole way down. The handle is printed once either way. */
  const hasPhoto = post.media.length > 0;

  /* Mutual friends only — a one-directional follow isn't a state this button
     can land in. "Incoming" routes to the account page rather than accepting
     inline, since accepting needs the request's id and this card only ever
     received a friendIds/outgoing summary, not the full request list.
   *
     Resolved to one element up here because the meta row below only exists
     when it has something to hold, and this is one of the two things that
     count. */
  const friendPill = "hidden min-h-9 shrink-0 items-center rounded-full px-3 text-xs font-medium sm:flex";
  const friendControl =
    !currentUserId || isOwner ? null : friendStatus === "none" ? (
      onAddFriend && (
        <button
          type="button"
          onClick={() => onAddFriend(post.userId)}
          className={`${friendPill} bg-pm-charcoal text-white transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange`}
        >
          Add friend
        </button>
      )
    ) : friendStatus === "requested" ? (
      <span className={`${friendPill} bg-pm-grey-tint text-pm-grey-text`}>Request sent</span>
    ) : friendStatus === "incoming" ? (
      <Link
        href="/account"
        className={`${friendPill} bg-pm-orange text-[#F7F4EC] transition-colors hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange`}
      >
        Respond
      </Link>
    ) : (
      <span className={`${friendPill} bg-pm-grey-tint text-pm-grey-text`}>Friends</span>
    );

  return (
    <article
      /* Both lines, in reading order: the words first and the subject line
         after, so the card announces itself as "Crispy crust, spicy honey…,
         hot honey pepperoni pizza at Landini's Pizzeria" rather than as a quote
         from nowhere. The reverse of the pair this used to name, because what
         the person said now leads the card. */
      aria-labelledby={lineDish || lineRestaurant ? `${titleId} ${kickerId}` : titleId}
      className={`overflow-hidden rounded-2xl bg-white ${
        highlighted ? "ring-2 ring-pm-orange" : ""
      }`}
    >
      {/* The plate itself, first, when the post has one — inset from the card
          edge with both radii visible, the same move as the restaurant page's
          hero. Only two things sit on it: the author's handle in the top-left
          corner, and the price chip in the bottom-left. The rating chips that
          used to be here are gone — the verdict lives under the photo now with
          the words it belongs to (rating branches are in the header below, and
          pre-split rows were converted by scripts/backfill-rating-kind.mjs). */}
      {hasPhoto && (
        <div className="relative mx-2.5 mt-2.5 overflow-hidden rounded-xl">
          <PostMediaCarousel
            media={post.media}
            dishName={post.dishName}
            restaurant={post.restaurant}
          />

          {/* Top-left, clear of everything the carousel puts on the photo: the
              slide counter is top-right, the arrows are centred, the dots and
              the price are along the bottom.
           *
           * Straight on the image with no chip under it, which means the halo
           * is doing all the separating — the same answer MapSearch reaches for
           * over the map, and for the same reason: a fill here would be a
           * second white bubble sitting on the plate. Cream rather than pure
           * white to stay in the palette, and the avatar gets the shadow as a
           * filter since text-shadow cannot reach it. */}
          <Link
            href={isOwner ? "/account" : `/u/${post.userId}`}
            aria-label={`View ${post.authorName}'s profile`}
            className="absolute left-2.5 top-2.5 flex max-w-[calc(100%-5rem)] items-center gap-2 rounded-full text-[#F7F4EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <span className="shrink-0 [filter:drop-shadow(0_1px_5px_rgba(0,0,0,0.85))]">
              <Avatar name={post.authorName} url={post.authorAvatarUrl} bg={palette.avatarBg} />
            </span>
            <span className="truncate font-mono text-xs font-medium [text-shadow:0_1px_7px_rgba(0,0,0,0.95),0_0_3px_rgba(0,0,0,0.7)]">
              {handleFor(post.authorName)}
            </span>
            {/* Plate points ride with the name, here and in the meta row — they
                say who this is as much as the handle does. */}
            <PointsBadge points={post.authorPoints} tone="photo" className="shrink-0" />
          </Link>

          {post.price && (
            <div className="pointer-events-none absolute bottom-2.5 left-2.5">
              <span className="rounded-full bg-white/95 px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-zinc-700">
                {post.price}
              </span>
            </div>
          )}
        </div>
      )}

      <header className={hasPhoto ? "px-4 pt-3" : "px-4 pt-4"}>
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
          {/* 42px, double what it was, with the scale named under it. At 21px
              it read as a footnote to the headline it shares a line with —
              this number is the post's verdict, so it now outweighs the
              headline rather than annotating it. The label is there because a
              bare percent beside a price is the one place this scale is
              genuinely ambiguous; `items-baseline` on the row still lands the
              numeral's baseline on the headline's first line, since a flex
              column aligns on its own first baseline. */}
          {post.rating !== undefined && post.ratingKind === "dish" && (
            <span className="flex shrink-0 flex-col items-end">
              <span
                data-heat={heatFor(post.rating)}
                /* The tier picks the pair of stops; --heat spreads them as the
                   number climbs past 85, and --chill drains them toward the
                   warm grey as it falls from 60 to 40. See heatRamp/chillRamp
                   — the two ranges do not overlap, so the middle of the scale
                   is painted by the tier alone, exactly as before. */
                style={
                  {
                    "--heat": heatRamp(post.rating),
                    "--chill": chillRamp(post.rating),
                  } as CSSProperties
                }
                className={`pct-heat font-mono text-[42px] font-bold leading-none tabular-nums ${
                  isPerfect(post.rating) ? "pct-shine" : ""
                }`}
              >
                {post.rating}%
              </span>
              <span className="mono-label mt-1 text-pm-orange-text">Rating</span>
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

        {/* The subject line: what was eaten, and where.
         *
         * The two names wear different clothes on purpose, and the split is the
         * one DESIGN.md already draws — a name used as a *title* sets in
         * Fraunces, a name used as a *compact reference to a record* sets in
         * mono. The dish is this post's title; the restaurant is a record it
         * points at. So the dish keeps the display face and the accent, and the
         * restaurant drops to mono at the muted step, with a hairline @ between
         * them. Two proper names two inches apart otherwise read as one name.
         *
         * --pm-orange-text, not --pm-orange: at 15px this is body-sized type and
         * only the darker accent token clears 4.5:1.
         *
         * `min-w-0 truncate` on each name rather than on the row, so two long
         * ones share the width instead of the restaurant being clipped off the
         * end entirely. */}
        {(lineDish || lineRestaurant) && (
          <p id={kickerId} className="mt-1.5 flex min-w-0 items-baseline gap-x-2">
            {lineDish &&
              (dishHref ? (
                <Link
                  href={dishHref}
                  className="min-w-0 truncate rounded-sm font-display text-[15px] font-semibold leading-tight text-pm-orange-text transition-colors hover:text-pm-orange hover:underline hover:underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  {lineDish}
                </Link>
              ) : (
                <span className="min-w-0 truncate font-display text-[15px] font-semibold leading-tight text-pm-orange-text">
                  {lineDish}
                </span>
              ))}

            {/* The word, not an `@`.
             *
                An `@` reads as a handle in this app and nowhere else — it is
                how every byline, every comment author and every profile link
                names a *person*. Putting one between a dish and a restaurant
                would be the second meaning of a mark that already has exactly
                one, on a card that prints the real kind three rows down.
             *
                Sans, because it is the one word on this line a person would
                say rather than a name or a machine value — DESIGN.md's split by
                authorship, applied to a two-letter word. */}
            {lineDish && lineRestaurant && (
              <span className="shrink-0 text-[13px] text-zinc-500">at</span>
            )}

            {lineRestaurant &&
              (restaurantHref ? (
                <Link
                  href={restaurantHref}
                  className="min-w-0 truncate rounded-sm font-mono text-[12px] font-medium text-zinc-500 transition-colors hover:text-zinc-900 hover:underline hover:underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  {lineRestaurant}
                </Link>
              ) : (
                <span className="min-w-0 truncate font-mono text-[12px] font-medium text-zinc-500">
                  {lineRestaurant}
                </span>
              ))}
          </p>
        )}

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

        {/* Only when there is something to put in it. With the handle and the
            points on the photo, the restaurant and the time at the foot of the
            card and the options button down in the action row, a photo post
            that isn't trending has nothing left for this line — and an empty
            24px row under the words is exactly the gap that made the card read
            as half air. */}
        {(!hasPhoto || trending || friendControl) && (
          <div className="mt-1.5 flex items-center gap-2">
            {/* Name and points only when they aren't already on the photo. */}
            {!hasPhoto && (
              <>
                <Link
                  href={isOwner ? "/account" : `/u/${post.userId}`}
                  aria-label={`View ${post.authorName}'s profile`}
                  className="flex min-w-0 items-center gap-2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  <Avatar name={post.authorName} url={post.authorAvatarUrl} bg={palette.avatarBg} />
                  <span className="truncate font-mono text-xs font-medium text-zinc-900">
                    {handleFor(post.authorName)}
                  </span>
                </Link>
                <PointsBadge points={post.authorPoints} className="shrink-0" />
              </>
            )}

            {trending && (
              <span
                className="flex shrink-0 items-center gap-1 rounded-full bg-pm-grey-tint py-0.5 pl-1.5 pr-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-pm-grey-text"
                title="Trending right now"
              >
                <FlameIcon className="h-3 w-3" />
                Hot
              </span>
            )}

            {friendControl && <div className="ml-auto shrink-0">{friendControl}</div>}
          </div>
        )}
      </header>

      {/* The verdict on the left, everything you can do about it on the
          right. PostActions owns that split itself; the options menu is added
          on the end of it here rather than kept on a line of its own, where a
          44px button was costing a whole row to say nothing.
       *
       * Barely any padding of its own: its buttons are min-h-11 for the tap
       * target, and that 44px is already most of a row's worth of air around
       * a 19px icon. */}
      <div className="flex items-center gap-1 px-4 pb-0.5 pt-0.5">
        <div className="min-w-0 flex-1">
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

        {/* Where and when, last — the footnote to the plate rather than part of
            the byline. Mono because it is a proper name and a machine value,
            zinc-500 because this is a white card and --pm-grey-text is the
            cream-ground token. */}
        {bylineParts.length > 0 && (
          <p className="mt-2.5 truncate font-mono text-xs text-zinc-500">
            {bylineParts.join(" · ")}
          </p>
        )}
      </div>
    </article>
  );
}
