"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { relativeTime } from "@/lib/format";
import type { Restaurant } from "@/data/restaurants";
import type { MapComment } from "@/data/mapComments";

// Roughly San Diego County's real extent — keeps users from panning off into
// open ocean or deep into Baja California / Riverside / Orange County.
const SD_COUNTY_BOUNDS: L.LatLngBoundsLiteral = [
  [32.5, -117.42],
  [33.3, -116.35],
];

// The urban core — Oceanside down to Chula Vista, coast to El Cajon. The map
// always opens here regardless of any region selected elsewhere in the app;
// map view shows every restaurant and every comment, unfiltered.
const URBAN_CORE_BOUNDS: L.LatLngBoundsLiteral = [
  [32.58, -117.3],
  [33.22, -116.9],
];

function intersectBounds(a: L.LatLngBounds, b: L.LatLngBounds): L.LatLngBounds | null {
  const south = Math.max(a.getSouth(), b.getSouth());
  const north = Math.min(a.getNorth(), b.getNorth());
  const west = Math.max(a.getWest(), b.getWest());
  const east = Math.min(a.getEast(), b.getEast());
  if (south >= north || west >= east) return null;
  return L.latLngBounds([south, west], [north, east]);
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
const BUBBLE_MAX_WIDTH = 160;
const BUBBLE_MIN_WIDTH = 50;
const BUBBLE_GAP = 6;

type Rect = { x: number; y: number; w: number; h: number };

function bubbleHeight(comment: MapComment) {
  return comment.upvotes !== undefined
    ? BUBBLE_TEXT_ROW_HEIGHT + BUBBLE_META_ROW_HEIGHT
    : BUBBLE_TEXT_ROW_HEIGHT;
}

// Rough text-width estimate (no DOM measurement available at layout time) —
// generous on purpose so we under-place rather than risk visual overlap.
function estimateBubbleWidth(comment: MapComment) {
  const length = (comment.dishPrefix ? comment.dishPrefix.length + 1 : 0) + comment.text.length;
  return Math.min(BUBBLE_MAX_WIDTH, Math.max(BUBBLE_MIN_WIDTH, 16 + length * 5.5));
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

function pinIcon() {
  return L.divIcon({
    className: "restaurant-pin",
    html: `<svg width="30" height="38" viewBox="0 0 24 34" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 21 12 21s12-12 12-21C24 5.373 18.627 0 12 0z" fill="#e8875a" />
      <circle cx="12" cy="12" r="8.5" fill="white" />
      <g transform="translate(7.5,6)" stroke="#e8875a" stroke-width="1.5" stroke-linecap="round" fill="none">
        <line x1="1" y1="0" x2="1" y2="11" />
        <path d="M0 0v3.2a1 1 0 0 0 2 0V0" />
        <path d="M7.5 0c1.3 1.1 1.3 3.3 0 4.4v6.6" />
      </g>
    </svg>`,
    iconSize: [30, 38],
    iconAnchor: [15, 37],
  });
}

function bubbleIcon(comment: MapComment, offsetY: number) {
  const offsetX = 12;
  const hasMeta = comment.upvotes !== undefined;
  const dishHtml = comment.dishPrefix
    ? `<span style="color: #b5502b; font-weight: 700;">${escapeHtml(comment.dishPrefix)}</span> `
    : "";
  const metaRow = hasMeta
    ? `<div style="
        display: flex;
        align-items: center;
        gap: 5px;
        margin-top: 2px;
        font-size: 9px;
        color: #a1a1aa;
        white-space: nowrap;
      ">
        ${
          comment.rating
            ? `<span style="font-weight: 700; color: #b5502b;">${escapeHtml(comment.rating)}</span>`
            : ""
        }
        <span style="color: #16a34a; font-weight: 600;">▲ ${comment.upvotes}</span>
        ${comment.createdAt ? `<span>${escapeHtml(relativeTime(comment.createdAt))}</span>` : ""}
      </div>`
    : "";
  return L.divIcon({
    className: "",
    html: `<div style="
      display: inline-block;
      position: relative;
      transform: translate(${offsetX}px, -${offsetY}px);
      cursor: pointer;
    ">
      <div style="
        max-width: 160px;
        background: white;
        border: 1px solid #e4e4e7;
        border-radius: 10px;
        padding: 3px 8px;
        font-size: 11px;
        line-height: 1.3;
        color: #3f3f46;
        box-shadow: 0 1px 4px rgba(0,0,0,0.18);
      ">
        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${dishHtml}${escapeHtml(comment.text)}</div>
        ${metaRow}
      </div>
      <div style="
        position: absolute; bottom: -7px; left: 14px;
        width: 0; height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 7px solid #e4e4e7;
      "></div>
      <div style="
        position: absolute; bottom: -5.5px; left: 15px;
        width: 0; height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 6px solid white;
      "></div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function RestaurantMap({
  restaurants,
  commentsByRestaurant,
}: {
  restaurants: Restaurant[];
  commentsByRestaurant: Record<string, MapComment[]>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const bubbleLayerRef = useRef<L.LayerGroup | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      maxBounds: SD_COUNTY_BOUNDS,
      maxBoundsViscosity: 1,
      minZoom: 10,
    }).fitBounds(URBAN_CORE_BOUNDS);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    markerLayerRef.current = L.layerGroup().addTo(map);
    bubbleLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      bubbleLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    const bubbleLayer = bubbleLayerRef.current;
    if (!map || !markerLayer || !bubbleLayer) return;

    markerLayer.clearLayers();
    for (const restaurant of restaurants) {
      L.marker([restaurant.lat, restaurant.lng], { icon: pinIcon() })
        .addTo(markerLayer)
        .bindTooltip(restaurant.name, { direction: "top", offset: [0, -34] })
        .on("click", () => router.push(`/restaurant/${restaurant.id}`));
    }

    const urbanCore = L.latLngBounds(URBAN_CORE_BOUNDS);
    if (restaurants.length > 0) {
      const bounds = L.latLngBounds(restaurants.map((r) => [r.lat, r.lng] as [number, number]));
      map.fitBounds(intersectBounds(bounds, urbanCore) ?? urbanCore, { padding: [24, 24] });
    } else {
      map.fitBounds(urbanCore);
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
      bubbleLayer!.clearLayers();

      const placed: Rect[] = [];
      for (const restaurant of ranked.slice(0, coverage)) {
        const comments = [...(commentsByRestaurant[restaurant.id] ?? [])].sort(
          (a, b) => (b.score ?? 0) - (a.score ?? 0),
        );
        const point = map!.latLngToContainerPoint([restaurant.lat, restaurant.lng]);
        let stackIndex = 0;
        let offsetY = BUBBLE_TOP_OFFSET;
        for (const comment of comments) {
          if (stackIndex >= limit) break;
          const width = estimateBubbleWidth(comment);
          const height = bubbleHeight(comment);
          const rect: Rect = { x: point.x + 12, y: point.y - offsetY, w: width, h: height };
          if (placed.some((r) => rectsOverlap(rect, r))) continue;
          placed.push(rect);
          L.marker([restaurant.lat, restaurant.lng], {
            icon: bubbleIcon(comment, offsetY),
          })
            .addTo(bubbleLayer!)
            .on("click", () => router.push(`/restaurant/${restaurant.id}`));
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

  return <div ref={containerRef} className="h-[540px] w-full rounded-xl" />;
}
