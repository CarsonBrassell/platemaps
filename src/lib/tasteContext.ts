import { loadCorpus, type Corpus } from "@/lib/discover";
import {
  TasteTableMissingError,
  applyTasteOp,
  getFriendRestaurantVisits,
  getTastePrefs,
  restaurantIdsPostedBy,
  saveTastePrefs,
  type User,
} from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  applyOpToPrefs,
  isEmptyPrefs,
  sanitizePrefs,
  type FriendVisit,
  type FullTastePrefs,
  type TasteOp,
} from "@/lib/taste";

/**
 * Everything the scorer needs to know about the viewer, gathered in one place so
 * `/api/account/taste` reads it.
 *
 * Server-only (it reaches the database through `lib/db.ts`) and PERSONAL: the
 * result must only ever be used inside a private, uncached response. Discover's
 * own GET is public and CDN-keyed by query string, so none of this may ride on it.
 *
 * Takes no user id from the caller's input and must never grow one: the only
 * taste it can read or write is the session's. `user` is passed in only so a
 * route that already resolved it (for rate limiting) does not read the cookie
 * twice; it must come from `getCurrentUser()`.
 *
 * Writes happen only when the caller asks: an `op` mutates the signed-in
 * viewer's stored prefs, and `importLocal` uploads a first-time local copy.
 * A read-only caller passes neither and nothing is stored.
 */
export type TasteContextOptions = {
  /** The session user. Omit to resolve it here; `null` means already known signed out. */
  user?: User | null;
  /** The corpus, when the caller has already loaded it. */
  corpus?: Corpus;
  /** Untrusted prefs from the request body (the localStorage copy). Sanitized here. */
  prefs?: unknown;
  /** One taste op to apply to the viewer's prefs (the taste route's write path). */
  op?: TasteOp | null;
  /** Signed in with no server row yet: store the body's prefs once. Never set by a read. */
  importLocal?: boolean;
};

export type TasteContext = {
  user: User | null;
  corpus: Corpus;
  /** The corpus vocabulary prefs are validated against. */
  cuisines: ReadonlySet<string>;
  ids: ReadonlySet<string>;
  /**
   * `"server"`: signed in and `taste_prefs` exists, the row is the truth and body
   * prefs were ignored. `"local"`: signed out or the table is not migrated, the
   * body's prefs were validated and used for this answer and never stored.
   */
  storage: "server" | "local";
  prefs: FullTastePrefs;
  /** Restaurants the viewer has posted at. Empty when signed out. */
  postedIds: string[];
  /** Hero posts by mutual friends. Empty when signed out. */
  friendVisits: FriendVisit[];
  /** Straight from the user row; the scorer checks it is a real corpus cuisine. */
  favoriteCuisine: string | null;
};

export async function resolveTasteContext(opts: TasteContextOptions = {}): Promise<TasteContext> {
  const user = opts.user === undefined ? await getCurrentUser() : opts.user;
  const op = opts.op ?? null;

  const corpus = opts.corpus ?? (await loadCorpus());
  const cuisines = new Set<string>();
  const ids = new Set<string>();
  for (const r of corpus.restaurants) {
    ids.add(r.id);
    if (r.cuisine) cuisines.add(r.cuisine);
  }
  const localPrefs = () => sanitizePrefs(opts.prefs, cuisines, ids);

  let storage: "server" | "local" = "local";
  let prefs: FullTastePrefs = localPrefs();

  if (user) {
    try {
      const read = await getTastePrefs(user.id);
      if (read.available) {
        storage = "server";
        prefs = read.prefs;
        if (!read.exists && opts.importLocal === true) {
          const upload = localPrefs();
          if (!isEmptyPrefs(upload)) {
            await saveTastePrefs(user.id, upload);
            prefs = upload;
          }
        }
        if (op) prefs = await applyTasteOp(user.id, op, cuisines, ids);
      }
    } catch (err) {
      if (!(err instanceof TasteTableMissingError)) throw err;
      storage = "local";
      prefs = localPrefs();
    }
  }
  if (storage === "local" && op) prefs = applyOpToPrefs(prefs, op, cuisines, ids);

  const [postedIds, friendVisits]: [string[], FriendVisit[]] = user
    ? await Promise.all([restaurantIdsPostedBy(user.id), getFriendRestaurantVisits(user.id)])
    : [[], []];

  return {
    user,
    corpus,
    cuisines,
    ids,
    storage,
    prefs,
    postedIds,
    friendVisits,
    favoriteCuisine: user?.favoriteCuisine ?? null,
  };
}
