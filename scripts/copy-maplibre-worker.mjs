/**
 * Copies MapLibre's worker into public/ so it is served as a plain static file.
 *
 * The bundler serves the worker module with a non-JavaScript MIME type, which
 * the browser refuses to execute. MapLibre decodes every vector tile in that
 * worker, so without it the map draws nothing at all — no streets, no water,
 * no labels — while reporting no error and still loading tiles over the
 * network. RestaurantMap points setWorkerUrl at /maplibre-gl-worker.mjs, and
 * these copies are what it loads.
 *
 * Running on postinstall keeps the copies in step with the installed
 * maplibre-gl, so an upgrade can't leave a stale worker talking to a newer
 * library. The copies stay committed as well, so the map still works if a
 * lockfile-only install or a script-blocking npm config skips this.
 *
 * This never fails an install: a missing source is reported and the existing
 * copy is left alone.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "node_modules", "maplibre-gl", "dist");
const publicDir = join(root, "public");

// The worker imports the shared chunk by relative path, so both files have to
// sit next to each other at the web root.
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

async function main() {
  if (!existsSync(distDir)) {
    console.warn("[maplibre] dist not found — keeping the committed public/ copies");
    return;
  }

  await mkdir(publicDir, { recursive: true });

  for (const file of FILES) {
    const source = join(distDir, file);
    if (!existsSync(source)) {
      console.warn(`[maplibre] ${file} is not in dist — keeping the committed copy`);
      continue;
    }
    await copyFile(source, join(publicDir, file));
  }
}

main().catch((error) => {
  console.warn(`[maplibre] worker copy skipped: ${error.message}`);
});
