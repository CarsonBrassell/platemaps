"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Turbopack can't serve MapLibre's worker module (it 404s with an HTML error
// page, failing the browser's module MIME check), and without its worker
// MapLibre renders no vector tiles at all. The worker and the shared chunk it
// imports are copied into /public (from node_modules/maplibre-gl/dist — keep
// them in step when upgrading maplibre-gl) and served as plain static files.
setWorkerUrl("/maplibre-gl-worker.mjs");
import { NEO_NOIR_STYLE } from "@/lib/mapStyle";
import { openStateFor } from "@/lib/openState";
import { relativeTime } from "@/lib/format";
import type { Restaurant } from "@/data/restaurants";
import type { MapComment } from "@/data/mapComments";

// Roughly San Diego County's real extent — keeps users from panning off into
// open ocean or deep into Baja California / Riverside / Orange County.
// MapLibre order: [west, south, east, north].
const SD_COUNTY_BOUNDS: [number, number, number, number] = [-117.42, 32.5, -116.35, 33.3];

// The urban core — Oceanside down to Chula Vista, coast to El Cajon. The map
// always opens here regardless of any region selected elsewhere in the app;
// map view shows every restaurant and every comment, unfiltered.
const URBAN_CORE_BOUNDS: [number, number, number, number] = [-117.3, 32.58, -116.9, 33.22];

function intersectBounds(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] | null {
  const west = Math.max(a[0], b[0]);
  const south = Math.max(a[1], b[1]);
  const east = Math.min(a[2], b[2]);
  const north = Math.min(a[3], b[3]);
  if (south >= north || west >= east) return null;
  return [west, south, east, north];
}

// The skyline angle, reached once the extruded buildings are fully in.
const MAX_PITCH = 35;
// Leads the buildings-3d layer (which fades in over 14.5-15.5) by a zoom
// level, so the ground has already tilted by the time the towers rise.
const PITCH_FROM_ZOOM = 13.5;
const PITCH_TO_ZOOM = 15.5;

function pitchForZoom(zoom: number) {
  if (zoom <= PITCH_FROM_ZOOM) return 0;
  if (zoom >= PITCH_TO_ZOOM) return MAX_PITCH;
  return ((zoom - PITCH_FROM_ZOOM) / (PITCH_TO_ZOOM - PITCH_FROM_ZOOM)) * MAX_PITCH;
}

// Only a sparse sample of restaurants show a comment at the widest zoom, and
// more of them join in as you zoom toward street level, so the map stays
// legible either way.
function bubbleCoverageForZoom(zoom: number) {
  if (zoom >= 17) return 1;
  if (zoom >= 15) return 0.7;
  if (zoom >= 13) return 0.45;
  return 0.3;
}

function bubbleLimitForZoom(zoom: number) {
  if (zoom >= 17) return 4;
  if (zoom >= 15) return 2;
  return 1;
}

// Deterministic pseudo-random spread for restaurants tied at the same
// comment score, so a partial-coverage view doesn't bunch onto one side.
function spreadHash(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 9973;
  return hash;
}

// How far above the marker the first bubble's top sits — clears the pin's
// outer halo (radius 15) with room for the tail below the box.
const BUBBLE_TOP_OFFSET = 72;
// The box's own box model, named so bubbleHeight and the tail's seam are
// derived from the same numbers the CSS below actually uses instead of a
// separately hand-measured guess that can drift out of sync with it.
const BUBBLE_BORDER = 2;
const BUBBLE_PADDING_Y = 4;
/** Measured from a real rendered bubble: a one-line comment, and the same
 * comment's rating/upvote/timestamp row when it has one. Rounded up a
 * couple of px as a safety margin for collision spacing, not measured tight. */
