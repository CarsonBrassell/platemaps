import { NextRequest, NextResponse } from "next/server";
import { accountJson } from "@/lib/account";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getUserByEmail, getUserByName, createUser, createSession } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";
import { checkPassword } from "@/lib/password";
import { checkEmail, normalizeEmail } from "@/lib/emailAddress";

/** Same charset a handle already renders in — no space could survive
    FoodPostCard's handleFor() anyway, so a signup that let one through would
    just be a username that displays differently than it was typed. */
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

export async function POST(req: NextRequest) {
  const { name, email, password, agreedToTerms } = await req.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Fill in every field." }, { status: 400 });
  }

  /* Shape-checked before anything else touches it. An address that cannot
     receive mail produces an account that can never verify, reset or recover —
     every route out of that state mails a link. Normalised at the same time so
     the uniqueness check below and every later lookup compare the same
     string. */
  const badEmail = checkEmail(String(email));
  if (badEmail) {
    return NextResponse.json({ error: badEmail }, { status: 400 });
  }
  const address = normalizeEmail(String(email));

  if (!USERNAME_PATTERN.test(String(name))) {
    return NextResponse.json(
      {
        error:
          "Username must be 3-24 characters, letters, numbers and underscores only.",
      },
      { status: 400 }
    );
  }

  // Checked against the username and address being created, so a password
  // can't be the very thing it is protecting. See lib/password.ts for why
  // there are no digit/symbol requirements.
  const weak = checkPassword(String(password), { name: String(name), email: address });
  if (weak) {
    return NextResponse.json({ error: weak }, { status: 400 });
  }

  if (agreedToTerms !== true) {
    return NextResponse.json(
      { error: "You must confirm you are 13 or older and agree to the Terms of Service and Privacy Policy to create an account." },
      { status: 400 }
    );
  }

  if (await getUserByEmail(address)) {
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
    email: address,
    passwordHash,
  });

  const token = randomUUID();
  await createSession(token, user.id);

  await setSessionCookie(token);

  return NextResponse.json(accountJson(user));
}
