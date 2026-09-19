import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { getBlockStatus, getPublicProfile, getRestaurantById, getUserPublicPosts } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { signInHrefFor } from "@/lib/signInGate";
import { initials } from "@/lib/format";
import { PlateStarIcon } from "@/components/icons";
import { RankInsignia } from "@/components/RankInsignia";
import { rankFor } from "@/lib/ranks";
import { ProfileFriendButton } from "@/components/ProfileFriendButton";
import { ProfileBlockButton } from "@/components/ProfileBlockButton";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { PublicProfilePlates } from "@/components/ProfileShelves";

/**
 * The public profile — what anyone, friend or stranger, sees when they look
 * this person up. Name, avatar, rank, favorites, points, and — see
 * `PublicProfilePlates` — the plates this person has posted, or a stated
 * empty state when they haven't posted any. `getUserPublicPosts` in
 * lib/db.ts is the query built to answer that safely for an arbitrary
 * visitor: no saved posts, no hearts, private media stripped in SQL.
 */
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [profile, viewer] = await Promise.all([getPublicProfile(id), getCurrentUser()]);
  if (!profile) notFound();

  /* This page isn't in signInGate's public list, so it's meant to require a
     session — but the proxy only checks that a `platemap_session` cookie is
     present, not that it resolves to anyone (see src/proxy.ts). A cookie
     that fails to resolve must be treated as no session at all, not as a
     free pass to view the page as an anonymous stranger: that was the hole
     that let a forged cookie skip the block check below entirely. */
  if (!viewer) {
    redirect(signInHrefFor(`/u/${id}`, ""));
  }

  /* A block in either direction hides the profile card the same way an
     unknown id does — blocking is expected to make someone disappear, not
     just hide the friend/follow affordance. See SECURITY-FINDINGS.md #10. */
  if (viewer.id !== id) {
    const blockStatus = await getBlockStatus(viewer.id, id);
    if (blockStatus !== "none") notFound();
  }

  const [favoriteRestaurant, posts] = await Promise.all([
    profile.favoriteRestaurantId ? getRestaurantById(profile.favoriteRestaurantId) : null,
    getUserPublicPosts(profile.id, viewer?.id ?? null),
  ]);

  const rank = rankFor(profile.points);

  return (
    <>
      {/* Header owns the full viewport width — see account/page.tsx's
          identical comment. max-w-2xl (672px) squeezed it far worse than
          account's max-w-5xl did. */}
      <Header />
      <div className="mx-auto w-full max-w-2xl pb-12">
      <div className="mx-4 rounded-2xl bg-white px-6 py-10 text-center sm:mx-6">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatarUrl}
            alt=""
            className="mx-auto h-24 w-24 rounded-full object-cover"
          />
        ) : (
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-pm-grey-tint font-mono text-3xl font-medium text-pm-grey-text">
            {initials(profile.name)}
          </div>
        )}

        <h1 className="mt-4 flex items-center justify-center gap-1.5 font-display text-2xl font-semibold text-zinc-900">
          {profile.name}
          <VerifiedBadge userId={profile.id} />
        </h1>

        {/* The rank is what someone's lifetime points *mean*. It shows here,
            on the phone twin, and as a chip on the phone Friends' Table — not
            the feed, not a comment byline. The crest carries it and the
            title names it, because a wreath alone is a puzzle; the raw total
            follows underneath for anyone who wants the number.
            Thresholds and the leaderboard's unrelated other "rank": lib/ranks.ts. */}
        <div className="mt-5 flex flex-col items-center">
          <RankInsignia rank={rank.key} size={76} />
          <p className="mt-2 font-display text-lg font-semibold text-zinc-900">{rank.title}</p>
        </div>

        <div className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-pm-grey-tint px-4 py-1.5">
          <PlateStarIcon className="h-4 w-5 text-zinc-500" />
          <span className="font-mono text-sm font-medium tabular-nums text-pm-grey-text">
            {profile.points.toLocaleString()} Plate Points
          </span>
        </div>

        <div className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-3 text-left">
          <div className="rounded-xl bg-pm-grey-tint/50 p-3">
            <p className="mono-label text-zinc-500">
              Favorite cuisine
            </p>
            <p className="mt-1 truncate text-sm font-medium text-zinc-800">
              {profile.favoriteCuisine ?? "Not set"}
            </p>
          </div>
          <div className="rounded-xl bg-pm-grey-tint/50 p-3">
            <p className="mono-label text-zinc-500">
              Favorite restaurant
            </p>
            {favoriteRestaurant ? (
              <Link
                href={`/restaurant/${favoriteRestaurant.id}`}
                className="mt-1 block truncate text-sm font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500"
              >
                {favoriteRestaurant.name}
              </Link>
            ) : (
              <p className="mt-1 text-sm font-medium text-zinc-800">Not set</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          <ProfileFriendButton userId={profile.id} />
          <ProfileBlockButton userId={profile.id} />
        </div>
      </div>

      {/* Straight on the cream ground, not inside the white card above — see
          the layout note on PublicProfilePlates/ProfileShelves. */}
      <div className="mx-4 mt-6 sm:mx-6">
        <PublicProfilePlates posts={posts} />
      </div>
      </div>
    </>
  );
}