const BUBBLE_TEXT_ROW_HEIGHT = 16;
const BUBBLE_META_ROW_HEIGHT = 20;
const BUBBLE_META_GAP = 3;
const BUBBLE_MIN_WIDTH = 50;
/** A meta row holds sparkle-rating, the upvote chip and a timestamp. */
const BUBBLE_META_MIN_WIDTH = 118;
const BUBBLE_GAP = 6;
/** Photo thumbnail rides to the left of the text when the post has one. */
const BUBBLE_PHOTO_SIZE = 38;
const BUBBLE_PHOTO_GAP = 7;
/** Retro ticket palette: cream card, dark chocolate ink, terracotta pop. */
const BUBBLE_FILL = "#f6ead8";
const BUBBLE_INK = "#2b211c";
const BUBBLE_POP = "#d96f45";
// Fixed tail size rather than one computed per comment — it is a small
// decorative gesture below the box, not something that needs to track the
// box's own width or text length, and a fixed size can't fall out of sync
// with the box the way a computed one already has once (see bubbleElement).
const BUBBLE_TAIL_WIDTH = 16;
const BUBBLE_TAIL_HEIGHT = 12;
const BUBBLE_TAIL_LEFT = 10;
/** Thickness of the tail's ink outline, to roughly match the box's border. */
const BUBBLE_TAIL_INSET = 3;

type Rect = { x: number; y: number; w: number; h: number };

function bubbleHeight(comment: MapComment) {
  const border = BUBBLE_BORDER * 2;
  const padding = BUBBLE_PADDING_Y * 2;
  const meta =
    comment.upvotes !== undefined ? BUBBLE_META_GAP + BUBBLE_META_ROW_HEIGHT : 0;
  const rows = BUBBLE_TEXT_ROW_HEIGHT + meta;
  // A thumbnail sits beside the rows rather than above them, so it sets a
  // floor on the box instead of adding to it.
  const inner = comment.photo ? Math.max(rows, BUBBLE_PHOTO_SIZE) : rows;
  return border + padding + inner;
}

// The closer you zoom in, the more room a bubble gets before its text is
// clipped — so more of a long comment becomes readable as you zoom.
function bubbleMaxWidthForZoom(zoom: number) {
  if (zoom >= 18) return 240;
  if (zoom >= 16) return 200;
  if (zoom >= 14) return 165;
  return 130;
}

/** What a thumbnail adds to the box, or 0 when the comment has no photo. */
function photoAllowance(comment: MapComment) {
  return comment.photo ? BUBBLE_PHOTO_SIZE + BUBBLE_PHOTO_GAP : 0;
}

/**
 * The box's own max-width. A thumbnail widens the ceiling rather than eating
 * into it: the zoom widths above are what the *text* is allowed, and taking
 * the photo out of that budget left a meta row — which is nowrap and can't
 * shrink — overflowing its own card.
 */
function bubbleWidthCap(comment: MapComment, zoom: number) {
  return bubbleMaxWidthForZoom(zoom) + photoAllowance(comment);
}

// Rough text-width estimate (no DOM measurement available at layout time) —
// generous on purpose so we under-place rather than risk visual overlap. A
// meta row can't shrink below what its sparkle-rating, chip and timestamp
// need, so it sets a floor of its own.
function estimateBubbleWidth(comment: MapComment, zoom: number) {
  const length = (comment.dishPrefix ? comment.dishPrefix.length + 1 : 0) + comment.text.length;
  const floor = comment.upvotes !== undefined ? BUBBLE_META_MIN_WIDTH : BUBBLE_MIN_WIDTH;
  const photo = photoAllowance(comment);
  return Math.min(
    bubbleWidthCap(comment, zoom),
    Math.max(floor + photo, 16 + length * 5.5 + photo),
  );
}

function rectsOverlap(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.w + BUBBLE_GAP &&
    a.x + a.w + BUBBLE_GAP > b.x &&
    a.y < b.y + b.h + BUBBLE_GAP &&
    a.y + a.h + BUBBLE_GAP > b.y
  );
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * intensity 0..1 scales the pin with its popularity (best comment score
 * relative to the hottest restaurant on the map); dimmed marks places that
 * are closed right now, which cool to a grey ember via .pin-dim.
 */
