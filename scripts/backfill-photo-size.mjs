/**
 * Measures every restaurant photo and writes its pixel size into the table.
 *
 *   node --env-file=.env.local scripts/backfill-photo-size.mjs --dry --limit 50
 *   node --env-file=.env.local scripts/backfill-photo-size.mjs
 *
 * **Costs nothing.** No API, no key, no quota. Both photo hosts serve HTTP
 * range requests, and every format's dimensions live in a header near the front
 * of the file, so this reads the first 16 KB of each image and stops. Measured
 * over the corpus that is ~16 KB x 4,800 rather than the ~1.5 GB downloading
 * the photos would cost.
 *
 * ## Why the dimensions have to be stored at all
 *
 * A card that keeps a photo's own proportions has to know them before the photo
 * arrives, or it is a zero-height box that snaps to size on load — once per
 * card, twenty-four times a page. Neither Yelp nor Google hands dimensions back
 * with a photo URL, and there is nowhere else to get them, so they get measured
 * once and kept.
 *
 * ## Resumable, and safe to re-run
 *
 * Only rows with a photo and no size are read, so an interrupted run picks up
 * where it stopped and a finished one is a no-op. `--refetch` re-measures rows
 * that already have a size, which is only worth doing if a host started serving
 * something different at the same URL.
 *
 * A photo whose header cannot be read stays null and gets tried again on the
 * next run. That is deliberate: the failures seen so far are transient (a 403,
 * a truncated read), and a permanent mark would need a table of its own to
 * distinguish "this URL is broken" from "the network was". Null costs a retry;
 * every reader already has to handle it, because a newly imported restaurant is
 * in exactly that state until this runs.
 *
 * ## Concurrency
 *
 * `--concurrency` (default 20) requests are in flight at once. A 429 or 5xx
 * backs that request off and retries it up to three times; the run does not
 * abort, because one throttled host should not cost the other host's work.
 */

import { sql, usingLocalPostgres } from "./sql-client.mjs";

if (usingLocalPostgres) console.log("→ local Postgres");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const REFETCH = args.includes("--refetch");
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const LIMIT = flag("--limit", 0);
const CONCURRENCY = Math.max(1, flag("--concurrency", 20));

/*
 * Enough for the overwhelming majority: 4,737 of 4,834 photos resolved from the
 * first 16 KB on the first run.
 *
 * The stragglers are all JPEG, and all failed for the same reason — an APP1
 * EXIF block of 17-20 KB sitting between the start of the file and the frame
 * header that carries the size, so the read ends before the answer does. They
 * get a second pass at `DEEP_BYTES`, which is why that number is worth the
 * bandwidth: it is spent on ~2% of rows, not on all of them.
 */
const HEAD_BYTES = 16 * 1024;
const DEEP_BYTES = 128 * 1024;

/* --- Reading a size out of an image header ------------------------------- */

