import { connect, constants as h2 } from "node:http2";
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { deletePushTokens, getPushTokensForUser } from "@/lib/db";

/**
 * Push delivery — APNs over HTTP/2, straight from the route handlers.
 *
 * ## Why no SDK and no Firebase
 *
 * APNs' HTTP/2 API is one JSON body and five headers. The two things a library
 * would do for us — the ES256 provider token and the connection — are a
 * dozen lines each on Node's own `crypto` and `http2`, and every APNs package
 * on npm is either abandoned or drags Firebase in. Firebase Cloud Messaging
 * is the other route (it would also cover Android later) but it puts a
 * second vendor and a second key between us and Apple for no gain today:
 * the app is iOS-only and the Capacitor plugin talks to APNs natively.
 *
 * ## Configuration
 *
 * Token-based auth (a `.p8` key from the Apple Developer portal, under
 * Certificates, Identifiers & Profiles → Keys, with the APNs box ticked). One
 * key works for every app on the team and never expires, which is why it is
 * preferred over the per-app push certificates that lapse yearly.
 *
 *   APNS_TEAM_ID       the 10-character team id (also in project.pbxproj)
 *   APNS_KEY_ID        the 10-character id of the .p8 key
 *   APNS_AUTH_KEY      the .p8 file's contents (PEM). Vercel's env editor
 *                      keeps real newlines; a `\n`-escaped single line works too.
 *   APNS_BUNDLE_ID     defaults to the id in capacitor.config.ts
 *   APNS_ENVIRONMENT   "production" (default — TestFlight and App Store
 *                      builds) or "sandbox" (a build run from Xcode). A token
 *                      registered by one environment is rejected by the other
 *                      with BadDeviceToken and dropped, so a Preview
 *                      deployment used with a debug build wants "sandbox".
 *
 * Unset means push is off: every send is a no-op that logs once. Nothing
 * user-facing depends on a send succeeding — the comment is already saved,
 * the request already sent — which is why callers wrap this in `after()`.
 *
 * ## What is sent
 *
 * Alert pushes only, with `url` alongside `aps` so the app knows where to go
 * when the notification is tapped (see components/mobile/PushRegistration).
 * `thread-id` groups a post's notifications in Notification Center;
 * `apns-collapse-id` lets a burst on one thread replace itself rather than
 * stack. No badge counts: there is no inbox to zero them against.
 */

export type PushMessage = {
  title: string;
  body: string;
  /** Where the app navigates on tap — a path on the site, never a full URL. */
  url: string;
  /** Notifications sharing a thread id are grouped on the lock screen. */
  threadId?: string;
  /** A newer push with the same collapse id replaces the older one. */
  collapseId?: string;
};

type ApnsConfig = {
  teamId: string;
  keyId: string;
  key: KeyObject;
  bundleId: string;
  host: string;
};

const DEFAULT_BUNDLE_ID = "com.platemapsapp.ios";
const HOSTS = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
} as const;

/** Apple wants the provider token refreshed at most hourly and at least every 20 minutes. */
const JWT_LIFETIME_MS = 50 * 60 * 1000;

let cachedConfig: ApnsConfig | null | undefined;
let cachedJwt: { value: string; issuedAt: number } | null = null;
let warnedUnconfigured = false;

function readConfig(): ApnsConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;

  const teamId = process.env.APNS_TEAM_ID?.trim();
  const keyId = process.env.APNS_KEY_ID?.trim();
  const rawKey = process.env.APNS_AUTH_KEY;
  if (!teamId || !keyId || !rawKey) {
    cachedConfig = null;
    return null;
  }

  let key: KeyObject;
  try {
    // A key pasted as one line arrives with literal backslash-n sequences.
    key = createPrivateKey(rawKey.replace(/\\n/g, "\n").trim());
  } catch (error) {
    console.error("APNS_AUTH_KEY is not a readable PEM private key:", error);
    cachedConfig = null;
    return null;
  }

  const env = process.env.APNS_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
  cachedConfig = {
    teamId,
    keyId,
    key,
    bundleId: process.env.APNS_BUNDLE_ID?.trim() || DEFAULT_BUNDLE_ID,
    host: HOSTS[env],
  };
  return cachedConfig;
}

