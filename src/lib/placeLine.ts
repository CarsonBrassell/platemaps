/**
 * The "Mexican · North Park · 0.4 mi" subtitle every restaurant surface prints
 * under a name.
 *
 * A one-line join would not need a module. This exists because `cuisine` became
 * nullable: about 400 listed restaurants arrived from OpenStreetMap with no
 * `cuisine=` tag, and they used to carry the literal string "Restaurant" to
 * paper over it — which is exactly what put a 382-row "Restaurant" option in
 * the Discover facet. Recording the absence honestly moved the problem here:
 * eight surfaces wrote `{cuisine} · {neighborhood}` directly, and each of them
 * would now render a leading separator for those rows.
 *
 * Fixing it eight times invites the ninth to get it wrong, so the join is one
 * function: empty parts drop out, and a subtitle that has nothing left to say
 * returns "" rather than a lone separator.
 */

/** The separator every one of these lines already used. */
const SEP = " · ";

export function placeLine(...parts: ReadonlyArray<string | null | undefined>): string {
  return parts.map((p) => p?.trim()).filter((p): p is string => !!p).join(SEP);
}
