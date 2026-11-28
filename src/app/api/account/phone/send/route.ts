import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { countHits, limitOrReject, limiterUnavailable, refundHit } from "@/lib/rateLimit";
import { clientIpBucket } from "@/lib/loginThrottle";
import { phoneVerifyAvailable } from "@/lib/contactsConfig";
import { PHONE_LIMITS, accountIsYoung } from "@/lib/contactIdentifiers";
import { normalizeUsPhone, phoneHmac, twilioSend } from "@/lib/phoneVerify";

/**
 * Text a one-time code to a phone number the caller wants on their account.
 *
 * Every text costs money and the number is typed by the caller, which makes
 * this the route bots look for ("SMS pumping": triggering paid texts to
 * numbers the attacker earns from). So before Twilio is asked for anything:
 * signed in, confirmed email, a US number, and one combined limiter call that
 * stops the request if the counters cannot be read (lib/rateLimit.ts).
 *
 * **The answer is the same whether or not the number is on another account.**
 * Nothing here looks the number up, so there is nothing to leak.
 *
 * **The number is never written down.** Limiter keys use its keyed hash, so
 * `rate_limit_hits` cannot be read back into numbers, and nothing is logged.
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

  const e164 = normalizeUsPhone((body as Record<string, unknown>).phone);
  if (!e164) {
    return NextResponse.json({ error: "Enter a US mobile number." }, { status: 400 });
  }

  const hmac = phoneHmac(e164);
  const pair = `${user.id}:${hmac}`;

  // Whether this account has been sent a code for this number before. A new
  // number also has to fit the "distinct numbers per month" limit below. Read
  // before the limiter, and an unreadable counter stops the request.
  let isNewNumber: boolean;
  try {
    isNewNumber = (await countHits("phone-send:pair", pair, PHONE_LIMITS.pair.windowMinutes)) === 0;
  } catch {
    return limiterUnavailable();
  }

  const limited = await limitOrReject(
    [
      { scope: "phone-send:user-hour", key: user.id, ...PHONE_LIMITS.userHour },
      { scope: "phone-send:user-day", key: user.id, ...PHONE_LIMITS.userDay },
      { scope: "phone-send:ip", key: clientIpBucket(req), ...PHONE_LIMITS.ipDay },
      { scope: "phone-send:number", key: hmac, ...PHONE_LIMITS.number },
      { scope: "phone-send:pair", key: pair, ...PHONE_LIMITS.pair },
      // The last line: what the whole site may spend on texts in a day.
      { scope: "phone-send:global", key: "all", ...PHONE_LIMITS.global },
      ...(isNewNumber
        ? [{ scope: "phone-send:new-number", key: user.id, ...PHONE_LIMITS.newNumber }]
        : []),
      // Accounts in their first week share one budget, so a batch of fresh
      // accounts runs that out long before it reaches the global one.
      ...(accountIsYoung(user.createdAt)
        ? [{ scope: "phone-send:starter-day", key: "all", ...PHONE_LIMITS.starterDay }]
        : []),
    ],
    { failClosed: true }
  );
  if (limited) return limited;

  // A failed send says only that the text did not go — never why, and it has
  // nothing to do with who else has the number.
  const sent = await twilioSend(e164);
  if (sent !== "ok") {
    /* Twilio said no outright (a landline, a number it blocks): no text went,
       so a first try at this number should not use up one of the account's
       two "new numbers this month" — otherwise two typos lock a person out of
       adding their real number for 30 days. Only that one counter is given
       back. Everything else stays charged so refused numbers cannot be probed
       for free, and the pair row stays so a retry of this same number is not
       counted as new again. An unknown outcome (timeout, Twilio down) gives
       nothing back, because the text may have gone. */
    if (sent === "refused" && isNewNumber) {
      await refundHit("phone-send:new-number", user.id).catch(() => {});
    }
    return NextResponse.json(
      { error: "We couldn't send the text. Check the number and try again later." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
