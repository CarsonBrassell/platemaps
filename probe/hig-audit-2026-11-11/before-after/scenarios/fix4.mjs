// Fix #4 (MOD-02): the sign-up sheet must not open on top of the free-food ticket.
// Real behaviour check against the running app, nothing simulated.
export default async function (h) {
  const state = (page) =>
    page.evaluate(() => ({
      ticket: !!document.querySelector('[role="dialog"][aria-labelledby="ff-title"]'),
      sheet: !!document.querySelector("[data-signup-sheet]"),
      dialogs: document.querySelectorAll('[role="dialog"],[aria-modal="true"]').length,
    }));

  // 1. First launch, nothing dismissed: the ticket should be alone.
  const page = await h.open({ quiet: false });
  await h.go(page, "/m/feed", 4500);
  h.log("safe area", JSON.stringify(await h.safeArea(page)));
  h.log("first launch, ~5s", JSON.stringify(await state(page)));
  await page.waitForTimeout(4000);
  h.log("first launch, ~9s", JSON.stringify(await state(page)));
  await h.statusBar(page, { glyphs: "dark" });
  await h.shot(page, "first-launch");

  // 2. Close the ticket: the sheet should follow about 1.2s later, not before.
  await page.locator('[aria-labelledby="ff-title"] button[aria-label="Close"]').first().tap();
  await page.waitForTimeout(500);
  h.log("0.5s after closing the ticket", JSON.stringify(await state(page)));
  await page.waitForTimeout(1800);
  h.log("2.3s after closing the ticket", JSON.stringify(await state(page)));
  await h.shot(page, "after-ticket-closed");

  // 3. Dismiss the sheet: it must stay gone.
  await page.locator('[data-signup-sheet] button[aria-label="Close"]').first().tap();
  await page.waitForTimeout(3000);
  h.log("3s after dismissing the sheet", JSON.stringify(await state(page)));

  // 4. Ticket already seen on an earlier visit: the sheet still shows on its own, as before.
  const p2 = await h.open({ quiet: false, storage: { "pm-ticket-pearl-2026-11-19-seen": "1" } });
  await h.go(p2, "/m/feed", 4500);
  h.log("ticket already seen, ~5s", JSON.stringify(await state(p2)));

  // 5. A sheet opened by the user (Discover filters) also holds the sign-up sheet back.
  const p3 = await h.open({ quiet: false, storage: { "pm-ticket-pearl-2026-11-19-seen": "1" } });
  await p3.goto((process.env.HIG_BASE || "http://localhost:3000") + "/m", { waitUntil: "domcontentloaded", timeout: 90000 });
  const filters = p3.locator('button[aria-haspopup="dialog"]').first();
  await filters.waitFor({ timeout: 20000 });
  await filters.tap();
  await p3.waitForTimeout(4000);
  h.log("filter sheet open for 4s", JSON.stringify(await state(p3)));
}
