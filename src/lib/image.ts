/**
 * Centre-crops `file` to a `size`x`size` JPEG.
 *
 * Hands back the encoded bytes rather than a data URL: the avatar goes to the
 * blob store now and the row keeps only its address, so there is nothing left
 * for the base64 detour to be for. Post photos pass a much larger `size` than
 * avatars do, so `quality` stays tunable — at 1080px the default 0.85 makes
 * files big enough to be worth thinking about.
 *
 * Drawing through a canvas re-encodes from pixels, which drops whatever EXIF
 * the picked file carried. That is what keeps a phone photo's GPS tag from
 * riding onto a public profile.
 *
 * ## Decoding, and why not FileReader
 *
 * This used to read the file with `readAsDataURL` and hand the string to an
 * `<img>`. That works on a desktop and falls over on the device this feature
 * is mostly used from: a photo straight off an iPhone is several megabytes,
 * base64 inflates it by a third, and mobile Safari has to hold the file, the
 * string and the decoded bitmap at once. Past a certain size it simply fails
 * the decode, `img.onerror` fires, and every caller shows the same "couldn't
 * read that image" — which is indistinguishable from picking a corrupt file.
 *
 * `createImageBitmap` decodes the Blob directly, with no intermediate string
 * and no `<img>` in the document, and `imageOrientation: "from-image"` applies
 * the EXIF rotation that a portrait photo carries — without it, a picture
 * taken sideways is cropped sideways. The object-URL path stays as a fallback
 * for anything that lacks it; it is still far cheaper than a data URL because
 * the browser reads from the file rather than from a copy in a string.
 */
/** Something a canvas can draw that also knows how big it is. */
export type DecodedImage = CanvasImageSource & { width: number; height: number };

/** The square of the source image a crop keeps, in source pixels. */
export type CropRect = { sx: number; sy: number; size: number };

/**
 * One square of `source`, encoded as a JPEG at `out`x`out`.
 *
 * The rect comes from the cropper rather than being computed here, because
 * only the cropper knows where the circle was dragged to. Callers that want
 * the plain centre crop can ask `centreCrop` for the rect.
 */
export async function cropToJpeg(
  source: DecodedImage,
  rect: CropRect,
  out = 256,
  quality = 0.85,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  /* The circle is a mask on the way in, not on the way out: the stored file
     stays a square JPEG and every surface that shows an avatar already clips
     it with `rounded-full`. Writing a transparent-cornered PNG instead would
     cost alpha, a bigger file, and a second format in the blob store, and
     would still be drawn inside the same CSS circle. */
  ctx.drawImage(source, rect.sx, rect.sy, rect.size, rect.size, 0, 0, out, out);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Could not encode image");
  return blob;
}

/** The biggest centred square in an image — where the cropper opens. */
export function centreCrop(source: DecodedImage): CropRect {
  const size = Math.min(source.width, source.height);
  return { sx: (source.width - size) / 2, sy: (source.height - size) / 2, size };
}

/** Frees an ImageBitmap's memory; a plain <img> has nothing to release. */
export function closeImage(source: CanvasImageSource) {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) source.close();
}

/**
 * The picked file as something a canvas can draw.
 *
 * `createImageBitmap` first — it decodes off the main thread and never
 * materializes the file as a string. The `<img>` path behind it exists for
 * browsers without it, and for the case that matters more in practice: Safari
 * has historically refused `createImageBitmap` on some HEIC files while
 * decoding them perfectly well through an `<img>`, so a rejection here is a
 * reason to try the other way rather than to give up.
 */
export async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to the <img> path
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
