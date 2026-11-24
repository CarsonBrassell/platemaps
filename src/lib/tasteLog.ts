import { sql } from "@/lib/sqlClient";

/**
 * The For me row's activity log: what the row showed, and what was tapped in it.
 *
 * Two tables (scripts/migrate.mjs). `taste_shown` holds one row per place in
 * each row of picks the server sent; `taste_tapped` holds one row per tap on a
 * place that was sent. Nothing reads them yet: they exist so a later change to
 * how picks are made can be judged against what people actually opened.
 *
 * Written only for the accounts on `lib/forMeGate.ts`. The callers gate, not
 * this file. Everything here is best effort: no function throws, and a missing
 * table (not migrated yet) is silent, so the log can never cost anyone their
 * picks.
 */

export type TasteSurface = "web" | "phone";
export const TASTE_SURFACES: readonly TasteSurface[] = ["web", "phone"];

/**
 * One place in a row of picks: where it sat, and the kind and wording of its
 * reason. `dish` and `score` are the menu line a dish pick was sent for and
 * what it scored (null for any other pick).
 */
export type ShownPick = {
  id: string;
  position: number;
  slot: string;
  reason: string;
  dish: string | null;
  score: number | null;
};

/** A batch id is the picks route's `randomUUID()`. */
const BATCH = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const isBatchId = (v: unknown): v is string => typeof v === "string" && BATCH.test(v);

/** The ops that are a tap on a pick's own buttons (Been here, Not for me) or the undo of one. */
const TAP_OPS: readonly string[] = ["been", "hide", "unbeen", "unhide"];
export const isTapOp = (kind: string): boolean => TAP_OPS.includes(kind);

function failed(what: string, err: unknown) {
  // 42P01: the tables are not on this database yet.
  if ((err as { code?: string } | null)?.code === "42P01") return;
  console.error(`taste log: ${what} failed`, err);
}

/** Records a row of picks as sent. `batch` names the row; a repeat of the same batch and place is ignored. */
export async function logTasteShown(
  userId: string,
  batch: string,
  picks: readonly ShownPick[],
  opts: { algo: string; refresh: boolean },
): Promise<void> {
  if (picks.length === 0) return;
  try {
    await sql`
      INSERT INTO taste_shown (user_id, batch_id, restaurant_id, position, slot, reason, dish, score, algo, refresh)
      SELECT ${userId}::text, ${batch}::text, r.id, r.position, r.slot, NULLIF(r.reason, ''),
             NULLIF(r.dish, ''), r.score, ${opts.algo}::text, ${opts.refresh}::boolean
      FROM jsonb_to_recordset(${JSON.stringify(picks)}::jsonb)
        AS r(id text, position int, slot text, reason text, dish text, score real)
      ON CONFLICT (batch_id, restaurant_id) DO NOTHING`;
  } catch (err) {
    failed("shown", err);
  }
}

/**
 * Marks places of one of this person's own batches as really seen on screen.
 * The first sighting stands. The whole row takes the surface it was seen on,
 * so the places never scrolled to are labelled phone or web too.
 */
export async function markTasteSeen(
  userId: string,
  batch: string,
  ids: readonly string[],
  surface: TasteSurface,
): Promise<void> {
  if (ids.length === 0) return;
  try {
    await sql`
      UPDATE taste_shown
      SET surface = COALESCE(surface, ${surface}::text),
          seen_at = CASE
            WHEN seen_at IS NULL AND restaurant_id = ANY(${[...ids]}::text[]) THEN now()
            ELSE seen_at
          END
      WHERE user_id = ${userId}
        AND batch_id = ${batch}
        AND (surface IS NULL OR (seen_at IS NULL AND restaurant_id = ANY(${[...ids]}::text[])))`;
  } catch (err) {
    failed("seen", err);
  }
}

/**
 * Records a card being opened. Copied from the shown row, so it lands only for
 * a place that batch really held for this person, at the position the server
 * sent it in. Anything else writes nothing.
 */
export async function logTasteOpen(
  userId: string,
  batch: string,
  restaurantId: string,
  surface: TasteSurface,
): Promise<void> {
  try {
    await sql`
      INSERT INTO taste_tapped (user_id, batch_id, restaurant_id, kind, position, surface)
      SELECT s.user_id, s.batch_id, s.restaurant_id, 'open', s.position, ${surface}::text
      FROM taste_shown s
      WHERE s.user_id = ${userId} AND s.batch_id = ${batch} AND s.restaurant_id = ${restaurantId}
      LIMIT 1`;
  } catch (err) {
    failed("open", err);
  }
}

/**
 * Records Been here / Not for me (or the undo of one), which reach the picks
 * route as an op. It is filed against the row of picks it was tapped in
 * (`batch`, sent by the browser) when that row held the place, and otherwise
 * against the newest row that showed this person the place: an undo arrives
 * after the row has moved on. A place they were never shown writes nothing.
 */
export async function logTasteOpTap(
  userId: string,
  restaurantId: string,
  kind: string,
  batch: string | null,
): Promise<void> {
  if (!isTapOp(kind)) return;
  try {
    await sql`
      INSERT INTO taste_tapped (user_id, batch_id, restaurant_id, kind, position, surface)
      SELECT s.user_id, s.batch_id, s.restaurant_id, ${kind}::text, s.position, s.surface
      FROM taste_shown s
      WHERE s.user_id = ${userId} AND s.restaurant_id = ${restaurantId}
      ORDER BY (s.batch_id = ${batch}::text) DESC NULLS LAST, s.shown_at DESC, s.id DESC
      LIMIT 1`;
  } catch (err) {
    failed(kind, err);
  }
}
