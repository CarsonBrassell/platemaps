"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { heatFor, heatRamp, HEAT_RAMP_FLOOR } from "@/components/post/PercentMeter";
import Link from "next/link";
import { PostMediaCarousel } from "@/components/feed/PostMediaCarousel";
import { PostActions, type VoteDirection } from "@/components/feed/PostActions";
import { StarRating } from "@/components/StarRating";
import { MoreIcon, FlagIcon, EyeOffIcon, FlameIcon, CloseIcon } from "@/components/icons";
import { relativeTime } from "@/lib/format";
import { tagAccent } from "@/data/foodTags";
import { amenityEmoji, vibeChip } from "@/data/reviewScales";
import type { Post } from "@/components/feed/types";

/**
 * The feed's post card, phone version.
 *
 * A fork of `FoodPostCard` for routing only: every link in the web card leaves
 * the /m tree, and its friend control is `sm:flex`, so it would render in the
 * 390px desktop preview and never on a real handset.
 *
 * ## The card leads with what the person said
 *
 * Both cards read the same way now, top-down:
 *
 * ```
 * Crispy edges, the sauce is the       ← the review, sans semibold, clamped to 3
 * whole point, would order twice…  88%   · mono rust score, hard right
 * Hamachi crudo at Kettner Exchange    ← the dish in Fraunces rust, the place in
 *                                        mono muted — both links
 * @mayaellis · 2h ago · Little Italy   ← mono, muted, machine values only
 * ```
 *
 * This card used to lead with the restaurant instead, on the argument that a
 * feed of plates is a list of places and the name is the thing you scan for.
 * What that arrangement cost was the sentence: the review sat two rows down in
 * grey regular, which is where a card puts what nobody is expected to read. A
 * feed of plates is a feed of opinions — "crispy edges, the sauce is the whole
 * point" is why you stop scrolling — and the plate it is about is the caption
 * to that, not the other way round.
 *
 * The two names then become one line rather than two stacked ones, because what
 * a plate *is* and where it was are one fact. See the note on that line for why
 * they wear different faces and why the joint is the word "at" and never an
 * `@`.
 *
 * The scan-for-a-name argument is not wrong, it is just answered somewhere
 * else: /m is the discover screen, and its cards are the list of places.
 *
 * ## The photo runs full width, on every card
 *
 * A post with a photo leads with it at 16:9 above the text — the web card's
 * shape, and now this one's too. There used to be two treatments: the first
 * card in the list ran its photo full width and every card below it took a 96px
 * left thumbnail, so a screenful held four or five plates instead of one and a
 * half. Density is not what this feed is for. The photo *is* the plate, and at
 * 96px in a column beside the text it stopped being the thing you scroll for —
 * a feed of food that shows the food the size of a favicon is a list, not a
 * feed. A post with no photo is the same block with nothing above it, so
 * nothing here branches on a flag any more.
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
 *
 * ## The underline is on hover, not at rest
 *
 * Both refs on this card were underlined at rest and are not any more: a
 * screenful of cards each carrying two ruled names read as a page of links
 * rather than as a feed. Colour and voice carry the affordance instead — the
 * dish is the only rust-coloured thing in the block, the restaurant the only
 * mono one — and the rule appears under the cursor.
 *
 * The cost is stated plainly because it is real and it is the argument the rest
 * underline was put here for: **a handset has no hover state**, so on the device
 * this component is named for, nothing marks either name as tappable until it is
 * tapped. That is a deliberate call, not an oversight. If it turns out to cost
 * taps, the fix is a rest-state mark that is quieter than a full rule — the
 * dotted `decoration-dotted` variant, or a colour shift — rather than putting
 * the solid underline back on every card.
 */
function RestaurantRef({ post, className = "" }: { post: Post; className?: string }) {
  const name = post.restaurant;
  if (!name) return null;
  const id = restaurantIdFor(post);
  if (!id) return <span className={className}>{name}</span>;
  return (
    <Link
      href={`/m/restaurant/${id}`}
      className={`rounded-sm transition-colors hover:underline hover:underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${className}`}
    >
      {name}
    </Link>
  );
}

/**
 * Which restaurant this post is allowed to link at.
 *
 * `restaurantId` is what the composer wrote — the author's own claim about
 * which place this was. `placeId` is `resolvePostRefs` matching a typed name
 * against the corpus: good enough to fall back to, but a guess, so the author's
 * answer wins. Null when neither resolves, which is the case `RestaurantRef`
 * turns into plain text rather than a tap that lands on a 404.
 */
function restaurantIdFor(post: Post): string | undefined {
  return post.restaurantId ?? post.placeId;
}

/**
 * The dish, as a link that opens it on the restaurant's screen — the `?dish=`
 * deep link `PhoneDetailScreen` already reads, and the same one the map's
 * bubbles use.
 *
 * Two ways this degrades, both deliberate. With no `dishId` — `posts.dish_name`
 * is free text and only resolves when it matches a line on the menu — it still
 * links to the restaurant, since landing on the place with no sheet open beats
 * a dead word. With no restaurant at all it is plain text, for the same reason
 * the name above it is.
 */
