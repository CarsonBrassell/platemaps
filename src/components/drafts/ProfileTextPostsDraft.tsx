"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ChatIcon, CloseIcon, MoreIcon, VoteArrowUpIcon, VoteArrowDownIcon } from "@/components/icons";
import { initials, avatarPalette, postedDate } from "@/lib/format";
import { chillRamp, heatFor, heatRamp, isPerfect } from "@/components/post/PercentMeter";

/**
 * DRAFT — the profile's *photoless* plates: how a post that is only words
 * sits in the "All posts" grid, and what it opens into.
 *
 * Today a words-only plate is a blank tone square with `▲ 3 · 94%` under it:
 * the tone block DESIGN.md prescribes for a *missing* photo, standing in for
 * a post whose strongest thing is what was written. The photo tiles have been
 * tuned; these have not.
 *
 * The idea every treatment here shares: **a photo post shows its photo, a
 * words post shows its words** — small, in the human voice, shorter than any
 * photo beside it, and packed into the two-column collage Discover already
 * uses, so a text tile's height comes from how much was said the way a photo
 * tile's comes from its aspect. The one display-face mark is the opening
 * quotation glyph: Fraunces draws the punctuation, the person's prose stays
 * in sans (DESIGN.md's three-voice rule).
 *
 * Nothing here is wired into the product. Real photo plates come from the
 * feed when the page can reach it; the words are sample copy so the same
 * sentences appear in every treatment. Delete the route once a pair is
 * picked; the tile moves into `ProfileShelves` and the open state into
 * `PlateDetailSheet`, which both trees share.
 */

export type DraftPost = {
  id: string;
  text: string;
  restaurant?: string;
  dishName?: string;
  rating?: number;
  ratingKind?: "restaurant" | "dish";
  upvoteCount: number;
  downvoteCount: number;
  createdAt: string;
  media?: { url: string; type: "image" | "video"; alt?: string }[];
  comments?: { id: string; authorName: string; text: string; createdAt: string }[];
  /** Layout only: the aspect a photo tile is drawn at, so packing is predictable. */
  aspect?: number;
};

export type FeedPost = {
  id: string;
  text: string;
  restaurant?: string;
  dishName?: string;
  rating?: number;
  ratingKind?: "restaurant" | "dish";
  upvoteCount: number;
  downvoteCount?: number;
  createdAt: string;
  media?: { url: string; type: "image" | "video"; alt?: string }[];
};

/* ------------------------------------------------------------------ */
/* Sample words                                                        */
/* ------------------------------------------------------------------ */

