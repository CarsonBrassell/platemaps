import { NextResponse } from "next/server";
import { clientIp } from "@/lib/loginThrottle";
import { limitOrReject } from "@/lib/rateLimit";
import { resubscribeByToken, unsubscribeByToken } from "@/lib/unsubscribe";

/**
 * Stops (or, with `undo`, restarts) promotional mail for the token's owner.
 *
 * Public on purpose: the link in an email has to work signed out. The token is
 * the credential. Accepts the token from a JSON body or the query string, and
 * RFC 8058 one-click (`List-Unsubscribe=One-Click` as a urlencoded form, token
 * in the URL), so a `List-Unsubscribe-Post` header can point straight here.
 *
 * Answers only `{ ok: true }` or `{ ok: false }`, so it cannot be used to
 * learn whether a token belongs to a real account.
 */
export async function POST(req: Request) {
  const limited = await limitOrReject({
    scope: "unsubscribe:ip",
    key: clientIp(req),
    max: 30,
    windowMinutes: 60,
  });
  if (limited) return limited;

  const url = new URL(req.url);
  let token: unknown = url.searchParams.get("token");
  let undo = url.searchParams.get("undo") === "1";

  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const b = (body ?? {}) as { token?: unknown; undo?: unknown };
    if (b.token !== undefined) token = b.token;
    if (b.undo === true) undo = true;
  } else if (type.includes("application/x-www-form-urlencoded")) {
    try {
      const form = await req.formData();
      const formToken = form.get("token");
      if (formToken) token = formToken;
    } catch {
      // A bare one-click body with no usable fields: the URL token stands.
    }
  }

  const ok = undo ? await resubscribeByToken(token) : await unsubscribeByToken(token);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
