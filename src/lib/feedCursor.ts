/**
 * Feed pagination cursor (probe/PERF-PLAN.md S5).
 *
 * A feed page ends with a cursor naming the last row it showed, and the next
 * page is "everything after that row" — keyset pagination, so a post landing
 * at the top between two scrolls neither duplicates nor skips anything, and
 * the database walks an index instead of counting past an OFFSET.
 *
 * `at` is the clock the first page was ranked against. Trending is a decay
 * over age, so re-ranking each page against a fresh `now()` would let the
 * order shift under the cursor; every page of one scroll uses the same `at`,
 * which makes the ordering a pure function of the data and the cursor exact.
 *
 * Opaque to the client: it is base64url JSON and the client only ever hands
 * it back. The server validates every field on the way in.
 */
export type FeedCursor = {
  /** ISO timestamp the whole scroll is ranked against. */
  at: string;
  /** `created_at::text` of the last row — full microsecond precision, which a JS Date would lose. */
  createdAt: string;
  /** Last row's id, the tie-breaker. */
  id: string;
  /** Last row's trending score, null on chronological feeds. */
  score: number | null;
};

export function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/;

/** Null for anything that is not a cursor this module wrote. */
export function decodeCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw || raw.length > 400) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { at, createdAt, id, score } = parsed as Record<string, unknown>;
  if (typeof at !== "string" || !ISO_LIKE.test(at) || Number.isNaN(Date.parse(at))) return null;
  if (typeof createdAt !== "string" || !ISO_LIKE.test(createdAt)) return null;
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return null;
  if (score !== null && (typeof score !== "number" || !Number.isFinite(score))) return null;
  return { at, createdAt, id, score };
}

/** Page size ceiling and default; the routes clamp `?limit=` to it. */
export const FEED_PAGE_LIMIT = 30;

/**
 * Clamps `?limit=` to 1..FEED_PAGE_LIMIT, defaulting to the ceiling. A
 * smaller page is for a client that wants a quick first paint (or a check
 * that the cursor really pages); a larger one is never granted.
 */
export function parseFeedLimit(raw: string | null | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return FEED_PAGE_LIMIT;
  return Math.min(Math.trunc(value), FEED_PAGE_LIMIT);
}
