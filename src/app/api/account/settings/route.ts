import { NextResponse } from "next/server";
import { updateFavorites, updatePhotoSharing, getUserById } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { cuisines, restaurants } from "@/data/restaurants";

/**
 * The one profile-settings endpoint for both fields the spec asks for: the
 * photo-sharing toggle and the two favorite references. Both are validated
 * against real, current lists rather than accepted as free text — cuisine
 * against data/restaurants.ts's `cuisines`, restaurant against a real id in
 * `restaurants` — since these are meant to be usable for taste matching
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
      restaurants.some((r) => r.id === body.favoriteRestaurantId)
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

  return NextResponse.json({
    id: fresh.id,
    name: fresh.name,
    email: fresh.email,
    points: fresh.points,
    avatarUrl: fresh.avatarUrl,
    sharePhotosPublicly: fresh.sharePhotosPublicly,
    favoriteCuisine: fresh.favoriteCuisine,
    favoriteRestaurantId: fresh.favoriteRestaurantId,
  });
}