/**
 * JPEG: walk the marker chain to the frame header (SOF0-SOF15) and read the
 * two 16-bit fields in it. Height comes first, which is the detail that makes
 * every portrait photo land on its side if you skim the spec.
 *
 * The excluded markers are the ones numbered in the SOF range that are not
 * frame headers at all: DHT (c4), JPG (c8) and DAC (cc).
 */
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    }
    /* Standalone markers carry no length field to skip over. */
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/** PNG: IHDR is always the first chunk, at a fixed offset. */
function pngSize(buf) {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** GIF: both dimensions are little-endian in the logical screen descriptor. */
function gifSize(buf) {
  if (buf.length < 10 || buf.toString("ascii", 0, 3) !== "GIF") return null;
  return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
}

/** WebP: three container variants, each storing the size differently. */
function webpSize(buf) {
  if (buf.length < 30) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8 ") {
    return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  if (kind === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8X") {
    /* 24-bit little-endian, stored one less than the real value. */
    const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
    const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
    return { w: w + 1, h: h + 1 };
  }
  return null;
}

function imageSize(buf) {
  const size = jpegSize(buf) ?? pngSize(buf) ?? webpSize(buf) ?? gifSize(buf);
  if (!size || !size.w || !size.h) return null;
  /* A header that parses to something absurd is a misparse, not a photo. */
  if (size.w > 20000 || size.h > 20000) return null;
  return size;
}

/* --- Fetching ------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The head of one image, or null if the host would not give it up.
 *
 * A host that ignores the Range header answers 200 with the whole file; the
 * body is capped by reading only what is needed, so that case costs bandwidth
 * but still works.
 */
async function fetchHead(url, bytes = HEAD_BYTES, attempt = 0) {
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${bytes - 1}` },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 2) return { error: `http ${res.status}` };
      await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 250));
      return fetchHead(url, bytes, attempt + 1);
    }
    if (!res.ok && res.status !== 206) return { error: `http ${res.status}` };

    const buf = Buffer.from(await res.arrayBuffer());
    return { buf: buf.length > bytes ? buf.subarray(0, bytes) : buf };
  } catch (e) {
    if (attempt >= 2) return { error: e.name === "TimeoutError" ? "timeout" : e.message };
    await sleep(500 * 2 ** attempt);
    return fetchHead(url, bytes, attempt + 1);
  }
}

/**
 * The size of one photo, reading further into the file only when the cheap read
 * was not enough.
 *
 * The deep read is gated on the file actually being a JPEG whose size was not
 * found, rather than on any failure: a 403 or a dropped connection will not
 * answer differently for being asked with a bigger range, and re-requesting
 * those would double the cost of every genuine failure.
 */
async function measure(url) {
  const { buf, error } = await fetchHead(url);
  if (!buf) return { error };

  const size = imageSize(buf);
  if (size) return { size };

  const isJpeg = buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8;
  if (!isJpeg) return { error: "unreadable header" };

  const deep = await fetchHead(url, DEEP_BYTES);
  if (!deep.buf) return { error: deep.error };
  const deepSize = imageSize(deep.buf);
  return deepSize ? { size: deepSize, deep: true } : { error: "unreadable header" };
}

/** Runs `worker` over `items`, `n` in flight at a time. */
async function pool(items, n, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

/* --- Run ----------------------------------------------------------------- */

/* `::boolean` because this is the one parameter with nothing beside it to infer
   a type from. Neon's proxy guesses; `pg` asks the server, which refuses to
   guess for a bare parameter in a boolean OR. */
const rows = await sql`
  SELECT id, name, photo FROM restaurants
   WHERE photo IS NOT NULL
     AND (${REFETCH}::boolean OR photo_w IS NULL)
   ORDER BY sort_order`;

const targets = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;

const [{ total, sized }] = await sql`
  SELECT count(*) FILTER (WHERE photo IS NOT NULL)::int AS total,
         count(*) FILTER (WHERE photo_w IS NOT NULL)::int AS sized
    FROM restaurants`;

console.log(`${sized}/${total} photos already measured.`);
console.log(`Reading ${targets.length}${DRY ? " (dry run — nothing is written)" : ""}, ${CONCURRENCY} at a time.\n`);

const measured = [];
const failures = [];
let done = 0;
let deepReads = 0;
const started = Date.now();

await pool(targets, CONCURRENCY, async (row) => {
  const { size, error, deep } = await measure(row.photo);

  if (size) {
    measured.push({ id: row.id, ...size });
    if (deep) deepReads++;
  } else {
    failures.push({ name: row.name, reason: error ?? "unreadable header", url: row.photo });
  }

  done++;
  if (done % 250 === 0 || done === targets.length) {
    const rate = done / ((Date.now() - started) / 1000);
    console.log(`  ${done}/${targets.length} — ${measured.length} read, ${failures.length} failed, ${rate.toFixed(0)}/s`);
  }
});

if (!DRY && measured.length > 0) {
  /* One statement per 500 rows, unnested rather than 500 tuples of literals —
     the same shape import-restaurants.mjs batches with, and it keeps the
     parameter count flat. */
  for (let i = 0; i < measured.length; i += 500) {
    const batch = measured.slice(i, i + 500);
    await sql.query(
      `UPDATE restaurants AS r
          SET photo_w = v.w, photo_h = v.h
         FROM (SELECT unnest($1::text[]) AS id,
                      unnest($2::int[])  AS w,
                      unnest($3::int[])  AS h) AS v
        WHERE r.id = v.id`,
      [batch.map((m) => m.id), batch.map((m) => m.w), batch.map((m) => m.h)],
    );
  }
}

/* --- What the corpus actually looks like --------------------------------- */

const elapsed = ((Date.now() - started) / 1000).toFixed(0);
console.log(
  `\n${measured.length} measured, ${failures.length} failed, ${elapsed}s` +
    (deepReads > 0 ? ` (${deepReads} needed the deep read).` : "."),
);

if (failures.length > 0) {
  const byReason = {};
  for (const f of failures) byReason[f.reason] = (byReason[f.reason] ?? 0) + 1;
  console.log("\nFailures (left null, retried on the next run):");
  for (const [reason, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${reason}`);
  }
  for (const f of failures.slice(0, 5)) console.log(`   e.g. ${f.name} — ${f.url.slice(0, 70)}`);
}

/*
 * The distribution is the point of running this, not a nicety: a masonry grid
 * is only worth building if the photos are actually different shapes. If they
 * all land in one bucket the layout has nothing to work with and the honest
 * answer is to keep the fixed crop.
 */
const shape = (r) => (r < 0.85 ? "portrait" : r > 1.18 ? "landscape" : "square-ish");
const stats = await sql`
  SELECT photo_w AS w, photo_h AS h FROM restaurants
   WHERE photo_w IS NOT NULL AND photo_h IS NOT NULL`;

if (stats.length > 0) {
  const ratios = stats.map((s) => s.w / s.h).sort((a, b) => a - b);
  const at = (p) => ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * p))];
  const buckets = {};
  for (const r of ratios) buckets[shape(r)] = (buckets[shape(r)] ?? 0) + 1;

  console.log(`\nAspect ratios across ${ratios.length} measured photos:`);
  console.log(`  min ${at(0).toFixed(2)}   p25 ${at(0.25).toFixed(2)}   median ${at(0.5).toFixed(2)}   p75 ${at(0.75).toFixed(2)}   max ${at(0.999).toFixed(2)}`);
  for (const [name, n] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(Math.round((n / ratios.length) * 100)).padStart(3)}%  ${name} (${n})`);
  }
}

/* Only the local driver holds a pool, and without closing it node never exits.
   Optional-called rather than branched on `usingLocalPostgres`, so this keeps
   working if the client ever grows a teardown for the Neon path too. */
await sql.end?.();
