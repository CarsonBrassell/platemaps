/**
 * The accounts that carry a verified badge.
 *
 * **Keyed by user id, never by name.** There are four accounts in the database
 * whose names are some spelling of "calvin lensink" — two of them typos
 * ("calvin lenisnk"), one a bare "clensink" — and exactly one of them is the
 * person who actually posts. A name or handle match would badge whichever of
 * those it hit first, which is the one failure a verification mark cannot
 * have: the whole point of the badge is that it says *this* account and not
 * the ones next to it that look like it.
 *
 * A hand-authored list rather than a `users.verified` column, for now. This is
 * two people, and CLAUDE.md's rule for bounded hand-authored vocabularies puts
 * them in `src/data/` rather than in Postgres — the same call `regions.ts` and
 * `priceBands.ts` already make. **Move it to a column the moment verification
 * becomes something anyone applies for**, because at that point it grows with
 * the city and stops being a vocabulary; a list in the bundle would then mean
 * a deploy per verified user, and it ships every verified id to every browser.
 */
export const VERIFIED_USER_IDS: ReadonlySet<string> = new Set([
  /* Carson Brassell — csbrassell@gmail.com */
  "0c39f913-fa39-4fdf-b2d6-486c027cebdc",
  /* Calvin Lensink — cjlensink.den@gmail.com, the account with the posts.
     Not cal@email, cjlensink@gmail.com or clensink@platemaps.com, which are
     the empty duplicates. */
  "940561ca-05c8-4010-b8a9-f397235378b9",
]);

export function isVerified(userId: string | null | undefined): boolean {
  return !!userId && VERIFIED_USER_IDS.has(userId);
}
