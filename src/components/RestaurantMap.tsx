"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ComponentType,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Turbopack can't serve MapLibre's worker module (it 404s with an HTML error
// page, failing the browser's module MIME check), and without its worker
// MapLibre renders no vector tiles at all. The worker and the shared chunk it
// imports are copied into /public (from node_modules/maplibre-gl/dist — keep
// them in step when upgrading maplibre-gl) and served as plain static files.
setWorkerUrl("/maplibre-gl-worker.mjs");
import { MapSearch, type MapMatches } from "@/components/MapSearch";
import { NEO_NOIR_STYLE } from "@/lib/mapStyle";
import { openStateFor } from "@/lib/openState";
import { relativeTime } from "@/lib/format";
import type { RestaurantView } from "@/data/restaurants";
import type { PlateScore } from "@/lib/plateScore";
import { SHOW_BLEND_STARS, blendLabel } from "@/lib/ratingDisplay";

/**
 * A restaurant as the map needs it: the projection plus the plate score, which
 * /api/restaurants attaches and hover prints. Optional so a caller that hasn't
 * got the aggregate still renders a map — the tip just says the name.
 */
export type MapRestaurant = RestaurantView & { plateScore?: PlateScore };
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
 * How deep a matched restaurant's stack may go while a search is running, at
 * any zoom.
 *
 * Both rations above exist to keep an unasked question from covering the city
 * in text. A search is the asked question, so they come off: "show me the
 * Mexican places" means every one of them, and "show me what people said" means
 * every comment, not the one that happens to be hottest at this zoom. Coverage
 * goes to 1 for the same reason, and only matches are candidates at all — which
 * is what pays for this, since a search is normally asking about a few dozen
 * restaurants where the unsearched map is rationing across seven hundred.
 *
 * It is a ceiling rather than `Infinity` because the collision pass is not the
 * only cost: every candidate above it is a rect tested against every rect
 * already down, and a restaurant with sixty comments would spend that on cards
 * stacked a screen and a half above their own ember, where nothing is legible
 * and nothing is reachable. Eight is about a phone's worth of height.
 */
const SEARCH_BUBBLE_LIMIT = 8;

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
 *
 * **A downvoted bubble sinks, and it does it in a second tier**, matching
 * getDiscoverFeed exactly — the map and the feed have to agree about what a
 * negative plate is worth, or the same post is buried in one and prominent in
 * the other. The decay here is multiplicative, so the trap is the same as the
 * feed's division: `negative * 0.5^age` rises toward zero as a post ages, which
 * would let an old −9 outrank a fresh −1. Underwater comments therefore return
 * their raw score, worst first, with no age term at all — and since every
 * non-negative heat is strictly positive (the +1 guarantees it), any negative
 * automatically sorts below every bubble that isn't underwater.
 *
 * This is what decides which single bubble a restaurant shows when only one
 * fits: the hated take is now the last one standing, not the first.
 */
function commentHeat(comment: MapComment, now: number) {
  const popularity = comment.score ?? comment.upvotes ?? 0;
  if (popularity < 0) return popularity;
  if (!comment.createdAt) return popularity;
  const posted = Date.parse(comment.createdAt);
  if (Number.isNaN(posted)) return popularity;
  const ageHours = Math.max(0, (now - posted) / 3_600_000);
  return (popularity + 1) * Math.pow(0.5, ageHours / COMMENT_HALF_LIFE_HOURS);
}

/**
 * Real posts outrank seeded chatter, before heat is even consulted.
 *
 * Heat alone couldn't decide this fairly, because the two aren't measuring the
 * same thing. A real post's count is votes people actually cast — 0 or 1 on
 * most of them today. A seeded bubble's is `2 + (seed % 23)` from
 * data/mapComments.ts: a number invented to make an empty map look busy. There
 * are 65 of them and they land between 2 and 24, so filler took every bubble
 * slot in San Diego at every zoom, and the vote chips — which only render on a
 * bubble with a post behind it — were unreachable. The downvote button on the
 * map wasn't broken; nothing that could be clicked was ever on screen.
 *
 * So filler is what it was always meant to be: what fills a gap when nobody has
 * said anything real about a place. Within each tier, `commentHeat` still
 * decides, so the most-upvoted real post is still the one that shows.
 */
function isRealPost(comment: MapComment) {
  return Boolean(comment.postId);
}

/** Sort comparator for bubbles: real before seeded, then hottest first. */
function compareBubbles(a: MapComment, b: MapComment, now: number) {
  if (isRealPost(a) !== isRealPost(b)) return isRealPost(a) ? -1 : 1;
  return commentHeat(b, now) - commentHeat(a, now);
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
/* Vertical room the neon restaurant sign takes above a stack's top edge —
   part of the collision footprint so no other bubble lands on the name. */
const NEON_SIGN_CLEARANCE = 14;
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
   invisible over the neo-noir ground.
   It is neon, the same light the ember it lands on and the sign above it are
   made of (`.map-leader` in globals.css carries the glow and the power-on
   flicker). A cream hairline read as a stray scratch; lit, the thread, the
   name and the dot are visibly one annotation. The mock draws two of its
   three leaders in this orange for the same reason. */
const LEADER_STROKE = "#ffb07a";
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
/** Vertical share of the drop given over to the elbow's diagonal. The run
 *  stays vertical above this, so the leader reads as a thread that nods toward
 *  its ember at the end rather than a diagonal slash across the map. */
const LEADER_ELBOW = 16;
/** Slack around the leader's svg root, which spans from just left of the pin to
 *  just right of the run. Both leaders — the card's and the bare sign's — need
 *  it: the path reaches left of its own box's edge, and an svg root that
 *  clipped would eat the elbow. */
const LEADER_PAD = 4;
/**
 * How far short of the pin's centre the leader stops, in px.
 *
 * The ember is not a fixed size — `restaurant-dots`' radius (and the halo over
 * it) grows with zoom, so this has to as well. A fixed clearance is exactly
 * what made the line look detached: sized for the close-up ember it left a
 * visible gap beside the 2px dot of a county view.
 *
 * Tracks the core dot's radius plus a hair, so the line dies at the edge of
 * the light at every zoom.
 */
function emberClearance(zoom: number) {
  const stops: [number, number][] = [
    [9, 3],
    [13, 5],
    [15, 6],
    [18, 8],
  ];
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z1, v1] = stops[i];
    if (zoom <= z1) {
      const [z0, v0] = stops[i - 1];
      return v0 + ((v1 - v0) * (zoom - z0)) / (z1 - z0);
    }
  }
  return stops[stops.length - 1][1];
}

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
 * blending into the ink dish name at the other end of the row. Both clear
 * 7:1 on the fill. Star ratings aren't on the meter's scale at all — see
 * scoreColorFor.
 */
function heatColorForPercent(pct: number) {
  if (pct >= 95) return "#7d1d08";
  if (pct >= 80) return "#9a2c10";
  if (pct >= 40) return BUBBLE_POP;
  return BUBBLE_MUTED;
}

/** A restaurant review's score arrives as a bare ratio ("4/5"). */
const RATIO_SCORE = /^\d+(?:\.\d+)?\/\d+$/;

/**
 * How the score reads at the right end of the headline: a dish percent as
 * authored ("92%"), a restaurant review's stars behind the glyph the approved
 * mockup puts in front of them ("★ 4/5"). Legacy "4★" strings already carry a
 * star of their own and are left alone.
 */
function scoreLabelFor(score: string) {
  return RATIO_SCORE.test(score) ? `★ ${score}` : score;
}

/**
 * A percent takes the meter's heat for its value; a star rating takes the
 * accent's small-text voice (the mockup's `.bmo`), not ink — stars are the
 * one score that isn't on the meter's scale, and leaving them ink made them
 * read as part of the dish name rather than as its verdict.
 */
function scoreColorFor(score: string) {
  return /%$/.test(score) ? heatColorForPercent(parseInt(score, 10)) : BUBBLE_POP;
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
  /* The handle, which this used to leave out entirely — and it only opens the
     row on a real post. Seeded chatter is anonymous, so every bubble the map
     used to place happened to be one this priced correctly, and the miss stayed
     invisible until real posts started winning bubbles. On those the row ran
     ~50px past the box and the second arrow and the reply count hung out over
     the map. `@` plus one 6px mono advance per character, uppercase being the
     same width in a monospace face. */
  if (comment.author) items.push((comment.author.length + 1) * 6);
  /* Arrow + count + arrow — the full vote pair, generous for the friends
     bubbles that only draw a heart. 34, not 26: each arrow occupies 13px of
     layout (a 25px padded hit box pulled back by its own -6px margins) and the
     flex `gap: 4px` sits on both sides of the count. 26 priced the glyphs and
     forgot the gaps. */
  if (comment.upvotes !== undefined) items.push(34 + compactCount(comment.upvotes).length * 6);
  if (comment.commentCount !== undefined) items.push(13 + String(comment.commentCount).length * 6);
  if (comment.createdAt) items.push(compactTime(comment.createdAt).length * 6);
  /* 12 per boundary, not 8: the row separates its parts with a mono middot
     (`@DANNYQ · 2H · 👍 34`, the byline shape DESIGN.md gives the feed card),
     so a boundary now costs two 4px gaps and a ~6px glyph rather than one gap. */
  const gaps = Math.max(0, items.length - 1) * 12;
  return items.reduce((a, b) => a + b, 0) + gaps + (BUBBLE_PADDING_X + BUBBLE_BORDER) * 2 + 8;
}

