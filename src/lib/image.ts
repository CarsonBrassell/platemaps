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
 */
export function resizeImageToJpeg(file: File, size = 128, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
          "image/jpeg",
          quality,
        );
      };
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}
