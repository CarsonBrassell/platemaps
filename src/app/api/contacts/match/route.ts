import { NextResponse } from "next/server";
import { matchContacts, phoneIsCurrent } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { countHits, limitOrReject, limiterUnavailable, recordHits } from "@/lib/rateLimit";
import { clientIpBucket } from "@/lib/loginThrottle";
import { sendOwnerAlert } from "@/lib/mail";
import { contactsMatchEnabled, phoneMatchingAvailable } from "@/lib/contactsConfig";
import { normalizeContactPhone, phoneHmac } from "@/lib/phoneVerify";
import {
  LIMITS,
  MAX_BODY_CHARS,
  MAX_EMAILS,
  MAX_EMAIL_CHARS,
  MAX_MATCHES,
  MAX_PHONES,
  MAX_PHONE_CHARS,
  STARTER_MAX_EMAILS,
  cleanContactEmail,
  contactsTier,
} from "@/lib/contactIdentifiers";

/**
 * Which of the caller's contacts are members who chose to be found.
 *
 * The body is `{ emails: string[], phones?: string[] }` straight out of
 * somebody's address book. Almost everyone in it is not a member and agreed
 * to nothing, so the whole route is built around what happens to that list:
 *
 * - **It is compared in this function's memory and then gone.** It is never
 *   written to a table, never passed to the database as a query parameter
 *   (`matchContacts` reads the findable accounts and compares here), and
 *   never logged.
 * - **No `console.*` call in this file may print the body, an identifier, or
 *   a caught error object** — an error thrown while parsing can carry the
 *   text it choked on. Catch blocks log a fixed string or nothing.
 * - **What comes back is an index, not an address.** Each match names the
 *   position in the uploaded list that hit, so the phone can label the row
 *   with its own contact name. No email, no number, and never a total.
 *
 * It is also an oracle — "does this address belong to a member?" — which is
 * why the order below matters. Everything that can refuse a request without
 * reading a counter does so first, so a request that was never going to be
 * answered uses up none of the caller's allowance. Then ONE combined limiter
 * call, which records nothing if any limit is full and stops the request if
 * the counters cannot be read (see lib/rateLimit.ts). Only then is anything
 * compared.
 *
 * The body is read as text and parsed by hand, not with the request's own
 * JSON reader, so its real size can be checked: `Content-Length` is whatever
 * the client says it is.
 */
