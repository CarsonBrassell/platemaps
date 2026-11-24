/**
 * Who may delete anyone's post or comment.
 *
 * Keyed by user id, never by name or handle: a display name can be changed by
 * its owner and is not unique, so anyone could rename themselves into a
 * name-based list. The id is the session's own user id, read on the server.
 *
 * The server is the gate. `DELETE /api/posts/[id]` and
 * `DELETE /api/comments/[id]` ask `isAdminUser` before deleting anything not
 * the caller's own. The account JSON carries `admin: true` only for these ids
 * (lib/account.ts) so the client can show the delete controls, and a client
 * that forged the flag gets a 403 from the route, not a deletion.
 */
export const ADMIN_USER_IDS: ReadonlySet<string> = new Set([
  /* Carson Brassell (@carsonbrassell) */
  "0c39f913-fa39-4fdf-b2d6-486c027cebdc",
]);

/** Whether the account with this id is an admin. Signed out is never. */
export function isAdminUser(id?: string | null): boolean {
  return typeof id === "string" && ADMIN_USER_IDS.has(id);
}
