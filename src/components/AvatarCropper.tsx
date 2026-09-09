"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  closeImage,
  cropToJpeg,
  decodeImage,
  type CropRect,
  type DecodedImage,
} from "@/lib/image";

/** How far past "fills the circle" a picture can be pushed. */
const MAX_ZOOM = 4;
/** The stored avatar's edge. 72px on screen at 3x is 216, so 256 covers it. */
const OUT_SIZE = 256;

/**
 * Move and scale a picked photo inside the circle it will be shown in.
 *
 * The upload used to centre-crop silently, which is only ever right by luck:
 * a face is rarely in the middle of the frame, and on a portrait photo the
 * centre square is usually somebody's chest. This is the same gesture every
 * phone user already knows — drag to move, pinch to zoom, and the part inside
 * the circle is the part that is kept.
 *
 * ## The geometry, in one place
 *
 * Everything is held as the drawn image's box inside a square viewport of side
 * `V`: `pos` is its top-left in viewport pixels and `zoom` multiplies the
 * scale at which it exactly covers that square. Keeping the state in *viewport*
 * pixels rather than source pixels is what makes the drag one-to-one with the
 * finger at any zoom, and it makes the constraint trivial — the image covers
 * the circle exactly when its box still contains the viewport, so `pos` is
 * clamped to `[V - drawn, 0]` on both axes and there is never a gap to guard
 * against at draw time.
 *
 * The crop rect is that mapping run backwards once, at Save. Nothing resamples
 * while you drag: the preview is the source image under a CSS transform, so it
 * stays sharp and costs no canvas work per frame.
 *
 * ## Why the circle is a mask and not the output
 *
 * The saved file is a square JPEG. Every surface that shows an avatar already
 * clips it with `rounded-full`, so a transparent-cornered PNG would cost alpha,
 * a bigger file and a second format in the blob store to end up drawn inside
 * the same CSS circle. The ring here is what the crop *means*, not what it
 * writes.
 */
