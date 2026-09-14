"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, CloseIcon, ChatIcon, ChevronIcon, PhotoIcon } from "@/components/icons";
import {
  MAX_PHOTOS,
  PHOTO_QUALITY,
  SHOT_H,
  SHOT_W,
  canvasToJpeg,
  fileToDraft,
  nextPhotoId,
  type PhotoDraft,
} from "@/lib/photos";

type Facing = "environment" | "user";
/** One camera filling the frame, or both stacked in one picture. */
type Mode = "single" | "split";
type Status = "starting" | "live" | "blocked" | "unsupported";

/** The split picture: 3:4 overall, two equal halves. */
const SPLIT_W = 1080;
const SPLIT_HALF = 720;

/**
 * The single picture, in the same 3:4 the split is built at and the feed hero
 * renders — see `PostMediaCarousel`. 3:4 rather than 4:5 since 2026-09-13:
 * Calvin wanted the picture a touch taller, and the shape has to change in
 * the file, the viewfinder and the feed together or the crop comes back.
 *
 * It used to be whatever frame the camera handed over, 4:3 or 16:9 landscape,
 * and that is why a photo changed shape between this screen and the feed: the
 * viewfinder cropped to the frame with `object-cover` while the file kept the bands
 * above and below that crop, and the feed then took its own crop of the file.
 * Cropping at the shutter instead means the file *is* what was framed.
 *
 * `SHOT_W`/`SHOT_H` live in lib/photos now, because `fileToDraft` cuts a
 * library picture to the same box: `SHOT_H` is the long edge, so a single
 * shot stays inside PHOTO_SIZE either way.
 */

/**
 * One camera frame, centre-cropped to fill a box of exactly `w` x `h`.
 *
 * `Math.max` is the same cover crop the viewfinder performs with
 * `object-cover`, and it has to be: what the file holds is what the frame
 * showed. A camera previewed mirrored — the way a mirror behaves — is written
 * mirrored too, or the shot comes back flipped from what was on screen.
 */
function coverCanvas(video: HTMLVideoElement, w: number, h: number, mirror: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx || !video.videoWidth) return null;

  const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
  const dw = video.videoWidth * scale;
  const dh = video.videoHeight * scale;
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return canvas;
}

/**
 * The first thing you see after tapping post: the camera, already running.
 *
 * A plate is the thing being reviewed, so the photo is not a field on a form —
 * it is the opening move, and everything else is decided after it exists. The
 * rear camera is asked for by default because the subject is on the table.
 *
 * Two shapes, one component. `fullscreen` is the phone composer's: the
 * viewfinder *is* the screen, edge to edge, with every control floating on the
 * picture — the BeReal arrangement, and the one a camera actually wants. Left
 * off, it renders as the 3:4 card the web composer puts inside its page column,
 * because a viewfinder filling a 27" monitor is not the same idea.
 *
 * Split mode composes one photo out of both cameras — the plate and the face
 * over it. How it gets them depends on the hardware and it cannot be known in
 * advance; see `openSpare`.
 *
 * **One photo, then a look at it.** The shutter does not land you back on the
 * live camera — the shot it just took fills the same frame the viewfinder was
 * filling, and the two questions a finished photo asks, keep it or take it
 * again, are the only controls left on screen. A plate post is about one plate;
 * a strip of thumbnails under a running camera made it a loop nobody was
 * looking at. `MAX_PHOTOS` in lib/photos carries the rest of that reasoning.
 *
 * **The library is a side door, not the front one.** It was taken off this
 * screen in 2026-08 (`039271c`) on the argument that a plate photo is a thing
 * you are looking at now, and every route from a camera roll ends in a post
 * about a meal that may be weeks old. Calvin put it back on 2026-09-14 because
 * the cost was the photo, not the freshness: iOS refuses a camera outside a
 * tap, in-app browsers refuse it altogether, a laptop's camera points at the
 * wrong thing, and the plate was photographed on the phone's own camera before
 * the app was ever opened. Every one of those used to end at the comment door
 * with no picture at all.
 *
 * So the camera is still the first thing on screen and the shutter is still
 * the one control the layout is built around. The library sits in the small
 * slot beside it, and on a camera that will not run it is offered next to
 * "Allow camera" rather than instead of it. A chosen picture goes through
 * `fileToDraft` and comes out as exactly the draft the shutter would have
 * made — same 3:4, same size, same review screen — so nothing after this step
 * knows which door it came through. Photos handed over from the feed still
 * arrive by their own path and skip this step entirely.
 */
