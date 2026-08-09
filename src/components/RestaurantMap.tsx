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
const BUBBLE_BORDER = 1;
const BUBBLE_PADDING_Y = 7;
const BUBBLE_PADDING_X = 11;
/** Measured from a real rendered bubble: the headline row, and the mono meta
 * row beneath it. Rounded up a couple of px as a safety margin for collision
 * spacing, not measured tight. */
const BUBBLE_TEXT_ROW_HEIGHT = 17;
const BUBBLE_META_ROW_HEIGHT = 15;
const BUBBLE_META_GAP = 5;
const BUBBLE_MIN_WIDTH = 56;
/** Border-box floor on a bubble that carries a meta row. The row is nowrap and
 *  cannot shrink, so the box must never be allowed narrower than the row plus
 *  its own padding — this is what stops the timestamp walking off the card. */
const BUBBLE_META_MIN_WIDTH = 150;
const BUBBLE_GAP = 6;
/* Utilitarian palette: warm near-white card, hairline edge, one orange accent.
   No pop-shadow, no pinstripe, no drop shadow — over a dark map the light card
   already separates itself, and PRODUCT.md's aesthetic direction rules shadows
   and gradients out. */
const BUBBLE_FILL = "#faf7f2";
const BUBBLE_INK = "#2b211c";
const BUBBLE_MUTED = "#8a7a6d";
const BUBBLE_EDGE = "rgba(43,33,28,0.16)";
const BUBBLE_POP = "#d96f45";
const BUBBLE_RADIUS = 8;
const MONO = "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace";
// Fixed tail size rather than one computed per comment — it is a small
// gesture below the box, not something that needs to track the box's own
// width or text length, and a fixed size can't fall out of sync with the box
// the way a computed one already has once (see bubbleElement).
const BUBBLE_TAIL_WIDTH = 12;
const BUBBLE_TAIL_HEIGHT = 7;
const BUBBLE_TAIL_LEFT = 14;
/** Thickness of the tail's outline, to match the box's hairline border. */
const BUBBLE_TAIL_INSET = 1;