// Rough text-width estimate (no DOM measurement available at layout time) —
// generous on purpose so we under-place rather than risk visual overlap. Only
// the headline row counts: the subject on the left and the score pinned right,
// with the flex gap between them. The comment's prose no longer shares that
// row (it sits in the hover-revealed .map-bubble-prose below), so a chatty
// dish comment stops reserving a cap-wide rect for text the resting bubble
// never shows. The nowrap meta row still sets a floor, but its own, computed
// one — not a constant.
function estimateBubbleWidth(comment: MapComment, zoom: number) {
  const score = bubbleScoreFor(comment);
  const line =
    22 +
    headlineFor(comment).length * 5.5 +
    (score ? 10 + scoreLabelFor(score).length * 6 : 0);
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

/* Restaurant pins are paint, not DOM. Each restaurant used to be its own
 * Marker — a div holding an animated SVG that the main thread repositioned on
 * every frame of every pan, which is what made the map stutter as the corpus
 * grew. They now live in one unclustered GeoJSON source feeding WebGL circle
 * layers: a thousand restaurants cost roughly what the tiles cost. Every
 * restaurant stays its own light at every zoom — zoomed out the lights go
 * tiny and vague and dense blocks clump purely because the real dots crowd
 * together, like city lights seen from a plane. The DOM holds only the
 * comment bubbles (already capped by zoom) and one shared hover name chip.
 *
 * Per-feature properties drive the paint the old pinElement used to compute:
 * `intensity` 0..1 scales size and glow with the spot's best comment score,
 * `closed` cools a spot to a dim grey ember, `density` 0..1 says how much of a
 * restaurant district this spot stands in (see districtDensities). */
const PIN_SOURCE = "restaurants";

/* How much ground counts as "this restaurant's district" for the aura's
   density read. ~0.35mi is a few walkable blocks — the scale at which Little
   Italy is one thing and the strip mall two exits up is another. Widen it and
   a whole suburb starts reading as a district; tighten it and a single busy
   corner stops reading as one. */
const DISTRICT_RADIUS_MI = 0.35;

/* Neighbours inside that radius for a spot to count as fully dense (1.0).
   Weighted, not counted: a neighbour at the edge of the circle is worth much
   less than one across the street, so the number is closer to "eight places
   you'd walk past" than eight dots anywhere in range. Measured over the San
   Diego corpus this puts the median restaurant near 0.3 and downtown at 1. */
const DISTRICT_FULL_NEIGHBOURS = 8;

const MI_PER_DEG_LAT = 69.05;

/**
 * Per-restaurant local density, 0..1 — the input that makes the aura's zoom
 * fade proportional to how many restaurants are actually there.
 *
 * Flat-earth arithmetic rather than `milesBetween`'s haversine: this only ever
 * measures distances under half a mile, where the two agree to a few feet, and
 * it runs O(n²) over the whole corpus (~465k pairs at 682 restaurants), so the
 * trig matters. The |Δlat| early-out skips almost every pair.
 *
 * The falloff is 1-(d/R)² rather than a plain count so the value moves
 * smoothly as the corpus grows — a hard cutoff makes a restaurant's aura jump
 * the moment a neighbour is added a hair inside the radius.
 */
function districtDensities(list: RestaurantView[]): number[] {
  const out = new Array<number>(list.length).fill(0);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    let sum = 0;
    for (let j = 0; j < list.length; j++) {
      if (i === j) continue;
      const b = list[j];
      const dy = (a.lat - b.lat) * MI_PER_DEG_LAT;
      if (Math.abs(dy) >= DISTRICT_RADIUS_MI) continue;
      const dx =
        (a.lng - b.lng) * MI_PER_DEG_LAT * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
      const d2 = (dx * dx + dy * dy) / (DISTRICT_RADIUS_MI * DISTRICT_RADIUS_MI);
      if (d2 >= 1) continue;
      sum += 1 - d2;
    }
    out[i] = Math.min(1, sum / DISTRICT_FULL_NEIGHBOURS);
  }
  return out;
}

/* The neon sign: the restaurant naming itself above its stack, in the same
   voice a bare dot answers hover with (.map-name-tip) — and carrying the same
   plate score that tip prints, because a name lit on the map and the same name
   under the cursor must not disagree about what the place scores.

   A null percent prints nothing. Below plateScore.ts's floor there is no
   number, and the Yelp/Google blend is never borrowed into the slot a
   PlateMaps number goes in — see the rating invariant in CLAUDE.md. The blend
   stars the hover tip can show stay off the sign: they need their `/5` to not
   be misread as a percent, and a sign is not a place to explain a scale.

   A "lantern" heat bar along the card's base edge was tried here and removed —
   at real bubble sizes it read as a stray orange underline, not a designed
   edge. */
function signPercent(restaurant: MapRestaurant) {
  const percent = restaurant.plateScore?.percent;
  return typeof percent === "number" ? `${percent}%` : null;
}

function signHtml(restaurant: MapRestaurant) {
  const percent = signPercent(restaurant);
  const rating = percent ? `<span class="map-sign-rating">${percent}</span>` : "";
  return `<div class="map-neon-sign">${escapeHtml(restaurant.name)}${rating}</div>`;
}

/* Same trade as estimateMetaWidth: the sign has to be measured before it is in
   the DOM, so its width is estimated from the glyph widths its CSS implies —
   10px mono (~6px/char) plus the 0.18em tracking the uppercase sign carries,
   and the tighter tracking .map-sign-rating sets on the percent. Only the
   collision footprint reads this, so a few px of drift costs a few px of
   clearance rather than a wrong-looking sign. */
const SIGN_NAME_CHAR_WIDTH = 7.8;
const SIGN_RATING_CHAR_WIDTH = 6.2;
/* Matches .map-neon-sign's `gap` and `left` in globals.css. */
const SIGN_GAP = 6;
const SIGN_LEFT = 4;

function estimateSignWidth(restaurant: MapRestaurant) {
  const percent = signPercent(restaurant);
  return (
    SIGN_LEFT +
    restaurant.name.length * SIGN_NAME_CHAR_WIDTH +
    (percent ? SIGN_GAP + percent.length * SIGN_RATING_CHAR_WIDTH : 0)
  );
}

/* How far above the ember a bare sign floats, and how far right — the same +12
   column the bubbles hang in, so a searched map's signs line up with the
   bubbled ones rather than sitting a few px off them.

   Far shorter than BUBBLE_TOP_OFFSET's 72, since there is no card to clear,
   but not as short as it could be: the sign draws the same leader down to its
   ember that a bubble does, and the thread needs enough drop to read as a
   thread. Below about forty the vertical run vanishes into LEADER_ELBOW's
   diagonal and what is left is a hook, not a line. */
const SIGN_ONLY_OFFSET_X = 12;
const SIGN_ONLY_OFFSET_Y = 44;

/**
 * A matched restaurant with nothing to say, signing its name anyway.
 *
 * Signs normally crown a stack, which means a place nobody has commented on is
 * nameless on the map — right when the map is choosing what to show for itself,
 * and wrong the moment someone asks for "every Mexican place". Silence is an
 * answer to that question: the reader asked where they are, not what is being
 * said about them, and a spot that dropped out of the reply because no one has
 * posted yet reads as the search having missed it.
 *
 * The sign hangs off a zero-height anchor rather than a card. `.map-neon-sign`
 * is positioned `bottom: calc(100% + 2px)` against its parent, so a parent with
 * no height puts it 2px above the anchor point — the same relationship it has
 * to a bubble's top edge, with the bubble taken away.
 *
 * It carries the same leader down to its ember that a bubble does, and for the
 * same reason: a name floating over a field of identical lights does not say
 * WHICH light it names, and on a searched map — where the whole point is
 * reading a label back to its dot — guessing by proximity fails the moment two
 * restaurants sit a block apart. The geometry below is bubbleElement's, with
 * the box's height taken out of it; see the long derivation there. The one
 * substantive difference is where the run starts: a card's leader begins at
 * BUBBLE_RADIUS, the first point along its bottom edge that is actually
 * straight, and a bare sign has no corner to clear — but the same 8px happens
 * to land under the sign's opening characters (it sets at `left: 4px`), so the
 * thread hangs off the name rather than off empty map beside it.
 */
