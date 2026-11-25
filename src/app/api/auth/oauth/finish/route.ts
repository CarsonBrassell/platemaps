import { NextRequest, NextResponse, after } from "next/server";
import { randomUUID } from "node:crypto";
import { accountJson } from "@/lib/account";
import {
  createOAuthUser,
  createSession,
  deletePendingSignup,
  getIdentity,
  getPendingSignup,
  getUserByEmail,
  getUserByName,
  type User,
} from "@/lib/db";
import { checkEmail, normalizeEmail } from "@/lib/emailAddress";
import { clientIp } from "@/lib/loginThrottle";
import { isSameOriginRequest } from "@/lib/originCheck";
import { limitOrReject } from "@/lib/rateLimit";
import { setSessionCookie } from "@/lib/session";
import { uniqueViolationConstraint, userConflictMessage } from "@/lib/uniqueViolation";
import { checkNewUsername } from "@/lib/username";
import { revokeStoredTokens } from "@/lib/oauth/apple";
import { maskEmail } from "@/lib/oauth/complete";
import { OAUTH_ERRORS } from "@/lib/oauth/errorCodes";
import { PENDING_COOKIE, clearFlowCookie, readFlowCookie } from "@/lib/oauth/flowCookies";
import { readiness } from "@/lib/oauth/providers";

const NO_STORE = { "Cache-Control": "no-store" };

/** Whether any provider sign-in is switched on. Off means no pending row can
    exist, so every method here answers without touching a table. */
function enabled(): boolean {
  const ready = readiness();
  return ready.webGoogle || ready.nativePair;
}

const expired = () =>
  NextResponse.json({ error: OAUTH_ERRORS.expired, code: "expired" }, { status: 400, headers: NO_STORE });

/**
 * What the finish screen needs to draw itself: which provider, a masked
 * address, whether to ask for one, and where to go afterwards. 404 when this browser has nothing
 * waiting. Reads only by the httpOnly pending cookie — there is no id to pass.
 */
export async function GET() {
  if (!enabled()) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE });

  const tokenHash = await readFlowCookie(PENDING_COOKIE);
  const pending = tokenHash ? await getPendingSignup(tokenHash) : null;
  if (!pending) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE });

  // This identity became an account somewhere else since it was parked (the
  // same person finishing on another device). There is nothing left to finish,
  // so the screen gets the same 404 and falls back to the sign-in card, where
  // "Continue with ..." now signs them straight in.
  if (await getIdentity(pending.provider, pending.subject)) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE });
  }

  return NextResponse.json(
    {
      provider: pending.provider,
      email: maskEmail(pending.email),
      needsEmail: pending.email === null,
      // Where the visitor was headed before signing in. Went through safeNext
      // when the flow began; the screen runs it through again before using it.
      next: pending.nextPath,
    },
    { headers: NO_STORE }
  );
}

/**
 * Create the account for a new Apple / Google person.
 *
 * **No users row exists before this request, and none is made without the
 * tick.** The provider sign-in only parked a verified identity for ten
 * minutes; an account is a thing a person agrees to, and `agreedToTerms ===
 * true` here is that agreement — the same sentence and the same
 * database-clock stamp as `/api/auth/signup`.
 *
 * The identity comes from the pending row, never from this request's body.
 * The body can choose a username, and an email address only when the provider
 * gave none — and a typed address is stored unverified, always. Only an
 * address the provider vouched for starts out confirmed.
 */