export async function POST(req: Request) {
  // Switched off for this deployment: do nothing at all.
  if (!contactsMatchEnabled()) {
    return NextResponse.json({ error: "Not available.", code: "unavailable" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  // Only people with a proved address may look anyone up. It is the same bar
  // an account has to clear to be found, and the cheapest thing that makes a
  // throwaway account cost something. Nothing is recorded for this refusal.
  if (!user.emailVerifiedAt) {
    return NextResponse.json(
      { error: "Confirm your email first.", code: "verify-first" },
      { status: 403 }
    );
  }

  const tier = contactsTier(user);

  const tooLarge = () =>
    NextResponse.json({ error: "That's too many contacts to check at once." }, { status: 413 });
  const badRequest = () => NextResponse.json({ error: "Bad request." }, { status: 400 });

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_CHARS) return tooLarge();

  let parsed: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_CHARS) return tooLarge();
    parsed = JSON.parse(text);
  } catch {
    return badRequest();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return badRequest();
  const body = parsed as Record<string, unknown>;

  const rawEmails = body.emails ?? [];
  const rawPhones = body.phones ?? [];
  if (!Array.isArray(rawEmails) || !Array.isArray(rawPhones)) return badRequest();
  if (rawEmails.some((e) => typeof e !== "string" || e.length > MAX_EMAIL_CHARS)) return badRequest();
  if (rawPhones.some((p) => typeof p !== "string" || p.length > MAX_PHONE_CHARS)) return badRequest();

  // Clean and de-duplicate, remembering where in the caller's own list each
  // survivor sat: that position is what a match is reported by.
  let emails: string[] = [];
  let emailAt: number[] = [];
  const seenEmails = new Set<string>();
  (rawEmails as string[]).forEach((raw, i) => {
    const email = cleanContactEmail(raw);
    if (!email || seenEmails.has(email)) return;
    seenEmails.add(email);
    emails.push(email);
    emailAt.push(i);
  });
  if (emails.length > MAX_EMAILS) return tooLarge();

  // Phone numbers are only looked at for a caller whose own phone is verified
  // and current — the same bar as for being found by one — and only where the
  // hashing key exists. For everyone else the list is ignored, whatever the
  // client sent. They are hashed here and the readable numbers dropped; only
  // the keyed hashes go any further, and those stay in memory too.
  let phoneHmacs: string[] = [];
  let phoneAt: number[] = [];
  if (phoneMatchingAvailable() && phoneIsCurrent(user)) {
    const seenPhones = new Set<string>();
    try {
      (rawPhones as string[]).forEach((raw, i) => {
        const e164 = normalizeContactPhone(raw);
        if (!e164 || seenPhones.has(e164)) return;
        seenPhones.add(e164);
        phoneHmacs.push(phoneHmac(e164));
        phoneAt.push(i);
      });
    } catch {
      // The key vanished mid-request. Carry on with emails alone.
      phoneHmacs = [];
      phoneAt = [];
    }
    if (phoneHmacs.length > MAX_PHONES) return tooLarge();
  }

  const done = (matches: unknown[], checked: number, truncated: boolean) =>
    NextResponse.json(
      { matches, checked, truncated },
      { headers: { "Cache-Control": "no-store" } }
    );

  // Nothing usable to compare: answer without touching the allowance.
  if (emails.length === 0 && phoneHmacs.length === 0) return done([], 0, false);

  const limited = await limitOrReject(
    [
      { scope: "contacts-match:ip", key: clientIpBucket(req), ...LIMITS.ipDay },
      {
        scope: "contacts-match:user-day",
        key: user.id,
        ...(tier === "starter" ? LIMITS.starterUserDay : LIMITS.userDay),
      },
      { scope: "contacts-match:user-month", key: user.id, ...LIMITS.userMonth },
      { scope: "contacts-match:global-hour", key: "all", ...LIMITS.globalHour },
      { scope: "contacts-match:global-day", key: "all", ...LIMITS.globalDay },
      // Every new or `+`-alias account draws on one shared daily budget, so
      // making more accounts does not buy more lookups.
      ...(tier === "starter"
        ? [{ scope: "contacts-match:starter-day", key: "all", ...LIMITS.starterDay }]
        : []),
    ],
    { failClosed: true }
  );
  if (limited) return limited;

  // The circuit breaker: once this many matches have been handed out in a
  // day, across everyone, the route stops until the window clears. A counter
  // that cannot be read stops it too.
  // The window is passed twice on these reads: once to count, once to prune.
  // Nothing else sweeps these two counters (they never go through
  // limitOrReject), and both are one-day scopes, so the full window is safe.
  try {
    const shown = await countHits(
      "contacts-match:shown",
      "all",
      LIMITS.shownPause.windowMinutes,
      LIMITS.shownPause.windowMinutes
    );
    if (shown >= LIMITS.shownPause.max) {
      return NextResponse.json(
        { error: "Contact matching is paused for now. Try a username instead.", code: "paused" },
        { status: 503 }
      );
    }
  } catch {
    return limiterUnavailable();
  }

  // A starter account has only the start of its list checked, and is told so.
  let truncated = false;
  if (tier === "starter") {
    if (emails.length > STARTER_MAX_EMAILS || phoneHmacs.length > STARTER_MAX_EMAILS) truncated = true;
    emails = emails.slice(0, STARTER_MAX_EMAILS);
    emailAt = emailAt.slice(0, STARTER_MAX_EMAILS);
    phoneHmacs = phoneHmacs.slice(0, STARTER_MAX_EMAILS);
    phoneAt = phoneAt.slice(0, STARTER_MAX_EMAILS);
  }

  let found;
  try {
    found = await matchContacts(user.id, { emails, phoneHmacs }, MAX_MATCHES);
  } catch {
    // Fixed text only — see the note at the top about caught errors.
    console.error("[contacts/match] the findable accounts could not be read");
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  // Positions go back out in terms of the list the caller sent, not ours.
  const matches = found.map((m) => ({
    ...m,
    ref: {
      kind: m.ref.kind,
      index: m.ref.kind === "email" ? emailAt[m.ref.index] : phoneAt[m.ref.index],
    },
  }));

  // Count what was handed out, and tell the owner once a day if it is a lot.
  // Best effort: the caller's answer does not depend on it, and the pause
  // above reads the same counter on the next request.
  if (matches.length > 0) {
    try {
      await recordHits("contacts-match:shown", "all", matches.length);
      const shown = await countHits(
        "contacts-match:shown",
        "all",
        LIMITS.shownAlert.windowMinutes,
        LIMITS.shownAlert.windowMinutes
      );
      if (
        shown >= LIMITS.shownAlert.max &&
        (await countHits(
          "contacts-match:alert",
          "all",
          LIMITS.shownAlert.windowMinutes,
          LIMITS.shownAlert.windowMinutes
        )) === 0
      ) {
        await recordHits("contacts-match:alert", "all", 1);
        await sendOwnerAlert(
          "PlateMaps: unusual contact matching",
          [
            `Contact matching has returned ${shown} matches in the last 24 hours.`,
            `It pauses by itself at ${LIMITS.shownPause.max}.`,
            "",
            "If that is more than the number of people using the app explains, someone may be",
            "testing a list of addresses. Look at the contacts-match rows in rate_limit_hits.",
          ].join("\n")
        );
      }
    } catch {
      /* see above */
    }
  }

  return done(matches, emails.length + phoneHmacs.length, truncated);
}
