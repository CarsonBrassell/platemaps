import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { getPublicProfile } from "@/lib/db";
import { restaurants } from "@/data/restaurants";
import { initials } from "@/lib/format";
import { PlateStarIcon } from "@/components/icons";
import { ProfileFriendButton } from "@/components/ProfileFriendButton";

/**
 * The public profile — what anyone, friend or stranger, sees when they look
 * this person up. Deliberately thin: name, avatar, favorites, points. No
 * posts, no saved list, no follower/friend count. getPublicProfile in
 * lib/db.ts doesn't even join the posts table, so there's no post history to
 * accidentally leak here later by someone adding a "recent activity" section
 * without re-reading why this page looks the way it does.
 */
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) notFound();

  const favoriteRestaurant = profile.favoriteRestaurantId
    ? restaurants.find((r) => r.id === profile.favoriteRestaurantId)
    : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl pb-12">
      <Header />

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

        <h1 className="mt-4 font-display text-2xl font-semibold text-zinc-900">{profile.name}</h1>

        <div className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-pm-grey-tint px-4 py-1.5">
          <PlateStarIcon className="h-4 w-5 text-zinc-500" />
          <span className="font-mono text-sm font-medium tabular-nums text-pm-grey-text">
            {profile.points.toLocaleString()} PM Points
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

        <div className="mt-6">
          <ProfileFriendButton userId={profile.id} />
        </div>
      </div>
    </div>
  );
}
