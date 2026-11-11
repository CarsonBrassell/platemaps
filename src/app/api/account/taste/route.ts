import { randomUUID } from "node:crypto";
import { NextResponse, after } from "next/server";
import { clientIp } from "@/lib/loginThrottle";
import { limitOrReject } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";
import { postsForDishTaste } from "@/lib/db";
import { loadDishIndex } from "@/lib/dishIndex";
import { dishPickLog, passesFloor, rankDishes } from "@/lib/dishTaste";
import { isForMeUser } from "@/lib/forMeGate";
import { TASTE_OP_KINDS, meanRating, scoreTaste, type TasteOp, type TastePick } from "@/lib/taste";
import { resolveTasteContext } from "@/lib/tasteContext";
import { isBatchId, isTapOp, logTasteOpTap, logTasteShown } from "@/lib/tasteLog";

/**
 * "Your taste" picks for Discover, computed per viewer.
 *
 * POST only and never cached: the answer is personal, and Discover's own GET is
 * public and CDN-keyed by query string, so none of this may ride on it.
 *
 * Takes no user id and must never grow one (same rule as
 * `/api/account/flavor-profile`): the only taste it can read or write is the
 * session's. Body: `{ prefs?, op?, limit?, import? }`.
 *
 * Where prefs live (`storage` in the reply):
 * - `"server"`: signed in and `taste_prefs` exists. The row is the truth and
 *   body prefs are ignored, except a one-time `import: true` when the viewer has
 *   no row yet (the client's pm.taste.v1 copy from before they signed in).
 * - `"local"`: signed out, or the table is not migrated yet. The body's prefs are
 *   validated against the corpus, used for this answer and never stored; the
 *   reply echoes the updated prefs for the client to keep.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

// The first request after the dish index lapses reads the menu table in pages.
export const maxDuration = 60;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * How long the dish-level picks may wait on a cold dish index. A cold instance builds the index from the
 * menu table (about 16s); past this grace the viewer gets the ordinary picks now, and the build finishes in
 * the background so the next request finds it warm.
 */
const DISH_INDEX_GRACE_MS = 2500;

/** The most place ids a refresh may carry. The newest are kept. */
const MAX_EXCLUDE = 240;

