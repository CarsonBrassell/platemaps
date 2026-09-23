import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { registerPushDevice, unregisterPushDevice } from "@/lib/db";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/session";
import { limitOrReject } from "@/lib/rateLimit";

/**
 * Where the iOS app hands in its APNs device token.
 *
 * A token is tied to the *session* that registered it, not just the user
 * (`push_devices.session_token`, cascading from `sessions`). That is what
 * makes sign-out safe without a round trip: logging out, "sign out other
 * devices", and session expiry all delete the session row, and the token
 * goes with it. A phone that was signed out never keeps receiving the next
 * person's notifications, and the client does not have to remember to
 * unregister on the way out — a request it could not make once the cookie
 * is gone.
 *
 * `POST` is idempotent; the app calls it on every launch while signed in,
 * because APNs may rotate the token and the row's session may have changed.
 * `DELETE` is the "Notifications: Off" switch in Settings.
 */

/** APNs device tokens are 32 bytes hex today; leave headroom for a longer format. */
const TOKEN_RE = /^[0-9a-f]{32,256}$/i;

function parseToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  return TOKEN_RE.test(token) ? token : null;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const limited = await limitOrReject({
    scope: "push-devices:user",
    key: user.id,
    max: 30,
    windowMinutes: 60,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { token: rawToken, platform } = (body ?? {}) as { token?: unknown; platform?: unknown };
  const token = parseToken(rawToken);
  if (!token) {
    return NextResponse.json({ error: "Bad device token." }, { status: 400 });
  }
  if (platform !== "ios") {
    return NextResponse.json({ error: "Unsupported platform." }, { status: 400 });
  }

  // getCurrentUser just resolved this cookie, so it is present and valid.
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  await registerPushDevice(user.id, sessionToken, token, "ios");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const limited = await limitOrReject({
    scope: "push-devices:user",
    key: user.id,
    max: 30,
    windowMinutes: 60,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const token = parseToken((body as { token?: unknown } | null)?.token);
  if (!token) {
    return NextResponse.json({ error: "Bad device token." }, { status: 400 });
  }

  await unregisterPushDevice(user.id, token);
  return NextResponse.json({ ok: true });
}
