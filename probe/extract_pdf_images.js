/*
 * Pulls the embedded JPEGs out of an image-only PDF so they can be READ.
 *
 *   node probe/extract_pdf_images.js menu.pdf <outdir>
 *   # then Read each <outdir>/page-N.jpg
 *
 * ## Why this exists
 *
 * A scanned or designed menu PDF has no text layer - `pdftotext` returns 2
 * bytes - and there is no `pdftoppm` on this machine to rasterise it. That
 * combination is what produced the worst incident this project has had: agents
 * reported "reading the PDF visually", which is impossible here, and invented
 * the prices. 247 dishes had to be deleted.
 *
 * But `Read` DOES work on a JPEG, and a scanned PDF page usually IS a JPEG,
 * stored in the file whole. No decoding is required to get it out: a JPEG runs
 * from an SOI marker (FF D8 FF) to an EOI marker (FF D9), and those bytes can be
 * copied straight to a file. That is all this script does.
 *
 * So the honest path for an image-only PDF is: extract the page images, Read
 * them, and take the prices off the page like any other menu photograph.
 *
 * ## What it cannot do
 *
 * Pages stored as Flate-compressed bitmaps rather than JPEGs come out as zero
 * images. Reconstructing those needs the width, height and colour space from
 * the object dictionary and a PNG encoder; it has not been needed yet. If this
 * script finds nothing, the PDF is that kind, and the restaurant is `blocked` -
 * NOT an invitation to guess.
 *
 * Verified on Gaslamp Lumpia Factory's "Steampunk Menu AUG 2026" (2 pages,
 * `pdftotext` yields 2 bytes) - both pages came out as readable JPEGs.
 */

const fs = require("node:fs");
const path = require("node:path");

const file = process.argv[2];
const outDir = process.argv[3] ?? ".";
if (!file) {
  console.error("usage: node probe/extract_pdf_images.js <file.pdf> [outdir]");
  process.exit(1);
}

const buf = fs.readFileSync(file);
fs.mkdirSync(outDir, { recursive: true });

let found = 0;
for (let i = 0; i < buf.length - 3; i++) {
  if (!(buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff)) continue;

  /* Walk JPEG segments to the end marker rather than searching for the first
   * FF D9 - that byte pair occurs inside entropy-coded scan data and inside
   * thumbnails, and cutting there yields a truncated image that renders as the
   * top third of the page. */
  let p = i + 2;
  let end = -1;
  while (p < buf.length - 1) {
    if (buf[p] !== 0xff) {
      p++;
      continue;
    }
    const marker = buf[p + 1];
    if (marker === 0xd9) {
      end = p + 2;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8) || marker === 0xff) {
      p += 2;
      continue;
    }
    const length = buf.readUInt16BE(p + 2);
    if (marker === 0xda) {
      /* Start of scan: skip the header, then run to the next real marker. */
      p += 2 + length;
      while (p < buf.length - 1) {
        if (buf[p] === 0xff && buf[p + 1] !== 0x00 && !(buf[p + 1] >= 0xd0 && buf[p + 1] <= 0xd7)) break;
        p++;
      }
      continue;
    }
    p += 2 + length;
  }
  if (end === -1) continue;

  found++;
  const out = path.join(outDir, `page-${found}.jpg`);
  fs.writeFileSync(out, buf.slice(i, end));
  console.log(`${out}\t${end - i} bytes`);
  i = end;
}

if (!found) {
  console.error(
    "No embedded JPEGs. This PDF stores its pages some other way (usually " +
      "Flate bitmaps), so there is nothing to Read - block the restaurant " +
      "rather than guessing at prices.",
  );
  process.exit(2);
}
console.error(`\n${found} page image(s) written. Read them; do not infer anything they do not show.`);
