import Link from "next/link";
import { notFound } from "next/navigation";
import { PlateStarIcon } from "@/components/icons";
import { RankInsignia } from "@/components/RankInsignia";
import { PhoneProfileFriendButton } from "@/components/mobile/PhoneProfileFriendButton";
import { ProfileBlockButton } from "@/components/ProfileBlockButton";
import { getPublicProfile, getRestaurantById } from "@/lib/db";
import { initials } from "@/lib/format";
import { rankFor } from "@/lib/ranks";

/**
 * The public profile, phone version — what anyone, friend or stranger, sees
 * when they look this person up.
 *
 * It exists because /m/friends and the profile's activity list both print other
 * people's names, and a name that is not a link is a dead end on a phone where
 * there is no hover, no status bar and no second column to put context in.
 * Every one of those links lands here.
 *
 * Deliberately thin, and thin in exactly the same way as `/u/[id]`: name,
 * avatar, rank, points, two favorites. **No posts, no saved list, no hearts,
 * and no friend or follower count.** `getPublicProfile` in lib/db.ts does not even
 * join the posts table, so there is no history to accidentally leak here later
 * by adding a "recent activity" section without re-reading why this page looks
 * the way it does. Hearts are author-only and live behind the session on
 * /m/account; they must never appear on this screen.
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
  const profile = await getPublicProfile(id);
  if (!profile) notFound();

  /* The nav-variant switcher rides in `?nav=` and every link has to carry it or
     the first tap drops you back to the default. Goes away with the switcher. */
  const rawNav = (await searchParams).nav;
  const nav = Array.isArray(rawNav) ? rawNav[0] : rawNav;
  const to = (href: string) => (nav ? `${href}?nav=${nav}` : href);

  const favoriteRestaurant = profile.favoriteRestaurantId
    ? await getRestaurantById(profile.favoriteRestaurantId)
    : null;

  const rank = rankFor(profile.points);

  return (
    <div className="min-h-dvh">
      <header className="px-4 pb-3 pt-4">
        <Link
          href={to("/m/friends")}
          className="mono-label inline-flex min-h-11 items-center rounded-full pr-2 text-pm-grey-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          ← Friends
        </Link>
      </header>

      <div className="mx-4 rounded-2xl bg-white px-5 py-8 text-center">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatarUrl}
            alt=""
            className="mx-auto h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-pm-grey-tint font-mono text-2xl font-medium text-pm-grey-text">
            {initials(profile.name)}
          </div>
        )}

        <h1 className="font-display mt-4 text-[24px] font-semibold leading-tight tracking-tight text-zinc-900">
          {profile.name}
        </h1>

        {/* Same block as `/u/[id]`, drawn smaller — the crest is 64px here
            against 76 on the web, which is the whole difference. The rank is
            shown on this screen and on its web twin and nowhere else in either
            tree: not the feed, not the leaderboard, not a comment byline. You
            find out where somebody stands by going and looking at them.
            Thresholds, and the leaderboard's unrelated other "rank": lib/ranks.ts. */}
        <div className="mt-4 flex flex-col items-center">
          <RankInsignia rank={rank.key} size={64} />
          <p className="font-display mt-2 text-[17px] font-semibold leading-tight text-zinc-900">
            {rank.title}
          </p>
        </div>

        {/* Points are the one number a profile prints. There is deliberately no
            friend or follower total beside it. */}
        <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-pm-grey-tint px-4 py-1.5">
          <PlateStarIcon className="h-4 w-5 text-zinc-500" />
          <span className="font-mono text-sm font-medium tabular-nums text-pm-grey-text">
            {profile.points.toLocaleString()} Plate Points
          </span>
        </span>

        <div className="mt-6 grid grid-cols-2 gap-2.5 text-left">
          <div className="rounded-xl bg-pm-grey-tint/50 p-3">
            <p className="mono-label text-zinc-500">Favorite cuisine</p>
            <p className="mt-1 truncate text-sm font-medium text-zinc-800">
              {profile.favoriteCuisine ?? "Not set"}
            </p>
          </div>
          <div className="rounded-xl bg-pm-grey-tint/50 p-3">
            <p className="mono-label text-zinc-500">Favorite restaurant</p>
            {favoriteRestaurant ? (
              <Link
                href={to(`/m/restaurant/${favoriteRestaurant.id}`)}
                className="mt-1 block truncate text-sm font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                {favoriteRestaurant.name}
              </Link>
            ) : (
              <p className="mt-1 text-sm font-medium text-zinc-800">Not set</p>
            )}
          </div>
        </div>

        {/* Friend and Block sit on one row: they are the two things you can do
            about a person, and the destructive one should not read as the
            primary action by getting a row of its own.

            `ProfileBlockButton` is the web component reused unmodified, not a
            Phone* fork — it navigates nowhere (all it does is POST /api/blocks),
            so nothing in it can drop you out of the /m tree, and it already
            carries the min-h-11 target this tree requires. */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <PhoneProfileFriendButton userId={profile.id} />
          <ProfileBlockButton userId={profile.id} />
        </div>
      </div>
    </div>
  );
}