function DishRef({ post, className = "" }: { post: Post; className?: string }) {
  const name = post.dishName;
  if (!name) return null;
  const id = restaurantIdFor(post);
  if (!id) return <span className={className}>{name}</span>;
  return (
    <Link
      href={post.dishId ? `/m/restaurant/${id}?dish=${post.dishId}` : `/m/restaurant/${id}`}
      className={`rounded-sm transition-colors hover:underline hover:underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${className}`}
    >
      {name}
    </Link>
  );
}

type SharedCardProps = {
  post: Post;
  currentUserId: string | null;
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
  const reviewRef = useRef<HTMLHeadingElement>(null);
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
   * Measured, not guessed from a character count. The count was tried while
   * the card had two widths to serve — 358px full width, ~254px beside a
   * thumbnail — and no single threshold was right for both: the one that
   * stopped a long review being silently truncated on the narrow card printed
   * an inert "Show more" under a three-line review on the wide one. The
   * thumbnail is gone and the text is always 358px now, but the measurement
   * stays: `scrollHeight` against `clientHeight` asks the question the button
   * is actually about, and a character count never does at any width.
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

  /* What the person said is the headline, and the subject line underneath names
     the plate and the place. Same restack the web card carries — see the header
     comment for what this replaced and why both cards now do it.

     The fallback is the only case where a name leads: a post with no words has
     no headline, so the dish (or failing that the restaurant) is promoted into
     the slot. Whichever name goes up is then dropped from the line below rather
     than printed twice. */
  const headline = words ?? post.dishName ?? post.restaurant ?? "A plate worth sharing";
  const lineDish = headline === post.dishName ? null : post.dishName;
  const lineRestaurant = headline === post.restaurant ? null : post.restaurant;

  const titleId = `post-${post.id}-title`;
  const subId = `post-${post.id}-dish`;

  /** Every photo runs full width — see the header note. */
  const showsHero = post.media.length > 0;

  // Reads either vocabulary the `vibe` column has held — "Lively", or "Food"
  // written back out as "Best at food".
  const roomChip = post.vibe ? vibeChip(post.vibe) : null;

  /* The byline: handle, time, distance, and nothing else. Every part is a
     machine value, so all of it is mono (DESIGN.md's type split), and
     `locationLabel` stands in for a distance nobody has measured — see the
     `distance` prop.
   *
   * Three parts is not a stylistic limit, it is the width.
   * "@samwhitaker · 5d ago · 6.2 miles away" already measures ~250px at 11px
   * mono, against 358px of card. A fourth segment, or a chip parked at the end
   * of the row, truncates the distance off every card in the feed — which is
   * how the price and the points badge lost their place here. The row was
   * ~254px back when a thumbnail took the left of it, so it has more room now,
   * not a reason to refill it. */
  const bylineTail = [
    relativeTime(post.createdAt),
    distance ?? post.locationLabel ?? null,
  ].filter(Boolean) as string[];

  const authorHref = isOwner ? "/m/account" : `/m/u/${post.userId}`;
  const authorLabel = isOwner ? "View your profile" : `View ${post.authorName}'s profile`;

  return (
    <article
      /* Headline first, then the subject line — the order they are read in, and
         the reverse of the pair this used to name, since what the person said
         now leads the card. */
      aria-labelledby={lineDish || lineRestaurant ? `${titleId} ${subId}` : titleId}
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

      {/*
        The text block, under the photo when there is one and alone when there
        isn't. It is one column at full card width — the thumbnail that used to
        take the left of this row is gone (header note) and nothing replaced it.
       *
        Where the *number* sits inside that column is worth writing down,
        because two other arrangements were tried and both failed for reasons
        that are easy to re-derive wrongly.
       *
        This used to be a three-column row — thumb, text, number — with the
        number pinned to the top right. That was correct while the top of the
        text column held a restaurant's *name*: a name is short, and the number
        beside it made a column a screenful could be read straight down. It
        stopped being correct the moment that slot held a sentence. Measured on
        a 390px handset: a card with no thumbnail gave its text 229px, a
        thumbnailed one gave the same text 123px — about eleven characters a
        line, so the three-line preview showed twenty-odd characters of someone's
        review before "Show more".
       *
        Floating the number so the text wraps around it does not work, and the
        reason is worth stating so it is not tried a third time: the headline
        has to be clamped, every way of clamping a box sets `overflow` or
        `display: -webkit-box`, and both make the box a formatting-context root
        — which is precisely a box that *avoids* floats instead of flowing
        around them. The clamped headline was still 123px wide with the floats
        in place.
       *
        So the number moved down one row instead, onto the subject line, and the
        headline gets the whole column. The cost is that the number's distance
        from the top of the card now varies with how long the review is, which
        is a real loss against the old straight-down read — paid because a feed
        of opinions has to make the opinion legible first, and because a 38px
        orange numeral is not hard to find.
      */}
      <div className={`px-4 ${showsHero ? "pt-3" : "pt-4"}`}>
        <div className="min-w-0">
          {/* What the person said, and it is the headline now, across the whole
              column — see the note on the row above for why the number is no
              longer beside it.
           *
              Sans, not Fraunces: this slot held the restaurant's name and a
              name is a proper noun, but a review is prose, and DESIGN.md splits
              the voices by who wrote the text rather than by which slot it
              lands in. It is the one thing on this card that is not a name or a
              number.
           *
              16px semibold, not the web card's 22: at 22px a three-line clamp
              spends ~130px of card height before the plate is named, on a card
              that has already spent a 16:9 photo getting here. The weight is
              what makes this the headline at this size, not the scale. */}
          <h3
            id={titleId}
            ref={words ? reviewRef : undefined}
            className={`text-[16px] font-semibold leading-snug text-zinc-900 ${
              expanded ? "" : "line-clamp-3"
            }`}
          >
            {headline}
          </h3>

          {words && (clamped || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="min-h-11 text-xs font-medium text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}

          {/* The plate and the number, on one row: what it was, where it was,
              and what it scored. The subject line takes whatever the verdict
              leaves — `min-w-0` so a long restaurant name wraps inside it
              instead of pushing the number off the card. */}
          <div className={`flex items-start justify-between gap-2.5 ${words ? "mt-1" : "mt-0.5"}`}>
            <div className="min-w-0 flex-1">
              {/* The subject line: the dish in the accent, then the restaurant.
               *
                  Both are links — the dish opens its sheet on the restaurant's
                  screen, the place opens the screen itself — and they wear
                  different clothes on purpose. The split is DESIGN.md's own: a
                  name used as a *title* sets in Fraunces, a name used as a
                  *compact reference to a record* sets in mono. The dish is this
                  post's title; the restaurant is a record it points at.
               *
                  The word "at", never an `@`. In this app an `@` means a person
                  and nothing else — it is how the byline one row down names one.
               *
                  Inline rather than flex, and wrapping rather than truncating:
                  at this width a dish and a restaurant often do not share a
                  line, and clipping both to force them onto one would lose the
                  halves that identify them. */}
              {(lineDish || lineRestaurant) && (
                <p id={subId} className="leading-snug">
                  {lineDish && (
                    <DishRef
                      post={post}
                      className="font-display text-[13px] font-semibold text-pm-orange-text"
                    />
                  )}
                  {lineDish && lineRestaurant && (
                    <span className="text-[12px] text-zinc-500"> at </span>
                  )}
                  {lineRestaurant && (
                    <RestaurantRef
                      post={post}
                      className="font-mono text-[12px] font-medium text-zinc-500"
                    />
                  )}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-start gap-1.5">
            {/* Trending rides with the verdict rather than at the end of the
                byline: parked there it cost ~66px of a 254px row and truncated
                the distance off the three hottest plates in the feed.
             *
             * Glyph only, no "HOT" — the word cost another 46px of a column
             * that has little to spare. The label is still announced, it just
             * isn't drawn. */}
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
                  web card wears: this is squarely the "large/bold numeral"
                  case --pm-orange is for, and one card in a scanned column
                  reading grey-brown because it scored 38 breaks the column.
               *
               * 38px, double what it was. At the old 19px it sat level with
               * the price beneath it and read as one more machine value in a
               * stack of them; the number *is* the post's verdict, so it now
               * outweighs everything else in the row. The RATING label under
               * it answers "percent of what" — a bare percent next to a price
               * is the one place this scale is genuinely ambiguous. */}
              {post.rating !== undefined && post.ratingKind === "dish" && (
                <>
                  {/* Flat rust below the ramp's floor, gradient above it. The
                      original objection to the web card's heat gradient down
                      here still stands and is why the floor matters: a column
                      of cards where one reads grey-brown because it scored 38
                      breaks the column. Nothing below 85 is painted any
                      differently than before — only the top of the scale opens
                      up, and it opens further the higher the number goes. */}
                  <span
                    data-heat={heatFor(post.rating)}
                    style={{ "--heat": heatRamp(post.rating) } as CSSProperties}
                    className={`font-mono text-[38px] font-bold leading-none tabular-nums ${
                      post.rating > HEAT_RAMP_FLOOR ? "pct-heat" : "text-pm-orange"
                    }`}
                  >
                    {post.rating}%
                  </span>
                  <span className="mono-label mt-0.5 text-pm-orange-text">Rating</span>
                </>
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
        </div>

          {/* The byline owns its whole row, below the subject line rather than
              beside it. Nothing is allowed to sit next to it — see `bylineTail`,
              which has three machine values to spend ~220px on and needs all of
              it. Sharing the subject line's column left it ~138px and truncated
              the distance off every card, which is the exact failure that
              comment was written about. */}
          <p className="mt-1 truncate font-mono text-[11px] tabular-nums text-zinc-500">
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
          it rather than kept on a line of its own. */}
      <div className="flex items-center gap-1 px-4 pb-0.5 pt-1">
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
