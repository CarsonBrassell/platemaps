// Harness smoke test: one phone page, the simulated status bar and the tap-box overlay.
export default async function (h) {
  const page = await h.open();
  const status = await h.go(page, "/m/feed");
  h.log("status", status, "title", await page.title());
  const info = await page.evaluate(() => ({
    w: innerWidth,
    h: innerHeight,
    mapButtons: document.querySelectorAll(".maplibregl-ctrl-group button, .map-locate-btn").length,
    articles: document.querySelectorAll("article").length,
    dialogs: document.querySelectorAll('[role=dialog],[aria-modal="true"]').length,
    bodyBg: getComputedStyle(document.body).backgroundColor,
  }));
  h.log("info", JSON.stringify(info));
  await h.statusBar(page, { glyphs: "dark" });
  await h.hitboxes(page, ".maplibregl-ctrl-group button, .map-locate-btn, article a");
  await h.shot(page, "top", { clip: { x: 0, y: 0, width: 393, height: 430 } });
}