/** A body's `exclude`: an array's strings of 1 to 64 characters, de-duplicated, the last 240. Anything else is empty. */
function excludeIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const ids = new Set<string>();
  for (const x of v) if (typeof x === "string" && x.length >= 1 && x.length <= 64) ids.add(x);
  return [...ids].slice(-MAX_EXCLUDE);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Expected JSON." }, 400);
  }
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  let op: TasteOp | null = null;
  if (b.op !== undefined && b.op !== null) {
    const o = b.op as { kind?: unknown; value?: unknown };
    if (
      typeof o !== "object" ||
      typeof o.kind !== "string" ||
      !(TASTE_OP_KINDS as readonly string[]).includes(o.kind) ||
      (o.value !== undefined && typeof o.value !== "string")
    ) {
      return json({ error: "Unknown op." }, 400);
    }
    op = { kind: o.kind as TasteOp["kind"], value: o.value as string | undefined };
  }
  const limit = typeof b.limit === "number" && Number.isFinite(b.limit) ? b.limit : undefined;
  // Place ids already shown by a "Refresh" (dish-level test only). Read here so it is validated once; it is
  // only ever used below for an account on the gate, and ignored for everyone else.
  const exclude = excludeIds(b.exclude);

  const user = await getCurrentUser();

  // A signed-in write is metered per person, and so is a refresh on the dish-level test (it re-ranks the whole
  // index). Everything else is metered per address, because it needs no account and scores the whole corpus.
  if (user ? op || (exclude.length > 0 && isForMeUser(user.id)) : true) {
    const limited = await limitOrReject({
      scope: user ? "taste:user" : "taste:ip",
      key: user ? user.id : clientIp(req),
      max: user ? 120 : 240,
      windowMinutes: 10,
    });
    if (limited) {
      limited.headers.set("Cache-Control", "private, no-store");
      return limited;
    }
  }

  // Prefs (server row or the body's local copy), the op, history and friends are
  // gathered by `lib/tasteContext.ts`.
  const ctx = await resolveTasteContext({
    user,
    prefs: b.prefs,
    op,
    importLocal: b.import === true,
  });
  const { storage, prefs } = ctx;

  const result = scoreTaste({
    restaurants: ctx.corpus.restaurants,
    plates: ctx.corpus.plates,
    prefs,
    postedIds: ctx.postedIds,
    favoriteCuisine: ctx.favoriteCuisine,
    friendVisits: ctx.friendVisits,
    limit,
  });

  // The viewer on the dish-level test reads their own posts' dishes instead of
  // the cuisine picks. Gated before any extra load; with too little to go on, or
  // a failed read, the ordinary picks stand.
  let picks: TastePick[] = result.picks;
  let { basis, header, shortHeader } = result;
  // The name of this row of picks in the activity log (lib/tasteLog.ts). Test accounts only: everyone else's
  // reply carries no `batch` and is what it always was.
  let batch: string | undefined;
  if (user && isForMeUser(user.id)) {
    let algo = "cuisine-1";
    // The quality floor (over 4.0 stars, 5+ reviews) holds on the fallback too.
    // A refresh drops what was already shown, so one that has run out answers with none rather than the old picks.
    picks = result.picks.filter((p) => passesFloor(p.restaurant));
    if (exclude.length > 0) {
      const shown = new Set(exclude);
      picks = picks.filter((p) => !shown.has(p.restaurant.id));
    }
    try {
      // One call only: concurrent callers share the in-flight build inside loadDishIndex, so holding this
      // promise past the grace never starts a second build.
      const indexLoad = loadDishIndex(ctx.corpus);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const graced = await Promise.race([
        indexLoad,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), DISH_INDEX_GRACE_MS);
        }),
      ]);
      clearTimeout(timer);
      if (graced === null) {
        // Cold: keep the instance alive until the build lands (a failure is logged by the catch below on the
        // next request, which retries), and answer with the ordinary picks.
        after(() => indexLoad.then(() => undefined, () => undefined));
      } else {
        const posts = await postsForDishTaste(user.id);
        const dish = rankDishes({
          index: graced,
          restaurants: ctx.corpus.restaurants,
          plates: ctx.corpus.plates,
          ratingMean: meanRating(ctx.corpus.restaurants),
          posts,
          prefs,
          now: Date.now(),
          limit,
          exclude,
        });
        // A refresh that has run out of dish picks answers with none (the client starts over), never with the
        // cuisine-level picks, which are a different kind of card.
        if (dish && (dish.length > 0 || exclude.length > 0)) {
          picks = dish;
          algo = "dish-1";
          // scoreTaste reports "none" (and an empty header) when the cuisine picks had nothing to go on, but
          // the client hides the section on "none", so valid dish picks would never show.
          if (dish.length > 0 && basis === "none") {
            basis = "history";
            header = "Based on your posts";
            shortHeader = header;
          }
        }
      }
    } catch (err) {
      console.error("dish picks failed, keeping the ordinary picks", err);
    }

    // The activity log: what this reply shows, and the Been here / Not for me (or undo) that asked for it.
    // Written after the reply has gone, so it can neither slow the picks nor fail them.
    const tapped =
      op && op.value && isTapOp(op.kind)
        ? { id: op.value, kind: op.kind, batch: isBatchId(b.batch) ? b.batch : null }
        : null;
    const id = picks.length > 0 ? randomUUID() : undefined;
    batch = id;
    if (tapped || id) {
      const userId = user.id;
      const refresh = exclude.length > 0;
      const shown = picks.map((p, i) => {
        const made = dishPickLog(p);
        return {
          id: p.restaurant.id,
          position: i,
          slot: p.reason.kind,
          // A friend pick's wording names the friend: the log keeps its kind, not the name.
          reason: p.reason.kind === "friend" ? "" : p.reason.text.slice(0, 200),
          dish: made?.dish?.slice(0, 200) ?? null,
          score: made && Number.isFinite(made.score) ? made.score : null,
        };
      });
      after(async () => {
        // The tap first: it belongs to the row it was made in, not the one this reply starts.
        if (tapped) await logTasteOpTap(userId, tapped.id, tapped.kind, tapped.batch);
        if (id) await logTasteShown(userId, id, shown, { algo, refresh });
      });
    }
  }

  return json({
    storage,
    basis,
    header,
    shortHeader,
    prefs,
    counts: result.counts,
    picks,
    ...(batch ? { batch } : {}),
  });
}