export async function POST(req: NextRequest) {
  // Ends in setSessionCookie, like signup — see lib/originCheck.ts.
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  }

  const limited = await limitOrReject({
    scope: "oauth-finish:ip",
    key: clientIp(req),
    max: 10,
    windowMinutes: 60,
  });
  if (limited) return limited;

  if (!enabled()) return expired();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { name, agreedToTerms, email } = body as Record<string, unknown>;

  const tokenHash = await readFlowCookie(PENDING_COOKIE);
  const pending = tokenHash ? await getPendingSignup(tokenHash) : null;
  if (!tokenHash || !pending) return expired();

  /* Asked before anything about the form. The person may have finished on
     another device while this screen sat open; they have an account and have
     proved to the provider who they are, so they are signed in to it. Left to
     the checks below they would be told "an account with that email already
     exists" and steered to Cancel — and cancelling used to revoke an Apple
     token that belongs to that live account. deletePendingSignup returns
     nothing to revoke for a subject that has an identity. */
  const owner = await getIdentity(pending.provider, pending.subject);
  if (owner) {
    await deletePendingSignup(tokenHash);
    await clearFlowCookie(PENDING_COOKIE);
    const token = randomUUID();
    await createSession(token, owner.user.id);
    await setSessionCookie(token);
    return NextResponse.json(accountJson(owner.user), { headers: NO_STORE });
  }

  const badName = checkNewUsername(name);
  if (badName) return NextResponse.json({ error: badName.error }, { status: badName.status });
  const username = String(name);

  if (agreedToTerms !== true) {
    return NextResponse.json(
      { error: "You must confirm you are 13 or older and agree to the Terms of Service and Privacy Policy to create an account." },
      { status: 400 }
    );
  }

  /* The provider's address when there is one — the body cannot override it.
     Only when the token carried none may one be typed, and then it gets the
     same shape check and normalisation signup applies. */
  let address: string;
  const fromProvider = pending.email !== null;
  if (pending.email !== null) {
    address = pending.email;
  } else {
    const badEmail = checkEmail(typeof email === "string" ? email : "");
    if (badEmail) return NextResponse.json({ error: badEmail }, { status: 400 });
    address = normalizeEmail(String(email));
  }

  // Asked again, not trusted from ten minutes ago: an account may have been
  // made under this address since the provider sign-in.
  if (await getUserByEmail(address)) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 }
    );
  }

  if (await getUserByName(username)) {
    return NextResponse.json(
      { error: "That username is already taken." },
      { status: 409 }
    );
  }

  let user: User;
  try {
    user = await createOAuthUser({
      id: randomUUID(),
      name: username,
      email: address,
      // Both halves required: the provider vouched, AND this is that address.
      emailVerified: fromProvider && pending.emailVerified,
      identity: {
        provider: pending.provider,
        subject: pending.subject,
        email: pending.email,
        emailVerified: pending.emailVerified,
        emailIsPrivate: pending.emailIsPrivate,
        clientId: pending.clientId,
        refreshTokenEnc: pending.refreshTokenEnc,
      },
    });
  } catch (error) {
    /* Two finish screens open for one person (a double tap, two tabs): the
       second insert loses on the identity's unique index and the whole
       statement, users row included, rolls back. That person HAS an account
       now, and has proved who they are, so they are signed in to it rather
       than shown a 500. Matched on the subject, as every sign-in is. */
    if (uniqueViolationConstraint(error) === "idx_user_identities_subject") {
      const winner = await getIdentity(pending.provider, pending.subject);
      if (!winner) throw error;
      user = winner.user;
    } else {
      // The same backstop signup has for the username / email race.
      const conflict = userConflictMessage(error);
      if (!conflict) throw error;
      return NextResponse.json({ error: conflict }, { status: 409 });
    }
  }

  // Not revoked: its Apple token now belongs to the identity just created
  // (and deletePendingSignup hands back nothing for a subject that has one).
  await deletePendingSignup(tokenHash);
  await clearFlowCookie(PENDING_COOKIE);

  const token = randomUUID();
  await createSession(token, user.id);

  await setSessionCookie(token);

  return NextResponse.json(accountJson(user), { headers: NO_STORE });
}

/**
 * "Cancel" on the finish screen. Drops the parked identity and, for Apple,
 * revokes the authorization — nobody made an account, so PlateMaps should not
 * be left sitting in their "Sign in with Apple" list.
 */
export async function DELETE(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  }

  const limited = await limitOrReject({
    scope: "oauth-finish-cancel:ip",
    key: clientIp(req),
    max: 30,
    windowMinutes: 15,
  });
  if (limited) return limited;

  if (enabled()) {
    const tokenHash = await readFlowCookie(PENDING_COOKIE);
    const dropped = tokenHash ? await deletePendingSignup(tokenHash) : null;
    if (dropped) after(() => revokeStoredTokens([dropped]));
  }
  await clearFlowCookie(PENDING_COOKIE);

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
