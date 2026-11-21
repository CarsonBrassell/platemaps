// One-off "thanks for downloading" email to recent sign-ups, in small batches.
//
//   node --env-file=.env.local scripts/send-thanks.mjs                 dry run (default)
//   node --env-file=.env.local scripts/send-thanks.mjs --send          send up to --limit (default 10)
//   node --env-file=.env.local scripts/send-thanks.mjs --send --limit 25
//   node --env-file=.env.local scripts/send-thanks.mjs --test you@x.com  one [TEST] mail, no log row
//   node scripts/send-thanks.mjs --preview out.html                    write the HTML, touch nothing
//
// Re-runs are safe: every successful send inserts a marketing_sends row
// (user_id, campaign), and the audience query excludes those. Run
// `npm run db:migrate` once first so that table exists.
//
// Env: DATABASE_URL, RESEND_API_KEY, MAIL_FROM (optional), MAIL_POSTAL_ADDRESS,
// APP_URL / NEXT_PUBLIC_APP_URL / VERCEL_PROJECT_PRODUCTION_URL (site URL).
// Never prints a full address, token or key.

import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { buildThanksEmail } from "./lib/thanks-email.mjs";

const CAMPAIGN = "thanks-2026-11";
const SINCE = "2026-11-18 00:00:00"; // America/Los_Angeles
const PAUSE_MS = 600;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function die(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function mask(email) {
  const [local = "", domain = ""] = String(email).split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Same resolution order as appUrl() in src/lib/mail.ts. */
function siteUrl() {
  const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- preview
const previewPath = value("--preview");
if (flag("--preview")) {
  if (!previewPath) die("--preview needs a file path.");
  const mail = buildThanksEmail({
    unsubscribeUrl: "https://example.com/unsubscribe?token=PREVIEW",
    postalAddress: process.env.MAIL_POSTAL_ADDRESS || "PlateMaps, 123 Example St, San Diego, CA 92101",
    siteUrl: siteUrl(),
  });
  writeFileSync(previewPath, mail.html, "utf8");
  console.log(`Preview written to ${previewPath}`);
  process.exit(0);
}

// ----------------------------------------------------------------- config
const testEmail = value("--test");
if (flag("--test") && !testEmail) die("--test needs an email address.");
const sending = flag("--send") || Boolean(testEmail);

const limitRaw = value("--limit");
const limit = limitRaw === undefined ? 10 : Number(limitRaw);
if (!Number.isInteger(limit) || limit < 1) die("--limit must be a positive whole number.");

const missing = [];
if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
if (!process.env.MAIL_POSTAL_ADDRESS) missing.push("MAIL_POSTAL_ADDRESS");
if (sending && !process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
if (missing.length) die(`missing ${missing.join(", ")}. Run with --env-file=.env.local and set them.`);

const site = siteUrl();
if (sending && /localhost|127\.0\.0\.1/.test(site)) {
  die("site URL resolves to localhost, so links in the mail would be dead. Set APP_URL.");
}
const postalAddress = process.env.MAIL_POSTAL_ADDRESS;
const from = process.env.MAIL_FROM || "noreply@platemaps.com";

const { sql } = await import("./sql-client.mjs");

// ---------------------------------------------------------------- queries
async function audience(max) {
  return sql.query(
    `SELECT u.id, u.email, u.unsubscribe_token
       FROM users u
      WHERE u.agreed_to_terms_at >= ($1::timestamp AT TIME ZONE 'America/Los_Angeles')
        AND COALESCE(u.email, '') <> ''
        AND u.email NOT LIKE '%@demo.platemaps.app'
        AND u.marketing_opt_out_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM marketing_sends m WHERE m.user_id = u.id AND m.campaign = $2
        )
      ORDER BY u.agreed_to_terms_at, u.id
      LIMIT $3`,
    [SINCE, CAMPAIGN, max],
  );
}

async function audienceCount() {
  const rows = await sql.query(
    `SELECT count(*)::int AS n
       FROM users u
      WHERE u.agreed_to_terms_at >= ($1::timestamp AT TIME ZONE 'America/Los_Angeles')
        AND COALESCE(u.email, '') <> ''
        AND u.email NOT LIKE '%@demo.platemaps.app'
        AND u.marketing_opt_out_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM marketing_sends m WHERE m.user_id = u.id AND m.campaign = $2
        )`,
    [SINCE, CAMPAIGN],
  );
  return rows[0].n;
}

/** Mirrors getOrCreateUnsubscribeToken in src/lib/db.ts. */
async function ensureToken(user) {
  if (user.unsubscribe_token) return user.unsubscribe_token;
  await sql.query(
    `UPDATE users SET unsubscribe_token = $1 WHERE id = $2 AND unsubscribe_token IS NULL RETURNING unsubscribe_token`,
    [randomBytes(32).toString("hex"), user.id],
  );
  const rows = await sql.query(`SELECT unsubscribe_token FROM users WHERE id = $1`, [user.id]);
  return rows[0]?.unsubscribe_token ?? null;
}

async function deliver(user, { test }) {
  const token = await ensureToken(user);
  if (!token) return { ok: false, detail: "no token" };
  const pageUrl = `${site}/unsubscribe?token=${token}`;
  // RFC 8058 one-click: a bare POST here, token in the query string.
  const oneClickUrl = `${site}/api/unsubscribe?token=${token}`;
  const mail = buildThanksEmail({ unsubscribeUrl: pageUrl, postalAddress, siteUrl: site });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: user.email,
        subject: test ? `[TEST] ${mail.subject}` : mail.subject,
        html: mail.html,
        text: mail.text,
        headers: {
          "List-Unsubscribe": `<${oneClickUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const body = await res.json().catch(() => ({}));
    return { ok: true, id: typeof body.id === "string" ? body.id : null };
  } catch {
    return { ok: false, detail: controller.signal.aborted ? "timed out" : "network error" };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------- main
try {
  if (testEmail) {
    const rows = await sql.query(
      `SELECT id, email, unsubscribe_token FROM users WHERE lower(email) = lower($1)`,
      [testEmail],
    );
    if (!rows.length) die("no user with that email.");
    const result = await deliver(rows[0], { test: true });
    console.log(
      result.ok ? `Test sent to ${mask(rows[0].email)}.` : `Test FAILED for ${mask(rows[0].email)}: ${result.detail}`,
    );
    process.exit(result.ok ? 0 : 1);
  }

  const total = await audienceCount();
  const batch = await audience(limit);

  if (!sending) {
    console.log(`DRY RUN. Campaign ${CAMPAIGN}.`);
    console.log(`Eligible: ${total}. Would send this run: ${batch.length} (limit ${limit}).`);
    for (const u of batch) console.log(`  ${mask(u.email)}`);
    console.log("Nothing sent or written. Add --send to send.");
    process.exit(0);
  }

  console.log(`Sending campaign ${CAMPAIGN}: ${batch.length} of ${total} eligible (limit ${limit}).`);
  let sent = 0;
  let failed = 0;
  for (const [i, user] of batch.entries()) {
    if (i > 0) await sleep(PAUSE_MS);
    const result = await deliver(user, { test: false });
    if (!result.ok) {
      failed += 1;
      console.log(`FAILED ${mask(user.email)}: ${result.detail}`);
      continue;
    }
    sent += 1;
    try {
      await sql.query(
        `INSERT INTO marketing_sends (user_id, campaign, provider_id) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, campaign) DO NOTHING`,
        [user.id, CAMPAIGN, result.id],
      );
    } catch {
      console.error(`WARNING: sent to ${mask(user.email)} but could not log it. Do not re-run until fixed.`);
      process.exit(1);
    }
    console.log(`sent ${mask(user.email)}`);
  }
  console.log(`Done. Sent ${sent}, failed ${failed}, remaining ${Math.max(0, total - sent)}.`);
} finally {
  if (typeof sql.end === "function") await sql.end().catch(() => {});
}
