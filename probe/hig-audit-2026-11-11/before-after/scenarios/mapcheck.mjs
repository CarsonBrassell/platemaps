// Does the phone map really carry zoom buttons? Opens the Map tab on the phone feed and measures them.
export default async function (h) {
  const page = await h.open();
  await h.go(page, "/m/feed", 4000);
  const tab = page.locator('[role="tablist"][aria-label="Feed filter"] [role="tab"]', { hasText: /^Map$/ });
  h.log("map tab count", await tab.count());
  await tab.first().click();
  await page.waitForSelector("canvas.maplibregl-canvas", { timeout: 30000 });
  await page.waitForTimeout(8000);
  const info = await page.evaluate(() => {
    const q = (s) =>
      [...document.querySelectorAll(s)].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          cls: el.className.toString().slice(0, 60),
          label: el.getAttribute("aria-label") || el.title || "",
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });
    return {
      zoom: q(".maplibregl-ctrl-group button"),
      locate: q(".map-locate-btn"),
      groups: q(".maplibregl-ctrl-group"),
      canvas: q("canvas.maplibregl-canvas"),
    };
  });
  h.log("controls", JSON.stringify(info));
  await h.shot(page, "map-plain");
  await h.hitboxes(page, ".maplibregl-ctrl-group button, .map-locate-btn");
  await h.shot(page, "map-boxes", { clip: { x: 0, y: 0, width: 393, height: 420 } });
}
