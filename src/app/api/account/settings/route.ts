import { NextResponse } from "next/server";
import { accountJson } from "@/lib/account";
import {
  getRestaurantById,
  getUserById,
  markPhotoNoticeSeen,
  setTourSeen,
  updateFavorites,
  updatePhotoSharing,
  updatePrivacySettings,
} from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { limitOrReject } from "@/lib/rateLimit";
import { cuisines } from "@/data/restaurantFacets";
import { contactsMatchEnabled } from "@/lib/contactsConfig";

/**
 * The one profile-settings endpoint for both fields the spec asks for: the
 * photo-sharing toggle and the two favorite references. Both are validated
 * against real, current lists rather than accepted as free text — cuisine
 * against data/restaurants.ts's `cuisines`, restaurant against a row that
 * actually exists — since these are meant to be usable for taste matching
 * later, and free text or a stale id wouldn't be.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const limited = await limitOrReject({
    scope: "account-settings:user",
    key: user.id,
    max: 120,
    windowMinutes: 15,
  });
  if (limited) return limited;

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;

  if (body.sharePhotosPublicly !== undefined) {
    if (typeof body.sharePhotosPublicly !== "boolean") {
      return NextResponse.json({ error: "Invalid value." }, { status: 400 });
    }
    await updatePhotoSharing(user.id, body.sharePhotosPublicly);
  }

  // The composer answering its first-post photo notice. `true` is the only
  // value that means anything — see markPhotoNoticeSeen on why this is a latch
  // and not a setting — so anything else is ignored rather than rejected: the
  // notice rides along on the same request that flips the toggle, and a bad
  // field here must not take the toggle down with it.
  if (body.photoNoticeSeen === true) {
    await markPhotoNoticeSeen(user.id);
  }

  // The coach tour finishing, being skipped, or being asked for again — so
  // either value, where the photo notice takes only `true`.
  if (typeof body.tourSeen === "boolean") {
    await setTourSeen(user.id, body.tourSeen);
  }

  // The four privacy switches ride this endpoint rather than getting one each:
  // they are booleans with no validation beyond their type, and the panel that
  // owns them already round-trips through here. Anything that needs a password
  // check or a uniqueness check got its own route instead.
  const privacy: {
    hideFromLeaderboard?: boolean;
    discoverableByUsername?: boolean;
    friendRequestsOpen?: boolean;
    discoverableByContacts?: boolean;
  } = {};

  for (const key of [
    "hideFromLeaderboard",
    "discoverableByUsername",
    "friendRequestsOpen",
    "discoverableByContacts",
  ] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean") {
        return NextResponse.json({ error: "Invalid value." }, { status: 400 });
      }
      privacy[key] = body[key];
    }
  }

  // "Find me from contacts" can only be turned ON where the feature is live.
  // Turning it off is always accepted: withdrawing consent must never depend
  // on a deployment switch. Nothing else happens here on purpose — this route
  // does not send a confirmation email as a side effect of the answer.
  if (privacy.discoverableByContacts === true && !contactsMatchEnabled()) {
    return NextResponse.json({ error: "Not available.", code: "unavailable" }, { status: 404 });
  }

  if (Object.keys(privacy).length > 0) {
    await updatePrivacySettings(user.id, privacy);
  }

  const favorites: { cuisine?: string | null; restaurantId?: string | null } = {};

  if (body.favoriteCuisine !== undefined) {
    if (body.favoriteCuisine === null) {
      favorites.cuisine = null;
    } else if (typeof body.favoriteCuisine === "string" && cuisines.includes(body.favoriteCuisine)) {
      favorites.cuisine = body.favoriteCuisine;
    } else {
      return NextResponse.json({ error: "Not a real cuisine." }, { status: 400 });
    }
  }

  if (body.favoriteRestaurantId !== undefined) {
    if (body.favoriteRestaurantId === null) {
      favorites.restaurantId = null;
    } else if (
      typeof body.favoriteRestaurantId === "string" &&
      // A lookup rather than a scan of the whole array, now that restaurants
      // are rows. Same guarantee: the id has to name a restaurant that exists.
      (await getRestaurantById(body.favoriteRestaurantId)) !== null
    ) {
      favorites.restaurantId = body.favoriteRestaurantId;
    } else {
      return NextResponse.json({ error: "Not a real restaurant." }, { status: 400 });
    }
  }

  if (Object.keys(favorites).length > 0) {
    await updateFavorites(user.id, favorites);
  }

  const fresh = await getUserById(user.id);
  if (!fresh) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  return NextResponse.json(accountJson(fresh));
}
