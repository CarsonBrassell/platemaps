/**
 * Sends one push by hand: a test to your own phone, or an announcement to
 * everyone with notifications on. Uses the same sender as the app
 * (src/lib/push.ts), so a push that arrives here proves the live path.
 *
 *   npx tsx --env-file=.env.local scripts/push-send.ts \
 *     --key ~/Downloads/AuthKey_XXXXXXXXXX.p8 \
 *     --to <user id> | --all \
 *     --title "..." --body "..." [--url /m/feed] [--yes]
 *
 * The key is read from the file, never printed. Without --yes it prints who
 * would receive the push and stops; --all always needs --yes, because a push
 * to every user cannot be taken back.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { neon } from "@neondatabase/serverless";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const keyPath = arg("key")?.replace(/^~/, process.env.HOME ?? "~");
const title = arg("title");
const body = arg("body");
const url = arg("url") ?? "/m/feed";
const to = arg("to");
const all = flag("all");

if (!keyPath || !title || !body || (!to && !all) || !url.startsWith("/m/")) {
  console.error("Usage: --key AuthKey_X.p8 (--to <user id> | --all) --title .. --body .. [--url /m/..] [--yes]");
  process.exit(1);
}
const keyId = basename(keyPath).match(/^AuthKey_([A-Z0-9]{10})\.p8$/)?.[1];
if (!keyId) {
  console.error("Expected a key file named AuthKey_<10 characters>.p8");
  process.exit(1);
}

process.env.APNS_TEAM_ID ??= "93Q75H5U7Z";
process.env.APNS_KEY_ID = keyId;
process.env.APNS_AUTH_KEY = readFileSync(keyPath, "utf8");

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`
    SELECT DISTINCT u.id, u.name
    FROM push_devices d
    JOIN sessions s ON s.token = d.session_token AND s.expires_at > now()
    JOIN users u ON u.id = d.user_id
    WHERE ${all} OR u.id = ${to ?? ""}
    ORDER BY u.name
  `) as { id: string; name: string }[];

  console.log(`"${title}" / "${body}" -> ${url}`);
  console.log(`${rows.length} recipient(s): ${rows.map((r) => r.name.trim()).join(", ") || "none"}`);
  if (!flag("yes")) {
    console.log("Dry run. Add --yes to send.");
    return;
  }

  // Imported after the env is set: push.ts reads its config on first use.
  const { sendPushToUser } = await import("@/lib/push");
  for (const r of rows) {
    await sendPushToUser(r.id, { title: title!, body: body!, url, collapseId: `manual:${Date.now()}` });
  }
  console.log("Sent. Any APNs errors are printed above.");
}

void main();