/** True when the environment carries an APNs key. Lets routes skip the token lookup. */
export function pushConfigured(): boolean {
  return readConfig() !== null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * The provider token: an ES256 JWT with the team id as issuer and the key id
 * in the header. Cached across sends inside a warm function instance; APNs
 * rejects a token older than an hour (ExpiredProviderToken) and throttles
 * one refreshed more often than every twenty minutes, so the cache window
 * sits between the two.
 */
function providerToken(config: ApnsConfig): string {
  const now = Date.now();
  if (cachedJwt && now - cachedJwt.issuedAt < JWT_LIFETIME_MS) return cachedJwt.value;

  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) }));
  const signingInput = `${header}.${claims}`;
  // JOSE wants the raw r||s signature, not DER — that is what ieee-p1363 is.
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: config.key,
    dsaEncoding: "ieee-p1363",
  });
  const value = `${signingInput}.${base64url(signature)}`;
  cachedJwt = { value, issuedAt: now };
  return value;
}

type DeliveryResult = { token: string; status: number; reason?: string };

/** Reasons that mean the token will never work again and should be deleted. */
const DEAD_TOKEN_REASONS = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

function sendOne(
  session: ReturnType<typeof connect>,
  config: ApnsConfig,
  token: string,
  body: Buffer,
  message: PushMessage,
): Promise<DeliveryResult> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {
      [h2.HTTP2_HEADER_METHOD]: "POST",
      [h2.HTTP2_HEADER_PATH]: `/3/device/${token}`,
      [h2.HTTP2_HEADER_CONTENT_TYPE]: "application/json",
      authorization: `bearer ${providerToken(config)}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      // Undeliverable for a day, then dropped rather than delivered stale.
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 24 * 60 * 60),
    };
    if (message.collapseId) headers["apns-collapse-id"] = message.collapseId.slice(0, 64);

    const req = session.request(headers);
    let status = 0;
    const chunks: Buffer[] = [];
    req.on("response", (res) => {
      status = Number(res[h2.HTTP2_HEADER_STATUS] ?? 0);
    });
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      let reason: string | undefined;
      if (chunks.length > 0) {
        try {
          reason = (JSON.parse(Buffer.concat(chunks).toString("utf8")) as { reason?: string }).reason;
        } catch {
          // A non-JSON body is not worth more than the status code.
        }
      }
      resolve({ token, status, reason });
    });
    req.on("error", (error) => {
      resolve({ token, status: 0, reason: error instanceof Error ? error.message : String(error) });
    });
    req.setTimeout(10_000, () => req.close(h2.NGHTTP2_CANCEL));
    req.end(body);
  });
}

/**
 * Sends one message to every live device of one user.
 *
 * Never throws: push is a courtesy on top of an action that already
 * succeeded, so a failure here is logged and forgotten. Dead tokens are
 * deleted as a side effect, which is the only write this module makes.
 */
export async function sendPushToUser(userId: string, message: PushMessage): Promise<void> {
  const config = readConfig();
  if (!config) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn("push: APNS_TEAM_ID / APNS_KEY_ID / APNS_AUTH_KEY not set; notifications are off");
    }
    return;
  }

  let devices: Awaited<ReturnType<typeof getPushTokensForUser>>;
  try {
    devices = await getPushTokensForUser(userId);
  } catch (error) {
    console.error(`push: token lookup failed for ${userId}:`, error);
    return;
  }
  if (devices.length === 0) return;

  const payload = {
    aps: {
      alert: { title: message.title, body: message.body },
      sound: "default",
      ...(message.threadId ? { "thread-id": message.threadId } : {}),
    },
    url: message.url,
  };
  const body = Buffer.from(JSON.stringify(payload));

  const session = connect(config.host);
  const connectError = new Promise<DeliveryResult[]>((resolve) => {
    session.on("error", (error) => {
      console.error("push: APNs connection failed:", error);
      resolve([]);
    });
  });

  try {
    const results = await Promise.race([
      Promise.all(devices.map((d) => sendOne(session, config, d.token, body, message))),
      connectError,
    ]);

    const dead: string[] = [];
    for (const result of results) {
      if (result.status === 200) continue;
      if (result.status === 410 || (result.reason && DEAD_TOKEN_REASONS.has(result.reason))) {
        dead.push(result.token);
        continue;
      }
      console.error(`push: APNs ${result.status || "no response"} for ${userId}: ${result.reason ?? "unknown"}`);
    }
    if (dead.length > 0) {
      await deletePushTokens(dead).catch((error) => console.error("push: could not drop dead tokens:", error));
    }
  } finally {
    session.close();
  }
}
