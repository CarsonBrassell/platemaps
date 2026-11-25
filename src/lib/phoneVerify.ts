import { createHmac } from "node:crypto";
import parsePhoneNumberFromString from "libphonenumber-js/min";
import { cleanContactPhone } from "@/lib/contactIdentifiers";
import { contactPepper, twilioConfig } from "@/lib/contactsConfig";

/**
 * Phone numbers: normalising them, hashing them, and texting a code.
 *
 * Server-only — it reads the hashing key and the Twilio credentials.
 *
 * **A phone number is never stored and never logged by this app.** What is
 * kept on an account is `phoneHmac(number)` and the last four digits. The
 * keyed hash means a copy of the database alone cannot be turned back into
 * numbers; someone holding the database AND `CONTACT_HMAC_PEPPER` could
 * brute-force it, and nothing here claims otherwise. Changing the key
 * orphans every stored phone (people verify again), which is what the `v1:`
 * prefix is for: a later `v2:` can sit beside it during a rotation.
 *
 * Twilio Verify is two plain `fetch` calls. Twilio generates the code, sends
 * it, expires it and counts wrong guesses, so there is no code table here to
 * get wrong. The browser never talks to Twilio, so the CSP is unchanged.
 */

/**
 * A number someone wants to verify, as E.164 (`+16195550123`), or null.
 *
 * US only. Verification texts are sent only to US numbers (Twilio's
 * geo-permissions are set to match), so anything else is refused here rather
 * than paid for and then blocked. `US` is the default region, so a number
 * typed without a country code is read the way a person here means it.
 */
export function normalizeUsPhone(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 32) return null;
  const parsed = parsePhoneNumberFromString(raw, "US");
  if (!parsed || !parsed.isValid() || parsed.country !== "US") return null;
  return parsed.number;
}

/**
 * A number out of somebody's address book, as E.164, or null.
 *
 * Looser than `normalizeUsPhone` about where the number is from, because an
 * address book holds whatever it holds; only a number some member verified
 * can ever match, so a foreign one simply never does. Most contacts are saved
 * without a country code, hence the `US` default. Extensions are cut first
 * (`cleanContactPhone`) so "(619) 555-0123 x5" is the same number as
 * "+16195550123".
 */
export function normalizeContactPhone(raw: string): string | null {
  const cleaned = cleanContactPhone(raw);
  if (!cleaned) return null;
  const parsed = parsePhoneNumberFromString(cleaned, "US");
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/**
 * The form a phone number is stored and compared in.
 *
 * Throws when the key is missing or too short to be a key. Callers check
 * `phoneVerifyAvailable()` / `phoneMatchingAvailable()` first, so reaching
 * the throw means a deployment lost its key mid-flight — and hashing with an
 * empty key would quietly produce values anyone could reproduce.
 */
export function phoneHmac(e164: string): string {
  const pepper = contactPepper();
  if (!pepper) throw new Error("CONTACT_HMAC_PEPPER is not set");
  return `v1:${createHmac("sha256", pepper).update(e164).digest("hex")}`;
}

/** The last four digits, the only readable part of a number that is kept. */
export function phoneLast4(e164: string): string {
  return e164.slice(-4);
}

/**
 * What came back from Twilio. `refused` is a definite no (a 4xx: nothing was
 * created, no text went). `unknown` is everything we cannot be sure about — a
 * timeout, a network error, a 5xx, a body that does not parse — where a text
 * may or may not have gone.
 */
type TwilioResult =
  | { kind: "ok"; data: Record<string, unknown> }
  | { kind: "refused" }
  | { kind: "unknown" };

/**
 * One form-encoded POST to Twilio Verify. Never throws, and never logs the
 * request, the response or a caught error: all three contain the phone number.
 */
async function twilioPost(
  path: "Verifications" | "VerificationCheck",
  form: Record<string, string>,
): Promise<TwilioResult> {
  const config = twilioConfig();
  if (!config) return { kind: "unknown" };

  // Bounded for the same reason the mailer is: somebody is watching a button.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(config.serviceSid)}/${path}`,
      {
        method: "POST",
        headers: {
          // An API key, not the account's master token: it can be revoked on
          // its own if it ever leaks.
          Authorization: `Basic ${Buffer.from(`${config.apiKeySid}:${config.apiKeySecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(form).toString(),
        signal: controller.signal,
      },
    );
    if (res.status >= 400 && res.status < 500) return { kind: "refused" };
    if (!res.ok) return { kind: "unknown" };
    const data: unknown = await res.json();
    return data && typeof data === "object"
      ? { kind: "ok", data: data as Record<string, unknown> }
      : { kind: "unknown" };
  } catch {
    return { kind: "unknown" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Text a code to a number. Only these three words come back: Twilio's own
 * error text names carriers, line types and fraud verdicts, none of which is
 * the caller's business. `refused` and `unknown` are both "not sent" to the
 * person; the route tells them apart only to decide whether a quota it
 * charged can be given back.
 */
export async function twilioSend(e164: string): Promise<"ok" | "refused" | "unknown"> {
  const result = await twilioPost("Verifications", { To: e164, Channel: "sms" });
  return result.kind;
}

/**
 * Whether `code` is the one Twilio texted to that number. A wrong code, an
 * expired one, too many guesses and an unreachable Twilio are all `"failed"`.
 */
export async function twilioCheck(e164: string, code: string): Promise<"ok" | "failed"> {
  const result = await twilioPost("VerificationCheck", { To: e164, Code: code });
  return result.kind === "ok" && result.data.status === "approved" ? "ok" : "failed";
}