export function AvatarCropper({
  file,
  busy = false,
  onCancel,
  onSave,
}: {
  file: File;
  /** The upload is in flight — the controls stay put but stop accepting taps. */
  busy?: boolean;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
}) {
  const [image, setImage] = useState<DecodedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  /*
   * Null until the picture is moved, and that is not laziness — it is what
   * keeps the opening frame out of an effect.
   *
   * The centred position cannot be known at mount: it needs both the decoded
   * image and the measured viewport, which arrive separately and later.
   * Computing it in an effect and calling setState there is the lint rule this
   * codebase has already been bitten by, and it also paints one frame with the
   * picture in the wrong place. Derived below instead, so the first render
   * that has both is already centred.
   */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const frameRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(0);

  /* Decode once, here, rather than in the caller: the cropper needs the
     bitmap on screen anyway, and handing the same decoded image to the crop
     at the end means a multi-megabyte photo is decoded once per pick. */
  useEffect(() => {
    let cancelled = false;
    let decoded: DecodedImage | null = null;
    decodeImage(file)
      .then((img) => {
        if (cancelled) {
          closeImage(img);
          return;
        }
        decoded = img;
        setImage(img);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not read that image."),
      );
    return () => {
      cancelled = true;
      if (decoded) closeImage(decoded);
    };
  }, [file]);

  /* The viewport is sized by CSS (it is a square that fits the screen), so its
     side has to be measured rather than assumed — every number below is in
     these pixels. */
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setSide(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [image]);

  /** The scale at which the image exactly covers the viewport. */
  const cover = image && side ? side / Math.min(image.width, image.height) : 0;
  const drawnW = image ? image.width * cover * zoom : 0;
  const drawnH = image ? image.height * cover * zoom : 0;

  /** Where the picture sits: what the drag put there, or dead centre. */
  const centred = { x: (side - drawnW) / 2, y: (side - drawnH) / 2 };
  const at = pos ?? centred;

  const clamp = useCallback(
    (next: { x: number; y: number }, w: number, h: number) => ({
      x: Math.min(0, Math.max(side - w, next.x)),
      y: Math.min(0, Math.max(side - h, next.y)),
    }),
    [side],
  );

  /**
   * Zoom about a fixed point.
   *
   * Without an anchor, zooming walks the picture: the top-left stays put and
   * everything the circle was framing slides out of it. The point under the
   * anchor — the pinch midpoint, or the centre for the slider — is held still
   * by converting it to a fraction of the image first and putting it back
   * afterwards.
   */
  const zoomTo = useCallback(
    (next: number, anchorX = side / 2, anchorY = side / 2) => {
      if (!image) return;
      const clamped = Math.min(MAX_ZOOM, Math.max(1, next));
      setPos((previous) => {
        const w = image.width * cover * zoom;
        const h = image.height * cover * zoom;
        /* Recomputed rather than closing over `centred`, which is a fresh
           object every render and would make this callback's identity churn. */
        const prev = previous ?? { x: (side - w) / 2, y: (side - h) / 2 };
        const fx = (anchorX - prev.x) / w;
        const fy = (anchorY - prev.y) / h;
        const nw = image.width * cover * clamped;
        const nh = image.height * cover * clamped;
        return clamp({ x: anchorX - fx * nw, y: anchorY - fy * nh }, nw, nh);
      });
      setZoom(clamped);
    },
    [image, cover, zoom, side, clamp],
  );

  /* Live pointers, by id. Two of them is a pinch; one is a drag. Kept in a ref
     because these change many times per frame and none of it should re-render
     on its own — only the position it produces does. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; midX: number; midY: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (busy) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = null;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (busy || !pointers.current.has(e.pointerId) || !image) return;
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const live = [...pointers.current.values()];
    const box = frameRef.current?.getBoundingClientRect();

    if (live.length >= 2 && box) {
      const [a, b] = live;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2 - box.left;
      const midY = (a.y + b.y) / 2 - box.top;
      if (pinch.current && pinch.current.dist > 0) {
        // Pan by however far the midpoint travelled, then zoom about it, so a
        // pinch that also slides does both rather than fighting itself.
        const dx = midX - pinch.current.midX;
        const dy = midY - pinch.current.midY;
        if (dx || dy)
          setPos((p) => clamp({ x: (p ?? centred).x + dx, y: (p ?? centred).y + dy }, drawnW, drawnH));
        zoomTo(zoom * (dist / pinch.current.dist), midX, midY);
      }
      pinch.current = { dist, midX, midY };
      return;
    }

    setPos((p) => {
      const from = p ?? centred;
      return clamp(
        { x: from.x + (e.clientX - prev.x), y: from.y + (e.clientY - prev.y) },
        drawnW,
        drawnH,
      );
    });
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
  }

  /** The viewport square, mapped back into the source image. */
  function rect(): CropRect | null {
    if (!image || !side || !drawnW || !drawnH) return null;
    const perPixel = image.width / drawnW;
    return {
      sx: -at.x * perPixel,
      sy: -at.y * (image.height / drawnH),
      size: side * perPixel,
    };
  }

  async function save() {
    const r = rect();
    if (!image || !r) return;
    try {
      onSave(await cropToJpeg(image, r, OUT_SIZE));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that crop.");
    }
  }

  return (
    /* Its own layer over whatever screen opened it. `pm-charcoal` rather than
       the cream ground on purpose: this is a viewer, and a photograph is
       judged against something dark (DESIGN.md's map exception makes the same
       argument). */
    <div
      className="fixed inset-0 z-50 flex flex-col bg-pm-charcoal"
      role="dialog"
      aria-modal="true"
      aria-label="Move and scale your photo"
    >
      <div className="flex items-center justify-between gap-3 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-white/70 transition-colors hover:text-white disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Cancel
        </button>
        <p className="text-sm font-medium text-white/90">Move and scale</p>
        <button
          type="button"
          onClick={save}
          disabled={busy || !image}
          className="inline-flex min-h-11 items-center rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] transition-transform active:scale-95 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-5">
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          /* `touch-none` is load-bearing: without it the browser claims the
             drag for page scrolling and the photo only moves in whichever
             direction the page cannot. */
          className="relative aspect-square w-full max-w-[360px] touch-none overflow-hidden select-none"
        >
          {image && side > 0 && (
            /* The source image under a transform — no canvas per frame, so the
               preview stays as sharp as the original while it moves. */
            /* A local object URL for a file the visitor just picked, so
               next/image has nothing it could fetch or optimise. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={URL.createObjectURL(file)}
              alt=""
              draggable={false}
              onLoad={(e) => URL.revokeObjectURL(e.currentTarget.src)}
              className="absolute left-0 top-0 max-w-none origin-top-left"
              style={{ width: drawnW, height: drawnH, transform: `translate(${at.x}px, ${at.y}px)` }}
            />
          )}

          {/* The circle. A ring plus an enormous spread shadow is what dims
              everything outside it without a second element to keep aligned. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(35,32,25,0.72)] ring-1 ring-white/70"
          />

          {!image && !error && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
              Opening your photo…
            </p>
          )}
        </div>

        {error && (
          <p className="mt-4 max-w-xs text-center font-mono text-[11px] leading-relaxed text-white/60">
            {error}
          </p>
        )}

        {image && (
          <label className="mt-6 flex w-full max-w-[360px] items-center gap-3">
            <span className="sr-only">Zoom</span>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              disabled={busy}
              onChange={(e) => zoomTo(Number(e.target.value))}
              /* accent-color styles the native track and thumb, so this needs no
                 CSS in the shared stylesheet; h-11 keeps the AGENTS.md touch floor. */
              className="h-11 w-full accent-pm-orange"
            />
          </label>
        )}
      </div>

      <p className="px-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-center text-xs leading-relaxed text-white/45">
        Drag to move, pinch or use the slider to zoom.
      </p>
    </div>
  );
}
