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

// Matches the bubble's own CSS: how far above the marker the first bubble's
// top sits, and the row heights that make up its box (text row, plus an
// optional meta row of rating/upvotes/timestamp for real posted comments).
const BUBBLE_TOP_OFFSET = 46;
const BUBBLE_TEXT_ROW_HEIGHT = 22;
const BUBBLE_META_ROW_HEIGHT = 14;
const BUBBLE_MIN_WIDTH = 50;
const BUBBLE_GAP = 6;

type Rect = { x: number; y: number; w: number; h: number };

function bubbleHeight(comment: MapComment) {
  return comment.upvotes !== undefined
    ? BUBBLE_TEXT_ROW_HEIGHT + BUBBLE_META_ROW_HEIGHT
    : BUBBLE_TEXT_ROW_HEIGHT;
}

// The closer you zoom in, the more room a bubble gets before its text is
// clipped — so more of a long comment becomes readable as you zoom.
function bubbleMaxWidthForZoom(zoom: number) {
  if (zoom >= 18) return 240;
  if (zoom >= 16) return 200;
  if (zoom >= 14) return 165;
  return 130;
}

// Rough text-width estimate (no DOM measurement available at layout time) —
// generous on purpose so we under-place rather than risk visual overlap.
function estimateBubbleWidth(comment: MapComment, zoom: number) {
  const length = (comment.dishPrefix ? comment.dishPrefix.length + 1 : 0) + comment.text.length;
  return Math.min(bubbleMaxWidthForZoom(zoom), Math.max(BUBBLE_MIN_WIDTH, 16 + length * 5.5));
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

function bubbleElement(comment: MapComment, offsetY: number, zoom: number) {
  const offsetX = 12;
  const hasMeta = comment.upvotes !== undefined;
  const maxWidth = bubbleMaxWidthForZoom(zoom);
  const dishHtml = comment.dishPrefix
    ? `<span class="map-dish-link" style="color: #f0a879; font-weight: 700; cursor: pointer;">${escapeHtml(comment.dishPrefix)}</span> `
    : "";
  const metaRow = hasMeta
    ? `<div style="
        display: flex;
        align-items: center;
        gap: 5px;
        margin-top: 2px;
        font-size: 9px;
        color: #7d858e;
        white-space: nowrap;
      ">
        ${
          comment.rating
            ? `<span style="font-weight: 700; color: #f0a879;">${escapeHtml(comment.rating)}</span>`
            : ""
        }
        <span style="color: #7ddba3; font-weight: 600;">▲ ${comment.upvotes}</span>
        ${comment.createdAt ? `<span>${escapeHtml(relativeTime(comment.createdAt))}</span>` : ""}
      </div>`
    : "";

  const el = document.createElement("div");
  el.className = "map-bubble";
  el.innerHTML = `<div style="
      display: inline-block;
      position: relative;
      transform: translate(${offsetX}px, -${offsetY}px);
      cursor: pointer;
    ">
      <div class="map-bubble-box" style="
        max-width: ${maxWidth}px;
        background: #1d2126;
        border: 1px solid rgba(232,135,90,0.55);
        border-radius: 12px;
        padding: 3px 8px;
        font-size: 11px;
        line-height: 1.3;
        color: #d6d9dd;
        box-shadow: 0 2px 10px rgba(0,0,0,0.55), 0 0 14px rgba(232,135,90,0.12);
      ">
        <div class="map-bubble-text" style="max-width: ${maxWidth - 16}px;">${dishHtml}${escapeHtml(comment.text)}</div>
        ${metaRow}
      </div>
      <div style="
        position: absolute; bottom: -7px; left: 14px;
        width: 0; height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 7px solid #83513e;
      "></div>
      <div style="
        position: absolute; bottom: -5.5px; left: 15px;
        width: 0; height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 6px solid #1d2126;
      "></div>
    </div>`;
  return el;
}

export function RestaurantMap({
  restaurants,
  commentsByRestaurant,
}: {
  restaurants: Restaurant[];
  commentsByRestaurant: Record<string, MapComment[]>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pinMarkersRef = useRef<Marker[]>([]);
  const bubbleMarkersRef = useRef<Marker[]>([]);
  /** False until the first fitBounds has played the opening dive. */
  const hasFitRef = useRef(false);
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
          const rect: Rect = { x: point.x + 12, y: point.y - offsetY, w: width, h: height };
          if (placed.some((r) => rectsOverlap(rect, r))) continue;
          placed.push(rect);

          const el = bubbleElement(comment, offsetY, zoom);
          el.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
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

          offsetY += height + BUBBLE_GAP + 7;
          stackIndex++;
        }
      }
    }

    renderBubbles();
    map.on("moveend", renderBubbles);

    return () => {
      map.off("moveend", renderBubbles);
    };
  }, [restaurants, commentsByRestaurant, router]);

  return <div ref={containerRef} className="map-fun-tiles h-[540px] w-full rounded-xl" />;
}
