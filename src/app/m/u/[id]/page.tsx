import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RankRing } from "@/components/RankRing";
import { PhoneProfileFriendButton } from "@/components/mobile/PhoneProfileFriendButton";
import { PhoneProfileMenu } from "@/components/mobile/PhoneProfileMenu";
import {
  getBlockStatus,
  getFlavorProfile,
  getPersonalityMatchForProfile,
  getPublicProfile,
  getRestaurantById,
  getTasteMatchForProfile,
  getUserPublicPosts,
} from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { signInHrefFor } from "@/lib/signInGate";
import { initials } from "@/lib/format";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { PublicProfilePlates } from "@/components/ProfileShelves";
import { PhoneFlavorProfileCard, PhoneTasteMatchCard } from "@/components/mobile/PhoneTasteMatchCard";

/**
 * The public profile, phone version — what anyone, friend or stranger, sees
 * when they look this person up.
 *
 * It exists because /m/friends and the profile's activity list both print other
 * people's names, and a name that is not a link is a dead end on a phone where
 * there is no hover, no status bar and no second column to put context in.
 * Every one of those links lands here.
 *
 * Same shape as `/u/[id]`: name, avatar, rank, points, two favorites, and the
 * plates this person posted — see `PublicProfilePlates` and
 * `getUserPublicPosts` in lib/db.ts, which is the one query built to answer
 * "what did they post" for an arbitrary visitor (private media stripped in
 * SQL, no saved posts, no hearts). Hearts stay author-only and live behind
 * the session on /m/account; they must never appear on this screen.
 *
 * The favourite restaurant is resolved with `getRestaurantById` rather than by
 * scanning the `restaurants` seed array the web page imports — Postgres is the
 * source of truth and `src/data/` is seed input (CLAUDE.md).
 */