function pinElement(name: string, intensity: number, dimmed: boolean) {
  const size = Math.round(32 + 12 * intensity);
  const glowRadius = Math.round(5 + 6 * intensity);
  const glowAlpha = (0.45 + 0.35 * intensity).toFixed(2);
  const el = document.createElement("div");
  el.className = dimmed ? "restaurant-pin pin-dim" : "restaurant-pin";
  el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 38 38" style="filter: drop-shadow(0 0 ${glowRadius}px rgba(232,135,90,${glowAlpha}));">
      <circle class="pin-halo" cx="19" cy="19" r="15" fill="none" stroke="#e8875a" stroke-width="1.5" opacity="0.35" />
      <circle cx="19" cy="19" r="11" fill="none" stroke="#e8875a" stroke-width="1" opacity="0.45" />
      <circle cx="19" cy="19" r="8" fill="#e8875a" stroke="#15171a" stroke-width="1.5" />
      <g transform="translate(16.2,13.5)" stroke="#15171a" stroke-width="1.5" stroke-linecap="round" fill="none">
        <line x1="1" y1="0" x2="1" y2="10.5" />
        <path d="M0 0v3a1 1 0 0 0 2 0V0" />
        <path d="M5.2 0c1.2 1.1 1.2 3.2 0 4.3v6.2" />
      </g>
    </svg>
    <span class="pin-tip">${escapeHtml(name)}</span>`;
  return el;
}

function bubbleElement(
  comment: MapComment,
  offsetY: number,
  zoom: number,
  stackIndex: number,
  canUpvote: boolean,
) {
  const offsetX = 12;
  const hasMeta = comment.upvotes !== undefined;
  const maxWidth = bubbleWidthCap(comment, zoom);
  const dishHtml = comment.dishPrefix
    ? `<span class="map-dish-link" style="color: ${BUBBLE_POP}; font-weight: 700; font-style: italic; font-family: var(--font-fraunces), Georgia, serif; cursor: pointer;">${escapeHtml(comment.dishPrefix)}</span> `
    : "";
  /* Upvoting is liking the underlying post, so only comments that came from a
     real post get the live chip; seeded map chatter keeps a static count. The
     chip is a real button — screen readers on the map get a pressable control
     with state, not a decorated span. */
  const upvoteHtml =
    comment.postId && canUpvote
      ? `<button type="button" class="map-upvote-chip" aria-pressed="${comment.upvotedByMe ? "true" : "false"}" aria-label="Upvote this plate" style="
          display: inline-flex; align-items: center; gap: 3px;
          padding: 1px 7px; border-radius: 999px;
          border: 1.5px solid ${BUBBLE_INK};
          background: ${comment.upvotedByMe ? BUBBLE_POP : "transparent"};
          color: ${comment.upvotedByMe ? "#fff6ec" : BUBBLE_INK};
          font-size: 9.5px; font-weight: 800; line-height: 1.6;
          cursor: pointer;
        ">▲ ${comment.upvotes}</button>`
      : `<span style="color: #2f7d4f; font-weight: 700;">▲ ${comment.upvotes}</span>`;
  /* The post's own photo, which until now stopped at the feed — a bubble could
     only hint at a plate it had a picture of. Square-cropped and ink-bordered
     so it reads as part of the ticket rather than pasted onto it. Decorative by
     default: the comment text beside it already says what it is. */
  const photoHtml = comment.photo
    ? `<img src="${escapeHtml(comment.photo)}" alt="${escapeHtml(comment.photoAlt ?? "")}" width="${BUBBLE_PHOTO_SIZE}" height="${BUBBLE_PHOTO_SIZE}" loading="lazy" style="
        width: ${BUBBLE_PHOTO_SIZE}px; height: ${BUBBLE_PHOTO_SIZE}px;
        flex: none; object-fit: cover; display: block;
        border: 1.5px solid ${BUBBLE_INK}; border-radius: 6px;
        background: ${BUBBLE_FILL};
      " />`
    : "";
  const textMaxWidth = maxWidth - 20 - photoAllowance(comment);

  const metaRow = hasMeta
    ? `<div style="
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 3px;
        font-size: 9.5px;
        color: #8a7a6d;
        white-space: nowrap;
      ">
        ${
          comment.rating
            ? `<span style="font-weight: 800; color: ${BUBBLE_POP};">✦ ${escapeHtml(comment.rating)}</span>`
            : ""
        }
        ${upvoteHtml}
        ${comment.createdAt ? `<span>${escapeHtml(relativeTime(comment.createdAt))}</span>` : ""}
      </div>`
    : "";

  /* A plain triangle built from CSS borders, not a hand-plotted SVG path:
     two stacked triangles (a slightly larger ink one behind a smaller fill
     one) read as an outlined tail with no path math to get wrong. The seam
     against the box is `-${BUBBLE_BORDER}px`, the box's own border width,
     not a separately guessed pixel value — so it cannot go back to silently
     drifting out of sync with the box the way the previous "-4px" did once
     the box's border weight changed out from under it.

     Only the bubble nearest the pin gets one — the rest of a stack sits well
     clear of their own markers and does not need to gesture at anything.
     pointer-events stay off so it never steals a click meant for the box or
     the map beneath it. */
  const tail =
    stackIndex === 0
      ? `<div style="
          position: absolute; left: ${BUBBLE_TAIL_LEFT}px; top: 100%;
          pointer-events: none;
        ">
          <div style="
            position: absolute; top: -${BUBBLE_BORDER}px; left: 0;
            width: 0; height: 0; border-radius: 2px;
            border-left: ${BUBBLE_TAIL_WIDTH / 2}px solid transparent;
            border-right: ${BUBBLE_TAIL_WIDTH / 2}px solid transparent;
            border-top: ${BUBBLE_TAIL_HEIGHT}px solid ${BUBBLE_INK};
          "></div>
          <div style="
            position: absolute; top: -${BUBBLE_BORDER}px; left: ${BUBBLE_TAIL_INSET}px;
            width: 0; height: 0; border-radius: 2px;
            border-left: ${BUBBLE_TAIL_WIDTH / 2 - BUBBLE_TAIL_INSET}px solid transparent;
            border-right: ${BUBBLE_TAIL_WIDTH / 2 - BUBBLE_TAIL_INSET}px solid transparent;
            border-top: ${BUBBLE_TAIL_HEIGHT - BUBBLE_TAIL_INSET}px solid ${BUBBLE_FILL};
          "></div>
        </div>`
      : "";

  const el = document.createElement("div");
  el.className = "map-bubble";
  /* Retro diner ticket: cream card, even chocolate-ink outline with a
     pinstripe just inside it (the inset shadows stack outward-in: cream gap,
     then a half-tone ink line), and a hard terracotta pop-shadow thrown
     down-right like a 70s menu sticker. The soft dark shadow under it keeps
     the card readable when it happens to sit over bright street glow.

     Both shadows live on the wrapper rather than the box so they trace box
     and tail as one silhouette; a box-shadow would stop at the box and leave
     the tail flat. */
  el.innerHTML = `<div style="
      display: inline-block;
      position: relative;
      transform: translate(${offsetX}px, -${offsetY}px);
      cursor: pointer;
      filter: drop-shadow(3px 3px 0 ${BUBBLE_POP}) drop-shadow(0 5px 8px rgba(0,0,0,0.35));
    ">
      <div class="map-bubble-box" style="
        max-width: ${maxWidth}px;
        background: ${BUBBLE_FILL};
        border: ${BUBBLE_BORDER}px solid ${BUBBLE_INK};
        border-radius: 11px;
        box-shadow: inset 0 0 0 2px ${BUBBLE_FILL}, inset 0 0 0 3px rgba(43,33,28,0.45);
        padding: ${BUBBLE_PADDING_Y}px 10px;
        font-size: 11px;
        line-height: 1.35;
        color: #3c2f27;
      ">
        ${photoHtml ? `<div style="display: flex; align-items: flex-start; gap: ${BUBBLE_PHOTO_GAP}px;">${photoHtml}<div style="min-width: 0; flex: 1;">` : ""}
        <div class="map-bubble-text" style="max-width: ${textMaxWidth}px;">${dishHtml}${escapeHtml(comment.text)}</div>
        ${metaRow}
        ${photoHtml ? `</div></div>` : ""}
      </div>
      ${tail}
    </div>`;
  return el;
}