/** 9043 -> "9.0k". Keeps a hot post's count from widening the whole bubble. */
function compactCount(n: number) {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`;
}

/**
 * "3h ago" -> "3h". The meta row is nowrap and every character it holds is a
 * character the box has to grow to fit, so the word the reader can infer goes.
 */
function compactTime(iso: string) {
  return relativeTime(iso).replace(/\s*ago$/, "");
}

type Rect = { x: number; y: number; w: number; h: number };

function bubbleHeight(comment: MapComment) {
  const border = BUBBLE_BORDER * 2;
  const padding = BUBBLE_PADDING_Y * 2;
  const meta =
    comment.upvotes !== undefined ? BUBBLE_META_GAP + BUBBLE_META_ROW_HEIGHT : 0;
  return border + padding + BUBBLE_TEXT_ROW_HEIGHT + meta;
}

// The closer you zoom in, the more room a bubble gets before its text is
// clipped — so more of a long comment becomes readable as you zoom.
function bubbleMaxWidthForZoom(zoom: number) {
  if (zoom >= 18) return 240;
  if (zoom >= 16) return 200;
  if (zoom >= 14) return 165;
  return 130;
}

/**
 * The box's own max-width. The meta floor wins over the zoom cap: at far zoom
 * the cap dips below what the row needs, and a cap below the floor is how the
 * timestamp ended up clipped.
 */
function bubbleWidthCap(comment: MapComment, zoom: number) {
  const cap = bubbleMaxWidthForZoom(zoom);
  const floor = comment.upvotes !== undefined ? BUBBLE_META_MIN_WIDTH : 0;
  return Math.max(cap, floor);
}

/**
 * Splits "Marlin taco 85%" into the dish someone named and the score the app
 * computed, so each can be set in its own face — sans for the human's words,
 * mono for the machine's number.
 *
 * Only a genuinely score-shaped last token splits. A restaurant review's prefix
 * is a bare dish name with no score appended at all, and a looser "take the
 * final token" rule turns "Marlin taco" into the dish "Marlin" scored "taco".
 */
const SCORE_TOKEN = /^(.*\S)\s(\d+(?:\.\d+)?(?:%|\/\d+))$/;

function splitDishPrefix(prefix: string): { name: string; score: string | null } {
  const match = prefix.match(SCORE_TOKEN);
  return match ? { name: match[1], score: match[2] } : { name: prefix, score: null };
}

/** The one line the compact bubble leads with: the plate, or failing that, what was said. */
function headlineFor(comment: MapComment) {
  return comment.dishPrefix ? splitDishPrefix(comment.dishPrefix).name : comment.text;
}

// Rough text-width estimate (no DOM measurement available at layout time) —
// generous on purpose so we under-place rather than risk visual overlap. Only
// the headline counts: the comment body is collapsed until hover. A meta row
// can't shrink below what its score, count and timestamp need, so it sets a
// floor of its own.
function estimateBubbleWidth(comment: MapComment, zoom: number) {
  const length = headlineFor(comment).length;
  const floor = comment.upvotes !== undefined ? BUBBLE_META_MIN_WIDTH : BUBBLE_MIN_WIDTH;
  return Math.min(bubbleWidthCap(comment, zoom), Math.max(floor, 16 + length * 5.5));
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
  mode: "discover" | "friends",
  canReact: boolean,
) {
  const offsetX = 12;
  const hasMeta = comment.upvotes !== undefined;
  const maxWidth = bubbleWidthCap(comment, zoom);
  const split = comment.dishPrefix ? splitDishPrefix(comment.dishPrefix) : null;
  /* The plate leads, in the poster's own words and the poster's own face. The
     score it earned is a computed number and is set in mono beside it, down in
     the meta row. */
  const headlineHtml = split
    ? `<span class="map-dish-link" style="cursor: pointer;">${escapeHtml(split.name)}</span>`
    : escapeHtml(comment.text);
  /* Which reaction the chip is depends on which feed the bubble's data came
     from — Discover bubbles upvote (public count, matches the number every
     other viewer already sees), Friends bubbles heart (no count anywhere,
     same rule the Friends tab itself follows). A bubble never offers both.
     Only comments backed by a real post get a live chip; seeded map chatter
     keeps a static upvote count and gets no heart at all. */
  const count = compactCount(comment.upvotes ?? 0);
  /* The upvote cluster is the bubble's one orange element, exactly as the
     reference draws it: orange arrow, orange count, no pill and no border.
     Whether *you* upvoted it rides on the arrow itself — hollow until you
     have, solid after — so the state never needs a second colour. */
  const arrow = comment.upvotedByMe ? "▲" : "△";
  const reactionHtml =
    mode === "discover"
      ? comment.postId && canReact
        ? `<button type="button" class="map-upvote-chip" aria-pressed="${comment.upvotedByMe ? "true" : "false"}" aria-label="Upvote this plate" style="
            display: inline-flex; align-items: baseline; gap: 4px;
            padding: 0; border: 0; background: none;
            font-family: ${MONO}; font-size: 10px; font-weight: 700; line-height: 1.5;
            color: ${BUBBLE_POP};
            cursor: pointer;
          ">${arrow}<span>${count}</span></button>`
        : `<span style="font-weight: 700; color: ${BUBBLE_POP};">▲ ${count}</span>`
      : comment.postId && canReact
        ? `<button type="button" class="map-heart-chip" aria-pressed="${comment.heartedByMe ? "true" : "false"}" aria-label="Heart this plate" style="
            display: inline-flex; align-items: center; justify-content: center;
            padding: 0; border: 0; background: none;
            font-size: 11px; line-height: 1.4; cursor: pointer;
            color: ${comment.heartedByMe ? BUBBLE_POP : BUBBLE_MUTED};
          ">♥</button>`
        : "";

  /* Replies, drawn rather than an emoji. Zero still shows, as in the
     reference — the row keeps one shape whether or not anyone has replied —
     but only for real posts; seeded chatter has no thread to count. */
  const repliesHtml =
    comment.commentCount !== undefined
      ? `<span style="display: inline-flex; align-items: center; gap: 3px;">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H6l-3 3v-8a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/></svg>
          ${comment.commentCount}
        </span>`
      : "";
  const textMaxWidth = maxWidth - (BUBBLE_PADDING_X + BUBBLE_BORDER) * 2;

  /* The comment itself, once the headline is the dish. Collapsed to nothing
     until hover, so the resting bubble stays one line — see .map-bubble-more. */
  const bodyHtml =
    split && comment.text.trim()
      ? `<div class="map-bubble-more" style="color: ${BUBBLE_MUTED}; max-width: ${textMaxWidth}px;">${escapeHtml(comment.text)}</div>`
      : "";

  /* Everything the app computed rather than a person wrote, so the whole row
     is mono: the score in its own scale, the upvote cluster, replies, and how
     long ago. The upvote is the row's one accent; the score sits in ink so it
     stays legible without competing for the orange. */
  const metaRow = hasMeta
    ? `<div style="
        display: flex;
        align-items: baseline;
        gap: 10px;
        margin-top: ${BUBBLE_META_GAP}px;
        font-family: ${MONO};
        font-size: 10px;
        line-height: 1.5;
        color: ${BUBBLE_MUTED};
        white-space: nowrap;
      ">
        ${
          split?.score
            ? `<span style="color: ${BUBBLE_INK};">${escapeHtml(split.score)}</span>`
            : comment.rating
              ? `<span style="color: ${BUBBLE_INK};">${escapeHtml(comment.rating)}</span>`
              : ""
        }
        ${reactionHtml}
        ${repliesHtml}
        ${comment.createdAt ? `<span>${escapeHtml(compactTime(comment.createdAt))}</span>` : ""}
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
            width: 0; height: 0;
            border-left: ${BUBBLE_TAIL_WIDTH / 2}px solid transparent;
            border-right: ${BUBBLE_TAIL_WIDTH / 2}px solid transparent;
            border-top: ${BUBBLE_TAIL_HEIGHT}px solid ${BUBBLE_EDGE};
          "></div>
          <div style="
            position: absolute; top: -${BUBBLE_BORDER}px; left: ${BUBBLE_TAIL_INSET}px;
            width: 0; height: 0;
            border-left: ${BUBBLE_TAIL_WIDTH / 2 - BUBBLE_TAIL_INSET}px solid transparent;
            border-right: ${BUBBLE_TAIL_WIDTH / 2 - BUBBLE_TAIL_INSET}px solid transparent;
            border-top: ${BUBBLE_TAIL_HEIGHT - BUBBLE_TAIL_INSET}px solid ${BUBBLE_FILL};
          "></div>
        </div>`
      : "";

  const el = document.createElement("div");
  el.className = "map-bubble";
  /* One plain card: warm near-white, a hairline edge, a 3px corner. No pop
     shadow, no pinstripe, no drop shadow — over a dark map a light card
     already separates itself, and the aesthetic direction in PRODUCT.md rules
     shadows and gradients out.

     The headline names the plate. When it resolves to a real dish it is a
     reference to that dish's own record, so it takes the .map-dish-link
     treatment in globals.css — accent colour and the display face — the way a
     feed styles an @handle. A bubble with no dish falls back to the comment's
     own words and stays in the UI sans, because that text is not a reference
     to anything. The meta row under both is machine-generated and set in
     mono. */
  el.innerHTML = `<div style="
      display: inline-block;
      position: relative;
      transform: translate(${offsetX}px, -${offsetY}px);
      cursor: pointer;
    ">
      <div class="map-bubble-box" style="
        box-sizing: border-box;
        max-width: ${maxWidth}px;
        ${hasMeta ? `min-width: ${BUBBLE_META_MIN_WIDTH}px;` : ""}
        background: ${BUBBLE_FILL};
        border: ${BUBBLE_BORDER}px solid ${BUBBLE_EDGE};
        border-radius: ${BUBBLE_RADIUS}px;
        padding: ${BUBBLE_PADDING_Y}px ${BUBBLE_PADDING_X}px;
        font-size: 12px;
        line-height: 1.35;
        color: ${BUBBLE_INK};
      ">
        <div class="map-bubble-text" style="max-width: ${textMaxWidth}px; font-weight: 600;">${headlineHtml}</div>
        ${bodyHtml}
        ${metaRow}
      </div>
      ${tail}
    </div>`;
  return el;
}