export const WORDS: DraftPost[] = [
  {
    id: "w1",
    text: "Carnitas were falling apart the way they should, and the salsa verde is the real deal. Skip the rice.",
    restaurant: "Las Cuatro Milpas",
    dishName: "Carnitas plate",
    rating: 94,
    ratingKind: "dish",
    upvoteCount: 12,
    downvoteCount: 1,
    createdAt: "2026-08-12T19:20:00Z",
    comments: [
      { id: "c1", authorName: "Maya Ortiz", text: "The rice is the best part, what are you talking about", createdAt: "2026-08-12T21:02:00Z" },
      { id: "c2", authorName: "Dev Patel", text: "Went Saturday on this rec. Correct about the salsa.", createdAt: "2026-08-15T01:14:00Z" },
    ],
  },
  {
    id: "w2",
    text: "Line moved fast. Batter thin and crisp, cabbage still cold.",
    restaurant: "Oscar's Mexican Seafood",
    dishName: "Fish taco",
    rating: 88,
    ratingKind: "dish",
    upvoteCount: 7,
    downvoteCount: 0,
    createdAt: "2026-09-02T02:10:00Z",
    comments: [],
  },
  {
    id: "w3",
    text: "Ordered the birria plate, the consomé came out scalding which is how it should be. Tortillas are handmade — you can tell by the char. Would come back on a weekday to skip the wait.",
    restaurant: "Tuetano Taqueria",
    dishName: "Birria plate",
    rating: 92,
    ratingKind: "dish",
    upvoteCount: 27,
    downvoteCount: 2,
    createdAt: "2026-07-30T18:45:00Z",
    comments: [
      { id: "c3", authorName: "Sam Reyes", text: "The weekday tip is real. 10 min wait at 11:30.", createdAt: "2026-07-31T19:00:00Z" },
      { id: "c4", authorName: "Jules Kim", text: "Did you try the marrow?", createdAt: "2026-08-01T00:31:00Z" },
      { id: "c5", authorName: "Maya Ortiz", text: "Adding this to the list", createdAt: "2026-08-03T17:12:00Z" },
    ],
  },
  {
    id: "w4",
    text: "Good room, loud after 8. Service was attentive without hovering.",
    restaurant: "Juniper & Ivy",
    rating: 4,
    ratingKind: "restaurant",
    upvoteCount: 3,
    downvoteCount: 0,
    createdAt: "2026-06-21T03:30:00Z",
    comments: [{ id: "c6", authorName: "Dev Patel", text: "Loud is generous", createdAt: "2026-06-22T15:00:00Z" }],
  },
  {
    id: "w5",
    text: "Best croissant in North Park and it isn't close.",
    restaurant: "Wayfarer Bread",
    dishName: "Croissant",
    rating: 97,
    ratingKind: "dish",
    upvoteCount: 19,
    downvoteCount: 0,
    createdAt: "2026-09-09T16:05:00Z",
    comments: [],
  },
  {
    id: "w6",
    text: "Cold brew is watery. Pastries are great though.",
    restaurant: "Dark Horse Coffee",
    rating: 3,
    ratingKind: "restaurant",
    upvoteCount: 1,
    downvoteCount: 1,
    createdAt: "2025-11-03T17:40:00Z",
    comments: [],
  },
];

/** Stand-ins when the feed is unreachable — tone blocks at photo aspects. */
export const PHOTO_FALLBACK: DraftPost[] = [
  { id: "p1", text: "", restaurant: "Callie", dishName: "Lamb tagine", rating: 91, ratingKind: "dish", upvoteCount: 22, downvoteCount: 1, createdAt: "2026-08-20T02:00:00Z", aspect: 4 / 5 },
  { id: "p2", text: "", restaurant: "Menya Ultra", dishName: "Tonkotsu", rating: 84, ratingKind: "dish", upvoteCount: 9, downvoteCount: 0, createdAt: "2026-08-01T04:00:00Z", aspect: 1 },
  { id: "p3", text: "", restaurant: "Buona Forchetta", dishName: "Margherita", rating: 89, ratingKind: "dish", upvoteCount: 14, downvoteCount: 2, createdAt: "2026-07-14T03:00:00Z", aspect: 5 / 4 },
  { id: "p4", text: "", restaurant: "Morning Glory", dishName: "Souffle pancakes", rating: 78, ratingKind: "dish", upvoteCount: 5, downvoteCount: 3, createdAt: "2026-06-02T17:00:00Z", aspect: 4 / 5 },
  { id: "p5", text: "", restaurant: "Cesarina", dishName: "Cacio e pepe", rating: 95, ratingKind: "dish", upvoteCount: 31, downvoteCount: 0, createdAt: "2026-05-11T02:00:00Z", aspect: 1 },
];

export const ASPECTS = [4 / 5, 1, 5 / 4, 4 / 5, 1];

/* ------------------------------------------------------------------ */
/* Shared helpers — copied, not exported out of shipping components    */
/* ------------------------------------------------------------------ */

export const isWords = (p: DraftPost) => !p.media?.some((m) => m.type === "image") && !p.aspect;
export const nameOf = (p: DraftPost) => p.dishName ?? p.restaurant ?? p.text;
const pctOf = (p: DraftPost) =>
  p.ratingKind === "dish" && p.rating != null ? Math.round(p.rating) : null;
const metaOf = (p: DraftPost) => {
  const pct = pctOf(p);
  return `▲ ${p.upvoteCount}${pct !== null ? ` · ${pct}%` : ""}`;
};

/** Interleave words between photos so every collage has both kinds throughout. */
export function mix(photos: DraftPost[], words: DraftPost[]) {
  const out: DraftPost[] = [];
  const order = [0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0]; // 0 = photo, 1 = words
  let pi = 0;
  let wi = 0;
  for (const kind of order) {
    if (kind === 0 && pi < photos.length) out.push(photos[pi++]);
    else if (wi < words.length) out.push(words[wi++]);
    else if (pi < photos.length) out.push(photos[pi++]);
  }
  return out;
}

