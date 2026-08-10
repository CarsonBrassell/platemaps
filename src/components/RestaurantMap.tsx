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

// What share of restaurants are even allowed to try for a bubble. These are
// candidates, not placements — the greedy collision pass still refuses any box
// that would overlap one already down, so raising these makes the map denser
// only where there is genuinely room. They were tuned much lower (0.3 at the
// opening frame), which left the county view nearly empty and meant a reader
// had to zoom several steps in before any comment appeared at all.
function bubbleCoverageForZoom(zoom: number) {
  if (zoom >= 17) return 1;
  if (zoom >= 15) return 0.85;
  if (zoom >= 13) return 0.7;
  if (zoom >= 11) return 0.55;
  return 0.45;
}

// How deep a single restaurant's stack may go. One at the widest view — the
// hottest thing anyone said about that place — and each step in reveals the
// next-hottest beneath it.
function bubbleLimitForZoom(zoom: number) {
  if (zoom >= 17) return 4;
  if (zoom >= 15) return 3;
  if (zoom >= 13) return 2;
  return 1;
}

/**
 * Popularity halves every four days. So a comment posted today outranks one
 * from four days ago with twice its votes, and one from eight days ago with
 * four times them — recent enthusiasm surfaces without old hits being erased.
 */
const COMMENT_HALF_LIFE_HOURS = 96;

/**
 * The single ranking key for bubbles: how popular a comment is, decayed by how
 * old it is. Drives both which restaurants get a bubble at all and the order of
 * a stack, so the two can never disagree about what "best" means.
 *
 * Real posts carry `score` (net votes); seeded chatter carries only `upvotes`.
 * Reading just `score` — which every sort here used to do — silently flattened
 * every seeded comment to zero, so a 24-upvote remark ranked below a real post
 * with no votes at all. Either field is the popularity signal.
 *
 * The +1 keeps age meaningful at the bottom of the scale: without it every
 * zero-vote comment ties at zero and the newest of them never wins.
 */
function commentHeat(comment: MapComment, now: number) {
  const popularity = Math.max(0, comment.score ?? comment.upvotes ?? 0);
  if (!comment.createdAt) return popularity;
  const posted = Date.parse(comment.createdAt);
  if (Number.isNaN(posted)) return popularity;
  const ageHours = Math.max(0, (now - posted) / 3_600_000);
  return (popularity + 1) * Math.pow(0.5, ageHours / COMMENT_HALF_LIFE_HOURS);
}

// Deterministic pseudo-random spread for restaurants tied at the same
// comment score, so a partial-coverage view doesn't bunch onto one side.
function spreadHash(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 9973;
  return hash;
}

// How far above the marker the first bubble's top sits — clears the pin's
// outer halo (radius 15) with room for the leader line below the box.
const BUBBLE_TOP_OFFSET = 72;
// The box's own box model, named so bubbleHeight and the leader's start are
// derived from the same numbers the CSS below actually uses instead of a
// separately hand-measured guess that can drift out of sync with it.
const BUBBLE_BORDER = 1;
const BUBBLE_PADDING_Y = 6;
const BUBBLE_PADDING_X = 11;
/** Measured from a real rendered bubble: the headline row, and the mono meta
 * row beneath it. Rounded up a couple of px as a safety margin for collision
 * spacing, not measured tight. */
const BUBBLE_TEXT_ROW_HEIGHT = 17;
const BUBBLE_META_ROW_HEIGHT = 15;
const BUBBLE_META_GAP = 4;
const BUBBLE_MIN_WIDTH = 56;
const BUBBLE_GAP = 6;
/* Utilitarian palette: warm near-white card, hairline edge, one orange accent.
   No pop-shadow, no pinstripe, no drop shadow — over a dark map the light card
   already separates itself, and PRODUCT.md's aesthetic direction rules shadows
   and gradients out. */
const BUBBLE_FILL = "#faf7f2";
const BUBBLE_INK = "#2b211c";
/* The meta row sets at 10px, so it owes 4.5:1 against BUBBLE_FILL. DESIGN.md's
   muted step (`zinc-500` #7E7261) is tuned against white and lands at 4.40:1 on
   this warm fill — just under — so the bubble carries the next step down. */