function signOnlyElement(restaurant: MapRestaurant, zoom: number) {
  /* The wrapper is translated to (X, -Y) from the marker point, so in its own
     coordinates the sign's baseline anchor is (0, 0) and the pin's centre is
     (-X, Y). Every number here comes off those two facts. */
  const leaderLeft = -SIGN_ONLY_OFFSET_X - LEADER_PAD;
  const leaderWidth = LEADER_X + LEADER_PAD - leaderLeft;
  const runX = LEADER_X - leaderLeft + 0.5;
  const pinX = -SIGN_ONLY_OFFSET_X - leaderLeft;
  const pinY = SIGN_ONLY_OFFSET_Y;
  const elbowY = Math.max(0, pinY - LEADER_ELBOW);
  const stop = emberClearance(zoom);
  const dx = pinX - runX;
  const dy = pinY - elbowY;
  const reach = Math.hypot(dx, dy) || 1;
  const endX = (pinX - (dx / reach) * stop).toFixed(1);
  const endY = (pinY - (dy / reach) * stop).toFixed(1);

  const el = document.createElement("div");
  /* Deliberately NOT `.map-bubble` — that class carries the hover rules that
     expand a card's prose, and there is no card here for them to act on. */
  el.className = "map-sign-only";
  el.innerHTML = `<div style="
      position: relative;
      width: 0;
      height: 0;
      transform: translate(${SIGN_ONLY_OFFSET_X}px, -${SIGN_ONLY_OFFSET_Y}px);
    ">
      ${signHtml(restaurant)}
      <svg class="map-leader" width="${leaderWidth}" height="${pinY + LEADER_PAD}" style="
        position: absolute; left: ${leaderLeft}px; top: 0;
        overflow: visible; pointer-events: none;
      " aria-hidden="true">
        <path d="M${runX},0 L${runX},${elbowY} L${endX},${endY}"
          fill="none" stroke="${LEADER_STROKE}" stroke-width="1"
          stroke-linecap="round" stroke-linejoin="round"
        />
      </svg>
    </div>`;
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
  /* The number the row carries at its far end, opposite the thing it measures
     — a dish's percent, or a restaurant review's stars. */
  const score = bubbleScoreFor(comment);
  /* The headline is a two-column row, not a flowing sentence: the subject
     hard left, the verdict hard right, the way the reference mockup and the
     feed's ledger card both set it. Space-between is what does it, so the
     number lands on the same edge in every bubble on the map and the column
     of scores can be read straight down. Voices split the way DESIGN.md's
     three-voice rule requires: Fraunces in ink for the plate (a proper name),
     mono for the score (a machine value), and the poster's own sans prose
     kept off this row entirely — it lives in .map-bubble-prose below.

     Truncation has priorities: the subject clips first (map-line-clip), the
     score never clips or wraps (map-line-score), so a long plate reads
     "Cortado and a mor… 84%" instead of losing its number to one ellipsis
     run. On hover the row keeps its two columns and the subject simply stops
     clipping (see globals.css).

     The dish stays a span rather than a button: text-overflow only applies to
     inline content, and a button is an atomic inline-level box that would
     clip mid-glyph instead. So it earns the keyboard affordances a link owes
     by hand — focusable, named as a link, and activated on Enter by the
     handler bound below. */
  const scoreHtml = score
    ? `<span class="map-line-score" style="font-family: ${MONO}; font-size: 10px; font-weight: ${
        /%$/.test(score) ? 700 : 600
      }; color: ${scoreColorFor(score)};">${escapeHtml(scoreLabelFor(score))}</span>`
    : "";
  /* No dish means no subject of its own, so what was said becomes the
     headline — and then there is no prose left to reveal, which is why
     proseHtml below is bound to `split` too rather than to comment.text. */
  const headlineHtml = split
    ? `<span class="map-dish-link map-line-clip" role="link" tabindex="0" style="cursor: pointer;">${escapeHtml(split.name)}</span>${scoreHtml}`
    : `<span class="map-line-clip">${escapeHtml(comment.text)}</span>${scoreHtml}`;
  /* The comment itself. Hidden at rest so the bubble reads as the mockup's two
     rows, revealed on hover or keyboard focus by the .map-bubble-prose rules
     in globals.css — the text is always in the DOM, never dropped, so nothing
     a person wrote becomes unreachable. Sans and muted: this is the one part
     of the bubble a human typed. */
  const proseHtml =
    split && comment.text.trim()
      ? `<div class="map-bubble-prose" style="margin-top: ${BUBBLE_META_GAP}px; font-weight: 400; line-height: 1.4; color: ${BUBBLE_MUTED};">${escapeHtml(comment.text)}</div>`
      : "";
  /* Which reaction the chip is depends on which feed the bubble's data came
     from — Discover bubbles upvote (public count, matches the number every
     other viewer already sees), Friends bubbles heart (no count anywhere,
     same rule the Friends tab itself follows). A bubble never offers both.
     Only comments backed by a real post get a live chip; seeded map chatter
     keeps a static upvote count and gets no heart at all. */
  const count = compactCount(comment.upvotes ?? 0);
  /* The vote pair, drawn the way the feed card draws it — thumb, NET score,
     thumb. Same marks as PostActions, hand-inlined as SVG because this bubble
     is an HTML string handed to MapLibre rather than React (the reply glyph
     below is inlined for the same reason). The thumbs NEVER change shape:
     your own vote is colour alone, driven off aria-pressed in globals.css
     (muted at rest, the orange text voice when pressed or hovered). Nothing
     scales, pops, or changes shape — that was the whole complaint about the
     old hollow-until-voted arrow swap these replaced. */
  /* The padding is the whole point, and the negative margin is what makes it
     free. At its drawn size the mark gave a 13x15 hit box with 14px of dead
     space between the two thumbs — a tap needed to be accurate to about six
     pixels or it landed on the card and navigated to the post instead of
     voting. That is what "the downvote button doesn't work" was: it worked,
     you just could not hit it. Padding grows the box and the matching negative
     margin pulls the layout back, so nothing on the row moves and the bubble
     keeps its measured width. Still short of the 44px floor AGENTS.md sets — a
     bubble this size cannot host one — but it is four times the area it was. */
  const voteButtonStyle = `
            display: inline-flex; align-items: center;
            padding: 8px 6px; margin: -8px -6px; border: 0; background: none;
            line-height: 1; cursor: pointer; touch-action: manipulation;`
  /* The vote pair keeps ONE shape on every bubble — arrow, count, arrow — so
     the row doesn't reflow depending on who authored what. Only the controls
     that can actually do something are buttons: seeded map chatter has no post
     behind it, so its arrows render as plain glyphs at the muted step rather
     than as buttons that would look live and do nothing when clicked. */
  const staticArrowStyle = `display: inline-flex; align-items: center; line-height: 1; color: ${BUBBLE_MUTED};`;
  /* One path, rotated for the downvote, at the meta row's 11px scale — the
     same closed outline `VoteArrowUpIcon` draws, hand-inlined because a bubble
     is an HTML string and cannot host a React component. The `d` here and the
     `VOTE_ARROW_PATH` constant in components/icons.tsx are one shape and have
     to be changed together; there is no import that can enforce it. */
  const arrowGlyph = (down: boolean) =>
    `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${
      down ? ' transform="rotate(180)"' : ""
    }><path d="M12 3.4 21 12.4h-4.6V20.6H7.6V12.4H3z"/></svg>`;
  const votePair = (interactive: boolean) =>
    `<span style="display: inline-flex; align-items: center; gap: 4px;">
        ${
          interactive
            ? `<button type="button" class="map-upvote-chip" aria-pressed="${comment.upvotedByMe ? "true" : "false"}" aria-label="Upvote this plate" style="${voteButtonStyle}">${arrowGlyph(false)}</button>`
            : `<span style="${staticArrowStyle}" aria-hidden="true">${arrowGlyph(false)}</span>`
        }
        <!-- .map-vote-count carries no styling of its own — it is the handle
             patchBubbleReaction() below finds this text node by when a vote
             lands. The count is the ONLY thing a vote is allowed to move on a
             drawn bubble, so it needs a name; everything the class could have
             said about weight and colour stays inline where it always was. -->
        <span class="map-vote-count" style="font-weight: 700; color: ${BUBBLE_POP};">${count}</span>
        ${
          interactive
            ? `<button type="button" class="map-downvote-chip" aria-pressed="${comment.downvotedByMe ? "true" : "false"}" aria-label="Downvote this plate" style="${voteButtonStyle}">${arrowGlyph(true)}</button>`
            : `<span style="${staticArrowStyle}" aria-hidden="true">${arrowGlyph(true)}</span>`
        }
      </span>`;
  const reactionHtml =
    mode === "discover"
      ? votePair(Boolean(comment.postId && canReact))
      : comment.postId && canReact
        ? `<button type="button" class="map-heart-chip" aria-pressed="${comment.heartedByMe ? "true" : "false"}" aria-label="Heart this plate" style="
            display: inline-flex; align-items: center; justify-content: center;
            padding: 0; border: 0; background: none;
            font-size: 11px; line-height: 1.4; cursor: pointer;
            color: ${comment.heartedByMe ? BUBBLE_POP : BUBBLE_MUTED};
          ">♥</button>`
        : "";

  /* Replies, drawn rather than an emoji, and shown on every bubble so the row
     keeps one shape whether or not anyone has replied — as in the reference.
     A real post opens its thread on click; seeded chatter has no thread, so it
     shows the shape at zero and stays inert for the same reason its arrows do. */
  const replyCount = comment.commentCount ?? 0;
  const replyGlyph = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H6l-3 3v-8a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/></svg>`;
  const repliesHtml = comment.postId
    ? `<button type="button" class="map-reply-chip" aria-label="${replyCount === 1 ? "1 reply" : `${replyCount} replies`}" style="
          display: inline-flex; align-items: center; gap: 3px;
          padding: 0; border: 0; background: none;
          font-family: ${MONO}; font-size: 10px; line-height: 1.5;
          cursor: pointer;
        ">${replyGlyph}${replyCount}</button>`
    : `<span style="display: inline-flex; align-items: center; gap: 3px;">${replyGlyph}${replyCount}</span>`;
  const textMaxWidth = maxWidth - (BUBBLE_PADDING_X + BUBBLE_BORDER) * 2;

  /* The social trail, all machine-made and all mono: who said it, how long
     ago, and what the room did about it — `@DANNYQ · 2H · 👍 34`, handle
     first, the same byline order DESIGN.md gives the feed's ledger card and
     the reference mockup gives the bubble. The score used to open this row,
     but it describes the plate rather than the conversation and now sits at
     the far end of the headline instead. The reaction stays the row's one
     accent.

     Middot separators rather than spacing alone, since the parts are of
     different kinds (a person, a time, a control) and the app's other byline
     already punctuates them. They are aria-hidden so a screen reader hears
     the values, not the furniture; estimateMetaWidth prices them per
     boundary. */
  const metaSeparator = '<span aria-hidden="true">·</span>';
  const metaParts = [
    comment.author ? `<span>@${escapeHtml(comment.author.toUpperCase())}</span>` : "",
    comment.createdAt ? `<span>${escapeHtml(compactTime(comment.createdAt))}</span>` : "",
    reactionHtml,
    repliesHtml,
  ].filter(Boolean);
  const metaRow = hasMeta
    ? `<div style="
        display: flex;
        align-items: baseline;
        gap: 4px;
        margin-top: ${BUBBLE_META_GAP}px;
        font-family: ${MONO};
        font-size: 10px;
        line-height: 1.5;
        color: ${BUBBLE_MUTED};
        white-space: nowrap;
      ">
        ${metaParts.join(metaSeparator)}
      </div>`
    : "";

  /* A leader line to the pin, the way a map annotates a feature — not a
     speech tail. No taper, no curve: a straight run off the box's flat bottom
     edge, then one elbow angling into the ember, exactly the two-segment path
     the approved mock draws (`M310,296 L310,288 L348,238`, ending on the ring
     of the dot at 352,232).

     It must actually REACH the dot. This used to drop dead-straight and stop
     20px to the pin's right, capped with a small circle of its own — which
     reads as connected only while the ember is wide enough to swallow the
     gap. Zoomed out the ember is a couple of px and the line visibly ended in
     open water beside it. The mock has no terminal circle either: the
     restaurant's own light is the terminus, so LEADER_DOT is gone.

     Only the bubble nearest the pin draws one. Giving every card in a stack
     its own leader was tried and is wrong: LEADER_X sits inside the column's
     own width, so the fourth card's line runs 187px down *through* the three
     boxes below it. The cards in a stack sit BUBBLE_GAP apart and read as one
     group anchored by the bottom card's line; the rest need no thread of their
     own. (Routing the line outside the column instead is what leaves it
     detached from the rounded corner — see LEADER_X.)

     The wrapper below is translated to (offsetX, -offsetY) from the marker
     point, so in its own coordinates the box's top-left is (0, 0) and the
     pin's centre is (-offsetX, offsetY) — every number here is derived from
     those two facts rather than hand-measured.

     pointer-events stay off so it never steals a click meant for the box or
     the map beneath it. */
  const drop = leaderDrop(comment, offsetY);
  /* The svg spans from just left of the pin to just right of the run, rather
     than riding on `overflow: visible` — the path now reaches left of the
     box's own edge, and an SVG root that clips would eat the elbow.

     `top: 100%` is the box's *rendered* bottom rather than a computed y, so
     the couple of px bubbleHeight() rounds up as collision margin can't open
     a gap between the box and its own line; that slack lands at the far end,
     where the ember's radius absorbs it. */
  const leaderLeft = -offsetX - LEADER_PAD;
  const leaderWidth = LEADER_X + LEADER_PAD - leaderLeft;
  /* +0.5 so the 1px vertical run lands on one pixel instead of straddling two
     and rendering as a 2px smear at half opacity. The diagonal is off-axis
     anyway, so it gains nothing from the same trick. */
  const runX = LEADER_X - leaderLeft + 0.5;
  /* The pin, in the svg's own coordinates. `offsetY - bubbleHeight` is the
     drop to the pin's centre; leaderDrop() is that same distance already
     backed off by LEADER_PIN_CLEARANCE, so adding it back recovers the centre
     without re-deriving it. */
  const pinX = -offsetX - leaderLeft;
  const pinY = drop + LEADER_PIN_CLEARANCE;
  /* The elbow turns late, so the leader reads as a vertical thread that just
     nods toward its ember at the end — not as a diagonal slash across the
     map. Clamped so a short drop degrades to a plain diagonal rather than
     bending upward. */
  const elbowY = Math.max(0, pinY - LEADER_ELBOW);
  /* Stop at the edge of the light rather than inside it. The ember's radius
     grows with zoom, so a fixed clearance is exactly what broke this: too big
     zoomed out, swallowed zoomed in. */
  const stop = emberClearance(zoom);
  const dx = pinX - runX;
  const dy = pinY - elbowY;
  const reach = Math.hypot(dx, dy) || 1;
  const endX = (pinX - (dx / reach) * stop).toFixed(1);
  const endY = (pinY - (dy / reach) * stop).toFixed(1);
  const leader =
    stackIndex === 0
      ? `<svg class="map-leader" width="${leaderWidth}" height="${pinY + LEADER_PAD}" style="
      position: absolute; left: ${leaderLeft}px; top: 100%;
      overflow: visible; pointer-events: none;
    " aria-hidden="true">
      <path d="M${runX},-${BUBBLE_BORDER} L${runX},${elbowY} L${endX},${endY}"
        fill="none" stroke="${LEADER_STROKE}" stroke-width="1"
        stroke-linecap="round" stroke-linejoin="round"
      />
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
     treatment in globals.css — the display face, and ink rather than the
     accent, since the approved mockup gives the row exactly one coloured
     value and that is the score on the right. A bubble with no dish falls
     back to the comment's own words and stays in the UI sans, because that
     text is not a reference to anything. The meta row under both is
     machine-generated and set in mono. */
  /* The card hangs from a FIXED bottom edge, and that is what keeps the leader
     on its restaurant.

     Hovering a bubble reveals its prose and widens it, so the box gets taller.
     While the box was in normal flow it grew DOWNWARD, the wrapper grew with
     it, and the leader — pinned to the wrapper's `top: 100%` — slid down with
     the bottom edge and shot straight past the ember. The line moved because
     its origin moved.

     So the wrapper is locked to the resting height and the box is absolutely
     positioned against its bottom: expanding now pushes the card UP into empty
     map, the bottom edge never moves, and `top: 100%` is a constant. The
     leader's geometry is exact by construction rather than by bubbleHeight()
     happening to match what rendered.

     The sign rides inside the box for the same reason — it names the card, so
     it has to travel with the card's top rather than sit at a fixed height the
     expanded box would grow up through. */
  el.innerHTML = `<div style="
      position: relative;
      width: 0;
      height: ${bubbleHeight(comment)}px;
      transform: translate(${offsetX}px, -${offsetY}px);
      cursor: pointer;
    ">
      <div class="map-bubble-box" style="
        position: absolute;
        bottom: 0;
        left: 0;
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
        <!-- Row order is load-bearing, and the meta row must stay last.
             The box is anchored \`bottom: 0\`, so its bottom edge is the fixed
             point and every row it grows takes the rows ABOVE it upward. With
             the prose last, revealing it on hover moved the vote chips 72px up
             — out from under the cursor that was travelling toward them. You
             could not click the arrows with a mouse at all: by the time the
             press landed they had left. Keeping the meta row at the bottom
             welds it to that fixed edge, so the chips hold still and the
             headline is what slides. -->
        <div class="map-bubble-text" style="max-width: ${textMaxWidth}px; font-weight: 600;">${headlineHtml}</div>
        ${proseHtml}
        ${metaRow}
      </div>
      ${leader}
    </div>`;
  return el;
}

