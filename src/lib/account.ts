import type { User } from "@/lib/db";
import { isDiscoverModesUser, isForMeUser } from "@/lib/forMeGate";
import { isAdminUser } from "@/lib/adminGate";

/**
 * The account object the client is allowed to see.
 *
 * This existed six times as a hand-written literal — in `/api/auth/me`,
 * `login`, `signup`, `avatar`, `account/settings` and `account/username` —
 * every one of them listing the same eleven fields. Six copies is fine right
 * up until a field is added, at which point the app's behaviour depends on
 * which endpoint you happened to come through: sign in and the new field is
 * there, change your username and it silently isn't.
 *
 * `email_verified_at` is the field that forced the issue, since a stale
 * `emailVerified: true` in a client that came through the wrong route would
 * tell somebody their address is confirmed when it is not.
 *
 * Note what is *not* here: `passwordHash`, obviously, but also
 * `emailVerifiedAt` itself — a timestamp nothing in the UI renders — and
 * `monthlyPoints`, which the leaderboard computes for itself. The client gets
 * a boolean because a boolean is the question it asks.
 */
export type AccountJson = {
  id: string;
  name: string;
  email: string;
  points: number;
  avatarUrl?: string;
  sharePhotosPublicly: boolean;
  favoriteCuisine?: string;
  favoriteRestaurantId?: string;
  hideFromLeaderboard: boolean;
  discoverableByUsername: boolean;
  friendRequestsOpen: boolean;
  /** Whether `email` has been proved reachable. False for every pre-verification account. */
  emailVerified: boolean;
  /** An address awaiting its link, if one is outstanding. */
  pendingEmail?: string;
  /**
   * Whether the first-post photo notice still has to be shown. The composer is
   * the only reader — it decides on this before it publishes, so it has to come
   * down with the account rather than be asked for separately at post time.
   */
  photoNoticeSeen: boolean;
  /** Whether the first-run coach tour has run. The feeds are the only readers. */
  tourSeen: boolean;
  /**
   * Present, and `true`, only for the accounts on lib/forMeGate.ts' list: the
   * client turns the dish picks on from it. Left out entirely for everyone else, so
   * their account JSON is what it was before the feature.
   */
  forMe?: true;
  /**
   * Present, and `true`, only for the ids on lib/forMeGate.ts' narrower list:
   * Discover shows the For me and Nearby buttons in place of the Your taste row.
   * Left out for everyone else, so their account JSON is unchanged.
   */
  discoverModes?: true;
  /**
   * Present, and `true`, only for lib/adminGate.ts' ids: shows the delete
   * control on everyone's posts and comments. Display only; the routes check
   * the id themselves.
   */
  admin?: true;
};

export function accountJson(user: User): AccountJson {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    points: user.points,
    avatarUrl: user.avatarUrl,
    sharePhotosPublicly: user.sharePhotosPublicly,
    favoriteCuisine: user.favoriteCuisine,
    favoriteRestaurantId: user.favoriteRestaurantId,
    hideFromLeaderboard: user.hideFromLeaderboard,
    discoverableByUsername: user.discoverableByUsername,
    friendRequestsOpen: user.friendRequestsOpen,
    emailVerified: user.emailVerifiedAt !== undefined,
    pendingEmail: user.pendingEmail,
    photoNoticeSeen: user.photoNoticeSeen,
    tourSeen: user.tourSeen,
    ...(isForMeUser(user.id) ? { forMe: true as const } : {}),
    ...(isDiscoverModesUser(user.id) ? { discoverModes: true as const } : {}),
    ...(isAdminUser(user.id) ? { admin: true as const } : {}),
  };
}