export function RestaurantMap({
  restaurants,
  commentsByRestaurant,
  onUpvote,
}: {
  restaurants: Restaurant[];
  commentsByRestaurant: Record<string, MapComment[]>;
  /** Omitted when nobody is signed in, which is what hides the upvote chips. */
  onUpvote?: (postId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pinMarkersRef = useRef<Marker[]>([]);
  const bubbleMarkersRef = useRef<Marker[]>([]);
  /** False until the first fitBounds has played the opening dive. */
  const hasFitRef = useRef(false);
  /* Held in a ref so a new callback identity each render doesn't re-run the
     marker effect — the handler is read at click time, not at bind time.
     Synced in an effect rather than during render: writing a ref while
     rendering is a lint error, since it makes the render's output depend on
     mutation order instead of props/state alone. */
  const onUpvoteRef = useRef(onUpvote);
  useEffect(() => {
    onUpvoteRef.current = onUpvote;
  }, [onUpvote]);
  const canUpvote = !!onUpvote;
  const router = useRouter();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Opens on the whole county so the first fitBounds below plays as a
    // cinematic dive into the urban core rather than a static appearance.
    // Starts dead flat; syncPitch below owns the tilt from here on.
    const map = new MapLibreMap({
      container: containerRef.current,
      style: NEO_NOIR_STYLE,
      bounds: SD_COUNTY_BOUNDS,
      maxBounds: SD_COUNTY_BOUNDS,
      minZoom: 9,
      maxZoom: 19,
      pitch: 0,
      maxPitch: MAX_PITCH,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
      /* Tilt follows zoom. Flat across the city-wide view, where perspective
         would only squash the top of the frame and cost screen height on a
         phone, then leaning into the skyline angle as the extruded buildings
         come in. Mobile gets the 3D payoff without a control to discover.

         This hook runs before every camera update, including the ones the
         gesture handlers drive, so the tilt is simply part of what a zoom
         *is* — there's no separate animation to perceive. Setting pitch from
         a "zoom" listener instead does not work: the handler recomputes and
         applies the whole camera each frame, overwriting the write. */
      transformCameraUpdate: ({ zoom }) => ({ pitch: pitchForZoom(zoom) }),
    });
    // Every user route to pitch/bearing is closed off, so the tilt is ours
    // alone to set — there's no 3D camera for anyone to wrangle.
    map.touchZoomRotate.disableRotation();
    map.touchPitch.disable();
    map.keyboard.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), "top-left");

    // MapLibre routes tile, source and style failures to an event rather than
    // throwing, so without this a broken map fails silently.
    map.on("error", (e) => {
      console.error("[map]", e.error?.message ?? e);
    });

    // Middle-mouse drag pans exactly like left-drag. MapLibre doesn't bind
    // the middle button, and the browser's default for it is autoscroll —
    // preventDefault suppresses that. Listeners live on the map's canvas, so
    // map.remove() in the cleanup below tears them down with it.
    map.getCanvas().addEventListener("mousedown", (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      let last = { x: e.clientX, y: e.clientY };
      const onMove = (ev: MouseEvent) => {
        map.panBy([last.x - ev.clientX, last.y - ev.clientY], { animate: false });
        last = { x: ev.clientX, y: ev.clientY };
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      pinMarkersRef.current = [];
      bubbleMarkersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Pin size and glow follow each restaurant's best comment score, so the
    // hottest spots read as the brightest lights on the map; closed places
    // cool to grey embers.
    const bestScore = (id: string) =>
      Math.max(0, ...(commentsByRestaurant[id] ?? []).map((c) => c.score ?? 0));
    const hottest = Math.max(1, ...restaurants.map((r) => bestScore(r.id)));
    const now = new Date();

    for (const marker of pinMarkersRef.current) marker.remove();
    pinMarkersRef.current = [];
    for (const restaurant of restaurants) {
      const intensity = bestScore(restaurant.id) / hottest;
      const closed = openStateFor(restaurant.closingTime, now).kind === "closed";
      const el = pinElement(restaurant.name, intensity, closed);
      el.addEventListener("click", () => router.push(`/restaurant/${restaurant.id}`));
      const marker = new Marker({ element: el, anchor: "center" })
        .setLngLat([restaurant.lng, restaurant.lat])
        .addTo(map);
      pinMarkersRef.current.push(marker);
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const firstFit = !hasFitRef.current;
    hasFitRef.current = true;
    // First fit animates the dive from the county-wide opening frame; later
    // refits (data refreshes) snap so they don't yank the user around.
    const fitOptions = {
      padding: 24,
      ...(firstFit && !reduceMotion ? { duration: 2400 } : { animate: false }),
    };
    if (restaurants.length > 0) {
      const lngs = restaurants.map((r) => r.lng);
      const lats = restaurants.map((r) => r.lat);
      const bounds: [number, number, number, number] = [
        Math.min(...lngs),
        Math.min(...lats),
        Math.max(...lngs),
        Math.max(...lats),
      ];
      map.fitBounds(intersectBounds(bounds, URBAN_CORE_BOUNDS) ?? URBAN_CORE_BOUNDS, fitOptions);
    } else {
      map.fitBounds(URBAN_CORE_BOUNDS, fitOptions);
    }

    // Rank restaurants by their best (most-liked) comment, breaking ties with
    // a deterministic spread so an unscored subset doesn't cluster together.
    const ranked = [...restaurants].sort((a, b) => {
      const scoreA = Math.max(0, ...(commentsByRestaurant[a.id] ?? []).map((c) => c.score ?? 0));
      const scoreB = Math.max(0, ...(commentsByRestaurant[b.id] ?? []).map((c) => c.score ?? 0));
      if (scoreB !== scoreA) return scoreB - scoreA;
      return spreadHash(a.id) - spreadHash(b.id);
    });

    // Greedily place bubbles in priority order (best-rated restaurants and
    // comments first), skipping any candidate whose screen-space box would
    // overlap one already placed — so the map never shows crowded, stacked
    // text no matter how close together restaurants are.
    function renderBubbles() {
      const zoom = map!.getZoom();
      const limit = bubbleLimitForZoom(zoom);
      const coverage = Math.ceil(ranked.length * bubbleCoverageForZoom(zoom));
      for (const marker of bubbleMarkersRef.current) marker.remove();
      bubbleMarkersRef.current = [];

      const placed: Rect[] = [];
      for (const restaurant of ranked.slice(0, coverage)) {
        const comments = [...(commentsByRestaurant[restaurant.id] ?? [])].sort(
          (a, b) => (b.score ?? 0) - (a.score ?? 0),
        );
        const point = map!.project([restaurant.lng, restaurant.lat]);
        let stackIndex = 0;
        let offsetY = BUBBLE_TOP_OFFSET;
        for (const comment of comments) {
          if (stackIndex >= limit) break;
          const width = estimateBubbleWidth(comment, zoom);
          const height = bubbleHeight(comment);
          // The tail is part of the bubble's footprint too, so nothing else
          // gets placed over it — only the nearest-the-pin bubble in a stack
          // draws one (see bubbleElement), so only its rect grows to include it.
          const rect: Rect = {
            x: point.x + 12,
            y: point.y - offsetY,
            w: width,
            h: height + (stackIndex === 0 ? BUBBLE_TAIL_HEIGHT : 0),
          };
          if (placed.some((r) => rectsOverlap(rect, r))) continue;
          placed.push(rect);

          const el = bubbleElement(comment, offsetY, zoom, stackIndex, canUpvote);
          el.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            const upvoteChip = target.closest(".map-upvote-chip");
            if (upvoteChip) {
              // Upvoting stays on the map rather than opening the post — the
              // whole point of putting the chip here is not having to leave.
              e.stopPropagation();
              if (comment.postId) onUpvoteRef.current?.(comment.postId);
              return;
            }
            if (target.closest(".map-dish-link")) {
              router.push(
                comment.dishId
                  ? `/restaurant/${restaurant.id}?dish=${comment.dishId}`
                  : `/restaurant/${restaurant.id}`,
              );
            } else {
              router.push(comment.postId ? `/feed?post=${comment.postId}` : "/feed");
            }
          });
          const marker = new Marker({ element: el, anchor: "top-left" })
            .setLngLat([restaurant.lng, restaurant.lat])
            .addTo(map!);
          bubbleMarkersRef.current.push(marker);

          offsetY += height + BUBBLE_GAP + BUBBLE_TAIL_HEIGHT;
          stackIndex++;
        }
      }
    }

    renderBubbles();
    map.on("moveend", renderBubbles);

    return () => {
      map.off("moveend", renderBubbles);
    };
  }, [restaurants, commentsByRestaurant, router, canUpvote]);

  return <div ref={containerRef} className="map-fun-tiles h-[540px] w-full rounded-xl" />;
}