/**
 * Shortest-column-first packing, like lib/photoShape's, but with a height
 * estimate for words tiles — a line of 12px sans at ~170px holds ~30 chars.
 */
export function pack(items: DraftPost[], estimate: (p: DraftPost) => number) {
  const columns: DraftPost[][] = [[], []];
  const heights = [0, 0];
  for (const item of items) {
    const i = heights[0] <= heights[1] ? 0 : 1;
    columns[i].push(item);
    heights[i] += estimate(item) + 8;
  }
  return columns;
}

/** Photo tile — the shipped white frame with the photo inset; unchanged. */
export function PhotoTile({ post, tone }: { post: DraftPost; tone: number }) {
  const photo = post.media?.find((m) => m.type === "image");
  const pct = pctOf(post);
  return (
    <div className="rounded-xl bg-white p-1.5 pb-1.5">
      <div
        className="relative w-full overflow-hidden rounded-lg"
        style={{ aspectRatio: String(post.aspect ?? 1), background: `var(--pm-tone-${tone})` }}
      >
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
      <span className="mt-1 block font-mono text-[9.5px] tabular-nums text-pm-orange-text">
        ▲ {post.upvoteCount}
        {pct !== null && ` · ${pct}%`}
      </span>
      <Activity post={post} />
    </div>
  );
}

function Activity({ post }: { post: DraftPost }) {
  const n = post.comments?.length ?? 0;
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-[3px] font-mono text-[9px] tabular-nums text-zinc-500">
      {n > 0 && (
        <>
          <ChatIcon className="h-2.5 w-2.5 shrink-0" />
          <span className="mr-1">{n}</span>
        </>
      )}
      {postedDate(post.createdAt)}
    </span>
  );
}

function HeatPercent({ pct, size }: { pct: number; size: string }) {
  return (
    <span
      data-heat={heatFor(pct)}
      style={{ "--heat": heatRamp(pct), "--chill": chillRamp(pct) } as CSSProperties}
      className={`pct-heat font-mono ${size} font-bold leading-none tabular-nums ${
        isPerfect(pct) ? "pct-shine" : ""
      }`}
    >
      {pct}%
    </span>
  );
}

