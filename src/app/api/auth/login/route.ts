import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getUserByEmail, createSession } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Fill in every field." }, { status: 400 });
  }

  const user = await getUserByEmail(String(email));

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "That email and password don't match an account." },
      { status: 401 }
    );
  }

  const token = randomUUID();
  await createSession(token, user.id);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    points: user.points,
    avatarUrl: user.avatarUrl,
    sharePhotosPublicly: user.sharePhotosPublicly,
    favoriteCuisine: user.favoriteCuisine,
    favoriteRestaurantId: user.favoriteRestaurantId,
  });
}