const BUBBLE_MUTED = "#776B5B";
const BUBBLE_EDGE = "rgba(43,33,28,0.16)";
/* The accent's small-text voice (`--pm-orange-text`), 5.45:1 on BUBBLE_FILL —
   the same reasoning .map-dish-link already documents one file over. The fill
   orange (`--pm-orange`, and the lighter #d96f45 this used to be) is a
   large-text colour; at the meta row's 10px it renders at 3.11:1. */
const BUBBLE_POP = "#A8481A";
const BUBBLE_RADIUS = 8;
const MONO = "var(--font-spline-mono), ui-monospace, SFMono-Regular, Menlo, monospace";
/* The leader is drawn on the map rather than on the card, so it is the one
   part of a bubble that cannot use BUBBLE_EDGE — a 16%-alpha ink hairline is
   invisible over the neo-noir ground. It carries the fill at 45% instead. */
const LEADER_STROKE = "rgba(250,247,242,0.45)";
/** Local x of the run: BUBBLE_RADIUS, the first point along the bottom edge
 *  where that edge is actually straight. Anything left of it is inside the
 *  corner arc, which curves away to the right — a line there is tangent to the
 *  side of the box and separates from it immediately, leaving a crescent of
 *  map between the two. Drawn from here the line meets a flat, opaque edge
 *  head-on and simply joins it. */
const LEADER_X = BUBBLE_RADIUS;
/** How far above the pin's centre the line stops. It runs 20px to the pin's
 *  right (LEADER_X against the box's own +12 offset), which is clear of the
 *  halo's r=15 at any intensity, so this only has to keep the dot off the
 *  glow rather than land on the ring. */
const LEADER_PIN_CLEARANCE = 4;
const LEADER_DOT = 2;

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

/**
 * How far the leader hangs below the box, from the box's bottom edge to the
 * dot. Shared by the drawing in bubbleElement and the collision rect in
 * renderBubbles so the space reserved and the space used are the same number,
 * rather than two hand-kept-in-sync ones.
 */
function leaderDrop(comment: MapComment, offsetY: number) {
  return Math.max(0, offsetY - bubbleHeight(comment) - LEADER_PIN_CLEARANCE);
}

// The closer you zoom in, the more room a bubble gets before its text is
// clipped — so more of a long comment becomes readable as you zoom. These
// caps only bound a LONG headline: the box hugs its content, so a short
// bubble never pays for the cap it isn't using. The far steps sit a little
// above where they did when the box was floor-forced to 150 wide, because
// the headline now shares its row with the score and would otherwise clip
// two words in.
function bubbleMaxWidthForZoom(zoom: number) {
  if (zoom >= 18) return 240;
  if (zoom >= 16) return 210;
  if (zoom >= 14) return 185;
  return 155;
}

/**
 * The box's own max-width. The meta floor wins over the zoom cap: at far zoom
 * the cap dips below what the row needs, and a cap below the floor is how the
 * timestamp ended up clipped. The floor is the row's real, per-comment need
 * (estimateMetaWidth), so a short row no longer props a wide box open.
 */