export default async function PhonePublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const [profile, viewer] = await Promise.all([getPublicProfile(id), getCurrentUser()]);
  if (!profile) notFound();

  /* This page isn't in signInGate's public list, so it's meant to require a
     session — but the proxy only checks that a `platemap_session` cookie is
     present, not that it resolves to anyone (see src/proxy.ts). A cookie
     that fails to resolve must be treated as no session at all, not as a
     free pass to view the page as an anonymous stranger: that was the hole
     that let a forged cookie skip the block check below entirely, and rendered
     the profile before RequireSignIn's client-side redirect could fire. */
  if (!viewer) {
    redirect(signInHrefFor(`/m/u/${id}`, ""));
  }

  /* A block in either direction hides the profile card the same way an
     unknown id does — blocking is expected to make someone disappear, not
     just hide the friend/follow affordance. See SECURITY-FINDINGS.md #10. */
  if (viewer.id !== id) {
    const blockStatus = await getBlockStatus(viewer.id, id);
    if (blockStatus !== "none") notFound();
  }

  /* The nav-variant switcher rides in `?nav=` and every link has to carry it or
     the first tap drops you back to the default. Goes away with the switcher. */
  const sp = await searchParams;
  const rawNav = sp.nav;
  const nav = Array.isArray(rawNav) ? rawNav[0] : rawNav;
  const to = (href: string) => (nav ? `${href}?nav=${nav}` : href);

  /* The back link used to be hardcoded to Friends regardless of where the
     visitor actually came from (BACKLOG: "Profile's back link is hardcoded
     to Friends"). This page is a server component and `document.referrer`
     doesn't update on client-side navigation, so every link site that sends
     someone here tags `?from=<surface>` instead (PhoneFriendsScreen,
     PhoneProfileScreen, PhoneFeedPostCard, PhoneFindFriends). Anything
     missing or unrecognized — a bookmarked or shared link — falls back to
     the surface root rather than a guess. */
  const rawFrom = sp.from;
  const from = Array.isArray(rawFrom) ? rawFrom[0] : rawFrom;
  const BACK_TARGETS: Record<string, { href: string; label: string }> = {
    feed: { href: "/m/feed", label: "Feed" },
    friends: { href: "/m/friends", label: "Friends" },
    account: { href: "/m/account", label: "Profile" },
  };
  const back = (from && BACK_TARGETS[from]) || { href: "/m", label: "Discover" };

  /* Taste match (both food personality wheels, plus the cuisine match for its
     "Try their pick") is null for yourself and for non-friends — no card at
     all; see getPersonalityMatchForProfile. On your own profile the flavor profile takes its
     place, so exactly one of the two is ever non-null. The block check above
     has already run. */
  const isSelf = viewer.id === profile.id;
  const [favoriteRestaurant, posts, taste, personality, flavor] = await Promise.all([
    profile.favoriteRestaurantId ? getRestaurantById(profile.favoriteRestaurantId) : null,
    getUserPublicPosts(profile.id, viewer?.id ?? null),
    getTasteMatchForProfile(viewer.id, profile.id),
    getPersonalityMatchForProfile(viewer.id, profile.id),
    isSelf ? getFlavorProfile(profile.id) : null,
  ]);


  return (
    <div className="min-h-dvh">
      <header className="px-4 pb-3 pt-4">
        <Link
          href={to(back.href)}
          className="mono-label inline-flex min-h-11 items-center rounded-full pr-2 text-pm-grey-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          ← {back.label}
        </Link>
      </header>

      {/* The card is `RankRing`, the owner's own rank card from the profile
          tab, so Plate Points read here the way they do on your own profile
          (Calvin, 2026-11-27). The charcoal band, the photo on its edge, the
          name and the one action ride in through its `identity` slot.

          `neighbors={false}`: a visitor sees this person's crest in its ring
          and not the ranks either side of it.

          Block and Report moved behind the three dots on the band
          (`PhoneProfileMenu`), which leaves Add friend as the card's only
          action. */}
      <div className="mx-4">
        <RankRing
          points={profile.points}
          neighbors={false}
          identity={
            <>
              {/* The band is the card's own top edge: it cancels RankRing's
                  padding and takes its top corners. */}
              <div className="-mx-5 -mt-4 h-24 rounded-t-[28px] bg-pm-charcoal" />
              <PhoneProfileMenu userId={profile.id} name={profile.name} />
              <div className="-mt-12 mb-4 flex flex-col items-center text-center">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    className="h-24 w-24 shrink-0 rounded-full object-cover ring-4 ring-white"
                  />
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint font-mono text-2xl font-medium text-pm-grey-text ring-4 ring-white">
                    {initials(profile.name)}
                  </div>
                )}
                <h1 className="font-display mt-3 flex max-w-full items-center gap-1.5 text-[24px] font-semibold leading-tight tracking-tight text-zinc-900">
                  <span className="truncate">{profile.name}</span>
                  <VerifiedBadge userId={profile.id} />
                </h1>
                <div className="mt-2.5 empty:hidden">
                  <PhoneProfileFriendButton userId={profile.id} compact />
                </div>
              </div>
            </>
          }
        >
          {/* An unset favorite is left out rather than printed as "Not set":
              a visitor cannot set it, and two of them were the emptiest part
              of the old card. */}
          {(profile.favoriteCuisine || favoriteRestaurant) && (
            <div
              className={`mb-1 mt-4 grid gap-2.5 text-left ${
                profile.favoriteCuisine && favoriteRestaurant ? "grid-cols-2" : ""
              }`}
            >
              {profile.favoriteCuisine && (
                <div className="rounded-xl bg-pm-grey-tint/50 p-3">
                  <p className="mono-label text-zinc-500">Favorite cuisine</p>
                  <p className="mt-1 truncate text-sm font-medium text-zinc-800">
                    {profile.favoriteCuisine}
                  </p>
                </div>
              )}
              {favoriteRestaurant && (
                <div className="rounded-xl bg-pm-grey-tint/50 p-3">
                  <p className="mono-label text-zinc-500">Favorite restaurant</p>
                  <Link
                    href={to(`/m/restaurant/${favoriteRestaurant.id}`)}
                    className="mt-1 block truncate text-sm font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                  >
                    {favoriteRestaurant.name}
                  </Link>
                </div>
              )}
            </div>
          )}
        </RankRing>
      </div>

      {personality && (
        <PhoneTasteMatchCard
          friendName={profile.name}
          personality={personality}
          tryPick={taste?.match?.tryPick}
          to={to}
        />
      )}
      {flavor && <PhoneFlavorProfileCard flavor={flavor.flavor} />}

      <div className="mx-4 mt-6">
        <PublicProfilePlates posts={posts} mosaic />
      </div>
    </div>
  );
}