export function RestaurantMap({
  restaurants,
  commentsByRestaurant,
  /** Which feed the comments in commentsByRestaurant were sourced from —
      decides whether bubbles offer the upvote chip or the heart chip. The
      two are never both available on the same bubble. */
  mode,
  onUpvote,
  onHeart,
}: {
  restaurants: Restaurant[];
  commentsByRestaurant: Record<string, MapComment[]>;
  mode: "discover" | "friends";
  /** Omitted when nobody is signed in, which is what hides the upvote chips. */
  onUpvote?: (postId: string) => void;
  /** Omitted when nobody is signed in, which is what hides the heart chips. */
  onHeart?: (postId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pinMarkersRef = useRef<Marker[]>([]);
  const bubbleMarkersRef = useRef<Marker[]>([]);
  /** False until the first fitBounds has played the opening dive. */
  const hasFitRef = useRef(false);
  /* Held in refs so a new callback identity each render doesn't re-run the
     marker effect — the handler is read at click time, not at bind time.
     Synced in an effect rather than during render: writing a ref while
     rendering is a lint error, since it makes the render's output depend on
     mutation order instead of props/state alone. */
  const onUpvoteRef = useRef(onUpvote);
  useEffect(() => {
    onUpvoteRef.current = onUpvote;
  }, [onUpvote]);
  const onHeartRef = useRef(onHeart);
  useEffect(() => {
    onHeartRef.current = onHeart;
  }, [onHeart]);
  const canUpvote = !!onUpvote;
  const canHeart = !!onHeart;
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

          const el = bubbleElement(
            comment,
            offsetY,
            zoom,
            stackIndex,
            mode,
            mode === "discover" ? canUpvote : canHeart,
          );
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
            const heartChip = target.closest(".map-heart-chip");
            if (heartChip) {
              e.stopPropagation();
              if (comment.postId) onHeartRef.current?.(comment.postId);
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
  }, [restaurants, commentsByRestaurant, router, mode, canUpvote, canHeart]);

  return <div ref={containerRef} className="map-fun-tiles h-[540px] w-full rounded-xl" />;
}
