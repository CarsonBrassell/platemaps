import { NextResponse } from "next/server";
import { clientIp } from "@/lib/loginThrottle";
import { limitOrReject } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";
import { TASTE_OP_KINDS, scoreTaste, type TasteOp } from "@/lib/taste";
import { resolveTasteContext } from "@/lib/tasteContext";

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

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
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

  const user = await getCurrentUser();

  // A signed-in write is metered per person. Everything else is metered per
  // address, because it needs no account and scores the whole corpus.
  if (user ? op : true) {
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
  // gathered by `lib/tasteContext.ts`, which the For me POST on Discover shares.
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

  return json({
    storage,
    basis: result.basis,
    header: result.header,
    shortHeader: result.shortHeader,
    prefs,
    counts: result.counts,
    picks: result.picks,
  });
}
