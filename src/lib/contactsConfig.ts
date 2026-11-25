/**
 * Whether the contacts features are switched on for this deployment.
 *
 * Server-only: it reads `process.env`. Everything here is false until the
 * owner sets the variables, and with all of it false the site and the app
 * behave exactly as they did before the feature existed — no route does
 * anything, and the account JSON carries no flag for a screen to draw from.
 *
 * The decision lives on the server, and reaches the client only as the
 * `contactsAvailable` / `phoneVerifyAvailable` flags on the account JSON
 * (`lib/account.ts`). A screen never guesses.
 */

/**
 * "Find friends from contacts" as a whole: the match route, and being allowed
 * to turn on "Find me from contacts".
 *
 * Its own switch, although Tier A needs no outside account, for two reasons.
 * The code can be deployed before `npm run db:migrate` has added the columns
 * it reads, and a switch nobody has flipped is what keeps that harmless. And
 * the policy text, the App Store privacy answers and the app build have to
 * exist before anyone is asked the question.
 */
export function contactsMatchEnabled(): boolean {
  return process.env.CONTACTS_MATCH_ENABLED === "1";
}

/** The secret key phone numbers are hashed with. Null when unset or too short to be one. */
export function contactPepper(): string | null {
  const pepper = process.env.CONTACT_HMAC_PEPPER;
  return pepper && pepper.length >= 32 ? pepper : null;
}

export type TwilioConfig = {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  serviceSid: string;
};

/** The four Twilio values, or null unless every one is present. */
export function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!accountSid || !apiKeySid || !apiKeySecret || !serviceSid) return null;
  return { accountSid, apiKeySid, apiKeySecret, serviceSid };
}

/**
 * Adding a verified phone number: needs the feature on, the hashing key, and
 * all of Twilio. Any one missing and the phone routes answer "not available"
 * and the phone rows are never drawn.
 */
export function phoneVerifyAvailable(): boolean {
  return contactsMatchEnabled() && contactPepper() !== null && twilioConfig() !== null;
}

/**
 * Whether uploaded phone numbers can be compared at all. Needs only the key,
 * not Twilio: if Twilio is taken away later, numbers already verified keep
 * matching.
 */
export function phoneMatchingAvailable(): boolean {
  return contactsMatchEnabled() && contactPepper() !== null;
}
