/**
 * Who gets the dish-level picks in Your taste while they are being tried out.
 *
 * The feature ships to production but is live for the accounts listed here and
 * nobody else. Everyone else, signed in or out, gets exactly what the site did
 * before it existed: the same answers on the wire, the same markup, the same
 * cards. Nothing about the gate is a setting or a flag a visitor could flip;
 * it is the session's own user id, read on the server.
 *
 * Both halves read from here. The server asks `isForMeUser` before it does any
 * dish-pick work (app/api/account/taste/route.ts), and puts `forMe: true`
 * on the account JSON only for these ids (lib/account.ts), which is what the
 * client's `useForMeAccess` reads. Removing the gate for everyone is deleting
 * that field and the checks that read it.
 */
export const FOR_ME_USER_IDS: ReadonlySet<string> = new Set([
  /* Calvin Lensink */
  "940561ca-05c8-4010-b8a9-f397235378b9",
  /* Carson Brassell */
  "0c39f913-fa39-4fdf-b2d6-486c027cebdc",
  /* Ellie Felber. Added 2026-11-22 for the flavor wheel on the phone profile
     (lib/flavorWheelSnapshots.ts); being on this list gives her the dish picks too. */
  "cc8b9144-dfdd-4a6a-bffb-22babf7ea1a0",
]);

/** Whether the account with this id is on the list. Signed out is never. */
export function isForMeUser(id?: string | null): boolean {
  return typeof id === "string" && FOR_ME_USER_IDS.has(id);
}

/**
 * Who gets the For me and Nearby buttons on Discover (lib/discoverModes.ts)
 * in place of the Your taste row. A narrower list than the one above, and an
 * id only counts when it is on that one too: the buttons show the same dish
 * picks, laid out as the grid. Everyone else on the list above keeps the row.
 */
export const DISCOVER_MODES_USER_IDS: ReadonlySet<string> = new Set([
  /* Calvin Lensink */
  "940561ca-05c8-4010-b8a9-f397235378b9",
]);

/** Whether the account with this id gets the Discover buttons. Signed out is never. */
export function isDiscoverModesUser(id?: string | null): boolean {
  return isForMeUser(id) && DISCOVER_MODES_USER_IDS.has(id as string);
}

/**
 * Who gets the 40-axis flavor fit (lib/flavor40.ts) blended into their For me picks. Calvin only: Carson and
 * everyone else keep today's ranking byte for byte. An id only counts when it is on the For me list too.
 */
export const FLAVOR40_USER_IDS: ReadonlySet<string> = new Set([
  /* Calvin Lensink */
  "940561ca-05c8-4010-b8a9-f397235378b9",
]);

/** Whether the account with this id gets the 40-axis fit. Signed out is never. */
export function isFlavor40User(id?: string | null): boolean {
  return isForMeUser(id) && FLAVOR40_USER_IDS.has(id as string);
}

/**
 * Who gets the new phone profile (2026-11-24): name and photo on the Plate
 * Points card, the flavor wheel and eater type inside it, Try next as cards.
 * Calvin only; everyone else, Carson and Ellie included, keeps the previous
 * profile byte for byte.
 */
export const PROFILE_V2_USER_IDS: ReadonlySet<string> = new Set([
  /* Calvin Lensink */
  "940561ca-05c8-4010-b8a9-f397235378b9",
]);

/** Whether the account with this id gets the new phone profile. Signed out is never. */
export function isProfileV2User(id?: string | null): boolean {
  return typeof id === "string" && PROFILE_V2_USER_IDS.has(id);
}
