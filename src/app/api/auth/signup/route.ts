import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getUserByEmail, getUserByName, createUser, createSession } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

/** Same charset a handle already renders in — no space could survive
    FoodPostCard's handleFor() anyway, so a signup that let one through would
    just be a username that displays differently than it was typed. */
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

export async function POST(req: NextRequest) {
  const { name, email, password, agreedToTerms } = await req.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Fill in every field." }, { status: 400 });
  }

  if (!USERNAME_PATTERN.test(String(name))) {
    return NextResponse.json(
      {
        error:
          "Username must be 3-24 characters, letters, numbers and underscores only.",
      },
      { status: 400 }
    );
  }

  if (agreedToTerms !== true) {
    return NextResponse.json(
      { error: "You must agree to the Terms of Service and Privacy Policy to create an account." },
      { status: 400 }
    );
  }

  if (await getUserByEmail(String(email))) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 }
    );
  }

  if (await getUserByName(String(name))) {
    return NextResponse.json(
      { error: "That username is already taken." },
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