/* ---------------------------------------------------------------------------
 * Voting changes what a bubble SAYS, never which bubbles exist.
 *
 * The bug this machinery exists to prevent: `commentsByRestaurant` was in the
 * drawing effect's dependency list, so a vote re-ran the whole pass — and the
 * pass ranks restaurants by their best bubble's SCORE and then takes a coverage
 * slice off the top. Rewriting one score reorders `ranked`, the slice selects a
 * different SET of restaurants, and every marker on the map is torn down and
 * rebuilt from that different set. Measured live: the first bubble was DIRTY
 * BIRDS before an upvote landed on it and VIN DE SYRAH immediately after. The
 * request had succeeded; the bubble had simply jumped out from under the
 * cursor, which is the entire reason upvoting from the map felt broken.
 *
 * So the pass reads the comments through a ref and is armed by
 * `bubbleSetFingerprint` instead — a key over everything a vote CANNOT change.
 * Same key as the pass on screen means nothing but votes moved, and the counts
 * are written straight into the live DOM by patchBubbleReaction. A different
 * key means the feed itself changed and the pass re-runs exactly as it always
 * did.
 * ------------------------------------------------------------------------- */

/* What the keys below join on, and the reason they can be trusted.
   A key is only sound if no field can forge a boundary — `"ab" + ""` and
   `"a" + "b"` must not produce the same string, or a genuine feed change would
   read as a vote and the bubbles would stop updating. NUL is the one character
   Postgres refuses to store in a `text` column, so no post's words, handle or
   dish name can contain one, and nothing in `src/data/` hand-authors one
   either. SOH separates whole records for the same reason. */
const FIELD_SEP = "\u0000";
const RECORD_SEP = "\u0001";

/**
 * A drawn bubble's identity: the restaurant AND the comment.
 *
 * Not the comment id alone. `buildMapComments` joins posts to restaurants by
 * NAME, so one post legitimately appears under two same-named listings (the
 * module says so explicitly), and keying on the comment id would let one of the
 * pair overwrite the other — leaving a live bubble with no element to patch and
 * a fingerprint that could miss a change to the shadowed copy.
 */
function bubbleKey(restaurantId: string, commentId: string) {
  return `${restaurantId}${FIELD_SEP}${commentId}`;
}

/**
 * Everything about a bubble that a vote cannot change, joined into one string.
 *
 * The exclusions are the whole point, and they are exactly the five fields
 * patchBubbleReaction writes: `score`, `upvotes`, `upvotedByMe`,
 * `downvotedByMe`, `heartedByMe`. Everything else a bubble renders is in here,
 * including the fields that only affect its BOX rather than its words —
 * `author`, `createdAt` and `commentCount` set the meta row's estimated width,
 * `postId` decides whether the chips are buttons at all, and `upvotes` being
 * *defined* (as opposed to its value) is what gives the bubble a meta row and
 * therefore its height. `dishId` is here because it is baked into the click
 * handler's href, so a menu landing after the bubbles have to redraw them.
 *
 * `dishName` is deliberately absent: nothing in this file reads it — it is the
 * input `findDishId`/`withDishIds` resolve into `dishId`, which is here.
 */
function bubbleIdentity(comment: MapComment) {
  return [
    comment.postId ?? "",
    comment.text,
    comment.dishPrefix ?? "",
    comment.rating ?? "",
    comment.dishId ?? "",
    comment.author ?? "",
    comment.createdAt ?? "",
    comment.commentCount ?? "",
    comment.upvotes === undefined ? "" : "meta",
  ].join(FIELD_SEP);
}

/**
 * The key that arms the drawing effect: every bubble's identity, sorted.
 *
 * **The sort is load-bearing, not tidiness.** `buildMapComments` sorts each
 * restaurant's real comments by score, so a vote that moves one plate past
 * another reorders the arrays — and a fingerprint built in array order would
 * differ, classify a plain vote as a feed change, and re-run exactly the pass
 * this is here to avoid. Sorted, the key is a property of the SET, which is
 * what "different bubbles" actually means.
 */
function bubbleSetFingerprint(comments: Record<string, MapComment[]>) {
  const entries: string[] = [];
  for (const [restaurantId, list] of Object.entries(comments)) {
    for (const comment of list) {
      entries.push(`${bubbleKey(restaurantId, comment.id)}${FIELD_SEP}${bubbleIdentity(comment)}`);
    }
  }
  return entries.sort().join(RECORD_SEP);
}

/**
 * Write a vote into a bubble that is already on the map.
 *
 * Only the count text and the pressed state move. `aria-pressed` is doing two
 * jobs at once here: it is the accessible state, and it is what globals.css
 * hangs `.map-upvote-chip[aria-pressed="true"] svg { fill: currentColor }` off,
 * so getting the attribute right is also what makes your own vote read as a
 * solid arrow instead of an outline.
 *
 * ## Why no relayout, and what that costs
 *
 * Nothing here can change a bubble's height: `bubbleHeight` reads only whether
 * `upvotes` is defined, never its value. Width is nearly as safe —
 * `estimateMetaWidth`'s one count-dependent term is
 * `34 + compactCount(upvotes).length * 6`, driven by the count's CHARACTER
 * length. So geometry only shifts when that length changes: 9→10, 99→100,
 * 0→-1, 999→1.0k. The rendered box shrink-wraps its content under a max-width
 * and grows on its own; what goes stale is the collision rect the layout pass
 * is holding, by about 6px, until the next pan re-runs renderBubbles.
 *
 * That is the deliberate trade. Do NOT reserve extra width for it and do NOT
 * trigger a relayout on a length change — a relayout re-ranks, and re-ranking
 * on a vote is the bug at the top of this section.
 */