export function CameraCapture({
  photos,
  onChange,
  onSkip,
  fullscreen = false,
  onClose,
  onDone,
}: {
  photos: PhotoDraft[];
  onChange: React.Dispatch<React.SetStateAction<PhotoDraft[]>>;
  /** The "post without a photo" door — skips the camera, keeps the flow. */
  onSkip: () => void;
  /** Render as the whole screen rather than as a card in a page. */
  fullscreen?: boolean;
  /** Fullscreen only: leave the composer. The page chrome carrying this is hidden. */
  onClose?: () => void;
  /** Fullscreen only: move on with what's been taken. Same reason. */
  onDone?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** The second camera, only ever filled on hardware that can run both. */
  const spareVideoRef = useRef<HTMLVideoElement>(null);
  const spareStreamRef = useRef<MediaStream | null>(null);

  /** null until the first split attempt answers it; false pins split to two shots. */
  const bothAtOnceRef = useRef<boolean | null>(null);
  /** The first half of a two-shot split, held as pixels until the second lands. */
  const pendingRef = useRef<HTMLCanvasElement | null>(null);

  const [mode, setMode] = useState<Mode>("single");
  const [facing, setFacing] = useState<Facing>("environment");
  /**
   * Which camera fills which half of a split — [top, bottom]. Fixed: the plate
   * on top, the face under it. This used to be state behind the flip button,
   * which in split mode swapped the halves instead of turning the camera —
   * the same icon meaning two things, and the second one nobody wanted.
   */
  const order: [Facing, Facing] = ["environment", "user"];
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [bothLive, setBothLive] = useState(false);
  const [status, setStatus] = useState<Status>("starting");
  /*
   * Why the camera actually refused.
   *
   * `getUserMedia` fails for reasons that need different fixes and used to be
   * indistinguishable here: the catch below discarded the error and every one
   * of them rendered as "Camera's off, go to Settings". A denied permission
   * (NotAllowedError) is the only one that advice is true for. NotFoundError
   * means there is no camera, NotReadableError means another app holds it,
   * SecurityError means the page is not a secure context, and OverconstrainedError
   * means the constraints could not be met — Settings fixes none of those, and
   * telling someone to go there is a dead end they can spend a long time in.
   */
  const [failure, setFailure] = useState<string | null>(null);
  /*
   * Bumped to ask for the camera again, and the reason this screen has a
   * button on it at all.
   *
   * The effect below opens the camera on mount, which is the design — a plate
   * is a thing you are looking at now, so the viewfinder should already be
   * running when you arrive. On iOS that is also the one thing Safari will not
   * do: a `getUserMedia` call that is not inside a user gesture is refused
   * outright with `NotAllowedError` **and no prompt is ever shown**. The
   * permission was never denied; it was never asked for. From this screen it
   * is indistinguishable from a denial, which is why it sent people to
   * Settings to toggle a permission that was not there to find.
   *
   * So the mount request stays (it is what desktop and Android want, and it
   * costs nothing when it fails), and the button below re-asks from inside a
   * real tap. That call is the one iOS will show the prompt for.
   */
  const [attempt, setAttempt] = useState(0);
  const [flash, setFlash] = useState(false);
  /** The hidden file input the library buttons open. */
  const fileRef = useRef<HTMLInputElement>(null);
  /** A chosen file is being decoded and cropped. */
  const [picking, setPicking] = useState(false);
  /** Why the last chosen file did not become a photo, in one sentence. */
  const [pickError, setPickError] = useState<string | null>(null);
  /**
   * The stream is attached *and* the first frame has arrived.
   *
   * `status` goes "live" the moment `srcObject` is assigned, but the element
   * reports `videoWidth` 0 until it has decoded a frame, and `capture` has
   * nothing to draw until then. The shutter used to be enabled across that
   * gap, and a press inside it did nothing — no flash, no photo — so it now
   * waits for `loadeddata`, the first drawable frame.
   */
  const [ready, setReady] = useState(false);

  /** The photo, once one exists. Its presence *is* the review step. */
  const taken = photos[0] ?? null;
  /** Which half the running camera is filling: the second one once a shot is held. */
  const slot = pendingUrl ? 1 : 0;
  const live: Facing = mode === "single" ? facing : order[slot];
  const spare: Facing = live === "environment" ? "user" : "environment";
  /** A split still owed its other half — the shutter means something different here. */
  const midSplit = pendingUrl !== null;

  useEffect(() => {
    let cancelled = false;

    function open(want: Facing) {
      return navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: want }, width: { ideal: 1440 } },
        audio: false,
      });
    }

    /**
     * `open`, but if the facingMode + width combination is itself the
     * problem — some WKWebView builds throw `OverconstrainedError` for a
     * constraint set a desktop browser accepts without complaint — retry
     * with just the width. A camera that exists but can't satisfy `ideal`
     * facingMode should still be usable; only a real refusal (permission,
     * no device) should reach the "blocked"/"unsupported" states below.
     */
    async function openResilient(want: Facing) {
      try {
        return await open(want);
      } catch (err) {
        if (err instanceof Error && err.name === "OverconstrainedError") {
          return navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1440 } },
            audio: false,
          });
        }
        throw err;
      }
    }

    function stop(stream: MediaStream | null) {
      stream?.getTracks().forEach((t) => t.stop());
    }

    /**
     * `autoPlay` is a request, not a guarantee: a muted stream assigned from
     * script has been seen sitting paused on its first frame, and WKWebView
     * in Low Power Mode refuses autoplay outright. A paused video still
     * reports a `videoWidth`, so without this the shutter would capture the
     * same stale frame every press. Asking explicitly is cheap; the rejection
     * (if any) is not actionable, so it is swallowed.
     */
    function show(el: HTMLVideoElement | null, stream: MediaStream) {
      if (!el) return;
      el.srcObject = stream;
      el.play().catch(() => {});
    }

    /*
     * Can this device show both cameras at once?
     *
     * There is no API that answers it, and the wrong answer is expensive in one
     * direction only: on most phones the second `getUserMedia` *takes* the
     * camera from the first stream, so asking costs the running preview. So it
     * is asked once per mount, the damage is repaired immediately (the primary
     * is reopened), and the verdict is cached in a ref — which is deliberately
     * not state, because re-running this effect is the one thing that must not
     * happen when it flips.
     *
     * Two cameras reported but the same `deviceId` handed back twice is the
     * laptop case: one webcam, `facingMode` ignored. That is not a split either.
     */
    async function openSpare(primary: MediaStream) {
      try {
        const cams = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "videoinput",
        );
        if (cancelled) return;
        if (cams.length < 2) {
          bothAtOnceRef.current = false;
          return;
        }
      } catch {
        bothAtOnceRef.current = false;
        return;
      }

      let second: MediaStream;
      try {
        second = await open(spare);
      } catch {
        bothAtOnceRef.current = false;
        return;
      }
      if (cancelled) {
        stop(second);
        return;
      }

      const primaryTrack = primary.getVideoTracks()[0];
      const secondTrack = second.getVideoTracks()[0];
      const sameLens = primaryTrack?.getSettings().deviceId === secondTrack?.getSettings().deviceId;
      const survived = primaryTrack?.readyState === "live";

      if (!survived || sameLens) {
        stop(second);
        bothAtOnceRef.current = false;
        setBothLive(false);
        if (!survived) {
          try {
            const again = await openResilient(live);
            if (cancelled) {
              stop(again);
              return;
            }
            stop(streamRef.current);
            streamRef.current = again;
            show(videoRef.current, again);
          } catch {
            if (!cancelled) setStatus("blocked");
          }
        }
        return;
      }

      spareStreamRef.current = second;
      show(spareVideoRef.current, second);
      bothAtOnceRef.current = true;
      setBothLive(true);
    }

    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }
      let stream: MediaStream;
      try {
        stream = await openResilient(live);
      } catch (err) {
        if (!cancelled) {
          setFailure(
            err instanceof Error ? `${err.name}: ${err.message}` : String(err),
          );
          setStatus("blocked");
        }
        return;
      }
      // The permission prompt outlives a fast back-navigation, so a stream
      // that arrives after unmount has to be shut down rather than left on.
      if (cancelled) {
        stop(stream);
        return;
      }
      streamRef.current = stream;
      show(videoRef.current, stream);
      setStatus("live");

      if (mode !== "split" || bothAtOnceRef.current === false) return;
      await openSpare(stream);
    }

    void start();

    return () => {
      cancelled = true;
      stop(streamRef.current);
      streamRef.current = null;
      stop(spareStreamRef.current);
      spareStreamRef.current = null;
      setBothLive(false);
      setReady(false);
    };
  }, [live, spare, mode, attempt]);

  function flashOnce() {
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
  }

  /** One camera frame, cover-cropped into half of the split picture. */
  function halfFrom(video: HTMLVideoElement, mirror: boolean) {
    return coverCanvas(video, SPLIT_W, SPLIT_HALF, mirror);
  }

  function join(top: HTMLCanvasElement, bottom: HTMLCanvasElement) {
    const canvas = document.createElement("canvas");
    canvas.width = SPLIT_W;
    canvas.height = SPLIT_HALF * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(top, 0, 0);
    ctx.drawImage(bottom, 0, SPLIT_HALF);
    return canvas;
  }

  /**
   * A finished picture joins the post.
   *
   * The preview is an object URL over the JPEG already in hand, so the
   * thumbnail is on screen the moment the shutter fires with no network in
   * the way. **Nothing is uploaded here.** A draft lives in this browser
   * until Post is pressed, which is what makes leaving the composer free:
   * back out, close the tab, kill the app, and there is nothing in the store
   * to find afterwards. `uploadPhotos` in lib/photos is where they go, once,
   * at the end. */
  function add(blob: Blob) {
    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    setPickError(null);
    onChange([{ id: nextPhotoId(), previewUrl: URL.createObjectURL(blob), blob }]);
  }

  /** Back to the live camera. Dropping the draft drops its object URL with it. */
  function retake() {
    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    setPickError(null);
    onChange([]);
  }

  /**
   * A picture from the library, arriving where the shutter's would.
   *
   * The input is cleared after every pick so choosing the same file twice —
   * retake, then the same photo again — fires `change` a second time; a file
   * input only reports a *different* selection. Decoding a phone photo takes
   * a beat, so the button shows it is busy rather than looking ignored.
   */
  async function chooseFromLibrary(input: HTMLInputElement) {
    // First file only — see the note on the input for why `multiple` is set.
    const file = input.files?.[0];
    input.value = "";
    if (!file || photos.length >= MAX_PHOTOS) return;
    setPickError(null);
    setPicking(true);
    try {
      const result = await fileToDraft(file);
      if (result.draft) {
        photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
        onChange([result.draft]);
      } else {
        setPickError(result.error);
      }
    } finally {
      setPicking(false);
    }
  }

  async function captureSplit() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;

    // Both lenses running: one press is the whole picture, nothing to wait for.
    if (bothLive) {
      const other = spareVideoRef.current;
      if (!other?.videoWidth) return;
      const top = halfFrom(order[0] === live ? video : other, order[0] === "user");
      const bottom = halfFrom(order[1] === live ? video : other, order[1] === "user");
      if (!top || !bottom) return;
      const joined = join(top, bottom);
      const blob = joined && (await canvasToJpeg(joined));
      if (blob) add(blob);
      flashOnce();
      return;
    }

    // One lens at a time: the press takes the half in front of it, the camera
    // turns around, and the next press finishes the picture. Nothing is added
    // to the post until both halves exist, so a half-taken split cannot be
    // posted by accident.
    const shot = halfFrom(video, live === "user");
    if (!shot) return;

    if (!pendingRef.current) {
      pendingRef.current = shot;
      setPendingUrl(shot.toDataURL("image/jpeg", PHOTO_QUALITY));
      flashOnce();
      return;
    }

    const joined = join(pendingRef.current, shot);
    pendingRef.current = null;
    setPendingUrl(null);
    const blob = joined && (await canvasToJpeg(joined));
    if (blob) add(blob);
    flashOnce();
  }

  async function capture() {
    if (photos.length >= MAX_PHOTOS) return;
    if (mode === "split") {
      void captureSplit();
      return;
    }

    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // The 3:4 the viewfinder is already showing, not the camera's own frame.
    const canvas = coverCanvas(video, SHOT_W, SHOT_H, facing === "user");
    if (!canvas) return;

    const blob = await canvasToJpeg(canvas);
    if (blob) add(blob);
    flashOnce();
  }

  function dropPending() {
    pendingRef.current = null;
    setPendingUrl(null);
  }

  function chooseMode(next: Mode) {
    if (next === mode) return;
    dropPending();
    setMode(next);
  }

  /** Turns the camera round. Single mode only — a split has no side to pick. */
  function flip() {
    setFacing((f) => (f === "environment" ? "user" : "environment"));
  }

  /* ---------------------------------------------------------------- pieces */

  /* Where the live camera sits. The element never moves in the tree — only its
     box changes — because remounting a <video> drops its `srcObject` and the
     preview goes black on every mode switch. */
  const liveBox =
    mode === "single"
      ? "inset-y-0 h-full"
      : slot === 0
        ? "top-0 h-1/2"
        : "bottom-0 h-1/2";

  const viewfinder = (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedData={() => setReady(true)}
        onEmptied={() => setReady(false)}
        aria-label="Camera preview"
        className={`absolute inset-x-0 w-full object-cover transition-opacity duration-300 ${liveBox} ${
          status === "live" ? "opacity-100" : "opacity-0"
        } ${live === "user" ? "-scale-x-100" : ""}`}
      />

      {/* Mounted always, shown only when the hardware granted a second stream —
          it has to exist in the DOM before the effect can attach one. */}
      <video
        ref={spareVideoRef}
        autoPlay
        playsInline
        muted
        aria-label="Second camera preview"
        className={`absolute inset-x-0 bottom-0 h-1/2 w-full object-cover ${
          mode === "split" && bothLive ? "" : "hidden"
        } ${order[1] === "user" ? "-scale-x-100" : ""}`}
      />

      {/* The half already taken, standing in for a camera that has turned away. */}
      {pendingUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pendingUrl}
          alt="The first half of your split photo"
          className="absolute inset-x-0 top-0 h-1/2 w-full object-cover"
        />
      )}

      {/* The half this phone can't show yet, waiting rather than missing. Kept
          to an icon and three words, and pinned under the seam: the shutter
          hint below already says what the next press does, and the middle of
          this half is where the controls sit. */}
      {mode === "split" && !bothLive && !pendingUrl && status === "live" && (
        <div className="absolute inset-x-0 bottom-0 flex h-1/2 flex-col items-center gap-2 bg-pm-charcoal px-8 pt-8 text-center">
          <CameraIcon className="h-6 w-6 text-white/30" />
          <p className="text-xs text-white/45">
            {order[1] === "user" ? "Selfie" : "Plate"} goes here
          </p>
        </div>
      )}

      {mode === "split" && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/50" aria-hidden="true" />
      )}

      {/* The truth, then the two doors: ask for the camera again, or bring a
          picture from the library. The skip button below stays the third. */}
      {/* One step lighter than the screen behind it, with viewfinder corners,
          so the 3:4 picture reads as a place before there is a picture. In
          fullscreen the screen is charcoal too, and the same fill here made
          the frame vanish: on a desktop preview with no camera, nothing said
          where the shot would be taken. */}
      {status !== "live" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-pm-charcoal-light px-8 text-center">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <span className="absolute left-4 top-4 h-7 w-7 rounded-tl-lg border-l-2 border-t-2 border-white/40" />
            <span className="absolute right-4 top-4 h-7 w-7 rounded-tr-lg border-r-2 border-t-2 border-white/40" />
            <span className="absolute bottom-4 left-4 h-7 w-7 rounded-bl-lg border-b-2 border-l-2 border-white/40" />
            <span className="absolute bottom-4 right-4 h-7 w-7 rounded-br-lg border-b-2 border-r-2 border-white/40" />
          </div>
          <CameraIcon className="h-8 w-8 text-white/35" />
          <p className="text-sm font-medium text-white/90">
            {status === "starting" && "Starting the camera…"}
            {status === "blocked" && "Camera's off"}
            {status === "unsupported" && "No camera here"}
          </p>
          {status !== "starting" && (
            <p className="max-w-xs text-xs leading-relaxed text-white/55">
              {status === "blocked"
                ? "Tap Allow camera to take the photo here — if your phone has already been told no, turn it back on in Settings under PlateMaps → Camera (or your browser's site settings on the web). Or pick one you've already taken."
                : "This browser doesn't offer a camera. Pick a photo from your library, or post without one."}
            </p>
          )}
          {/* The reason, in the browser's own words. Mono because it is a
              machine value, and quiet because it is for whoever is debugging
              rather than for the person trying to post a plate — but on
              screen, because a failure nobody can name is a failure nobody
              can fix. */}
          {/* The ask, on a tap.
              This is the whole fix for the common case and it has to be a
              real button: iOS shows its permission prompt only for a
              `getUserMedia` call with a user gesture on the stack, and the
              one this screen makes on mount has none. Primary action, so it
              wears the orange fill — it is the way out of this screen, and
              the skip door below is the alternative rather than the default. */}
          {/* Allow camera keeps the orange while there is a camera to allow;
              with none at all, the library is the way out and takes it. */}
          {status !== "starting" && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              {status === "blocked" && (
                <button
                  type="button"
                  onClick={allowCamera}
                  className="inline-flex min-h-11 items-center rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Allow camera
                </button>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={picking}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition-transform active:scale-95 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  status === "unsupported"
                    ? "bg-pm-orange text-[#F7F4EC]"
                    : "bg-white/15 text-white ring-1 ring-inset ring-white/25 backdrop-blur-md hover:bg-white/25"
                }`}
              >
                <PhotoIcon className="h-4 w-4 shrink-0" />
                {picking ? "Opening…" : "Choose a photo"}
              </button>
            </div>
          )}
          {failure && (
            <p className="max-w-xs font-mono text-[10px] leading-relaxed text-white/40">
              {failure}
            </p>
          )}
        </div>
      )}

      {/* The shutter's own feedback — a frame of white over the viewport. */}
      {flash && <div className="shutter-flash absolute inset-0 bg-white" aria-hidden="true" />}

      {/* The library, behind every "Choose a photo" on this screen. One input
          for the rail button and the no-camera door alike, so there is one
          `change` handler and one place the pick lands. No `capture` attribute
          on purpose — that would open the camera again, which is the thing
          this input exists to be the alternative to. `image/*` rather than a
          list: iOS offers HEIC under it and `fileToDraft` re-encodes whatever
          arrives. `multiple` is not for taking several: iOS lists "Take
          Photo" on its picker sheet for a single-file input and drops it for a
          multi-file one, and the shutter next to this button already is the
          take-photo option. `chooseFromLibrary` keeps the first file only. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void chooseFromLibrary(e.currentTarget)}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  );

  /* Two modes of one control, so they take the screen-tab treatment DESIGN.md
     gives the map's switch: no track survives on a moving picture either. */
  const modeSwitch = (
    <div
      role="group"
      aria-label="Camera mode"
      className="flex items-center gap-1 rounded-full bg-pm-charcoal/55 p-1 ring-1 ring-inset ring-white/15 backdrop-blur-md"
    >
      {(["single", "split"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => chooseMode(m)}
          className={`mono-label min-h-11 rounded-full px-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
            mode === m ? "bg-white text-pm-charcoal" : "text-white/75 hover:text-white"
          }`}
        >
          {m === "single" ? "One" : "Split"}
        </button>
      ))}
    </div>
  );

  const railButton = fullscreen
    ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-inset ring-white/25 backdrop-blur-md transition-colors hover:bg-white/25 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    : "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-zinc-500 ring-1 ring-inset ring-zinc-200 transition-colors hover:text-pm-orange-text disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

  const controls = (
    <div className="flex items-center justify-between gap-4">
      {/* The library, in the small slot — the same size as the flip button
          opposite, which is what keeps the shutter in the centre. It stays
          enabled while the camera is starting or refused: a picture you
          already have does not need the lens to be working. Not while a
          split is half taken, though — that picture is being built from two
          cameras and a file has no second half. */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={picking || midSplit}
        aria-label="Choose a photo from your library"
        className={railButton}
      >
        <PhotoIcon className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={capture}
        disabled={status !== "live" || !ready}
        aria-label={
          mode === "split"
            ? midSplit
              ? "Take the second half"
              : bothLive
                ? "Take both cameras at once"
                : "Take the first half"
            : "Take a photo"
        }
        className="flex h-20 w-20 shrink-0 rounded-full bg-white p-2 shadow-md ring-1 ring-inset ring-pm-charcoal/10 transition-transform active:scale-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pm-orange"
      >
        {/* White ring, orange core — the gap between them is what makes it
            read as a shutter rather than a plain round button. A split waiting
            on its other half hollows the core out, so the press that finishes
            it looks different from the press that starts one. */}
        <span
          className={`block h-full w-full rounded-full ${
            midSplit ? "border-8 border-pm-orange" : "bg-pm-orange"
          }`}
        />
      </button>

      {/* No flip in split: both cameras are already in the picture, and the
          button used to swap the halves instead — a second meaning for the
          same icon. The spacer keeps the shutter centred, matching the left. */}
      {mode === "split" ? (
        <span className="h-12 w-12 shrink-0" aria-hidden="true" />
      ) : (
        <button
          type="button"
          onClick={flip}
          disabled={status !== "live"}
          aria-label={
            facing === "environment"
              ? "Switch to the front camera"
              : "Switch to the rear camera"
          }
          className={railButton}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
            <path d="M3 10a7 7 0 0 1 11.9-5" />
            <path d="M21 14a7 7 0 0 1-11.9 5" />
            <path d="M15 5h4V1" />
            <path d="M9 19H5v4" />
          </svg>
        </button>
      )}
    </div>
  );

  /* What the shutter will do, said once, just above the door and the shutter.
     A library pick that failed borrows the line: it is the one piece of text
     already sitting over a live viewfinder, and the failure is about the next
     photo just as the hint is. */
  const splitHint = (
    <p aria-live="polite" className="text-xs font-medium text-white/75">
      <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
        {pickError
          ? pickError
          : mode === "split"
          ? midSplit
            ? `Now the ${order[1] === "user" ? "selfie" : "plate"}`
            : bothLive
              ? "Both cameras, one picture"
              : `${order[0] === "user" ? "Selfie" : "Plate"} first, then the other side`
          : ""}
      </span>
    </p>
  );

  const skipDoor = (
    <button
      type="button"
      onClick={onSkip}
      className="flex min-h-11 w-full items-center gap-2 rounded-2xl bg-white/15 px-4 text-left text-sm font-medium text-white ring-1 ring-inset ring-white/25 backdrop-blur-md transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <ChatIcon className="h-4 w-4 shrink-0" />
      <span className="flex-1">Post without a photo</span>
      <ChevronIcon className="h-4 w-4 shrink-0 text-white/60" />
    </button>
  );

  /*
   * The shot, standing exactly where the camera was standing.
   *
   * Covering, in both modes, and cropping nothing in either: every photo this
   * screen makes is 3:4 — a single shot at `SHOT_W`/`SHOT_H`, a split at
   * `SPLIT_W` by twice `SPLIT_HALF` — and the frame it stands in is 3:4 too,
   * here, in the fullscreen composer and in the feed hero. This used to be a
   * choice between covering and containing because the two pictures were not
   * the same shape, and the shape a photo was reviewed at was not the shape it
   * was posted at.
   *
   * The stream keeps running behind it: retake has to be instant, and
   * reopening a camera costs a second of black. That only holds while the
   * `<video>` stays in the tree, so both layouts below render this *over* the
   * viewfinder, never *instead of* it. Swapping the two used to unmount the
   * video on every shot; retake then remounted a fresh element with no
   * `srcObject`, and the shutter — still enabled, `status` was still "live" —
   * drew from a 0x0 frame and silently did nothing.
   */
  const review = taken && (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={taken.previewUrl}
      alt="The photo you just took"
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
    />
  );

  /* Keep it or take it again — the only two questions a finished photo asks.
     `onDone` exists only on the fullscreen composer, which hid its own chrome
     for this step; the web card leaves Next to the action bar under it. */
  const reviewActions = (
    /* Lifted clear of the bottom edge on the fullscreen composer. The live
       screen puts an 80px shutter down there and this row is 48px, so at the
       same padding it lands lower than anything the camera has ever asked to
       be tapped — inside the strip a phone browser's toolbar and the home
       indicator both take a share of. */
    <div className={`flex items-center gap-3 ${fullscreen ? "pb-6" : ""}`}>
      <button
        type="button"
        onClick={retake}
        className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
          fullscreen
            ? "bg-white/15 text-white ring-1 ring-inset ring-white/25 backdrop-blur-md hover:bg-white/25 focus-visible:outline-white"
            : "bg-white text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:text-pm-orange-text focus-visible:outline-pm-orange"
        }`}
      >
        <CameraIcon className="h-4 w-4 shrink-0" />
        Retake
      </button>

      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="flex min-h-12 flex-1 items-center justify-center gap-1 rounded-2xl bg-pm-orange px-4 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Next
          <ChevronIcon className="h-4 w-4 shrink-0" />
        </button>
      )}
    </div>
  );

  /* ------------------------------------------------------------ fullscreen */

  if (fullscreen) {
    return (
      /*
       * Fixed, not absolute, and that is what makes it the screen: inside /m the
       * shell is the containing block for fixed children (phone.css transforms
       * it), so this fills the phone — the real viewport on a handset, the 390px
       * frame in a desktop preview — and covers PhoneNav's z-40 with it. The
       * composer hides its own chrome for this step, so the two controls that
       * chrome carried, leaving and moving on, are up here.
       *
       * Both rails carry `z-10`. The picture behind them is a positioned
       * sibling at `z-index: auto`, which leaves paint order to the order the
       * elements happen to be written in — fine until someone moves one, and
       * the failure it produces is a button that is visibly there and does
       * nothing.
       */
      <div className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden bg-pm-charcoal">
        {/* The picture is 3:4 and the screen is not — a handset is roughly
            1:2. Filling the screen would frame the shot at a shape no photo is
            ever saved at, and the crop would appear the moment the post landed
            in the feed. Held to 3:4 at full width and centred instead, so the
            edges of this box are the edges of the file: charcoal above and
            below it, under the two rails that already sit there.

            The width cap is for short screens. The frame is placed from the
            centre and the shutter from the bottom, so on a 667px-tall handset
            a full-width 3:4 picture runs under the shutter and the door pinned
            to its bottom edge would sit beneath the button. Capping the height
            at the screen minus both rails (116px each side plus the bottom
            safe area, mirrored) narrows the picture instead. On any 800px+
            screen the cap is slack and the picture is full width. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="relative aspect-[3/4] w-full overflow-hidden rounded-xl"
            style={{ width: "min(100%, calc((100dvh - 232px - 2 * env(safe-area-inset-bottom)) * 3 / 4))" }}
          >
            {viewfinder}
            {review}
            {/* The other door rides inside the picture, pinned to its bottom
                edge, rather than in the rail below. The rail is placed from
                the screen's bottom and the picture from its centre, so where
                the two met depended on the handset — and on a 390x844 the
                bubble straddled the picture's bottom edge exactly. Anchored
                here it is always the same distance clear of that line.
                `z-20` beats the rails' `z-10`: on a short screen the bottom
                rail's box reaches up over this spot and would eat the tap. */}
            {!taken && (
              <div className="absolute inset-x-4 bottom-3 z-20 flex flex-col gap-2">
                {splitHint}
                {skipDoor}
              </div>
            )}
          </div>
        </div>

        <div
          className="relative z-10 flex items-start justify-between gap-3 px-4 pb-3 pt-4"
          style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Leave without posting"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pm-charcoal/55 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-colors hover:bg-pm-charcoal/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <CloseIcon className="h-5 w-5" />
          </button>

          {/* The mode switch is a question about the next shot, so it belongs to
              the viewfinder. Under review the picture is already taken and the
              only controls are the two at the bottom — leaving, top left, is the
              third and it never goes away. */}
          {taken ? <span className="h-11 flex-1" aria-hidden="true" /> : modeSwitch}

          <span className="h-11 w-11 shrink-0" aria-hidden="true" />
        </div>

        <div
          className="relative z-10 flex flex-col gap-3 px-4 pb-4"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          {taken ? reviewActions : controls}
        </div>

        {midSplit && (
          <button
            type="button"
            onClick={dropPending}
            aria-label="Start the split photo over"
            className="absolute right-4 top-1/2 z-10 flex h-9 w-9 -translate-y-[calc(100%+0.5rem)] items-center justify-center rounded-full bg-pm-charcoal/70 text-white backdrop-blur-sm transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        )}

      </div>
    );
  }

  /* ------------------------------------------------------------------ card */
  /**
   * Ask for the camera from inside a tap.
   *
   * Deliberately a throwaway stream on the simplest possible constraints: the
   * only job here is to make iOS show its prompt while a user gesture is on
   * the stack. The tracks are stopped the moment it resolves, and the effect
   * then reopens the camera properly with the facing mode and width the
   * screen actually wants. Asking twice costs a frame and keeps the real
   * open path in exactly one place.
   */
  async function allowCamera() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const granted = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      granted.getTracks().forEach((t) => t.stop());
      setFailure(null);
      setStatus("starting");
      setAttempt((n) => n + 1);
    } catch (err) {
      setFailure(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    }
  }


  return (
    // Held to a phone's column even on a wide screen: a 3:4 viewport at the
    // full content width stands 840px tall and pushes the shutter — the one
    // control this screen exists for — under the fold.
    <div className="mx-auto w-full max-w-sm">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-pm-charcoal shadow-lg">
        {viewfinder}
        {taken ? (
          review
        ) : (
          <>
            <div className="absolute inset-x-0 top-3 flex items-center justify-center px-3">
              {modeSwitch}
            </div>

            {midSplit && (
              <button
                type="button"
                onClick={dropPending}
                aria-label="Start the split photo over"
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-[calc(100%+0.5rem)] items-center justify-center rounded-full bg-pm-charcoal/70 text-white backdrop-blur-sm transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            )}

            {/* The other door, sitting in the viewfinder rather than below it: one
                line of chrome over the picture costs nothing, where a card under it
                pushed the shutter itself off a laptop screen. The card carries
                no split hint, so a failed library pick gets its own line here. */}
            <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2">
              {pickError && (
                <p aria-live="polite" className="px-1 text-xs font-medium text-white/75">
                  <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">{pickError}</span>
                </p>
              )}
              {skipDoor}
            </div>
          </>
        )}
      </div>

      <div className="mt-4">{taken ? reviewActions : controls}</div>
    </div>
  );
}
