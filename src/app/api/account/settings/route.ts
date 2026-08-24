import { NextResponse } from "next/server";
import { accountJson } from "@/lib/account";
import {
  getRestaurantById,
  getUserById,
  updateFavorites,
  updatePhotoSharing,
  updatePrivacySettings,
} from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { cuisines } from "@/data/restaurants";

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

  const body = await req.json();

  if (body.sharePhotosPublicly !== undefined) {
    if (typeof body.sharePhotosPublicly !== "boolean") {
      return NextResponse.json({ error: "Invalid value." }, { status: 400 });
    }
    await updatePhotoSharing(user.id, body.sharePhotosPublicly);
  }

  // The three privacy switches ride this endpoint rather than getting one each:
  // they are booleans with no validation beyond their type, and the panel that
  // owns them already round-trips through here. Anything that needs a password
  // check or a uniqueness check got its own route instead.
  const privacy: {
    hideFromLeaderboard?: boolean;
    discoverableByUsername?: boolean;
    friendRequestsOpen?: boolean;
  } = {};

  for (const key of ["hideFromLeaderboard", "discoverableByUsername", "friendRequestsOpen"] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean") {
        return NextResponse.json({ error: "Invalid value." }, { status: 400 });
      }
      privacy[key] = body[key];
    }
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