/** Stars for a restaurant-rated plate — never a percent (rating invariant). */
function Stars({ n }: { n: number }) {
  return (
    <span className="font-mono text-[9.5px] tabular-nums text-zinc-600">
      {"★".repeat(n)}
      <span className="text-zinc-300">{"★".repeat(5 - n)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Tile treatments for a words-only plate                              */
/* ------------------------------------------------------------------ */

/** NOW — the shipped blank tone square. */
export function TileNow({ post, tone }: { post: DraftPost; tone: number }) {
  return (
    <div className="rounded-xl bg-white p-1.5 pb-1.5">
      <div className="block aspect-square w-full rounded-lg" style={{ background: `var(--pm-tone-${tone})` }} />
      <span className="mt-1 block font-mono text-[9.5px] tabular-nums text-pm-orange-text">{metaOf(post)}</span>
      <Activity post={post} />
    </div>
  );
}

/**
 * A — Clipping. The words on a tone block, with Fraunces drawing the opening
 * quote as the tile's one mark. Height follows the text (3 lines max), so a
 * short remark is a short tile. Restaurant tucked under as the caption.
 */
export function TileClipping({ post, tone }: { post: DraftPost; tone: number }) {
  const pct = pctOf(post);
  return (
    <div className="rounded-xl bg-white p-1.5 pb-1.5">
      <div className="relative rounded-lg px-2.5 pb-2 pt-4" style={{ background: `var(--pm-tone-${tone})` }}>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1.5 top-0 select-none font-display text-[30px] font-bold leading-none text-zinc-900/20"
        >
          “
        </span>
        <p className="line-clamp-3 text-[12px] leading-[1.35] text-zinc-800">{post.text}</p>
        <p className="mt-1.5 truncate font-display text-[11px] font-semibold leading-tight text-zinc-900">
          {post.restaurant}
        </p>
      </div>
      <span className="mt-1 flex items-center gap-1 font-mono text-[9.5px] tabular-nums text-pm-orange-text">
        ▲ {post.upvoteCount}
        {pct !== null ? ` · ${pct}%` : post.ratingKind === "restaurant" && post.rating != null ? <><span className="text-zinc-300">·</span><Stars n={post.rating} /></> : null}
      </span>
      <Activity post={post} />
    </div>
  );
}

/**
 * B — Slip. The smallest. A white card, two lines of words and a mono byline
 * — restaurant as a compact reference, in the byline voice the feed card
 * already uses. No tone, no mark: a words tile is simply less than a photo,
 * and reads that way in the collage.
 */
export function TileSlip({ post }: { post: DraftPost }) {
  const pct = pctOf(post);
  return (
    <div className="rounded-xl bg-white px-2.5 pb-2 pt-2">
      <p className="line-clamp-2 text-[12px] leading-[1.35] text-zinc-800">{post.text}</p>
      <p className="mt-1.5 truncate font-mono text-[9.5px] tabular-nums text-zinc-500">
        {post.restaurant}
      </p>
      <span className="mt-0.5 block font-mono text-[9.5px] tabular-nums text-pm-orange-text">
        ▲ {post.upvoteCount}
        {pct !== null && ` · ${pct}%`}
      </span>
      <Activity post={post} />
    </div>
  );
}

/**
 * C — Score-led. The verdict first: the percent in the feed's heat, the dish
 * named in Fraunces, the words as two quiet lines under it. Reads as a rating
 * that happens to have a note, which is what a words-only dish rating is.
 */
export function TileScore({ post, tone }: { post: DraftPost; tone: number }) {
  const pct = pctOf(post);
  return (
    <div className="rounded-xl bg-white p-1.5 pb-1.5">
      <div className="rounded-lg px-2.5 pb-2.5 pt-2.5" style={{ background: `var(--pm-tone-${tone})` }}>
        {pct !== null ? (
          <HeatPercent pct={pct} size="text-[20px]" />
        ) : (
          <span className="font-mono text-[14px] font-bold tabular-nums text-zinc-700">
            {post.rating}<span className="text-zinc-400">/5</span>
          </span>
        )}
        <p className="mt-1 truncate font-display text-[12px] font-semibold leading-tight text-zinc-900">
          {nameOf(post)}
        </p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-[1.35] text-zinc-600">{post.text}</p>
      </div>
      <span className="mt-1 block font-mono text-[9.5px] tabular-nums text-pm-orange-text">▲ {post.upvoteCount}</span>
      <Activity post={post} />
    </div>
  );
}

export type TileKind = "now" | "clipping" | "slip" | "score";

export function estimateFor(kind: TileKind, cell: number) {
  const lineChars = Math.max(18, Math.round(cell / 6.2));
  return (p: DraftPost) => {
    if (!isWords(p)) return cell / (p.aspect ?? 1) + 40;
    if (kind === "now") return cell + 40;
    const lines = Math.ceil(p.text.length / lineChars);
    if (kind === "clipping") return 16 + Math.min(lines, 3) * 16 + 20 + 12 + 40;
    if (kind === "slip") return 8 + Math.min(lines, 2) * 16 + 14 + 14 + 22;
    return 10 + 22 + 16 + Math.min(lines, 2) * 15 + 12 + 34;
  };
}

/** A 390px profile column: the "All posts" label and the two-column collage. */
export function Collage({ posts, kind, onOpen, framed = true }: { posts: DraftPost[]; kind: TileKind; onOpen?: (post: DraftPost) => void; framed?: boolean }) {
  const columns = pack(posts, estimateFor(kind, 170));
  return (
    <div className={framed ? "w-[390px] shrink-0 rounded-2xl bg-[#F7F4EC] px-4 pb-6 pt-4 ring-1 ring-zinc-900/5" : ""}>
      <p className="mono-label mb-2.5 text-zinc-900">{`All posts · ${posts.length}`}</p>
      <div className="grid grid-cols-2 items-start gap-2">
        {columns.map((column, ci) => (
          <div key={ci} className="grid auto-rows-min content-start gap-2">
            {column.map((post, i) => {
              const tone = ((i + ci * 2) % 3) + 1;
              if (!isWords(post)) return <PhotoTile key={post.id} post={post} tone={tone} />;
              const tile =
                kind === "now" ? <TileNow post={post} tone={tone} />
                : kind === "clipping" ? <TileClipping post={post} tone={tone} />
                : kind === "slip" ? <TileSlip post={post} />
                : <TileScore post={post} tone={tone} />;
              if (!onOpen) return <span key={post.id}>{tile}</span>;
              return (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => onOpen(post)}
                  aria-label={`Open ${nameOf(post)}`}
                  className="block w-full rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  {tile}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The shipped 76px square grid, for the before shot. */
export function CurrentGrid({ posts }: { posts: DraftPost[] }) {
  return (
    <div className="w-[390px] shrink-0 rounded-2xl bg-[#F7F4EC] px-4 pb-6 pt-4 ring-1 ring-zinc-900/5">
      <p className="mono-label mb-2.5 text-zinc-900">{`All posts · ${posts.length}`}</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">
        {posts.map((post, i) => {
          const tone = ((i + 2) % 3) + 1;
          const photo = post.media?.find((m) => m.type === "image");
          return (
            <div key={post.id} className="rounded-xl bg-white p-1.5 pb-1.5">
              <div className="relative aspect-square w-full overflow-hidden rounded-lg" style={{ background: `var(--pm-tone-${tone})` }}>
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                )}
              </div>
              <span className="mt-1 block font-mono text-[9.5px] tabular-nums text-pm-orange-text">{metaOf(post)}</span>
              <Activity post={post} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The open state — what a words plate becomes when tapped             */
/* ------------------------------------------------------------------ */

const HEARTS = ["Maya Ortiz", "Sam Reyes", "Jules Kim"];

function Faces() {
  return (
    <span className="flex -space-x-1.5">
      {HEARTS.map((n) => (
        <span
          key={n}
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white font-mono text-[9px] font-semibold text-[#F7F4EC] ${avatarPalette(n).avatarBg}`}
        >
          {initials(n)}
        </span>
      ))}
    </span>
  );
}

function Dots() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pm-grey-tint text-pm-grey-text">
      <MoreIcon className="h-4 w-4" />
    </span>
  );
}

function Votes({ post, size = "text-[13px]" }: { post: DraftPost; size?: string }) {
  return (
    <span className={`flex items-center gap-1 font-mono ${size} tabular-nums text-zinc-700`}>
      <VoteArrowUpIcon className="h-4 w-4 text-zinc-700" />
      {post.upvoteCount - post.downvoteCount}
      <VoteArrowDownIcon className="ml-0.5 h-4 w-4 text-zinc-400" />
    </span>
  );
}

function ScoreLine({ post }: { post: DraftPost }) {
  const pct = pctOf(post);
  return (
    <div className="flex items-center gap-2 font-mono text-[13px] tabular-nums text-zinc-700">
      <Votes post={post} />
      {pct !== null && (
        <>
          <span aria-hidden="true" className="text-zinc-400">·</span>
          <span className="text-pm-orange-text">{pct}%</span>
        </>
      )}
      <span aria-hidden="true" className="text-zinc-400">·</span>
      <span className="text-zinc-500">3 likes</span>
      <span aria-hidden="true" className="text-zinc-400">·</span>
      <span className="text-zinc-500">{postedDate(post.createdAt)}</span>
    </div>
  );
}

function Thread({ post }: { post: DraftPost }) {
  const comments = post.comments ?? [];
  return (
    <>
      <p className="mono-label mb-2 text-zinc-500">
        {comments.length > 0 ? `${comments.length} comments` : "Comments"}
      </p>
      <ul className="flex flex-col gap-2">
        {comments.map((c) => (
          <li key={c.id} className="flex items-start gap-2.5 rounded-xl bg-pm-grey-tint/40 px-3 py-2.5">
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold text-[#F7F4EC] ${avatarPalette(c.authorName).avatarBg}`}
            >
              {initials(c.authorName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-semibold text-zinc-900">{c.authorName}</span>
                <span className="font-mono text-[10px] text-zinc-500">{postedDate(c.createdAt)}</span>
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-zinc-700">{c.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The Dialog's sheet chrome at phone width, drawn static so states sit side by side. */
export type OpenKind = "now" | "quote" | "tone" | "verdict";

/** The sheet title each open treatment wants — the dish, or for Verdict the restaurant. */
export function openTitle(kind: OpenKind, post: DraftPost) {
  return kind === "verdict" ? (post.restaurant ?? nameOf(post)) : nameOf(post);
}

export function OpenBody({ kind, post }: { kind: OpenKind; post: DraftPost }) {
  if (kind === "now") return <OpenNow post={post} />;
  if (kind === "quote") return <OpenQuote post={post} />;
  if (kind === "tone") return <OpenTone post={post} />;
  return <OpenVerdict post={post} />;
}

export function Sheet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative h-[760px] w-[390px] shrink-0 overflow-hidden rounded-2xl bg-[#F7F4EC] ring-1 ring-zinc-900/5">
      <div className="absolute inset-0 bg-pm-charcoal/45" />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[92%] flex-col rounded-t-2xl bg-white">
        <div className="shrink-0 border-b border-zinc-100 px-5 pb-3 pt-3">
          <div className="flex items-center gap-3">
            <h2 className="min-w-0 flex-1 truncate font-display text-base font-semibold text-zinc-900">{title}</h2>
            <span className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-500">
              <CloseIcon className="h-5 w-5" />
            </span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        <div className="shrink-0 border-t border-zinc-100 bg-white px-5 py-3">
          <div className="flex items-end gap-2">
            <span className="flex min-h-11 flex-1 items-center rounded-full bg-pm-grey-tint/60 px-4 text-sm text-pm-grey-text">
              Add a comment…
            </span>
            <span className="flex min-h-11 items-center rounded-full bg-pm-orange px-4 text-sm font-medium text-[#F7F4EC] opacity-40">
              Post
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** NOW — the shipped sheet for a photoless plate. */
export function OpenNow({ post }: { post: DraftPost }) {
  return (
    <div className="px-4 pb-5 pt-1">
      <div className="mb-3 flex items-start justify-between gap-2">
        <Dots />
        <span className="flex items-center gap-1.5 rounded-full bg-pm-grey-tint/60 py-1 pl-1.5 pr-3">
          <Faces />
          <span className="font-mono text-[11px] text-zinc-600">3</span>
        </span>
      </div>
      {post.dishName && post.restaurant && <p className="mb-1 text-[13px] text-zinc-500">{post.restaurant}</p>}
      <div className="mb-3"><ScoreLine post={post} /></div>
      <p className="mb-4 whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-800">{post.text}</p>
      <Thread post={post} />
    </div>
  );
}

/**
 * 1 — Pull quote. The words take the photo's job: set large with generous
 * leading, the Fraunces quote hanging in the margin, the restaurant as the
 * caption under them. Score line and thread below, as today. The title is
 * the dish, as the tile named it.
 */
export function OpenQuote({ post }: { post: DraftPost }) {
  return (
    <div className="px-4 pb-5 pt-2">
      <div className="mb-3 flex items-start justify-between gap-2">
        <Dots />
        <span className="flex items-center gap-1.5 rounded-full bg-pm-grey-tint/60 py-1 pl-1.5 pr-3">
          <Faces />
          <span className="font-mono text-[11px] text-zinc-600">3</span>
        </span>
      </div>
      <div className="relative pl-6 pt-1">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-2 left-0 select-none font-display text-[44px] font-bold leading-none text-zinc-900/20"
        >
          “
        </span>
        <p className="text-[19px] leading-[1.4] text-zinc-900">{post.text}</p>
        <p className="mt-3 font-display text-[14px] font-semibold text-zinc-900">
          {post.restaurant}
          {post.dishName && <span className="font-mono text-[11px] font-normal text-zinc-500"> · {post.dishName}</span>}
        </p>
      </div>
      <div className="mb-5 mt-4"><ScoreLine post={post} /></div>
      <Thread post={post} />
    </div>
  );
}

/**
 * 2 — The tile, grown up. The same tone block the Clipping tile drew, now
 * full width where the photo would sit, with the hearts pinned in its corner
 * the way they pin to a photo. The tap does not change what you are looking
 * at; it brings it closer. Everything below is the shipped sheet.
 */
export function OpenTone({ post }: { post: DraftPost }) {
  return (
    <div className="px-4 pb-5 pt-1">
      <div className="relative mb-3">
        <div className="relative overflow-hidden rounded-xl px-5 pb-5 pt-9" style={{ background: "var(--pm-tone-2)" }}>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1 select-none font-display text-[48px] font-bold leading-none text-zinc-900/20"
          >
            “
          </span>
          <p className="text-[16px] leading-[1.45] text-zinc-800">{post.text}</p>
          <p className="mt-4 font-display text-[13px] font-semibold text-zinc-900">{post.restaurant}</p>
          <span className="absolute bottom-3 right-3 flex flex-col items-center gap-0.5">
            <span className="flex flex-col -space-y-1.5">
              {HEARTS.map((n) => (
                <span
                  key={n}
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white font-mono text-[9px] font-semibold text-[#F7F4EC] ${avatarPalette(n).avatarBg}`}
                >
                  {initials(n)}
                </span>
              ))}
            </span>
          </span>
        </div>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2"><ScoreLine post={post} /><Dots /></div>
      <Thread post={post} />
    </div>
  );
}

/**
 * 3 — Verdict first. The score leads, at feed size in heat, beside the
 * restaurant and dish in Fraunces; the words sit under it as a note card on a
 * cream well, labelled the way the dish sheet labels its sections. Closest to
 * the Score-led tile, and the one that treats a words plate as a rating.
 */
export function OpenVerdict({ post }: { post: DraftPost }) {
  const pct = pctOf(post);
  return (
    <div className="px-4 pb-5 pt-3">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[22px] font-semibold leading-tight tracking-tight text-zinc-900">
            {post.dishName ?? post.restaurant}
          </p>
          {post.dishName && <p className="mt-0.5 text-[13px] text-zinc-500">{post.restaurant}</p>}
        </div>
        {pct !== null && <HeatPercent pct={pct} size="text-[34px]" />}
      </div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <ScoreLine post={post} />
        <Dots />
      </div>
      <div className="mb-4 rounded-xl bg-[#F7F4EC] p-3">
        <p className="mono-label mb-2 text-zinc-500">What you said</p>
        <div className="rounded-lg bg-white px-3.5 py-3">
          <p className="text-[14px] leading-relaxed text-zinc-800">{post.text}</p>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="font-mono text-[10px] text-zinc-500">{postedDate(post.createdAt)}</span>
            <span className="flex items-center gap-1.5">
              <Faces />
              <span className="font-mono text-[10px] text-zinc-500">3 likes</span>
            </span>
          </div>
        </div>
      </div>
      <Thread post={post} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Block({ letter, name, note, children }: { letter: string; name: string; note: string; children: ReactNode }) {
  return (
    <section className="mb-12">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-[13px] tabular-nums text-pm-orange-text">{letter}</span>
        <h2 className="font-display text-xl font-semibold text-zinc-900">{name}</h2>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-pm-grey-text">{note}</p>
      {children}
    </section>
  );
}


/** Real photo plates from the feed (yours when signed in), with a cycled aspect so packing is predictable. */
export function usePhotoPlates(account: unknown) {
  const [photos, setPhotos] = useState<DraftPost[]>(PHOTO_FALLBACK);
  useEffect(() => {
    fetch(account ? "/api/posts?mine=1" : "/api/posts")
      .then((r) => r.json())
      .then((d: { posts: FeedPost[] }) => {
        const withPhoto = d.posts
          .filter((p) => p.media?.some((m) => m.type === "image"))
          .slice(0, 5)
          .map((p, i) => ({ ...p, downvoteCount: p.downvoteCount ?? 0, comments: [], aspect: ASPECTS[i % ASPECTS.length] }));
        if (withPhoto.length >= 3) setPhotos(withPhoto);
      })
      .catch(() => {});
  }, [account]);
  return photos;
}
