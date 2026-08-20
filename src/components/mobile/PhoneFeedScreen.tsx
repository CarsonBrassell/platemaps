"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { usePostFeed } from "@/components/feed/usePostFeed";
import { CommentsScreen } from "@/components/feed/CommentsScreen";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { OfflineBanner, EndOfFeed } from "@/components/feed/EmptyFeedState";
import { UtensilsIcon, CompassIcon, WifiOffIcon, PlusIcon } from "@/components/icons";
import type { FeedTab, Post } from "@/components/feed/types";
import { FeedSortSwitch } from "@/components/feed/FeedSortSwitch";
import { FEED_SORT_DEFAULT, type FeedSort } from "@/lib/feedSort";
import { PhoneFeedHeader } from "./PhoneFeedHeader";
import { PhoneFeedSearch } from "./PhoneFeedSearch";
import { PhoneFeedTabs } from "./PhoneFeedTabs";
import { PhoneFeedPostCard } from "./PhoneFeedPostCard";
import { PhoneFeedMapPanel } from "./PhoneFeedMapPanel";

/**
 * The feed, phone version.
 *
 * The data layer is the web feed's, unchanged and unforked: the same
 * `/api/posts/discover` and `/api/posts/friends` routes behind the same
 * `usePostFeed` hook, so optimistic voting, hearts, saves, comments, deletes
 * and the three-state vote arithmetic all live in exactly one place. If this
 * screen and `/feed` ever disagree about what an upvote does, the bug is that
 * someone forked the hook.
 *
 * What is phone-shaped is above the cards, and it is three decisions:
 *
 * - **The map is a tab, and it is the only screen here that does not scroll.**
 *   The three tabs are the web's three. The map fills the frame between the tabs
 *   and the nav's reserved space instead of standing at the web's fixed 540px —
 *   see the layout note on the root element below, and PhoneFeedMapPanel for
 *   how that height reaches a component whose container is `h-[540px]`.
 * - **No saved view.** The web feed reaches it through `?view=saved`, which is
 *   a leftover from the archived side rail; on the phone the profile tab is the
 *   obvious home for it and the nav already points there.
 * - **No leaderboard.** The web feed does not render one either — its `<aside>`
 *   was removed and `Leaderboard.tsx` currently has no importer — so there is
 *   nothing here to compress into an entry point. Adding one would be inventing
 *   a surface the product doesn't have, and it would have to link to an /m
 *   screen that doesn't exist.
 *
 * Signed out mirrors `/feed` exactly: no wall. Discover renders for everybody
 * (`getDiscoverFeed` takes a null viewer), the friend feed returns an empty
 * list rather than an error, every action prompts to sign in instead of being
 * disabled, and the sign-in doorway is /m/account.
 */
