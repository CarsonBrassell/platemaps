/**
 * Menu-photo harvest from Google Maps, no API.
 *
 *   node --env-file=.env.local probe/menu-photos/fetch.mjs --limit 100
 *   node --env-file=.env.local probe/menu-photos/fetch.mjs --ids 1011,3202
 *
 * For each listed restaurant with no dishes and a google_place_id, opens the
 * Maps place page in headless Chromium, opens the photo gallery, clicks the
 * "Menu" category tile if Google shows one, and downloads up to MAX_PHOTOS of
 * those photos to probe/menu-photos/img/<id>/. Appends one row per restaurant
 * to probe/menu-photos/manifest.jsonl. Resumable: ids already in the manifest
 * are skipped.
 *
 * Google sometimes serves a "limited view" shell to headless Chromium; the
 * gallery has no category tiles in that mode, so the visit is retried.
 */
import { chromium } from "playwright";
import { neon } from "@neondatabase/serverless";
import { mkdir, writeFile, appendFile, readFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const LIMIT = Number(val("limit") ?? 100);
const IDS = val("ids") ? val("ids").split(",") : null;
// --retry: revisit rows whose manifest status is limited-view / no-gallery / error.
// Google throttles a long headless run into the "limited view" shell more and
// more as it goes, so a second pass later recovers most of them. Retried rows
// get a fresh manifest line; the old one is superseded by the last line per id.
const RETRY = args.includes("--retry");
const PAUSE = Number(val("pause") ?? 0);
const MAX_PHOTOS = 8;
const ROOT = "probe/menu-photos";
const MANIFEST = path.join(ROOT, "manifest.jsonl");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const sql = neon(process.env.DATABASE_URL);
const last = new Map();
try { for (const l of (await readFile(MANIFEST, "utf8")).split("\n")) if (l.trim()) { const j = JSON.parse(l); last.set(String(j.id), j.status); } } catch {}
const done = new Set([...last.keys()].filter((id) => !RETRY || !/^(limited-view|no-gallery|error)$/.test(last.get(id))));

let rows;
if (RETRY) {
  const ids = [...last.keys()].filter((id) => !done.has(id));
  rows = await sql`SELECT id::text AS id, name, address, city, website, google_place_id, google_review_count FROM restaurants WHERE id::text = ANY(${ids})`;
} else if (IDS) {
  rows = await sql`SELECT id::text AS id, name, address, city, website, google_place_id, google_review_count FROM restaurants WHERE id::text = ANY(${IDS})`;
} else {
  // Random sample so the hit rate extrapolates to the whole gap.
  rows = await sql`
    SELECT r.id::text AS id, r.name, r.address, r.city, r.website, r.google_place_id, r.google_review_count
    FROM restaurants r
    WHERE r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.google_place_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id::text = r.id::text)
    ORDER BY random() LIMIT ${LIMIT}`;
}
rows = rows.filter((r) => !done.has(r.id));
console.log(`${rows.length} restaurants to visit`);

const browser = await chromium.launch({ headless: true });

async function harvest(r) {
  const ctx = await browser.newContext({ userAgent: UA, locale: "en-US", timezoneId: "America/Los_Angeles", viewport: { width: 1440, height: 900 } });
  ctx.setDefaultTimeout(20000);
  const page = await ctx.newPage();
  const out = { id: r.id, name: r.name, address: `${r.address ?? ""}, ${r.city ?? ""}`.trim(), website: r.website, reviews: r.google_review_count, status: "", photos: [], urls: [], at: new Date().toISOString() };
  try {
    let tiles = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      await page.goto(`https://www.google.com/maps/place/?q=place_id:${r.google_place_id}&hl=en`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2500);
      const hero = page.locator('button[aria-label^="Photo of"]').first();
      if (!(await hero.count())) { out.status = "no-photos"; break; }
      await hero.click();
      await page.waitForTimeout(4000);
      const limited = await page.evaluate(() => /limited view/.test(document.body.innerText));
      tiles = await page.$$eval("button", (els) => els.map((e) => (e.textContent || "").trim().replace(/\s+/g, " ")).filter((t) => /^(All|Latest|Menu|Food & drink|Vibe|By owner|Videos|Street View)/.test(t)));
      if (tiles.length && !limited) break;
      // A throttled "limited view" is sticky for the next few minutes, so
      // re-requesting only adds load and makes the throttle worse. Give up on
      // the first one and let --retry pick it up later.
      if (limited) { out.status = "limited-view"; break; }
      if (attempt === 3) out.status = "no-gallery";
    }
    if (!out.status) {
      out.tiles = tiles;
      const menuTile = page.locator("button").filter({ hasText: /^\s*Menu\s*$/ });
      if (!(await menuTile.count())) { out.status = "no-menu-category"; }
      else {
        await menuTile.first().click();
        await page.waitForTimeout(4000);
        // Gallery tiles are background-image divs; strip the thumbnail size suffix.
        const urls = await page.evaluate(() => {
          // The same photo appears under two thumbnail suffixes, so dedupe on the
          // suffix-stripped URL.
          const seen = [];
          for (const el of document.querySelectorAll("[style*='googleusercontent.com/gps-cs-s'], [style*='googleusercontent.com/p/']")) {
            const m = (el.getAttribute("style") || "").match(/url\("?(https:\/\/lh3\.googleusercontent\.com\/[^")]+)"?\)/);
            if (m) seen.push(m[1].replace(/=[^=]*$/, ""));
          }
          return [...new Set(seen)];
        });
        out.urls = urls.slice(0, MAX_PHOTOS);
        const dir = path.join(ROOT, "img", r.id);
        await mkdir(dir, { recursive: true });
        let n = 0;
        for (const u of out.urls) {
          const full = u.replace(/=[^=]*$/, "") + "=w1600";
          try {
            const res = await ctx.request.get(full, { timeout: 30000 });
            if (!res.ok()) continue;
            const buf = await res.body();
            if (buf.length < 5000) continue;
            const f = path.join(dir, `${++n}.jpg`);
            await writeFile(f, buf);
            out.photos.push(f);
          } catch {}
        }
        out.status = out.photos.length ? "ok" : "menu-category-empty";
      }
    }
  } catch (e) {
    out.status = "error";
    out.error = String(e.message || e).slice(0, 200);
  }
  await ctx.close();
  return out;
}

let i = 0;
for (const r of rows) {
  if (PAUSE) await new Promise((res) => setTimeout(res, PAUSE * 1000));
  const out = await harvest(r);
  await appendFile(MANIFEST, JSON.stringify(out) + "\n");
  console.log(`${String(++i).padStart(3)}/${rows.length} ${out.status.padEnd(20)} ${out.photos.length} photos  ${r.name}`);
}
await browser.close();
