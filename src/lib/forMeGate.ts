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
  "940561ca-05c8-4010-b8a9-f397235378b9",
]);

/** Whether the account with this id is on the list. Signed out is never. */
export function isForMeUser(id?: string | null): boolean {
  return typeof id === "string" && FOR_ME_USER_IDS.has(id);
}
