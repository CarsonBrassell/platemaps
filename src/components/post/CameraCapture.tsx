"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, CloseIcon, ChatIcon, ChevronIcon } from "@/components/icons";
import {
  MAX_PHOTOS,
  PHOTO_QUALITY,
  PHOTO_SIZE,
  photoFromDataUrl,
  resizePhotos,
  type PhotoDraft,
} from "@/lib/photos";

type Facing = "environment" | "user";
type Status = "starting" | "live" | "blocked" | "unsupported";

/**
 * The first thing you see after tapping post: the camera, already running.
 *
 * A plate is the thing being reviewed, so the photo is not a field on a form —
 * it is the opening move, and everything else is decided after it exists. The
 * rear camera is asked for by default because the subject is on the table.
 *
 * Every branch that can fail ends somewhere usable rather than in a dead end: no
 * camera API, a refused permission, or a laptop with the lens covered all fall
 * through to the library picker, and the comment door below never depends on any
 * of it.
 */
export function CameraCapture({
  photos,
  onChange,
  onSkip,
}: {
  photos: PhotoDraft[];
  onChange: React.Dispatch<React.SetStateAction<PhotoDraft[]>>;
  /** The "just leave a comment" door — no photo, straight on to the choice. */
  onSkip: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [facing, setFacing] = useState<Facing>("environment");
  const [status, setStatus] = useState<Status>("starting");
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const full = photos.length >= MAX_PHOTOS;

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1440 } },
          audio: false,
        });
        // The permission prompt outlives a fast back-navigation, so a stream
        // that arrives after unmount has to be shut down rather than left on.
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("live");
      } catch {
        if (!cancelled) setStatus("blocked");
      }
    }

    void start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || full) return;

    const scale = Math.min(1, PHOTO_SIZE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // The front camera is previewed mirrored, the way a mirror behaves; the
    // capture has to match what was on screen or the shot looks flipped.
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    onChange((prev) => [...prev, photoFromDataUrl(canvas.toDataURL("image/jpeg", PHOTO_QUALITY))]);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
  }

  async function addFromLibrary(files: File[]) {
    if (!files.length) return;
    setError(null);
    const { photos: added, error: problem } = await resizePhotos(files, MAX_PHOTOS - photos.length);
    setError(problem);
    if (added.length) onChange((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    // Held to a phone's column even on a wide screen: a 4:5 viewport at the
    // full content width stands 840px tall and pushes the shutter — the one
    // control this screen exists for — under the fold.
    <div className="mx-auto w-full max-w-sm">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-pm-charcoal shadow-lg">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="Camera preview"
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            status === "live" ? "opacity-100" : "opacity-0"
          } ${facing === "user" ? "-scale-x-100" : ""}`}
        />

        {status !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <CameraIcon className="h-8 w-8 text-white/35" />
            <p className="text-sm font-medium text-white/90">
              {status === "starting" && "Starting the camera…"}
              {status === "blocked" && "Camera's off"}
              {status === "unsupported" && "No camera here"}
            </p>
            {status !== "starting" && (
              <p className="max-w-xs text-xs leading-relaxed text-white/55">
                {status === "blocked"
                  ? "PlateMaps needs camera permission for this screen. Allow it in your browser, or pick a photo you already have."
                  : "This browser doesn't offer a camera. Pick a photo you already have instead."}
              </p>
            )}
            {status !== "starting" && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-1 min-h-11 rounded-full bg-white px-5 text-sm font-semibold text-pm-charcoal transition-transform hover:brightness-95 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Choose a photo
              </button>
            )}
          </div>
        )}

        {/* The shutter's own feedback — a frame of white over the viewport. */}
        {flash && <div className="shutter-flash absolute inset-0 bg-white" aria-hidden="true" />}

        {photos.length > 0 && (
          <p className="absolute left-4 top-4 rounded-full bg-pm-charcoal/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            {photos.length} of {MAX_PHOTOS}
          </p>
        )}

        {/* The other door, sitting in the viewfinder rather than below it: one
            line of chrome over the picture costs nothing, where a card under it
            pushed the shutter itself off a laptop screen. */}
        <button
          type="button"
          onClick={onSkip}
          className="absolute inset-x-3 bottom-3 flex min-h-11 items-center gap-2 rounded-2xl bg-white/15 px-4 text-left text-sm font-medium text-white ring-1 ring-inset ring-white/25 backdrop-blur-md transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <ChatIcon className="h-4 w-4 shrink-0" />
          <span className="flex-1">Just leave a comment</span>
          <ChevronIcon className="h-4 w-4 shrink-0 text-white/60" />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={full}
          aria-label="Choose from your photos"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-zinc-500 ring-1 ring-inset ring-zinc-200 transition-colors hover:text-pm-orange-text disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </button>

        <button
          type="button"
          onClick={capture}
          disabled={status !== "live" || full}
          aria-label={full ? `Photo limit reached — ${MAX_PHOTOS} maximum` : "Take a photo"}
          className="flex h-[74px] w-[74px] shrink-0 rounded-full bg-white p-[7px] shadow-md ring-1 ring-inset ring-pm-charcoal/10 transition-transform active:scale-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pm-orange"
        >
          {/* White ring, orange core — the gap between them is what makes it
              read as a shutter rather than a plain round button. */}
          <span className="block h-full w-full rounded-full bg-pm-orange" />
        </button>

        <button
          type="button"
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          disabled={status !== "live"}
          aria-label={facing === "environment" ? "Switch to the front camera" : "Switch to the rear camera"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-zinc-500 ring-1 ring-inset ring-zinc-200 transition-colors hover:text-pm-orange-text disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
            <path d="M3 10a7 7 0 0 1 11.9-5" />
            <path d="M21 14a7 7 0 0 1-11.9 5" />
            <path d="M15 5h4V1" />
            <path d="M9 19H5v4" />
          </svg>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void addFromLibrary(Array.from(e.target.files ?? []))}
        className="sr-only"
        aria-label="Choose photos"
      />

      {photos.length > 0 && (
        <ul className="mt-4 flex gap-2">
          {photos.map((photo, i) => (
            <li key={photo.id} className="relative h-16 w-16 overflow-hidden rounded-xl ring-1 ring-inset ring-zinc-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-pm-charcoal/75 text-white transition-transform hover:scale-110"
              >
                <CloseIcon className="h-2.5 w-2.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

    </div>
  );
}
