"use client";

/**
 * The app's side of "Find friends from your contacts": what the phone does
 * with the Capacitor contacts plugin. Mirrors `pushClient.ts`.
 *
 * The site is one bundle for the browser and for the iOS app, and the plugin
 * only exists in an app build that shipped its native half. A browser tab and
 * an older app build both answer "unsupported", and every caller draws
 * nothing for that answer, so no screen needs its own "are we native" branch.
 *
 * THE RULE THIS MODULE EXISTS TO KEEP: the plugin's `getContacts()` (and
 * `getContact()` / `pickContact()`) show the iOS permission prompt by
 * themselves the first time they run. That prompt must never appear before
 * our own explanation, so:
 *
 *   - `getContactsSupport()` is the ONLY export that may be called before the
 *     contacts sheet's Continue button. It uses `checkPermissions()`, which
 *     reads the current answer and never prompts.
 *   - `requestContactsAccess()` and `readDeviceContacts()` are called from
 *     that Continue path and nowhere else.
 *   - Nothing here calls `createContact`, `deleteContact` or `pickContact`,
 *     and nothing may start to.
 *
 * Nothing in this module writes to localStorage or sessionStorage. A contact
 * list lives in React state for as long as the Friends screen is mounted.
 */

import {
  MAX_BODY_CHARS,
  MAX_EMAILS,
  MAX_PHONE_CHARS,
  MAX_PHONES,
  cleanContactEmail,
  cleanContactPhone,
} from "@/lib/contactIdentifiers";

/**
 *   "unsupported"  a browser tab, or an app build without the plugin
 *   "prompt"       the app, iOS has not been asked yet
 *   "granted"      full access
 *   "limited"      iOS 18's "only these contacts"
 *   "denied"       refused or restricted; only iOS Settings can change it
 */
export type ContactsSupport = "unsupported" | "prompt" | "granted" | "limited" | "denied";

/**
 * One address-book entry, as much of it as this feature reads. `name` is the
 * person's own label for the contact and never leaves the phone. `emails` are
 * already cleaned; `phones` are kept as the address book wrote them, for
 * showing, and are cleaned again wherever they are used.
 */
export type DevicePerson = { name: string; emails: string[]; phones: string[] };

/** The JS name the native half registers under (`jsName` in ContactsPlugin.swift). */
const PLUGIN_NAME = "Contacts";

async function pluginPresent(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const { Capacitor } = await import("@capacitor/core");
  // Both halves. `isNativePlatform` alone is true in App Store builds that
  // predate the plugin, where calling it would throw "not implemented".
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(PLUGIN_NAME);
}

/**
 * Boxed on purpose: a Capacitor plugin is a Proxy that answers `then`, so an
 * async function returning it bare is treated as a thenable and rejects. See
 * the same comment in `pushClient.ts`, where that shipped.
 */
async function plugin() {
  const { Contacts } = await import("@capacitor-community/contacts");
  return { contacts: Contacts };
}

function toSupport(state: string): ContactsSupport {
  if (state === "granted" || state === "limited" || state === "denied") return state;
  if (state === "prompt" || state === "prompt-with-rationale") return "prompt";
  // Anything this code has not heard of is treated as "no": the cautious side.
  return "denied";
}

/**
 * Whether this screen can read contacts, and what iOS currently says. Never
 * prompts. Never throws: any failure reads as "unsupported", which hides the
 * feature rather than offering a button that cannot work.
 */
export async function getContactsSupport(): Promise<ContactsSupport> {
  try {
    if (!(await pluginPresent())) return "unsupported";
    const { contacts } = await plugin();
    const status = await contacts.checkPermissions();
    return toSupport(status.contacts);
  } catch {
    return "unsupported";
  }
}

/**
 * Shows the iOS contacts prompt if it has never been shown, and resolves with
 * the answer. ONLY the contacts sheet's Continue button may call this.
 */
export async function requestContactsAccess(): Promise<ContactsSupport> {
  try {
    if (!(await pluginPresent())) return "unsupported";
    const { contacts } = await plugin();
    const status = await contacts.requestPermissions();
    return toSupport(status.contacts);
  } catch {
    return "denied";
  }
}

/**
 * Reads names, email addresses and phone numbers from the address book, on
 * the phone. ONLY the contacts sheet's Continue path may call this, after
 * `requestContactsAccess()` said "granted" or "limited".
 *
 * The projection is the whole privacy story on the device side: photos,
 * notes, postal addresses, birthdays and organisations are never asked for,
 * so the native half never reads them.
 *
 * Throws when access is missing or the read fails; the sheet shows its error
 * step.
 */
