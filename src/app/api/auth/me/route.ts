import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserId, getUserById } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ user: null });

  const userId = await getSessionUserId(token);
  if (!userId) return NextResponse.json({ user: null });

  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      points: user.points,
      avatarUrl: user.avatarUrl,
      sharePhotosPublicly: user.sharePhotosPublicly,
      favoriteCuisine: user.favoriteCuisine,
      favoriteRestaurantId: user.favoriteRestaurantId,
    },
  });
}
