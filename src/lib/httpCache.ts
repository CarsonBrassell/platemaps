import { createHash } from "node:crypto";

/**
 * Cache headers for GET routes (probe/PERF-PLAN.md S7).
 *
 * Two things every JSON GET should carry and none of them did:
 *
 * - **Cache-Control.** A public answer — one that does not depend on who is
 *   asking — is served from Vercel's edge for `sMaxAge` seconds and, once
 *   that is up, the stale copy is served while one function call refreshes
 *   it. A private answer (feeds, anything reading the session cookie) never
 *   touches the shared cache, but the browser is still told it may keep a
 *   copy and ask whether it has changed.
 * - **ETag.** A hash of the body. A browser that already holds this exact
 *   answer sends it back as `If-None-Match`, and the reply is an empty 304
 *   instead of the same kilobytes again. The edge does the same for public
 *   answers it holds, so a repeat load of the map or a picker list costs a
 *   round trip and no bytes.
 *
 * Weak validators (`W/`) on purpose: two bodies that hash the same are the
 * same JSON, but nothing here promises byte-identical transfer encoding.
 *
 * The body is serialised once, here, and the hash is over that string —
 * so the tag can never disagree with what was actually sent.
 */
export type CachePolicy =
  | { scope: "public"; sMaxAge?: number; staleWhileRevalidate?: number; maxAge?: number }
  | { scope: "private" };

const DEFAULT_PUBLIC: Required<Omit<Extract<CachePolicy, { scope: "public" }>, "scope">> = {
  sMaxAge: 60,
  staleWhileRevalidate: 300,
  maxAge: 0,
};

export function cacheControlFor(policy: CachePolicy): string {
  if (policy.scope === "private") return "private, no-cache";
  const { sMaxAge, staleWhileRevalidate, maxAge } = { ...DEFAULT_PUBLIC, ...policy };
  return `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`;
}

export function etagFor(body: string): string {
  return `W/"${createHash("sha1").update(body).digest("base64url").slice(0, 27)}"`;
}

/** True when the request already holds the answer tagged `etag`. */
function matches(req: Request, etag: string): boolean {
  const header = req.headers.get("if-none-match");
  if (!header) return false;
  if (header.trim() === "*") return true;
  const strong = etag.replace(/^W\//, "");
  return header
    .split(",")
    .map((t) => t.trim().replace(/^W\//, ""))
    .some((t) => t === strong);
}

/**
 * A JSON response with Cache-Control and ETag, or a 304 when the caller's
 * `If-None-Match` already names this body.
 *
 * `extraHeaders` ride on both the 200 and the 304 — RFC 9110 wants a 304 to
 * repeat the headers that would have gone on the 200.
 */
export function cachedJson(
  req: Request,
  body: unknown,
  policy: CachePolicy = { scope: "public" },
  extraHeaders: Record<string, string> = {},
): Response {
  const text = JSON.stringify(body);
  const etag = etagFor(text);
  const headers: Record<string, string> = {
    ...extraHeaders,
    "Cache-Control": cacheControlFor(policy),
    ETag: etag,
  };
  if (policy.scope === "private") headers.Vary = "Cookie";

  if (matches(req, etag)) return new Response(null, { status: 304, headers });

  return new Response(text, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