function bubbleWidthCap(comment: MapComment, zoom: number) {
  const cap = bubbleMaxWidthForZoom(zoom);
  const floor = comment.upvotes !== undefined ? estimateMetaWidth(comment) : 0;
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

/**
 * The one number that belongs on the headline, next to the thing it measures:
 * a dish review's percent, or a restaurant review's stars. The plate is the
 * unit of truth, so its score sits beside it rather than exiled to the meta
 * row — which is also what let the meta row shrink to its social trail.
 */
function bubbleScoreFor(comment: MapComment): string | null {
  if (comment.dishPrefix) return splitDishPrefix(comment.dishPrefix).score;
  return comment.rating ?? null;
}

/**
 * The percent meter on /post runs hotter as it climbs (commit 35d7097 —
 * greige, then brand orange, then #d1451f, then #c62d12, banded at 40/80/95).
 * A dish percent shown here wears the same temperature so the two surfaces
 * agree about what 96% feels like — but each band speaks in its small-text
 * voice, since the meter's fill colours are tuned for a 56px track, not a
 * 10px numeral on #faf7f2: cool takes the bubble's muted, warm the orange's
 * own text voice (#A8481A, as .map-dish-link documents), and the two red
 * tiers run much darker than the meter's fills — deep bricks rather than
 * bright reds — so a hot percent reads as red at a glance instead of
 * blending into the orange dish name sitting an em to its left. Both clear
 * 7:1 on the fill. Star ratings aren't on the meter's scale and stay ink.
 */
function heatColorForPercent(pct: number) {
  if (pct >= 95) return "#7d1d08";
  if (pct >= 80) return "#9a2c10";
  if (pct >= 40) return BUBBLE_POP;
  return BUBBLE_MUTED;
}

/**
 * What the meta row cannot shrink below: reaction cluster, replies, timestamp,
 * at 10px mono (~6px/char) with the row's own gaps. Estimated per comment
 * instead of the old blanket 150px floor — the floor is what forced every
 * bubble to carry dead space on the right at far zoom, where the width cap
 * (130) sat under it. Generous on purpose, like estimateBubbleWidth below.
 */
function estimateMetaWidth(comment: MapComment) {
  const items: number[] = [];
  // Arrow + count + arrow — the full vote pair, generous for the friends
  // bubbles that only draw a heart.
  if (comment.upvotes !== undefined) items.push(26 + compactCount(comment.upvotes).length * 6);
  if (comment.commentCount !== undefined) items.push(13 + String(comment.commentCount).length * 6);
  if (comment.createdAt) items.push(compactTime(comment.createdAt).length * 6);
  const gaps = Math.max(0, items.length - 1) * 8;
  return items.reduce((a, b) => a + b, 0) + gaps + (BUBBLE_PADDING_X + BUBBLE_BORDER) * 2 + 8;
}

// Rough text-width estimate (no DOM measurement available at layout time) —
// generous on purpose so we under-place rather than risk visual overlap. The
// whole line counts now — dish, score, and the trailing comment all share it —
// so most bubbles sit at the zoom cap and short ones hug what they have. The
// nowrap meta row still sets a floor, but its own, computed one — not a
// constant.
function estimateBubbleWidth(comment: MapComment, zoom: number) {
  const score = bubbleScoreFor(comment);
  const trailing = comment.dishPrefix ? comment.text.trim().length : 0;
  const line =
    22 +
    (headlineFor(comment).length + trailing) * 5.5 +
    (score ? 6 + score.length * 6 : 0);
  const floor =
    comment.upvotes !== undefined ? estimateMetaWidth(comment) : BUBBLE_MIN_WIDTH;
  return Math.min(bubbleWidthCap(comment, zoom), Math.max(floor, line));
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
  /* The number the line carries right behind the thing it measures — a dish's
     percent, or a restaurant review's stars ahead of the prose. */
  const score = bubbleScoreFor(comment);
  /* One flowing line: the plate, its score right behind it, and then the
     poster's own words — not a headline row with the comment exiled below it.
     Each part keeps its own voice inline: Fraunces + accent for the dish (a
     reference), mono ink for the score (a measurement), muted sans for the
     prose (a person talking). At rest the line truncates like any one-liner;
     on hover it wraps and reads whole. */
  /* The dish stays a span rather than a button: .map-bubble-text truncates
     with text-overflow, which only applies to inline content, and a button is
     an atomic inline-level box that would clip mid-glyph instead. So it earns
     the keyboard affordances a link owes by hand — focusable, named as a
     link, and activated on Enter by the handler bound below. */
  /* At rest the line is a flex row so truncation has priorities: the name
     clips first (map-line-clip), the score never clips (map-line-score), and
     the prose takes whatever is left (map-line-fill) — so "Cortado and a
     mor… 84%" keeps its number where a single ellipsis run would have eaten
     it. On hover the row flips to a block and the same spans flow as one
     wrapping paragraph (see globals.css). */
  /* A percent takes the meter's heat for its value; a star rating stays ink. */
  const scoreColor = score && /%$/.test(score) ? heatColorForPercent(parseInt(score, 10)) : BUBBLE_INK;
  const scoreHtml = score
    ? `<span class="map-line-score" style="font-family: ${MONO}; font-size: 10px; font-weight: 600; color: ${scoreColor};">${escapeHtml(score)}</span>`
    : "";
  const headlineHtml = split
    ? `<span class="map-dish-link map-line-clip" role="link" tabindex="0" style="cursor: pointer;">${escapeHtml(split.name)}</span>
       ${scoreHtml}
       ${
         comment.text.trim()
           ? `<span class="map-line-fill" style="font-weight: 400; color: ${BUBBLE_MUTED};">${escapeHtml(comment.text)}</span>`
           : ""
       }`
    : `${scoreHtml}
       <span class="map-line-clip">${escapeHtml(comment.text)}</span>`;
  /* Which reaction the chip is depends on which feed the bubble's data came
     from — Discover bubbles upvote (public count, matches the number every
     other viewer already sees), Friends bubbles heart (no count anywhere,
     same rule the Friends tab itself follows). A bubble never offers both.
     Only comments backed by a real post get a live chip; seeded map chatter
     keeps a static upvote count and gets no heart at all. */
  const count = compactCount(comment.upvotes ?? 0);
  /* The vote pair, drawn the way the feed card draws it: "▲ 4 ▼" — the NET
     score between the arrows. The arrows NEVER change shape: the old
     hollow-until-voted swap (△→▲) replaced a hairline outline with a solid
     block, and the solid glyph renders larger — the "upvote gets bigger on
     click" the user kept seeing after every animation was already stripped.
     One glyph, forever; your own vote is colour alone, driven off
     aria-pressed in globals.css (muted at rest, the orange text voice when
     pressed or hovered). Nothing scales, pops, or changes shape. */
  const voteButtonStyle = `
            padding: 0; border: 0; background: none;
            font-family: ${MONO}; font-size: 10px; font-weight: 700; line-height: 1.5;
            cursor: pointer;`;
  const reactionHtml =
    mode === "discover"
      ? comment.postId && canReact
        ? `<span style="display: inline-flex; align-items: baseline; gap: 4px;">
            <button type="button" class="map-upvote-chip" aria-pressed="${comment.upvotedByMe ? "true" : "false"}" aria-label="Upvote this plate" style="${voteButtonStyle}">▲</button>
            <span style="font-weight: 700; color: ${BUBBLE_POP};">${count}</span>
            <button type="button" class="map-downvote-chip" aria-pressed="${comment.downvotedByMe ? "true" : "false"}" aria-label="Downvote this plate" style="${voteButtonStyle}">▼</button>
          </span>`
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

  /* The social trail, all machine-made and all mono: the reaction cluster,
     replies, and how long ago. The score used to open this row too, but it
     describes the plate, not the conversation — it now sits on the headline
     beside the name it measures, and the row it left behind is short enough
     that the box can finally hug it. The upvote stays the row's one accent. */
  const metaRow = hasMeta
    ? `<div style="
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-top: ${BUBBLE_META_GAP}px;
        font-family: ${MONO};
        font-size: 10px;
        line-height: 1.5;
        color: ${BUBBLE_MUTED};
        white-space: nowrap;
      ">
        ${reactionHtml}
        ${repliesHtml}
        ${comment.createdAt ? `<span>${escapeHtml(compactTime(comment.createdAt))}</span>` : ""}
      </div>`
    : "";

  /* A leader line to the pin, the way a map annotates a feature — not a
     speech tail. A dead-straight vertical drop: no bend, no taper, no curve.

     Only the bubble nearest the pin draws one. Giving every card in a stack
     its own leader was tried and is wrong: LEADER_X sits inside the column's
     own width, so the fourth card's line runs 187px down *through* the three
     boxes below it. The cards in a stack sit BUBBLE_GAP apart and read as one
     group anchored by the bottom card's line; the rest need no thread of their
     own. (Routing the line outside the column instead is what leaves it
     detached from the rounded corner — see LEADER_X.)

     The wrapper below is translated to (offsetX, -offsetY) from the marker
     point, so in its own coordinates the box's top-left is (0, 0) and the
     pin's centre is (-offsetX, offsetY) — the length is derived from those two
     facts rather than hand-measured. It leaves the bottom edge at LEADER_X and
     drops toward the pin.

     pointer-events stay off so it never steals a click meant for the box or
     the map beneath it. */
  const drop = leaderDrop(comment, offsetY);
  /* The svg is a narrow strip centred on the run. `top: 100%` is the box's
     *rendered* bottom rather than a computed y, so the couple of px
     bubbleHeight() rounds up as collision margin can't open a gap between the
     box and its own line; that slack lands at the far end instead. */
  const LEADER_STRIP = 8;
  const leaderLeft = LEADER_X - LEADER_STRIP / 2;
  /* +0.5 so a 1px stroke lands on one pixel instead of straddling two and
     rendering as a 2px smear at half opacity. The run starts at -BUBBLE_BORDER
     so it tucks under the box's own hairline and leaves no antialiasing seam
     where the two meet. */
  const runX = LEADER_STRIP / 2 + 0.5;
  const leader =
    stackIndex === 0
      ? `<svg width="${LEADER_STRIP}" height="${drop + LEADER_DOT + 1}" style="
      position: absolute; left: ${leaderLeft}px; top: 100%;
      overflow: visible; pointer-events: none;
    " aria-hidden="true">
      <line x1="${runX}" y1="-${BUBBLE_BORDER}" x2="${runX}" y2="${drop}"
        stroke="${LEADER_STROKE}" stroke-width="1"
      />
      <circle cx="${runX}" cy="${drop}" r="${LEADER_DOT}" fill="${BUBBLE_FILL}" />
    </svg>`
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
        background: ${BUBBLE_FILL};
        border: ${BUBBLE_BORDER}px solid ${BUBBLE_EDGE};
        border-radius: ${BUBBLE_RADIUS}px;
        padding: ${BUBBLE_PADDING_Y}px ${BUBBLE_PADDING_X}px;
        font-size: 12px;
        line-height: 1.35;
        color: ${BUBBLE_INK};
      ">
        <div class="map-bubble-text" style="max-width: ${textMaxWidth}px; font-weight: 600;">${headlineHtml}</div>
        ${metaRow}
      </div>
      ${leader}
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
  onDownvote,
  onHeart,
}: {
  restaurants: Restaurant[];
  commentsByRestaurant: Record<string, MapComment[]>;
  mode: "discover" | "friends";
  /** Omitted when nobody is signed in, which is what hides the vote chips. */
  onUpvote?: (postId: string) => void;
  /** The pair's other half — always passed together with onUpvote. */
  onDownvote?: (postId: string) => void;
  /** Omitted when nobody is signed in, which is what hides the heart chips. */
  onHeart?: (postId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pinMarkersRef = useRef<Marker[]>([]);
  const bubbleMarkersRef = useRef<Marker[]>([]);
  /** False until the first fitBounds has played the opening dive. */
  const hasFitRef = useRef(false);
  /* Which set of restaurants the camera was last fitted to. The effect below
     re-runs on every vote — commentsByRestaurant is rebuilt from `posts`, so
     its identity changes the moment a count does — and it used to refit the
     camera each time, snapping a reader who had zoomed into a block all the
     way back out to the county frame. Fitting is about *which places are on
     the map*, not about their vote counts, so it now happens only when that
     set actually changes. */
  const fittedToRef = useRef<string | null>(null);
  /* Held in refs so a new callback identity each render doesn't re-run the
     marker effect — the handler is read at click time, not at bind time.
     Synced in an effect rather than during render: writing a ref while
     rendering is a lint error, since it makes the render's output depend on
     mutation order instead of props/state alone. */
  const onUpvoteRef = useRef(onUpvote);
  useEffect(() => {
    onUpvoteRef.current = onUpvote;
  }, [onUpvote]);
  const onDownvoteRef = useRef(onDownvote);
  useEffect(() => {
    onDownvoteRef.current = onDownvote;
  }, [onDownvote]);
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

    /* Only refit when the set of places changed — never merely because a vote
       count did. See fittedToRef above: this effect re-runs on every upvote,
       and refitting there threw away whatever the reader had zoomed to. */
    const fitKey = restaurants.map((r) => r.id).join(",");
    if (fittedToRef.current !== fitKey) {
      fittedToRef.current = fitKey;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const firstFit = !hasFitRef.current;
      hasFitRef.current = true;
      // First fit animates the dive from the county-wide opening frame; later
      // refits (the filter set changing) snap so they don't yank the user around.
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
    }

    /* One timestamp for the whole effect rather than Date.now() per call, so
       the ranking can't reshuffle between the initial render and a later pan —
       a bubble that shifted down the stack mid-pan would look like a bug. */
    const heatAt = now.getTime();
    const hottestComment = (id: string) =>
      Math.max(0, ...(commentsByRestaurant[id] ?? []).map((c) => commentHeat(c, heatAt)));

    // Rank restaurants by their hottest comment, breaking ties with a
    // deterministic spread so an unscored subset doesn't cluster onto one side.
    const ranked = [...restaurants].sort((a, b) => {
      const heatA = hottestComment(a.id);
      const heatB = hottestComment(b.id);
      if (heatB !== heatA) return heatB - heatA;
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
        /* Hottest first, so stackIndex 0 — the one bubble a restaurant is
           guaranteed at any zoom, and the only one that draws a leader — is
           always the best recent thing anyone said about the place. Zooming in
           raises the limit, and the next-hottest appear above it in order. */
        const comments = [...(commentsByRestaurant[restaurant.id] ?? [])].sort(
          (a, b) => commentHeat(b, heatAt) - commentHeat(a, heatAt),
        );
        const point = map!.project([restaurant.lng, restaurant.lat]);
        let stackIndex = 0;
        let offsetY = BUBBLE_TOP_OFFSET;
        for (const comment of comments) {
          if (stackIndex >= limit) break;
          const width = estimateBubbleWidth(comment, zoom);
          const height = bubbleHeight(comment);
          // The leader hangs below the box toward the pin, so it is part of the
          // footprint and nothing else may be placed over it. Only the
          // nearest-the-pin bubble draws one (see bubbleElement), so only its
          // rect grows — and it grows by exactly what that bubble will draw,
          // via the same leaderDrop() the drawing uses.
          const rect: Rect = {
            x: point.x + 12,
            y: point.y - offsetY,
            w: width,
            h: height + (stackIndex === 0 ? leaderDrop(comment, offsetY) : 0),
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
          const dishHref = comment.dishId
            ? `/restaurant/${restaurant.id}?dish=${comment.dishId}`
            : `/restaurant/${restaurant.id}`;
          el.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            const upvoteChip = target.closest(".map-upvote-chip");
            if (upvoteChip) {
              // Voting stays on the map rather than opening the post — the
              // whole point of putting the chips here is not having to leave.
              e.stopPropagation();
              if (comment.postId) onUpvoteRef.current?.(comment.postId);
              return;
            }
            const downvoteChip = target.closest(".map-downvote-chip");
            if (downvoteChip) {
              e.stopPropagation();
              if (comment.postId) onDownvoteRef.current?.(comment.postId);
              return;
            }
            const heartChip = target.closest(".map-heart-chip");
            if (heartChip) {
              e.stopPropagation();
              if (comment.postId) onHeartRef.current?.(comment.postId);
              return;
            }
            if (target.closest(".map-dish-link")) {
              router.push(dishHref);
            } else {
              router.push(comment.postId ? `/feed?post=${comment.postId}` : "/feed");
            }
          });
          /* The two chips are real buttons, so the platform already fires their
             click from the keyboard. Only the dish reference — a span, for the
             truncation reason above — has to answer Enter itself. Space stays
             unbound: this is a link, and links don't activate on Space. */
          el.addEventListener("keydown", (e) => {
            if (e.key !== "Enter") return;
            if (!(e.target as HTMLElement).closest(".map-dish-link")) return;
            e.preventDefault();
            router.push(dishHref);
          });
          const marker = new Marker({ element: el, anchor: "top-left" })
            .setLngLat([restaurant.lng, restaurant.lat])
            .addTo(map!);
          bubbleMarkersRef.current.push(marker);

          /* One true gap between stacked cards. Only the nearest-the-pin
             bubble grows a leader, and it hangs *below* that box, toward the
             pin — never up into the gap — so padding every step of the stack
             for it would spread the cards apart for nothing. */
          offsetY += height + BUBBLE_GAP;
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
