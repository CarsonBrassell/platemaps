/**
 * Every logo raster in the repo, resized from the supplied artwork.
 *
 *   npm run logo:build
 *
 * **The artwork is `public/logo-source.webp`, it was supplied by Carson, and
 * nothing here or anywhere else may redraw it.** This script only ever crops
 * the flat border off and resizes; it does not trace, re-letter, restyle or
 * "match" the mark. There is no vector source any more, deliberately: the
 * previous version of this script rendered every raster from a hand-drawn
 * `logo-mark.svg`, and each pass at "improving" that SVG — a wider knife, more
 * space between the utensils — shipped a logo that was not the real one. If
 * the mark ever needs to change, replace the source file. Do not edit a copy
 * of it, and do not draw a new one.
 *
 * `sharp` is a Next transitive dependency rather than something this project
 * declares. That is fine for a script nothing in the build path calls, and it
 * is the reason this isn't wired into `postinstall`.
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const SOURCE = "public/logo-source.webp";

/**
 * The artwork sits in the middle of a square canvas with a wide flat margin.
 * Every output crops to the mark itself so a caller's `h-9 w-9` box holds a
 * pin rather than mostly background — the same reason the old SVG carried a
 * viewBox cropped to the artwork. Measured from the source rather than
 * hardcoded, so replacing the file cannot silently mis-crop it.
 *
 * `threshold` is generous because the background carries a couple of levels of
 * grain; the artwork's orange and ink are nowhere near it.
 */
async function artworkBox() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const i0 = 0;
  const bg = [data[i0], data[i0 + 1], data[i0 + 2]];
  const threshold = 14;
  const isBackground = (i) =>
    Math.abs(data[i] - bg[0]) <= threshold &&
    Math.abs(data[i + 1] - bg[1]) <= threshold &&
    Math.abs(data[i + 2] - bg[2]) <= threshold;

  let left = W, right = -1, top = H, bottom = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (isBackground((y * W + x) * 4)) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1, background: bg };
}

const BOX = await artworkBox();
const ASPECT = BOX.width / BOX.height;

/**
 * The artwork's own cream, read off the source rather than assumed, so the
 * padding around a square icon matches the picture instead of introducing a
 * second near-identical cream at its edge.
 */
const SOURCE_CREAM = { r: BOX.background[0], g: BOX.background[1], b: BOX.background[2], alpha: 1 };

/** The mark, cropped to itself, at `width`x`height`. */
function pin(width, height) {
  return sharp(SOURCE)
    .extract({ left: BOX.left, top: BOX.top, width: BOX.width, height: BOX.height })
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
}

/** The mark at its own proportions. */
async function mark(width, out) {
  const height = Math.round(width / ASPECT);
  writeFileSync(out, await pin(width, height));
  return `${out} — ${width}x${height}`;
}

/**
 * Square, for icon slots. `padding` is a fraction of the side: icons get 10%
 * so the pin isn't flush to a rounded mask, favicons get 6% because at 16px
 * every pixel of padding is a pixel of pin you don't have.
 *
 * The canvas is the artwork's own background colour, which also satisfies the
 * iOS catalogue — App Store validation rejects an alpha channel in the app
 * icon, and this is opaque everywhere.
 */
async function square(size, out, { padding = 0.1 } = {}) {
  const pad = Math.max(1, Math.round(size * padding));
  const inner = size - pad * 2;
  const composited = await sharp({
    create: { width: size, height: size, channels: 4, background: SOURCE_CREAM },
  })
    .composite([{ input: await pin(Math.round(inner * ASPECT), inner), gravity: "center" }])
    .png()
    .toBuffer();
  if (out) writeFileSync(out, composited);
  return composited;
}

/**
 * A PNG-compressed .ico, assembled by hand — there is no ICO encoder here and
 * pulling one in for six directory entries isn't worth a dependency. Layout is
 * a 6-byte header, one 16-byte directory entry per image, then the PNGs.
 */
async function favicon(out, sizes) {
  const pngs = [];
  for (const size of sizes) pngs.push(await square(size, null, { padding: 0.06 }));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((size, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size, 0); // width  — 0 would mean 256
    e.writeUInt8(size, 1); // height
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });

  writeFileSync(out, Buffer.concat([header, ...entries, ...pngs]));
  return `${out} — ${sizes.join("/")}`;
}


/**
 * The iOS launch screen — the very first thing the app shows.
 *
 * It shipped as Capacitor's stock blue placeholder and stayed that way, so
 * every cold start of the app flashed someone else's logo before any of ours
 * loaded. All three slots in `Splash.imageset` (1x/2x/3x) take the same
 * 2732² image, which is what Capacitor's own generator does — the canvas is
 * square and oversized so it covers every device aspect from a centre crop.
 *
 * The mark is deliberately small in the frame (a fifth of the side): iOS
 * centre-crops this to the screen, so anything large gets cut off on a
 * narrow device.
 */
async function splash(size, out) {
  const markWidth = Math.round(size * 0.2);
  const composited = await sharp({
    create: { width: size, height: size, channels: 4, background: SOURCE_CREAM },
  })
    .composite([
      { input: await pin(markWidth, Math.round(markWidth / ASPECT)), gravity: "center" },
    ])
    .png()
    .toBuffer();
  for (const file of out) writeFileSync(file, composited);
  return `${out.length} splash images — ${size}x${size}`;
}

const built = [
  await mark(660, "public/logo-mark.png"),
  /* Nothing in `src/` reads this any more — the sign-in form used to load it
     as a stacked lockup and no longer shows a logo at all. It is regenerated
     rather than deleted so an outside link to /logo.png gets the real
     artwork instead of the retired one. */
  await mark(660, "public/logo.png"),
  await square(512, "src/app/icon.png").then(() => "src/app/icon.png — 512x512"),
  await favicon("src/app/favicon.ico", [16, 32, 48]),
  await square(1024, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png").then(
    () => "ios AppIcon-512@2x.png — 1024x1024, no alpha",
  ),
  await splash(2732, [
    "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png",
    "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png",
    "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png",
  ]),
];

console.log(`from ${SOURCE} (crop ${BOX.width}x${BOX.height} @ ${BOX.left},${BOX.top}):`);
for (const line of built) console.log(`  ${line}`);
