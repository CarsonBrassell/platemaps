import { NextResponse } from "next/server";
import { accountJson } from "@/lib/account";
import { getUserById, setVerifiedPhone } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { countHits, limitOrReject, limiterUnavailable } from "@/lib/rateLimit";
import { sendPhoneMovedEmail } from "@/lib/mail";
import { phoneVerifyAvailable } from "@/lib/contactsConfig";
import { PHONE_LIMITS } from "@/lib/contactIdentifiers";
import { normalizeUsPhone, phoneHmac, phoneLast4, twilioCheck } from "@/lib/phoneVerify";

/** How long after asking for a code this account may still redeem one. */
const CODE_WINDOW_MINUTES = 30;

/**
 * Redeem the texted code and put the number on the caller's account.
 *
 * Twilio owns the code: it decides whether it matches, expires it and counts
 * wrong guesses. On approval the number's keyed hash, its last four digits
 * and the time are stored — never the number.
 *
 * If another account held the number it is moved, not refused: "already in
 * use" would tell the caller the number has an account. Whoever lost it gets
 * an email saying so (without the number in it). A phone is never a way to
 * sign in or recover an account here, so a moved number changes only who is
 * findable by it.
 */
export async function POST(req: Request) {
  // Not configured for this deployment: do nothing at all.
  if (!phoneVerifyAvailable()) {
    return NextResponse.json({ error: "Not available.", code: "unavailable" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  if (!user.emailVerifiedAt) {
    return NextResponse.json(
      { error: "Confirm your email first.", code: "verify-first" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { phone, code } = body as Record<string, unknown>;

  const e164 = normalizeUsPhone(phone);
  if (!e164) {
    return NextResponse.json({ error: "Enter a US mobile number." }, { status: 400 });
  }
  if (typeof code !== "string" || !/^\d{4,8}$/.test(code)) {
    return NextResponse.json({ error: "Enter the code from the text." }, { status: 400 });
  }

  // Guessing is bounded here as well as at Twilio, and a counter that cannot
  // be read stops the request.
  const limited = await limitOrReject(
    [{ scope: "phone-verify:user", key: user.id, ...PHONE_LIMITS.verifyUserHour }],
    { failClosed: true }
  );
  if (limited) return limited;

  const wrongCode = () =>
    NextResponse.json({ error: "That code didn't work. Check it and try again." }, { status: 400 });

  const hmac = phoneHmac(e164);

  // Only the account that asked for a code may redeem one for that number.
  // Without this, any signed-in account could spend guesses against a code
  // somebody else had just requested. Same answer as a wrong code.
  // Three arguments on purpose: this reads a 30-day counter over half an
  // hour, and countHits only prunes when given a fourth. Pruning the scope
  // with this window would wipe every account's pair history (the 30-day
  // limit, and what tells /send a number is not new). The send route's
  // limiter sweeps the scope with its real window.
  try {
    const asked = await countHits("phone-send:pair", `${user.id}:${hmac}`, CODE_WINDOW_MINUTES);
    if (asked === 0) return wrongCode();
  } catch {
    return limiterUnavailable();
  }

  if ((await twilioCheck(e164, code)) !== "ok") return wrongCode();

  const result = await setVerifiedPhone(user.id, hmac, phoneLast4(e164));

  // Told even when our own write lost the race below: their number is gone
  // from their account either way. Best effort — a mailer problem must not
  // undo a verification that has already happened.
  for (const id of result.movedFromUserIds) {
    try {
      const previous = await getUserById(id);
      if (previous) await sendPhoneMovedEmail(previous.email);
    } catch {
      /* see above */
    }
  }

  if (!result.ok) {
    return NextResponse.json({ error: "Try again." }, { status: 409 });
  }

  const fresh = await getUserById(user.id);
  if (!fresh) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  return NextResponse.json(accountJson(fresh));
}
