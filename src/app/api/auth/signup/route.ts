import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getUserByEmail, createUser, createSession } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Fill in every field." }, { status: 400 });
  }

  if (await getUserByEmail(String(email))) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await createUser({
    id: randomUUID(),
    name,
    email,
    passwordHash,
  });

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
