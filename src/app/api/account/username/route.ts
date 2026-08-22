import { NextResponse } from "next/server";
import { accountJson } from "@/lib/account";
import { getUserByName, getUserById, updateUserName } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/** The signup rule, repeated deliberately rather than imported from that
    route — a route importing another route's constant is a circular-ish
    dependency waiting to happen, and this pattern is short. If it changes,
    it has to change in both places, which is why the message is identical. */
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

/**
 * Change the username.
 *
 * No password check here, unlike the password and delete routes. Those two are
 * irreversible or lock-you-out dangerous; this one is neither — the worst a
 * borrowed phone can do is rename you, and you can rename yourself back.
 * Asking for a password on every settings field is how people stop reading the
 * prompt on the field where it matters.
 *
 * Nothing needs backfilling afterwards: posts, comments and the leaderboard all
 * read the display name off `users` at query time rather than copying it, so
 * one UPDATE is the whole rename. The exception is the old name itself — it is
 * released the moment this succeeds, and someone else may take it.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let name: unknown;
  try {
    ({ name } = await req.json());
  } catch {
    name = undefined;
  }

  if (typeof name !== "string" || !USERNAME_PATTERN.test(name)) {
    return NextResponse.json(
      { error: "Username must be 3-24 characters, letters, numbers and underscores only." },
      { status: 400 }
    );
  }

  if (name === user.name) {
    return NextResponse.json({ error: "That's already your username." }, { status: 400 });
  }

  // Case-insensitive, matching the unique index — so "Calvin" can't be taken
  // while "calvin" exists, which would collide on write anyway.
  const taken = await getUserByName(name);
  if (taken && taken.id !== user.id) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
  }

  await updateUserName(user.id, name);

  const fresh = await getUserById(user.id);
  if (!fresh) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  return NextResponse.json(accountJson(fresh));
}