export async function readDeviceContacts(): Promise<DevicePerson[]> {
  if (!(await pluginPresent())) throw new Error("contacts unavailable");
  const { contacts } = await plugin();

  // `getContacts` would raise the iOS prompt itself if access were missing.
  // Refusing here means a future caller that skips the Continue path gets an
  // error instead of a system prompt nobody explained.
  const access = toSupport((await contacts.checkPermissions()).contacts);
  if (access !== "granted" && access !== "limited") throw new Error("contacts not allowed");

  const result = await contacts.getContacts({
    projection: { name: true, emails: true, phones: true },
  });

  const people: DevicePerson[] = [];
  for (const entry of result.contacts ?? []) {
    const emails: string[] = [];
    for (const item of entry.emails ?? []) {
      const clean = typeof item?.address === "string" ? cleanContactEmail(item.address) : null;
      if (clean && !emails.includes(clean)) emails.push(clean);
    }
    const phones: string[] = [];
    for (const item of entry.phones ?? []) {
      const raw = typeof item?.number === "string" ? item.number.trim() : "";
      if (raw && cleanContactPhone(raw) && !phones.includes(raw)) phones.push(raw);
    }
    // Nothing to match on and nothing to invite with: not worth a row.
    if (emails.length === 0 && phones.length === 0) continue;

    const given = [entry.name?.given, entry.name?.family]
      .filter((part): part is string => typeof part === "string" && part.trim() !== "")
      .join(" ");
    const name = (entry.name?.display ?? "").trim() || given || emails[0] || phones[0];
    people.push({ name, emails, phones });
  }
  return people;
}

export type ContactsUpload = {
  /** What goes in the request body. */
  emails: string[];
  /** `emailOwners[i]` is the index in `people` that `emails[i]` came from. */
  emailOwners: number[];
  /** Present only when phones are being sent. */
  phones?: string[];
  phoneOwners?: number[];
};

/**
 * Turns the address book into the request body, and remembers which contact
 * each entry came from so a match (the server answers with a position in
 * these arrays, never with a name or an address) can be labelled with the
 * person's own name for them.
 *
 * De-duplicated, cut to the server's counts, and stopped before the JSON
 * would pass the server's size cap, so a real address book can never be
 * refused for being big. Emails are added first: they are what every caller
 * may send, and phones only fill what is left.
 *
 * `includePhones` must be true only for an account whose own phone is
 * verified; the sheet decides, and its explainer says which it will be.
 */
export function buildUpload(
  people: DevicePerson[],
  { includePhones }: { includePhones: boolean }
): ContactsUpload {
  // `{"emails":[],"phones":[]}` and a little slack for the punctuation.
  let chars = 32;
  const fits = (value: string) => chars + JSON.stringify(value).length + 1 <= MAX_BODY_CHARS;

  const emails: string[] = [];
  const emailOwners: number[] = [];
  const seenEmails = new Set<string>();
  people.forEach((person, owner) => {
    for (const email of person.emails) {
      if (emails.length >= MAX_EMAILS || seenEmails.has(email) || !fits(email)) continue;
      seenEmails.add(email);
      emails.push(email);
      emailOwners.push(owner);
      chars += JSON.stringify(email).length + 1;
    }
  });
  if (!includePhones) return { emails, emailOwners };

  const phones: string[] = [];
  const phoneOwners: number[] = [];
  const seenPhones = new Set<string>();
  people.forEach((person, owner) => {
    for (const raw of person.phones) {
      const phone = cleanContactPhone(raw);
      if (!phone || phone.length > MAX_PHONE_CHARS) continue;
      if (phones.length >= MAX_PHONES || seenPhones.has(phone) || !fits(phone)) continue;
      seenPhones.add(phone);
      phones.push(phone);
      phoneOwners.push(owner);
      chars += JSON.stringify(phone).length + 1;
    }
  });
  return { emails, emailOwners, phones, phoneOwners };
}

/**
 * A link that opens Messages addressed to one number with `text` filled in,
 * or null when the number is not one.
 *
 * The number goes through `cleanContactPhone` first, which leaves only digits
 * and one leading `+`. That is the security half: a contact field containing
 * `&body=` or a comma cannot change the message or add recipients.
 *
 * `&body=` rather than `?body=` is the iOS form, and this is only ever built
 * inside the iOS app.
 */
export function smsHref(rawPhone: string, text: string): string | null {
  const clean = cleanContactPhone(rawPhone);
  if (!clean) return null;
  return `sms:${clean}&body=${encodeURIComponent(text)}`;
}

/**
 * A link that opens Mail addressed to one person, or null when the address is
 * not one. Re-validated here, although `readDeviceContacts` already did, so
 * the link is safe whatever a caller hands in; the address is also encoded so
 * a `?` or `&` allowed in a local part cannot start a second header.
 */
export function mailHref(email: string, text: string): string | null {
  const clean = cleanContactEmail(email);
  if (!clean) return null;
  const to = encodeURIComponent(clean).replace(/%40/g, "@");
  return `mailto:${to}?subject=${encodeURIComponent("Join me on PlateMaps")}&body=${encodeURIComponent(text)}`;
}
