import { sql, usingLocalPostgres } from "./sql-client.mjs";

/**
 * Re-arms the first-post photo question for one account, or for everyone.
 *
 * `photo_notice_seen` is a one-way latch by design — nobody should be asked who
 * sees their photos twice — which makes the screen behind it the one surface in
 * the app you cannot get back by reloading. Answering it once while building is
 * enough to lose it for good, so this exists to put it back.
 *
 * For a look at the screen without spending the flag, `?photo-notice=1` on the
 * composer forces it open in development. Use this script instead when the real
 * first run is what's being tested — the answer writing through, the latch
 * setting, the second visit going straight to the camera.
 *
 *   npm run notice:reset -- you@example.com
 *   npm run notice:reset -- --all
 *
 * Nothing else is touched: `share_photos_publicly` keeps whatever it was set to,
 * because that is a real preference and this is only bookkeeping about whether
 * the question has been put.
 */
if (usingLocalPostgres) console.log("→ local Postgres");

const arg = process.argv[2];

if (!arg) {
  console.error("Usage: npm run notice:reset -- <email> | --all");
  process.exit(1);
}

if (arg === "--all") {
  const rows = await sql`
    UPDATE users SET photo_notice_seen = false
    WHERE photo_notice_seen = true
    RETURNING id
  `;
  console.log(`Re-armed the photo question for ${rows.length} account(s).`);
} else {
  const rows = await sql`
    UPDATE users SET photo_notice_seen = false
    WHERE lower(email) = lower(${arg})
    RETURNING name, email, share_photos_publicly
  `;
  if (rows.length === 0) {
    console.error(`No account with the email ${arg}.`);
    process.exit(1);
  }
  const [user] = rows;
  console.log(
    `Re-armed for ${user.name} <${user.email}>. ` +
      `Photos are currently ${user.share_photos_publicly ? "shown to everyone" : "friends only"}, ` +
      `which is what the question will show as current.`
  );
}