function patchBubbleReaction(el: HTMLElement, comment: MapComment) {
  const count = el.querySelector<HTMLElement>(".map-vote-count");
  if (count) count.textContent = compactCount(comment.upvotes ?? 0);
  const upvote = el.querySelector<HTMLElement>(".map-upvote-chip");
  if (upvote) upvote.setAttribute("aria-pressed", comment.upvotedByMe ? "true" : "false");
  const downvote = el.querySelector<HTMLElement>(".map-downvote-chip");
  if (downvote) downvote.setAttribute("aria-pressed", comment.downvotedByMe ? "true" : "false");
  const heart = el.querySelector<HTMLElement>(".map-heart-chip");
  if (heart) {
    heart.setAttribute("aria-pressed", comment.heartedByMe ? "true" : "false");
    /* The heart carries its state as an inline colour rather than through an
       aria-pressed rule the way the arrows do (bubbleElement writes it, and
       globals.css only gives .map-heart-chip its hit area and focus ring), so
       the patch has to write the colour as well as the attribute. */
    heart.style.color = comment.heartedByMe ? BUBBLE_POP : BUBBLE_MUTED;
  }
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
  searchField: SearchField = MapSearch,
}: {
  restaurants: MapRestaurant[];
  commentsByRestaurant: Record<string, MapComment[]>;
  mode: "discover" | "friends";
  /** Omitted when nobody is signed in, which is what hides the vote chips. */
  onUpvote?: (postId: string) => void;
  /** The pair's other half — always passed together with onUpvote. */
  onDownvote?: (postId: string) => void;
  /** Omitted when nobody is signed in, which is what hides the heart chips. */
  onHeart?: (postId: string) => void;
  /**
   * Which search field sits on the map. Omitted everywhere in the app, which is
   * the only state `/feed` ever sees: the shipped `MapSearch` is the default and
   * nothing about this prop changes what that page renders.
   *
   * It exists so `/drafts/map-search/*` can put a candidate field on the *real*
   * map instead of a mockup — the design problem is a control read against a
   * backdrop that moves and changes colour as you pan, which a static comp
   * cannot answer. The map hands over its `mapRef` because that is the only
   * thing a search field needs from it (the shipped one takes exactly the same
   * prop), so a draft can fly the camera and read the live source without this
   * component knowing anything about the draft.
   *
   * A component type rather than a render callback: passing `mapRef` to a plain
   * function during render is a `react-hooks/refs` error, and rightly — as a
   * JSX prop the ref is handed to React, not read.
   *
   * The second prop is optional for the field's benefit, not this component's:
   * the drafts under `/drafts/map-search/*` were written against the one-prop
   * seam and a field that ignores it still satisfies this type. A draft that
   * wants to light the map up simply accepts it.
   */
  searchField?: ComponentType<{
    mapRef: RefObject<MapLibreMap | null>;
    onMatchesChange?: (matches: MapMatches | null) => void;
  }>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const bubbleMarkersRef = useRef<Marker[]>([]);
  /* Restaurant id -> the neon sign already naming it on the map. A place whose
     bubble is showing has said its name once; hovering its ember must not say
     it a second time in a floating chip an inch away. Kept as a ref rather
     than state because the hover handler is bound once, at layer-creation
     time, and has to see whatever the latest bubble pass produced. */
  const signsByRestaurantRef = useRef<Map<string, HTMLElement>>(new Map());
  /* bubbleKey() -> the element already drawn for that bubble. The parallel to
     bubbleMarkersRef above: markers are what the map has to remove, elements
     are what a vote has to reach into. Populated where a marker is pushed and
     cleared where the markers are, so the two can never disagree about what is
     on screen — a patch written to an element this map still held after the
     markers were torn down would land on a detached node and be invisible. */
  const bubbleElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  /** False until the first fitBounds has played the opening dive. */
  const hasFitRef = useRef(false);
  /* Which set of restaurants the camera was last fitted to. The effect below
     used to re-run on every vote — commentsByRestaurant is rebuilt from
     `posts`, so its identity changed the moment a count did — and it refitted
     the camera each time, snapping a reader who had zoomed into a block all
     the way back out to the county frame. Fitting is about *which places are
     on the map*, not about their vote counts, so it happens only when that set
     actually changes. A vote no longer re-runs the effect at all (see the
     patch effect below), but the guard is not thereby redundant: every other
     dependency still re-runs it with the same restaurants — a new page of
     posts, the Discover/Friends switch, signing in — and none of those is a
     reason to throw away the block someone had zoomed into. */
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

  /* The bubbles themselves, held in a ref for exactly the reason the three
     callbacks above are: the drawing effect must be able to READ the latest
     data without being RE-ARMED by it. A vote rewrites `commentsByRestaurant`
     wholesale (buildMapComments rebuilds it from `posts`), and while that prop
     sat in the effect's dependency list every vote tore the map down and laid
     it out again from a re-ranked, re-sliced set — see the long note above
     bubbleKey. */
  const commentsByRestaurantRef = useRef(commentsByRestaurant);

  /* The key that decides which of the two things just happened: same bubbles
     with different numbers, or different bubbles. It covers everything a vote
     cannot change, so equality means "nothing but votes moved". */
  const bubbleSetKey = useMemo(
    () => bubbleSetFingerprint(commentsByRestaurant),
    [commentsByRestaurant],
  );
  /* The key of the pass that is actually on the map right now — written by the
     drawing effect after it has drawn, and only then. Compared against rather
     than the previous render's key because what the patch needs to know is not
     "did anything change since last time" but "are the elements I am about to
     write into the ones this data describes". Null until a pass has drawn (the
     effect returns early until the map exists), which correctly reads as
     "nothing to patch". */
  const drawnBubbleSetRef = useRef<string | null>(null);

  /**
   * A vote landed: rewrite what the drawn bubbles SAY, and nothing else.
   *
   * Declared ahead of the drawing effect so that in a commit where both are
   * live the ref is refreshed before the pass reads it. In a commit where only
   * this one fires — the vote case — there is no pass to run: the count text
   * and the pressed states go straight into the DOM and every bubble stays
   * exactly where the reader last saw it, which is the entire point.
   *
   * When the keys differ the feed genuinely changed, and this does nothing:
   * `bubbleSetKey` is in the drawing effect's dependency list, so that effect
   * is already re-running in this same commit and will rebuild every marker.
   * Patching first would only write into elements about to be discarded.
   */
  useEffect(() => {
    commentsByRestaurantRef.current = commentsByRestaurant;
    if (bubbleSetKey !== drawnBubbleSetRef.current) return;
    for (const [restaurantId, list] of Object.entries(commentsByRestaurant)) {
      for (const comment of list) {
        /* Seeded map chatter has no post behind it, so its counts are static
           and its chips are plain glyphs rather than buttons. There is nothing
           for a vote to have changed and nothing in it a patch may touch. */
        if (!comment.postId) continue;
        const el = bubbleElementsRef.current.get(bubbleKey(restaurantId, comment.id));
        if (el) patchBubbleReaction(el, comment);
      }
    }
  }, [commentsByRestaurant, bubbleSetKey]);

  const canUpvote = !!onUpvote;
  const canHeart = !!onHeart;
  const router = useRouter();

  /* What the search field has asked the map to light up, and the handle to
     redraw with it.

     A ref and a manual call, rather than state and a dependency: the marker
     effect below tears down and re-places every bubble on the map when it
     re-runs, so a query in its dependency list would rebuild the city once per
     typed character — the same reason the field owns the query in the first
     place (see MapSearch's own note). The effect publishes its `renderBubbles`
     here on every run; the field writes the matches and calls it, and the pass
     reads the ref it always reads.

     `useCallback` with no deps because MapSearch's debounce effect depends on
     this identity — a new one each render would restart its timer forever. */
  const matchesRef = useRef<{ ids: Set<string> } | null>(null);
  const redrawForSearchRef = useRef<(() => void) | null>(null);
  const handleMatchesChange = useCallback((matches: MapMatches | null) => {
    /* A term nothing matched is treated as no search at all. Blanking the map
       to say "no results" would be the loudest possible answer to a half-typed
       word, and the dropdown is already saying it in one line. */
    matchesRef.current =
      matches && matches.ids.length > 0 ? { ids: new Set(matches.ids) } : null;
    redrawForSearchRef.current?.();
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    /* Read once here rather than out of the ref in the cleanup below: the ref
       object is never reassigned (only emptied), so this is the same Map, and
       the lint rule that flags a `.current` read at teardown time is asking for
       exactly this. */
    const bubbleElements = bubbleElementsRef.current;

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
      bubbleMarkersRef.current = [];
      /* Same breath as the markers, for the same reason renderBubbles clears
         it: an element map outliving the map it describes is a set of handles
         to detached nodes. */
      bubbleElements.clear();
      drawnBubbleSetRef.current = null;
    };
  }, []);

  /* How dense a restaurant district each spot sits in. Depends only on where
     the restaurants are, so it must not be recomputed on every vote — the
     effect below re-runs whenever a comment count changes, and this is the one
     O(n²) pass in the component. */
  const districtDensity = useMemo(() => districtDensities(restaurants), [restaurants]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const now = new Date();

    /* Rebuilt rather than held, because `dim` changes with the search and the
       rest changes with the votes — one builder keeps the two from needing
       separate update paths into the same source.

       `bestScore` and `hottest` moved INSIDE it when votes stopped re-running
       this effect. They read vote scores, so computing them once at effect
       time would have frozen every ember at whatever the counts were when the
       feed last changed; computed per call, a repaint picks up whatever the
       ref holds. The cost is one O(n) pass per repaint, and repaints happen
       when the search settles or when settleComments below decides a pan is
       due one — not on every vote, which is what they used to cost. */
    const buildPinData = (matched: Set<string> | null): GeoJSON.FeatureCollection => {
      const comments = commentsByRestaurantRef.current;
      // Pin size and glow follow each restaurant's best comment score, so the
      // hottest spots read as the brightest lights on the map; closed places
      // cool to grey embers.
      //
      // This one keeps its zero floor, unlike the bubble ranking below. Brightness
      // is a magnitude, not an order: an ember can be unlit but not less than
      // unlit, and a negative here would feed a negative radius into the pin
      // scale. A downvoted restaurant reads as cold, which is the darkest thing
      // the map can say about it.
      const bestScore = (id: string) =>
        Math.max(0, ...(comments[id] ?? []).map((c) => c.score ?? 0));
      const hottest = Math.max(1, ...restaurants.map((r) => bestScore(r.id)));
      return {
        type: "FeatureCollection",
        features: restaurants.map((restaurant, i) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [restaurant.lng, restaurant.lat] },
          properties: {
            id: restaurant.id,
            name: restaurant.name,
            /* Not what the search matched — what it DIDN'T. While a search is
               running these places keep their ember and lose everything else:
               the glow, the inner light and the ring all go, so the map still
               shows the whole city but only the matches are lit enough to carry
               a name. Without it a searched map is a field of identical lights
               with labels floating over some of them, and there is no way to
               read which light a label belongs to. False for everyone when
               nothing is being searched, which is the map's normal state. */
            dim: matched ? !matched.has(restaurant.id) : false,
            /* Both of the place's numbers, carried so hover can answer "how good
               is this?" without a round trip. `plateScore` is ours, the same 0-100
               percent the dish bubbles show, where -1 stands for "not enough rated
               plates" — a GeoJSON property cannot be null and 0 is a real score.
               `blend` is the Yelp/Google star mean, which is what a restaurant with
               no rated plates has instead. */
            plateScore: restaurant.plateScore?.percent ?? -1,
            blend: restaurant.rating,
            intensity: bestScore(restaurant.id) / hottest,
            /* Read only by the aura, and only far out: how much company this
               restaurant keeps within a few blocks. Same index as `restaurants`
               because districtDensity is built from that same array. */
            density: districtDensity[i],
            closed: openStateFor(restaurant.hours, now).kind === "closed",
          },
        })),
      };
    };

    /* Source and layers are created once, then only re-fed — recreating them
       per vote would flash every pin. Event handlers bind at creation time and
       read feature properties at event time, so they never go stale. */
    const applyPinData = () => {
      const pinData = buildPinData(matchesRef.current?.ids ?? null);
      const existing = map.getSource(PIN_SOURCE) as GeoJSONSource | undefined;
      if (existing) {
        existing.setData(pinData);
        return;
      }
      /* Safe to call at any time, which it has to be: the search redraw below
         fires whenever a query settles, and MapSearch's first effect runs (with
         an empty term) while the style is very often still loading. `addSource`
         THROWS in that window — "Style is not done loading" — and the throw
         landed inside a React passive effect, taking the rest of the marker
         pass down with it and leaving the map with no bubbles at all.

         Bailing is not a lost update: the `once("load")` registration at the
         bottom of this effect calls back here, and this function reads
         matchesRef at call time rather than closing over a snapshot, so
         whatever the search settled on in the meantime is what gets drawn. */
      if (!map.isStyleLoaded()) return;
      /* No clustering: merging neighbours into one synthetic blob is exactly
         what kills the airplane-window read. Every restaurant keeps its own
         light at every zoom; the "clump" is just real dots crowding. */
      map.addSource(PIN_SOURCE, { type: "geojson", data: pinData });

      /* The district aura: a soft pool of warm light under wherever the dots
         crowd, drawn as a low-key heatmap so busy areas glow as an area, not
         a shape. Sits under every dot layer; reads as the mock's Gaslamp /
         Little Italy pools and fades to nothing where the city is quiet.

         Three numbers decide whether that happens, and they only work
         together — tune one and the others have to be re-checked on screen:

         - `heatmap-intensity` sets what ONE restaurant is worth. MapLibre
           accumulates `weight * intensity * 0.3989` at a point's centre, so
           at ~0.3 a lone spot peaks around 0.09 density — under the ramp's
           floor, which is the whole point: an isolated restaurant must not
           light its own block. It used to sit near 1.6, where a single dot
           in the middle of nowhere saturated the ramp and the map became one
           flat orange wash.
         - `heatmap-radius` is what actually creates contrast, because the
           per-point peak doesn't shrink as the radius grows — a wider kernel
           just means more neighbours land on the same pixel. Dense blocks
           stack to density ~1 while quiet ones stay at one dot's 0.09. It
           also has to roughly track zoom, or a "district" stops being a
           fixed piece of ground and becomes a fixed number of screen pixels.
         - The ramp holds ALL of the alpha from z13 up, where `heatmap-opacity`
           is 1. Splitting it at street zoom — 0.3 in the ramp times 0.55
           opacity — is how this layer ended up at ~0.17 effective alpha over
           the #191c22 ground, i.e. invisible. The dead band below 0.2 density
           is what keeps quiet neighbourhoods at literally zero rather than a
           faint film, and the mid stops carry real light so a district doesn't
           have to reach the top 10% of the ramp before anything shows. The
           ramp cannot vary with zoom — `heatmap-color` only sees
           `heatmap-density` — so the zoom fade below has to come from the
           other two.

         Below z13 the layer FADES OUT, and how much it fades is the whole
         point of the `heatmap-weight` ramp below: the fade is per-restaurant,
         scaled by how dense a district that restaurant stands in. A packed
         downtown block keeps essentially all of its pool at county scale; a
         thin scatter of places loses most of its own. Measured at z9 with a
         flat weight, every probe across the county — Pacific Beach 0.97,
         Carlsbad 0.97, La Jolla 0.92, Oceanside 0.88, Chula Vista 0.70 —
         cleared the ramp's 0.55 stop, so the county view was one warm ribbon
         down the whole coastal corridor at near-max alpha, with the real core
         (Little Italy 3.88, Gaslamp 3.63) indistinguishable from it because
         both clamped. Radius is no help here: shrinking it at z9 pulls the
         core down as fast as the suburbs (the downtown:busy ratio only moves
         4.0 → 3.4 from R50 to R28), so it stays on its zoom track.

         - `heatmap-weight` is the only lever that can tell one restaurant
           from another — intensity and opacity are layer-wide, and the
           colour ramp only ever sees `heatmap-density`. So the
           density-proportional fade has to live here, as the one expression
           that reads both `["zoom"]` and a feature property. At z13 and in
           every stop above it the factor is exactly 1, which is what leaves
           the approved near view untouched; from z13 down to z9 each
           restaurant's weight falls toward `FAR_FLOOR` in proportion to how
           empty its own few blocks are. A spot in a full district barely
           moves; a lone spot ends up worth a sixth of itself and drops out
           of the ramp entirely. Note this fades DISTRICTS, not restaurants:
           the dots are a separate layer and every restaurant keeps its own
           ember at every zoom regardless.
         - `heatmap-intensity` is NOT a brightness dial and does not ride
           zoom for cosmetic reasons. `heatmap-radius` is in SCREEN pixels,
           so the patch of actual ground a kernel covers shrinks every time
           you zoom in: 50px at z9 is ~13km, 270px at z16 is only ~540m.
           Far out that swallows hundreds of restaurants and saturates;
           close in it holds a handful and never clears the dead band. This
           ramp cancels that inversion, and the rule it is solved for is the
           same at every zoom: ONE isolated restaurant stays under the band
           and stays dark, a tight cluster of about five clears it and
           lights. MapLibre accumulates `weight * intensity * 0.3989` per
           point, so the ceiling is set by the LONE restaurant, not the
           cluster: weight runs 0.4 (no posts) to 1.0 (a top-scoring spot),
           so at 0.85 a quiet lone dot reaches only 0.14 density and stays
           under the 0.2 band, while five stacked clear 0.6 and sit in the
           ramp's middle. Past ~0.9 a single highly-rated restaurant starts
           lighting its own block, which is the other failure mode.
           The two low stops are the exception and are deliberately tiny.
           At county scale every urban area is "dense" next to the desert,
           so the honest reading there is RELATIVE — but the suppression is
           now the weight ramp's job, per district, rather than this one
           number's. 0.16 at z9 is the value that lands downtown at the top
           of the colour ramp once the weight floor has taken the thin areas
           out; it reads as a big number next to the 0.07 it replaced only
           because most of the corpus is contributing a fraction of its
           former weight there.
         - `heatmap-opacity` then sets how strong whatever survived reads.
           These are two different jobs and must not be confused: intensity
           and weight pick the districts, opacity sets their brightness. It
           stays near 1 all the way out (0.92 at z9) precisely so that it is
           NOT a second, indiscriminate fade — dimming everything here is
           what made the dense core fade with the quiet blocks. It must
           reach exactly 1 by z13 or it would disturb the approved near
           view. */
      map.addLayer({
        id: "restaurant-aura",
        type: "heatmap",
        source: PIN_SOURCE,
        paint: {
          /* Zoom on the outside, feature property on the inside — MapLibre
             only accepts `["zoom"]` as the input to a top-level interpolate,
             so the two stops are whole weight expressions rather than a
             factor multiplied in afterwards. The z13 stop is the old flat
             weight, unchanged: 0.4 for a place with no posts up to 1.0 for a
             top-scoring one.

             The z9 stop multiplies that by 0.15..1 across `density`, so a
             restaurant standing alone keeps a sixth of its weight at county
             scale while one in a full district keeps all of it. 0.15 rather
             than 0 because a small isolated cluster should thin out, not
             blink off — below about 0.1 the outlying beach towns disappear
             between one zoom step and the next. */
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            [
              "*",
              ["+", 0.4, ["*", 0.6, ["get", "intensity"]]],
              ["+", 0.15, ["*", 0.85, ["get", "density"]]],
            ],
            13,
            ["+", 0.4, ["*", 0.6, ["get", "intensity"]]],
          ],
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            0.16,
            11,
            0.22,
            13,
            0.6,
            15,
            0.85,
            17,
            1,
            19,
            1.1,
          ],
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            50,
            13,
            115,
            16,
            270,
            19,
            420,
          ],
          "heatmap-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            0.92,
            11,
            0.96,
            13,
            1,
          ],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(232,135,90,0)",
            0.2,
            "rgba(232,135,90,0)",
            0.35,
            "rgba(232,135,90,0.1)",
            0.55,
            "rgba(232,135,90,0.24)",
            0.75,
            "rgba(232,135,90,0.35)",
            1,
            "rgba(232,135,90,0.46)",
          ],
        },
      });

      /* The mock's dot family, no clumping tricks: every restaurant is a
         visible neon ember at every zoom — small crisp core in the mock's
         #d98a5f warming toward #ffb07a as a spot's best post score rises,
         over a soft #e8875a halo, no dark outline anywhere. Radii scale
         gently with zoom so a dot reads at county scale and swells into a
         proper lamp at street scale. Intensity spreads sizes, so hot spots
         are visibly bigger lights than quiet ones. Closed spots cool to
         small grey embers with no glow.
         Blur rides zoom for the same reason radius does: from county height
         a light is seen through miles of air, so it should read as an
         indistinct smudge of glow rather than a shrunken hard dot — pulling
         in burns the haze off and the smudges resolve into defined lamps. */
      const byZoom = (z9: unknown, z13: unknown, z15: unknown, z18: unknown) =>
        [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          z9,
          13,
          z13,
          15,
          z15,
          18,
          z18,
        ] as unknown as number;
      const withIntensity = (base: number, gain: number) =>
        ["+", base, ["*", gain, ["get", "intensity"]]];
      /* What a search does to everywhere it didn't match — see `dim` in
         buildPinData. The three decorative layers switch off entirely and the
         core dot alone survives at a low alpha, so an unmatched restaurant
         reads as a bare ember: still there, still hoverable, no longer
         claiming any of the reader's attention. Doing it by opacity rather
         than by a new colour is deliberate — over the #191c22 ground a fainter
         ember cools toward the ground on its own, and inventing a second grey
         would put it in a conversation with `closed`, which already owns
         #4b525e and means something entirely different. */
      /* Measured on screen against the unsearched map rather than picked: at
         0.34 the county view lost the city entirely — the dots are only 1.8px
         at that zoom, and with the glow gone there was nothing left to see, so
         a search read as "the map went dark" instead of "these ones are lit".
         0.45 keeps a legible ember at every zoom while the matches, which
         carry the glow, the inner light and the ring on top of a 0.95 dot,
         stay obviously the brighter thing. */
      const DIM_DOT_OPACITY = 0.45;
      map.addLayer({
        id: "restaurant-dot-glow",
        type: "circle",
        source: PIN_SOURCE,
        paint: {
          "circle-color": "#e8875a",
          "circle-blur": byZoom(2, 1.5, 1.15, 1),
          "circle-opacity": [
            "case",
            ["any", ["get", "closed"], ["get", "dim"]],
            0,
            ["+", 0.4, ["*", 0.3, ["get", "intensity"]]],
          ],
          "circle-radius": byZoom(
            withIntensity(5, 5),
            withIntensity(8, 7),
            withIntensity(11, 9),
            withIntensity(16, 12),
          ),
        },
      });
      map.addLayer({
        id: "restaurant-dot-inner",
        type: "circle",
        source: PIN_SOURCE,
        paint: {
          "circle-color": "#f0a06a",
          "circle-blur": byZoom(1.5, 1, 0.7, 0.6),
          "circle-opacity": ["case", ["any", ["get", "closed"], ["get", "dim"]], 0, 0.8],
          "circle-radius": byZoom(
            withIntensity(2.5, 2.5),
            withIntensity(4, 3),
            withIntensity(5, 4.5),
            withIntensity(7, 5),
          ),
        },
      });
      map.addLayer({
        id: "restaurant-dots",
        type: "circle",
        source: PIN_SOURCE,
        paint: {
          "circle-color": [
            "case",
            ["get", "closed"],
            "#4b525e",
            [
              "interpolate",
              ["linear"],
              ["get", "intensity"],
              0,
              "#d98a5f",
              1,
              "#ffb07a",
            ],
          ],
          "circle-blur": byZoom(1.35, 0.65, 0.3, 0.18),
          /* `dim` is tested BEFORE `closed`: while a search is running, whether
             a place is open is not the question being asked, and letting the
             closed branch win would leave unmatched-but-closed spots brighter
             (0.5) than unmatched-and-open ones. */
          "circle-opacity": [
            "case",
            ["get", "dim"],
            DIM_DOT_OPACITY,
            ["get", "closed"],
            0.5,
            0.95,
          ],
          "circle-radius": byZoom(
            withIntensity(1.8, 1.6),
            withIntensity(2.4, 2.4),
            withIntensity(3, 3.4),
            withIntensity(4, 4.5),
          ),
        },
      });
      /* The mock's ringed actives: the hottest spots wear a thin halo ring
         around their light once the map is close enough to read them. */
      map.addLayer({
        id: "restaurant-dot-ring",
        type: "circle",
        source: PIN_SOURCE,
        minzoom: 12,
        filter: [
          "all",
          ["!", ["get", "closed"]],
          ["!", ["get", "dim"]],
          [">", ["get", "intensity"], 0.55],
        ],
        paint: {
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": "#e8875a",
          "circle-stroke-opacity": 0.45,
          "circle-stroke-width": 1.2,
          "circle-radius": byZoom(
            withIntensity(3, 2),
            withIntensity(4.5, 3),
            withIntensity(6.5, 4),
            withIntensity(10, 5),
          ),
        },
      });

      /* The hover/click target, and NOTHING else — fully transparent, and the
         only layer the pointer events below are bound to.

         The events used to ride a painted layer, which meant the target was
         only ever as big as the light was drawn: a couple of px across at
         county zoom, so a cursor sitting visually on top of an ember often hit
         nothing at all. MapLibre hit-tests a circle by its radius alone —
         `circle-blur` spreads the glow but not the geometry — so no amount of
         paint tuning could fix that. This layer decouples the two: the ember
         stays whatever size it should LOOK, and the thing you have to hit
         stays a comfortable size at every zoom.
         `circle-opacity: 0` still participates in queryRenderedFeatures; only
         `visibility: none` would take it out. */
      map.addLayer({
        id: "restaurant-hit",
        type: "circle",
        source: PIN_SOURCE,
        paint: {
          "circle-color": "#000",
          "circle-opacity": 0,
          "circle-radius": byZoom(14, 16, 19, 24),
        },
      });

      /* One shared name chip for the whole layer, shown by the map's hover
         events — the per-pin .pin-tip died with the DOM pins. */
      const tip = document.createElement("div");
      tip.className = "map-name-tip";
      const tipMarker = new Marker({ element: tip, anchor: "bottom", offset: [0, -12] });
      /* The sign currently answering a hover, so it can be put back when the
         cursor leaves — the flicker class has to come off something. */
      let litSign: HTMLElement | null = null;
      const dimSign = () => {
        litSign?.classList.remove("is-live");
        litSign = null;
      };

      /**
       * Which pin a tap has named but not yet opened.
       *
       * A mouse names a pin by hovering it and opens it by clicking, which is
       * two separate gestures. A finger has only one, so on a touch screen the
       * first tap names and the second opens — and this is the pin waiting for
       * that second tap. Null on a mouse, where hover already did the naming.
       */
      let armedId: string | null = null;

      /**
       * Name a pin: light its own sign if it already has one on screen,
       * otherwise raise the tip.
       *
       * Extracted so hover and the first tap run the identical code. They used
       * to be one inline block inside `mousemove`; a touch copy would have been
       * a second implementation of "which name goes with this dot", and the two
       * drifting is exactly the bug where the tip says one place and the tap
       * opens another.
       */
      const showName = (feature: GeoJSON.Feature) => {
        const id = String(feature.properties?.id ?? "");

        /* If this restaurant's bubble is already on screen, its neon sign is
           already naming it. Printing the tip too would stack a second copy of
           the same name a few px away and read as two different places. The
           sign it already has answers instead: a short flicker, the same "you
           are on this one" the tip would have said, without repeating a word. */
        const existingSign = signsByRestaurantRef.current.get(id);
        if (existingSign) {
          tipMarker.remove();
          /* Only on ENTERING a sign — mousemove fires for every pixel the
             cursor travels, and re-playing the flicker on each one would leave
             the name permanently strobing while you rested on it. */
          if (existingSign !== litSign) {
            dimSign();
            existingSign.classList.add("is-live");
            if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
              existingSign.animate(
                [
                  { opacity: 1 },
                  { opacity: 0.3, offset: 0.18 },
                  { opacity: 1, offset: 0.34 },
                  { opacity: 0.55, offset: 0.52 },
                  { opacity: 1 },
                ],
                { duration: 400, easing: "linear" },
              );
            }
            litSign = existingSign;
          }
          return;
        }
        dimSign();

        /* Name in the neon voice, then whichever numbers the place has: our
           percent (the same scale the dish bubbles carry, so no denominator is
           needed for it) and the blend's stars, which always print their `/5`
           because the two sit side by side here. A place whose plates haven't
           cleared the plate-score floor shows the stars alone — see
           lib/plateScore.ts and lib/ratingDisplay.ts. */
        const name = String(feature.properties?.name ?? "");
        const percent = Number(feature.properties?.plateScore);
        const blend = Number(feature.properties?.blend);
        const parts = [];
        if (Number.isFinite(percent) && percent >= 0) {
          parts.push(`<span class="map-tip-rating">${percent}%</span>`);
        }
        if (SHOW_BLEND_STARS && Number.isFinite(blend) && blend > 0) {
          parts.push(`<span class="map-tip-blend">★ ${blendLabel(blend)}</span>`);
        }
        tip.innerHTML = `<span>${escapeHtml(name)}</span>` + parts.join("");
        const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
        tipMarker.setLngLat([lng, lat]).addTo(map);
      };

      map.on("mousemove", "restaurant-hit", (e) => {
        /* The generous hit radius means several targets can be under one
           cursor in a dense block, and MapLibre hands them back in RENDER
           order, not by distance — so `features[0]` is often a neighbour
           rather than the ember actually being pointed at. Pick the closest,
           or hovering one light answers with another's name. */
        let feature: (typeof e.features extends undefined ? never : NonNullable<typeof e.features>[number]) | null = null;
        let nearest = Infinity;
        for (const candidate of e.features ?? []) {
          const point = map.project(
            (candidate.geometry as GeoJSON.Point).coordinates as [number, number],
          );
          const distance = Math.hypot(point.x - e.point.x, point.y - e.point.y);
          if (distance < nearest) {
            nearest = distance;
            feature = candidate;
          }
        }
        if (!feature) return;
        map.getCanvas().style.cursor = "pointer";
        showName(feature as unknown as GeoJSON.Feature);
      });
      map.on("mouseleave", "restaurant-hit", () => {
        map.getCanvas().style.cursor = "";
        tipMarker.remove();
        dimSign();
      });
      /* Click resolves the same way hover does — whatever the tip named under
         the cursor has to be what opens, or the two disagree in a crowd. */
      map.on("click", "restaurant-hit", (e) => {
        let best: { feature: GeoJSON.Feature; id: unknown; d: number } | null = null;
        for (const candidate of e.features ?? []) {
          const point = map.project(
            (candidate.geometry as GeoJSON.Point).coordinates as [number, number],
          );
          const d = Math.hypot(point.x - e.point.x, point.y - e.point.y);
          if (!best || d < best.d) {
            best = {
              feature: candidate as unknown as GeoJSON.Feature,
              id: candidate.properties?.id,
              d,
            };
          }
        }
        if (typeof best?.id !== "string") return;

        /*
         * On a touch screen, name it first and open it second.
         *
         * A mouse gets to ask "what is this?" for free by hovering, so a click
         * can mean "open it" — the reader has already read the name. A finger
         * has no such gesture: one tap would open a dot whose name was never
         * shown, which on a map of a few hundred unlabelled embers is a
         * navigation you cannot aim. So the first tap raises the name and the
         * second commits, and a tap on a *different* pin re-aims rather than
         * opening the one that happened to be armed.
         *
         * Gated on `(hover: none)` rather than on a touch-capable API: a laptop
         * with a touchscreen still has a pointer that hovers, and should keep
         * the one-click behaviour. This is the same question CSS asks.
         */
        const noHover = window.matchMedia("(hover: none)").matches;
        if (noHover && armedId !== best.id) {
          armedId = best.id;
          showName(best.feature);
          return;
        }

        router.push(`/restaurant/${best.id}`);
      });

      /* Panning or zooming disarms. Otherwise a name raised before the map
         moved stays armed under a finger that is now somewhere else entirely,
         and the next tap opens a restaurant the reader never pointed at. */
      map.on("movestart", () => {
        armedId = null;
      });

      /* A tap on empty map clears the name and the arm together — the way
         tapping outside anything dismisses it everywhere else. `click` on the
         map fires for the layer too, so this checks that the tap missed. */
      map.on("click", (e) => {
        const onPin = map.queryRenderedFeatures(e.point, { layers: ["restaurant-hit"] });
        if (onPin.length > 0) return;
        armedId = null;
        tipMarker.remove();
        dimSign();
      });

    };
    // The style loads async; until it has, sources can't be added. The off()
    // in this effect's cleanup keeps re-runs from stacking stale handlers.
    if (map.isStyleLoaded()) applyPinData();
    else map.once("load", applyPinData);

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
    /* The bubble this restaurant would lead with, under the same rule the stack
       itself uses — real posts before seeded filler, then hottest. Ranking
       restaurants on a bare heat number instead is what buried every real post:
       a place with one genuine plate scored 0.4 lost to a place whose only
       bubble was invented chatter scored 21. `null` when there is nothing to
       say, which sorts last — those restaurants take a coverage slot and then
       draw nothing. */
    const bestBubble = (comments: Record<string, MapComment[]>, id: string): MapComment | null => {
      const list = comments[id] ?? [];
      if (list.length === 0) return null;
      return list.reduce((best, c) => (compareBubbles(c, best, heatAt) < 0 ? c : best));
    };

    // Rank restaurants by their best bubble, breaking ties with a deterministic
    // spread so an unscored subset doesn't cluster onto one side.
    const rank = (comments: Record<string, MapComment[]>) =>
      [...restaurants].sort((a, b) => {
        const bubbleA = bestBubble(comments, a.id);
        const bubbleB = bestBubble(comments, b.id);
        if (!bubbleA || !bubbleB) {
          if (bubbleA === bubbleB) return spreadHash(a.id) - spreadHash(b.id);
          return bubbleA ? -1 : 1;
        }
        const byBubble = compareBubbles(bubbleA, bubbleB, heatAt);
        if (byBubble !== 0) return byBubble;
        return spreadHash(a.id) - spreadHash(b.id);
      });

    /* The ranking, and the comments snapshot it was built from.
       `let`, because votes are allowed to change what this SHOULD be without
       being allowed to redraw the map — see settleComments below. */
    let rankedFrom = commentsByRestaurantRef.current;
    let ranked = rank(rankedFrom);

    /**
     * Catch the ranking up to whatever the votes have done since the last pass.
     *
     * Ranking by score is what makes a vote able to change which restaurants
     * get a bubble at all, so it may not be re-run when a vote lands — that is
     * the bubble-jumps-out-from-under-the-cursor bug. It is re-run on the next
     * PAN instead, where the whole map is being laid out again anyway and a
     * different selection reads as the map answering a new frame rather than
     * as the thing you clicked running away.
     *
     * Identity-gated on the comments object, so a pan with no votes behind it
     * costs one reference comparison and nothing else. Returns whether it moved,
     * because the embers have to settle on exactly the same pan: `bestScore`
     * reads the same vote scores, and a pin brightening while its bubble holds
     * still is a half-update that reads as a glitch.
     */
    const settleComments = () => {
      const latest = commentsByRestaurantRef.current;
      if (latest === rankedFrom) return false;
      rankedFrom = latest;
      ranked = rank(latest);
      return true;
    };

    // Greedily place bubbles in priority order (best-rated restaurants and
    // comments first), skipping any candidate whose screen-space box would
    // overlap one already placed — so the map never shows crowded, stacked
    // text no matter how close together restaurants are.
    function renderBubbles() {
      const zoom = map!.getZoom();
      /* A live search takes the whole bubble budget for what it matched: every
         match is a candidate (no coverage ration), each gets a deep stack (see
         SEARCH_BUBBLE_LIMIT), and nothing that didn't match is drawn at all.
         The embers underneath are untouched — the city stays lit, it just stops
         talking about everywhere the reader didn't ask about. */
      const matched = matchesRef.current;
      const drawing = matched
        ? ranked.filter((r) => matched.ids.has(r.id))
        : ranked.slice(0, Math.ceil(ranked.length * bubbleCoverageForZoom(zoom)));
      const limit = matched ? SEARCH_BUBBLE_LIMIT : bubbleLimitForZoom(zoom);
      /* The CARDS are laid out from the latest counts, not from the snapshot
         `ranked` was built against. The two are the same object on every path
         that settles first, and where they aren't this is the safe side of the
         difference: a marginally stale ORDER is invisible, whereas rebuilding a
         bubble from stale counts would print the number the reader's own vote
         just replaced and read as the vote coming undone. */
      const comments = commentsByRestaurantRef.current;
      for (const marker of bubbleMarkersRef.current) marker.remove();
      bubbleMarkersRef.current = [];
      /* Cleared with the markers, in the same synchronous breath, so the patch
         effect can never find an element that has already left the map. */
      bubbleElementsRef.current.clear();
      signsByRestaurantRef.current.clear();

      /* Rects carry their owner so a card can be tested against every OTHER
         restaurant's footprint and none of its own. That used to be an index
         comparison against where this stack began in `placed`, which only works
         while a stack is laid in one uninterrupted run — and the depth rounds
         below deliberately interleave them. Same rule, stated as what it
         actually means: the offsets already lay a stack out with a real gap, so
         testing a card against its own stack could only reject an authored
         position for grazing the one under it.

         `bareW` is the width before the neon sign widened it, so the crown can
         be handed from one card to the next without the reservation it made
         being left behind on a card that no longer wears it. */
      type PlacedRect = Rect & { owner: string; bareW: number };
      const placed: PlacedRect[] = [];

      type Stack = {
        restaurant: MapRestaurant;
        point: { x: number; y: number };
        /* Hottest first, so the first card placed — the one bubble a restaurant
           is guaranteed at any zoom, and the only one that draws a leader — is
           always the best recent thing anyone said about the place. */
        comments: MapComment[];
        /** Next comment to try. Survives across rounds. */
        next: number;
        /** Cards actually placed. */
        count: number;
        /** Offset of the last card placed, so a candidate skipped for colliding
         *  with a neighbour doesn't leave a hole in the stack above it. */
        lastOffsetY: number;
        topEl: HTMLElement | null;
        topRect: PlacedRect | null;
      };

      const stacks: Stack[] = drawing.map((restaurant) => ({
        restaurant,
        point: map!.project([restaurant.lng, restaurant.lat]),
        comments: [...(comments[restaurant.id] ?? [])].sort((a, b) =>
          compareBubbles(a, b, heatAt),
        ),
        next: 0,
        count: 0,
        lastOffsetY: BUBBLE_TOP_OFFSET,
        topEl: null,
        topRect: null,
      }));

      /* The sign crowns the stack — whichever card ended up highest, not the
         pin-nearest one, which read as the name wedged into the middle of the
         pile once stacks worked. Since cards now arrive one round at a time,
         the crown is handed upward as the stack grows: the previous top gives
         back the clearance and the width it was holding, and the new top takes
         them. Widening matters because the sign carries the plate score as well
         as the name and is regularly wider than the card under it. */
      function crown(stack: Stack) {
        const { restaurant, topEl, topRect } = stack;
        if (!topEl || !topRect) return;
        const box = topEl.querySelector<HTMLElement>(".map-bubble-box");
        box?.insertAdjacentHTML("afterbegin", signHtml(restaurant));
        const signEl = topEl.querySelector<HTMLElement>(".map-neon-sign");
        /* Register the stack's sign so hovering this restaurant's ember can
           make the name it ALREADY has answer, instead of printing a second
           copy of it beside itself. */
        if (signEl) signsByRestaurantRef.current.set(restaurant.id, signEl);
        topRect.y -= NEON_SIGN_CLEARANCE;
        topRect.h += NEON_SIGN_CLEARANCE;
        topRect.w = Math.max(topRect.bareW, estimateSignWidth(restaurant));
      }

      /** The exact inverse, so nothing the old top reserved outlives it. */
      function uncrown(stack: Stack) {
        const { topEl, topRect } = stack;
        if (!topEl || !topRect) return;
        topEl.querySelector(".map-neon-sign")?.remove();
        topRect.y += NEON_SIGN_CLEARANCE;
        topRect.h -= NEON_SIGN_CLEARANCE;
        topRect.w = topRect.bareW;
      }

      /**
       * Add up to `budget` more cards to one stack. Returns how many landed.
       *
       * Called with the whole limit for the unsearched map — which lays each
       * stack in one run, exactly as it always did — and one card at a time
       * under a search, which is what stops a chatty restaurant spending the
       * whole map before a quiet one has been named.
       */
      function grow(stack: Stack, budget: number) {
        const { restaurant, point, comments } = stack;
        let added = 0;
        while (added < budget && stack.count < limit && stack.next < comments.length) {
          const comment = comments[stack.next];
          stack.next++;
          const width = estimateBubbleWidth(comment, zoom);
          const height = bubbleHeight(comment);
          /* Offsets measure the box's TOP edge, so a card stacked above the
             last one has to clear that card's own height as well as the gap.
             Advancing by only the lower card's height (which is what this did)
             put every second card's box inside the footprint the card below it
             reserves, so it collided with its own stack and was dropped — no
             restaurant ever showed two comments at any zoom. */
          const offsetY =
            stack.count === 0
              ? BUBBLE_TOP_OFFSET
              : stack.lastOffsetY + height + BUBBLE_GAP;
          // The leader hangs below the box toward the pin, so it is part of the
          // footprint and nothing else may be placed over it. Only the
          // nearest-the-pin bubble draws one (see bubbleElement), so only its
          // rect grows — and it grows by exactly what that bubble will draw,
          // via the same leaderDrop() the drawing uses.
          /* The sign is NOT reserved here: it crowns the stack, not this card,
             and which card ends up on top isn't known until the stack is laid.
             `crown` below grows whichever rect ends up highest. */
          const rect: PlacedRect = {
            owner: restaurant.id,
            x: point.x + 12,
            y: point.y - offsetY,
            w: width,
            bareW: width,
            h: height + (stack.count === 0 ? leaderDrop(comment, offsetY) : 0),
          };
          if (placed.some((r) => r.owner !== restaurant.id && rectsOverlap(rect, r))) continue;
          placed.push(rect);

          const el = bubbleElement(
            comment,
            offsetY,
            zoom,
            stack.count,
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
            /* Replies are the one chip that leaves the map — a thread cannot be
               read in a bubble. It lands on the post the same way the card body
               does; the branch exists so the click can't fall through to the
               dish-reference test below and open a menu entry instead. */
            if (target.closest(".map-reply-chip")) {
              if (comment.postId) router.push(`/feed?post=${comment.postId}`);
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
          /* Registered here, beside the marker, because these two are the same
             fact seen from two sides: the marker is how the map takes the
             bubble away, this is how a vote reaches into the one that is still
             there. Keyed by restaurant AND comment — see bubbleKey. */
          bubbleElementsRef.current.set(bubbleKey(restaurant.id, comment.id), el);

          /* Only the nearest-the-pin bubble grows a leader, and it hangs
             *below* that box, toward the pin — never up into the gap — so
             padding every step of the stack for it would spread the cards
             apart for nothing. The gap itself is applied where the next
             card's offset is computed, off this one's. */
          uncrown(stack);
          stack.lastOffsetY = offsetY;
          stack.topEl = el;
          stack.topRect = rect;
          stack.count++;
          crown(stack);
          added++;
        }
        return added;
      }

      /* Breadth before depth, and only under a search does the difference show.
         The unsearched map lays each stack in one run (`grow` with the whole
         limit), which is what it has always done and what the zoom rations are
         tuned against.

         A search cannot afford that. `drawing` is ordered by hottest bubble, so
         a single restaurant with eight posts would lay eight cards — a wall
         roughly the height of the map — before the second match was even
         considered, and every other match in that half of the county would then
         collide against it and vanish. Which is precisely what happened once
         the feed started carrying two months of posts: searching "mexican"
         returned one restaurant's stack covering the frame and hiding the other
         seventy-five. So each round offers every match exactly one more card,
         and the rounds stop as soon as one passes with nothing placed. Everyone
         gets named first; the chatty places get their depth out of what's
         left. */
      for (const stack of stacks) {
        if (grow(stack, matched ? 1 : limit) === 0 && matched) placeSignOnly(stack);
      }
      if (matched) {
        for (let round = 1; round < limit; round++) {
          let any = false;
          for (const stack of stacks) if (grow(stack, 1) > 0) any = true;
          if (!any) break;
        }
      }

      /* Matched, but it got no bubble — either nobody has said anything about
         it, or its one candidate collided with a neighbour's stack. Under a
         search that still has to be visible: the reader asked where these
         places ARE, and a silent one dropping off the answer reads as the
         search having missed it. So it signs its name on its own.

         Called in the breadth round, not after all the depth rounds, so a bare
         name competes for space against every match's FIRST card rather than
         against a map already full of second and third ones. What somebody
         actually said still outranks a bare name — the stack that got there
         first keeps its ground — but a quiet restaurant is no longer last in
         line behind the chatty ones' extra cards. */
      function placeSignOnly(stack: Stack) {
        const { restaurant, point } = stack;
        /* It carries a leader but no pointer events; the ember under it is the
           click target, the same as for a restaurant with no bubble on the
           unsearched map.

           The rect runs from the sign's top edge all the way down to the pin,
           because the leader hangs in that gap and nothing may be placed over
           the thread — the same footprint rule the stack's own leader gets. */
        const signWidth = estimateSignWidth(restaurant);
        const signRect: PlacedRect = {
          owner: restaurant.id,
          x: point.x + SIGN_ONLY_OFFSET_X,
          y: point.y - SIGN_ONLY_OFFSET_Y - NEON_SIGN_CLEARANCE,
          w: signWidth,
          bareW: signWidth,
          h: NEON_SIGN_CLEARANCE + SIGN_ONLY_OFFSET_Y,
        };
        if (placed.some((r) => rectsOverlap(signRect, r))) return;
        placed.push(signRect);
        const el = signOnlyElement(restaurant, zoom);
        const marker = new Marker({ element: el, anchor: "top-left" })
          .setLngLat([restaurant.lng, restaurant.lat])
          .addTo(map!);
        bubbleMarkersRef.current.push(marker);
        const signEl = el.querySelector<HTMLElement>(".map-neon-sign");
        if (signEl) signsByRestaurantRef.current.set(restaurant.id, signEl);
      }
    }

    /* Which bubble set is on the map, published only now that one actually is.
       The patch effect reads it to decide whether the elements it is holding
       are the ones its data describes; leaving it null while nothing has been
       drawn is what makes "no pass yet" and "a different pass" the same, safe
       answer there. */
    drawnBubbleSetRef.current = bubbleSetKey;

    renderBubbles();
    /* A pan is where the votes cast since the last pass are allowed to change
       the map: the ranking catches up, and the embers catch up with it in the
       same frame — brightening a pin while its bubble held still would be a
       half-update, and a bubble jumping on a pan reads as the map answering a
       new frame rather than as the thing you just clicked running away. With
       no votes behind it this costs one reference comparison. */
    const handleMoveEnd = () => {
      if (settleComments()) applyPinData();
      renderBubbles();
    };
    map.on("moveend", handleMoveEnd);
    /* Published for the search field's sake — see matchesRef above. Reassigned
       on every run of this effect so the handle is never a closure over a
       torn-down pass.

       Both halves, in this order: the embers say WHICH restaurants the answer
       is about and the bubbles say what is being said about them, so a redraw
       that did one without the other would leave labels over dark dots or lit
       dots with nothing to read. The pins are repainted unconditionally here
       (the search changes every feature's `dim`), so settleComments only has
       to bring the ranking along. */
    redrawForSearchRef.current = () => {
      settleComments();
      applyPinData();
      renderBubbles();
    };

    return () => {
      map.off("load", applyPinData);
      map.off("moveend", handleMoveEnd);
      redrawForSearchRef.current = null;
    };
    /* `bubbleSetKey`, NOT `commentsByRestaurant`. The prop is a fresh object on
       every vote and it used to sit here, which is what made a vote tear the
       map down and lay it out from a re-ranked, re-sliced set of restaurants —
       the bubble jumping out from under the cursor. The key changes only when
       something a vote cannot change does, so a genuine feed change (a new page
       of posts, a reply landing, a menu resolving a dish link) still rebuilds
       everything exactly as before. The data itself is read through
       commentsByRestaurantRef. */
  }, [restaurants, districtDensity, bubbleSetKey, router, mode, canUpvote, canHeart]);

  /* The wrapper is only a positioning context for the search field, which has
     to sit over the map without being inside the map's own container — MapLibre
     binds its gesture handlers to the canvas container, and a field living in
     there would hand every wheel and drag over the input to the map.

     `overflow-hidden` moved onto the map container itself when this wrapper
     arrived. The host (`src/app/feed/page.tsx`) used to supply it with
     `[&>div]:overflow-hidden`, which now names this wrapper instead — leaving
     the canvas free to square off the corners the `rounded-xl` below rounds.
     A component that needs to clip itself should say so itself anyway. */
  return (
    <div className="relative">
      <div ref={containerRef} className="map-fun-tiles h-[540px] w-full overflow-hidden rounded-xl" />
      <SearchField mapRef={mapRef} onMatchesChange={handleMatchesChange} />
    </div>
  );
}
