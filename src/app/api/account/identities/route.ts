import { NextRequest, NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { listIdentities, unlinkIdentity } from "@/lib/db";
import { sendSecurityNotice } from "@/lib/mail";
import { isSameOriginRequest } from "@/lib/originCheck";
import { limitOrReject } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";
import { revokeStoredTokens } from "@/lib/oauth/apple";
import { isProvider } from "@/lib/oauth/providers";

/**
 * The signed-in account's sign-in methods, for the Settings block.
 *
 * Takes no user id and must never grow one — the same rule as
 * `/api/account/activity`. The provider and the address it gave, and nothing
 * else about the identity: not the provider's user number, not the token.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const identities = await listIdentities(user.id);
  return NextResponse.json(
    {
      hasPassword: user.passwordHash !== null,
      emailVerified: user.emailVerifiedAt !== undefined,
      identities: identities.map((i) => ({ provider: i.provider, email: i.email })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Disconnect Apple or Google from the account.
 *
 * **Only an account with a password can do this**, and it confirms with that
 * password. That is the whole lock-out argument: the person has just typed
 * the one sign-in method that will remain, so it provably works, and no route
 * anywhere removes a password, so it will still be there afterwards. A
 * password-less account is told to add one first. The guard is repeated
 * inside the DELETE statement itself (`unlinkIdentity`), so two Disconnects
 * fired together cannot both pass a check and leave nothing.
 *
 * Apple is told to revoke after the response, and the address on file gets a
 * notice either way.
 */
export async function DELETE(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let provider: unknown;
  let password: unknown;
  try {
    ({ provider, password } = await req.json());
  } catch {
    provider = undefined;
    password = undefined;
  }

  if (!isProvider(provider)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // The password check below is a guess from behind a session, so it shares
  // the counter the password and delete routes use. See F11/F12.
  const limited = await limitOrReject({
    scope: "account:reauth",
    key: user.id,
    max: 10,
    windowMinutes: 15,
    message: "Too many password attempts. Try again in a few minutes.",
  });
  if (limited) return limited;

  if (user.passwordHash === null) {
    return NextResponse.json(
      { error: "Add a password first, so you still have a way to sign in." },
      { status: 409 }
    );
  }

  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Enter your password to confirm." }, { status: 400 });
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }

  const removed = await unlinkIdentity(user.id, provider);
  if (!removed) {
    return NextResponse.json({ error: "That sign-in isn't connected." }, { status: 404 });
  }

  after(async () => {
    await revokeStoredTokens([removed]);
    const send = await sendSecurityNotice(user.email, user.name, "signin_removed", removed.provider);
    if (!send.ok && send.reason === "failed") {
      console.error(`sign-in removed notice failed for ${user.id}: ${send.detail}`);
    }
  });

  return NextResponse.json({ ok: true });
}