export function PhoneFeedScreen() {
  const { account, isSignedIn } = useAuth();

  /* The feed is the launch view, matching `/feed` — see PhoneFeedTabs for the
     order and for what the map costs a visitor who never opens it. Everything
     downstream already handles every tab; the only thing this line changes is
     which one you land on. */
  const [tab, setTab] = useState<FeedTab>("discover");
  /* Discover's ordering — its own state for the same reason `mapSource` below
     has its own: leaving the feed for another tab and coming back must not
     silently reset how you had it sorted. */
  const [sort, setSort] = useState<FeedSort>(FEED_SORT_DEFAULT);
  const [reloadKey, setReloadKey] = useState(0);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  /* Set by the search FAB on the card tabs — see PhoneFeedSearch's onSearch.
     A restaurant name, not a query object: this narrows the list already on
     screen rather than asking the server a new question, so it clears the
     moment the term does. */
  const [restaurantFilter, setRestaurantFilter] = useState("");
  /* Which feed backs the map's bubbles — its own switch, independent of `tab`,
     so leaving the map for another feed and coming back doesn't reset which one
     you had picked. Lives here rather than in the panel because it also decides
     which endpoint the screen reads. */
  const [mapSource, setMapSource] = useState<"discover" | "friends">("discover");

  /* The post a map bubble asked to open, once it is on screen. Cleared after a
     beat — see the effect below. */
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /* Two genuinely different queries, not one list sliced client-side: Discover
     is server-ranked and photo-gated, the friend feed is an audience filter
     with no ranking at all. The map draws whichever of the two its own switch
     points at, which is the same rule `/feed` follows.

     The sort rides only the Discover tab. The map reads the same endpoint but
     is not a list you scroll, so re-ranking its bubbles under a control it
     doesn't show would change what's on screen for no visible reason. */
  const endpoint =
    tab === "friends" || (tab === "map" && mapSource === "friends")
      ? "/api/posts/friends"
      : tab === "discover"
        ? `/api/posts/discover?sort=${sort}`
        : "/api/posts/discover";

  const {
    posts,
    loadError,
    offline,
    banner,
    setBanner,
    reactPoints,
    commentReactPoints,
    vote: handleVote,
    heart: handleHeart,
    save: handleSave,
    comment: handleComment,
    voteComment: handleVoteComment,
    remove: handleDelete,
    share: handleShare,
  } = usePostFeed({ endpoint, reloadKey });

  /* The flame is a Discover-only signal. Friends is explicitly not an
     engagement-ranked feed, so flaming a card there would contradict the
     surface it is shown on. Net score, the same number the card prints — a
     plate with 12 ups and 11 downs is an argument, not a hot plate. */
  const trendingIds = useMemo(() => {
    if (!posts || tab !== "discover") return new Set<string>();
    const net = (p: Post) => p.upvoteCount - p.downvoteCount;
    return new Set(
      [...posts]
        .filter((p) => net(p) >= 3)
        .sort((a, b) => net(b) - net(a))
        .slice(0, 3)
        .map((p) => p.id),
    );
  }, [posts, tab]);

  const activePost = commentsPostId
    ? (posts?.find((p) => p.id === commentsPostId) ?? null)
    : null;

  /* Filters the loaded list in place rather than re-querying: the point is to
     let someone see every post about one restaurant instead of one, not to
     ask the server a different question. Matches `dishName` too — "what has
     everyone said about the carbonara" is the same kind of search. */
  const visiblePosts = useMemo(() => {
    if (!posts || !restaurantFilter) return posts;
    const q = restaurantFilter.trim().toLowerCase();
    return posts.filter(
      (p) => p.restaurant?.toLowerCase().includes(q) || p.dishName?.toLowerCase().includes(q),
    );
  }, [posts, restaurantFilter]);

  /**
   * A map bubble asking to open its post.
   *
   * On the web this is a `router.push("/feed?post=<id>")`, which lands on the
   * page you are already looking at and is read back out of the URL. Here the
   * destination screen *is* this one, so the same thing happens without a
   * navigation: leave the map for the list the bubble was drawn from, and mark
   * the card. Keeping it out of the URL also keeps this page free of
   * `useSearchParams` and the Suspense boundary that would come with it — the
   * same call `src/app/m/feed/page.tsx` documents.
   */
  const openPost = useCallback(
    (postId: string | null) => {
      setTab(mapSource);
      setHighlighted(postId);
    },
    [mapSource],
  );

  /* Scroll the marked card into view once the list it lives in has rendered,
     then let the ring fade off it. The `some()` guard is what makes this wait:
     switching from the map to the friend feed re-fetches, so the post the
     bubble named is not in `posts` on the first pass. */
  useEffect(() => {
    if (!highlighted || !posts?.some((p) => p.id === highlighted)) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scroll = setTimeout(() => {
      postRefs.current[highlighted]?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
    }, 150);
    const clear = setTimeout(() => setHighlighted(null), 3000);
    return () => {
      clearTimeout(scroll);
      clearTimeout(clear);
    };
  }, [highlighted, posts]);

  const showMap = tab === "map";

  /*
   * Lock the document while the map is up.
   *
   * The map screen is exactly viewport-height, so there is nothing to scroll —
   * but iOS Safari rubber-bands the document anyway on a downward drag, and the
   * bounce pulls the cream page background up under a map that is meant to run
   * to the bottom edge. The class is what `phone.css` hangs `overflow: hidden`
   * and `overscroll-behavior: none` off.
   *
   * On <html> rather than <body> because Safari honours the property there;
   * removed on cleanup so leaving the map — by tab, by nav, or by unmount —
   * always gives the page its scroll back. Every exit runs the cleanup, so
   * there is no path that strands the app unscrollable.
   */
  useEffect(() => {
    if (!showMap) return;
    const root = document.documentElement;
    root.classList.add("pm-lock-scroll");
    return () => root.classList.remove("pm-lock-scroll");
  }, [showMap]);

  return (
    /*
     * Two layouts, one screen.
     *
     * The card tabs scroll: `min-h-dvh`, and `.pm-phone-content` already carries
     * `padding-bottom: var(--phone-nav-space)` so the last card clears the nav.
     *
     * The map does not scroll — a map inside a scroller is a gesture fight — so
     * on that tab the screen is locked to exactly the height the nav leaves it
     * and the map takes whatever is left under the header and tabs. The height
     * subtracts the *same* `--phone-nav-space` the content padding adds, so the
     * two sum to 100dvh and nothing here pads the bottom a second time. On the
     * desktop frame that dvh is the 390px shell's own height (phone.css sets it
     * to 100dvh and clips), so this measures the frame, not the monitor.
     */
    <div
      className={
        showMap
          ? /* Full bleed to the bottom of the screen, with the nav floating on
               top of the map rather than sitting under it on a cream strip.
               Two things make that work:

               `h-dvh` — the whole viewport, NOT the viewport minus the nav.
               The map runs behind the nav and is visible around it.

               The negative bottom margin cancels `.pm-phone-content`'s
               `padding-bottom: var(--phone-nav-space)`, which every other
               screen needs (it is what stops a last card hiding under the nav)
               and this one must undo, or the reserved strip would push these
               100dvh up by its own height and reintroduce the gap. Cancelling
               it here rather than removing it from the shell keeps the rule
               correct for the scrolling screens that depend on it. */
            "flex h-dvh flex-col mb-[calc(-1*var(--phone-nav-space))]"
          : "min-h-dvh"
      }
    >
      {/*
        Scrolls away rather than sticking, the same call the discover screen
        makes: a 390px screen has roughly 640 usable points of height and the
        nav already owns the bottom ~96 of them. The nav is the thing that has
        to stay reachable, and it does.
      */}
      {/* No subtitle. The header is the title, the search and the avatar, and
          nothing else — the reference design gives the count no room, and it
          was buying a line of vertical space on a screen whose whole job is to
          show the map underneath. `PhoneFeedHeader` still takes a `subtitle`
          for the screens that want one. */}
      <PhoneFeedHeader />

      {/* Tabs get the row to themselves; the sort and search share the next
          one. All three on one row is what this was, and it did not fit — the
          tabs measure 182px and the sort switch 153px inside 343px of usable
          width, so they were already 3px over before search asked for 36 more.
          Both rows below the tabs are modifiers on the feed the tabs pick,
          which is also why they wear rank 3 and the tabs wear rank 2. */}
      <div className="px-4">
        <PhoneFeedTabs active={tab} onChange={setTab} />
      </div>

      {/* Search owns this row and takes the sort switch as its left half — see
          PhoneFeedSearch for why the two rows it spans have to live in one
          component. On the card tabs a search narrows the list already on
          screen (onSearch); the map tab gets no onSearch, so it keeps sending
          you to Discover — there's no list there to narrow. */}
      <div className="mt-0.5">
        <PhoneFeedSearch
          leading={tab === "discover" ? <FeedSortSwitch active={sort} onChange={setSort} /> : null}
          onSearch={showMap ? undefined : setRestaurantFilter}
        />
      </div>

      {/* On the map tab this row is usually empty, and an empty row with
          padding is 8px of cream between the tabs and a map that is supposed to
          run edge to edge. So the padding is spent only when there is something
          to put in it. The card tabs always want it — the list lives in here. */}
      <div className={showMap ? (offline || banner ? "px-4 pt-2" : "") : "px-4 pt-2"}>
        {offline && <OfflineBanner />}

        {banner && (
          <p
            role="status"
            className="mb-3 rounded-xl bg-pm-orange-tint px-4 py-2.5 text-sm font-medium text-pm-orange-text"
          >
            {banner}
          </p>
        )}

        {!showMap && posts !== null && posts.length > 0 && restaurantFilter && (
          /* Only shown once there's something to narrow — the filter chip
             would otherwise flash past on a still-loading or empty feed. */
          <p className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-pm-orange-tint px-4 py-2.5 text-sm font-medium text-pm-orange-text">
            <span className="truncate">Posts about &ldquo;{restaurantFilter}&rdquo;</span>
            <button
              type="button"
              onClick={() => setRestaurantFilter("")}
              className="shrink-0 font-mono text-xs font-semibold uppercase tracking-wide underline underline-offset-2"
            >
              Clear
            </button>
          </p>
        )}

        {showMap ? null : posts === null ? (
          <FeedSkeleton count={2} />
        ) : loadError && posts.length === 0 ? (
          <PhoneFeedState
            icon={<WifiOffIcon className="h-6 w-6" />}
            title="Couldn't load the feed"
            body="Something went wrong reaching PlateMaps. Your connection may have dropped."
            action={
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className={PRIMARY}
              >
                Try again
              </button>
            }
          />
        ) : posts.length === 0 ? (
          tab === "friends" ? (
            <PhoneFeedState
              icon={<CompassIcon className="h-6 w-6" />}
              title="Your friends feed is quiet"
              body={
                isSignedIn
                  ? "Add a few friends whose taste you trust and their plates will land here."
                  : "Sign in to add friends and build a feed of the eaters you actually trust."
              }
              action={
                isSignedIn ? (
                  <Link href="/m/friends" className={PRIMARY}>
                    Find friends
                  </Link>
                ) : (
                  <Link href="/m/account" className={PRIMARY}>
                    Sign in
                  </Link>
                )
              }
            />
          ) : (
            <PhoneFeedState
              icon={<UtensilsIcon className="h-6 w-6" />}
              title="No plates yet"
              body="No one has posted around here today. Be the first and pick up the points."
              action={
                <Link href="/m/post" className={PRIMARY}>
                  <PlusIcon className="h-4 w-4" />
                  Post a plate
                </Link>
              }
            />
          )
        ) : visiblePosts && visiblePosts.length === 0 ? (
          <PhoneFeedState
            icon={<CompassIcon className="h-6 w-6" />}
            title="No posts match"
            body={`No one has posted about "${restaurantFilter}" here yet.`}
            action={
              <button type="button" onClick={() => setRestaurantFilter("")} className={PRIMARY}>
                Clear search
              </button>
            }
          />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {(visiblePosts ?? []).map((post, index) => {
                /* Split at the call site rather than passed as a string: the
                   card's props are a union on `surface`, so the vote handler
                   and the heart handler cannot both reach one card — the
                   guarantee the two feeds depend on. */
                const shared = {
                  post,
                  /* Only the top of the list runs its photo full width. Below
                     the fold a 16:9 photo per card means a screenful holds one
                     and a half plates; the thumbnail treatment holds four or
                     five. Index rather than a flag on the post: this is a
                     position in a list, not a property of the plate. */
                  featured: index === 0,
                  currentUserId: account?.id ?? null,
                  onSave: handleSave,
                  onShare: handleShare,
                  onOpenComments: setCommentsPostId,
                  onDelete: handleDelete,
                  onRequireSignIn: () => setBanner("Sign in to join in — it takes a second."),
                };
                return (
                  /* The wrapper exists so a card arrived at from a map bubble
                     can be scrolled to and marked. `PhoneFeedPostCard` takes no
                     `highlighted` prop (the web card does) — the ring is drawn
                     on this box instead, at the card's own radius, which needs
                     nothing from the card and so cannot drift from it. */
                  <div
                    key={post.id}
                    ref={(el) => {
                      postRefs.current[post.id] = el;
                    }}
                    className={
                      post.id === highlighted
                        ? "rounded-2xl ring-2 ring-pm-orange transition-shadow motion-reduce:transition-none"
                        : "rounded-2xl transition-shadow motion-reduce:transition-none"
                    }
                  >
                    {tab === "friends" ? (
                      <PhoneFeedPostCard {...shared} surface="friends" onReact={handleHeart} />
                    ) : (
                      <PhoneFeedPostCard
                        {...shared}
                        surface="discover"
                        trending={trendingIds.has(post.id)}
                        reactPoints={reactPoints[post.id] ?? null}
                        onVote={handleVote}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <EndOfFeed />
          </>
        )}
      </div>

      {showMap && (
        /* The map's slot: everything the header, the tabs and the banner row
           left over. `min-h-0` is what makes `flex-1` able to shrink — without
           it the map's own content would set a floor and push the bottom of the
           frame under the nav.

           No padding at all, unlike the card tabs' 16px gutters: the map runs
           edge to edge. It still stops above the nav, because the wrapper's
           height already subtracts `--phone-nav-space` — that clearance is
           bought once, up there, and must not be paid for again here. */
        <div className="min-h-0 flex-1">
          <PhoneFeedMapPanel
            posts={posts}
            source={mapSource}
            onSourceChange={setMapSource}
            isSignedIn={isSignedIn}
            onVote={handleVote}
            onHeart={handleHeart}
            onOpenPost={openPost}
          />
        </div>
      )}

      {/* The shared comments screen, reused whole. It is `Dialog`'s `screen`
          variant — a full-viewport destination with its own back arrow, which
          is already the phone shape; the thread building, the collapse rails
          and the reply composer are 600 lines that must not be forked to
          change a layout that doesn't need changing. */}
      {activePost && (
        <CommentsScreen
          post={activePost}
          currentUserId={account?.id ?? null}
          onClose={() => setCommentsPostId(null)}
          onSubmit={handleComment}
          onVoteComment={handleVoteComment}
          reactPoints={commentReactPoints}
        />
      )}
    </div>
  );
}

const PRIMARY =
  "inline-flex min-h-11 items-center gap-2 rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * Empty and error states, as a white card on the cream ground.
 *
 * `EmptyFeedState` and `FeedErrorState` would have rendered fine at this width
 * — what they cannot do is point at /m: both send a signed-out visitor to
 * `/account`, which is the web layout, and the empty Discover state calls back
 * into `router.push("/post")`. The states are three lines each; the hrefs are
 * the whole reason they are restated.
 */
function PhoneFeedState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-pm-grey-tint text-pm-grey-text">
        {icon}
      </span>
      <p className="font-display text-base font-semibold text-zinc-900">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-zinc-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
