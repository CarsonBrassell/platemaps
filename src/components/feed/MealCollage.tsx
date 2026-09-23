"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { chillRamp, heatFor, heatRamp, isPerfect } from "@/components/post/PercentMeter";
import type { PostMedia } from "./types";

/**
 * One frame of the collage: a plate's photo plus the facts printed under it.
 * The hero post and its courses are both flattened into this before they get
 * here, so the collage never has to know which frame is the row that owns
 * the card.
 */
export type CollagePlate = {
  id: string;
  dishName?: string;
  /** The menu line this plate matched, when it matched one. */
  dishId?: string;
  price?: string;
  rating?: number;
  media: PostMedia[];
};

/** A collage past this is a contact sheet; the route caps writes to match. */
export const MAX_COLLAGE_PLATES = 6;

/*
 * Every plate is a photo, bricked edge to edge, with its name, percent and
 * price printed over its lower edge on a soft shadow — the name in the
 * display face, the numbers in mono, as everywhere else in the app.
 *
 * Geometry is in frame units, 300 across, and drawn in `cqw` so it scales
 * with the card. Bands stack top to bottom; each band is columns; each column
 * is tiles of [plate, weight], weight being the tile's share of the column's
 * photo height. Slot 0 is the hero — the best-rated plate — and it takes the
 * widest column, swapping sides as the count grows so consecutive meals in a
 * feed don't all lean the same way.
 */
type Column = { w: number; t: [number, number][] };
type Layout = { bands: Column[][]; caps?: number[] };
const LAYOUTS: Record<number, Layout> = {
  1: { bands: [[{ w: 300, t: [[0, 1]] }]] },
  2: { bands: [[{ w: 165, t: [[0, 1]] }, { w: 135, t: [[1, 1]] }]] },
  3: { bands: [[{ w: 120, t: [[1, 1], [2, 1]] }, { w: 180, t: [[0, 1]] }]] },
  4: { bands: [[{ w: 165, t: [[0, 225], [2, 175]] }, { w: 135, t: [[1, 175], [3, 225]] }]] },
  5: { bands: [[{ w: 130, t: [[1, 1], [2, 1], [3, 1]] }, { w: 170, t: [[0, 225], [4, 175]] }]] },
  6: {
    caps: [240, 160],
    bands: [
      [{ w: 180, t: [[0, 1]] }, { w: 120, t: [[1, 1], [2, 1]] }],
      [{ w: 100, t: [[3, 1]] }, { w: 100, t: [[4, 1]] }, { w: 100, t: [[5, 1]] }],
    ],
  },
};

type Tile = { plate: number; x: number; y: number; w: number; ph: number };

/** How much of a 3:4 photo survives `object-fit: cover` in a w×h box. */
const shown = (w: number, h: number) => {
  const a = w / h;
  return Math.min(a / 0.75, 0.75 / a);
};

function tilesAt(band: Column[], hb: number, y0: number): Tile[] {
  const out: Tile[] = [];
  let x = 0;
  for (const col of band) {
    const sum = col.t.reduce((a, [, wt]) => a + wt, 0);
    const room = hb;
    let y = y0;
    for (const [plate, wt] of col.t) {
      const ph = (room * wt) / sum;
      out.push({ plate, x, y, w: col.w, ph });
      y += ph;
    }
    x += col.w;
  }
  return out;
}

/**
 * Each band's height is searched for, not hand-set: it is the height at which
 * the most-cropped photo keeps the most of itself, capped so a five- or
 * six-plate card doesn't grow past a screenful. Runs once per count, at
 * module load.
 */
function solve(layout: Layout): { tiles: Tile[]; height: number } {
  const tiles: Tile[] = [];
  let y0 = 0;
  layout.bands.forEach((band, bi) => {
    const cap = layout.caps?.[bi] ?? 400;
    let best: { m: number; hb: number; ts: Tile[] } | null = null;
    for (let hb = 120; hb <= cap; hb++) {
      const ts = tilesAt(band, hb, y0);
      if (ts.some((t) => t.ph < 40)) continue;
      const m = Math.min(...ts.map((t) => shown(t.w, t.ph)));
      if (!best || m > best.m + 1e-4) best = { m, hb, ts };
    }
    if (!best) return;
    tiles.push(...best.ts);
    y0 += best.hb;
  });
  return { tiles, height: y0 };
}

const SOLVED = Object.fromEntries(
  Object.entries(LAYOUTS).map(([n, l]) => [n, solve(l)]),
) as Record<number, { tiles: Tile[]; height: number }>;

/** Frame units to container-width units: 300 units is the card's width. */
const cq = (v: number) => `${(v / 3).toFixed(3)}cqw`;

/**
 * The hero first, then the rest as entered. Ties go to the earlier plate, so
 * two 90s put the first course up top rather than shuffling on every render.
 */
export function orderForCollage(plates: CollagePlate[]): CollagePlate[] {
  if (plates.length < 2) return plates;
  let best = 0;
  plates.forEach((p, i) => {
    if ((p.rating ?? -1) > (plates[best].rating ?? -1)) best = i;
  });
  return [plates[best], ...plates.filter((_, i) => i !== best)];
}

/** One plate: its photo, with its name, percent and price along its foot. */
function PlateTile({
  plate,
  tile,
  restaurant,
  href,
}: {
  plate: CollagePlate;
  tile: Tile;
  restaurant?: string;
  href?: string;
}) {
  const [failed, setFailed] = useState(false);
  const photo = plate.media.find((m) => m.type === "image");
  const alt =
    photo?.alt ||
    [plate.dishName, restaurant && `at ${restaurant}`].filter(Boolean).join(" ") ||
    "Food photo";

  /* The bigger photos get a size up, as in the mockup: 160 units is the
     line between a hero column and a side one. */
  const big = tile.w >= 160;

  const box = { left: cq(tile.x), top: cq(tile.y), width: cq(tile.w), height: cq(tile.ph) };
  const body = (
      <div className="relative h-full w-full overflow-hidden">
        {photo && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.url}
            alt={alt}
            // Every frame loads at once: the collage is one picture, and a
            // half-painted one reads as broken, not as loading.
            loading="eager"
            decoding="async"
            onError={() => setFailed(true)}
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-[var(--pm-tone-1)]" />
        )}
        <div
          className={`absolute inset-x-0 bottom-0 flex min-w-0 flex-col bg-[linear-gradient(to_top,rgba(18,12,8,.62),rgba(18,12,8,.25)_60%,transparent)] text-white ${
            big ? "px-2.5 pb-2 pt-8" : "px-2 pb-[7px] pt-[26px]"
          }`}
        >
          {plate.dishName && (
            <span
              className={`truncate font-display font-semibold leading-[1.15] ${big ? "text-[14px]" : "text-[12px]"}`}
            >
              {plate.dishName}
            </span>
          )}
          <span
            className={`flex items-baseline gap-[5px] font-mono leading-[1.3] tabular-nums ${
              big ? "text-[12px]" : "text-[11px]"
            }`}
          >
            {plate.rating != null && (
              /* The same heat paint the card's verdict numeral wears, so a
                 plate's percent reads as the same number it would be on its
                 own post. */
              <b
                data-heat={heatFor(plate.rating)}
                style={
                  {
                    "--heat": heatRamp(plate.rating),
                    "--chill": chillRamp(plate.rating),
                  } as CSSProperties
                }
                className={`pct-heat font-bold ${big ? "text-[17px]" : "text-[15px]"} ${
                  isPerfect(plate.rating) ? "pct-shine" : ""
                }`}
              >
                {Math.round(plate.rating)}%
              </b>
            )}
            {plate.rating != null && plate.price && <span className="opacity-60">·</span>}
            {plate.price && <span className="truncate opacity-95">{plate.price}</span>}
          </span>
        </div>
      </div>
  );

  /* A tap opens that one plate: its dish on the restaurant's screen when the
     name matched the menu, the restaurant otherwise — the same rule the
     card's own dish link follows. */
  return href ? (
    <Link
      href={href}
      aria-label={[plate.dishName ?? "This plate", restaurant && `at ${restaurant}`].filter(Boolean).join(" ")}
      className="absolute p-px focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange"
      style={box}
    >
      {body}
    </Link>
  ) : (
    <div className="absolute p-px" style={box}>
      {body}
    </div>
  );
}

/**
 * Every plate of a meal in one frame — the card's answer to "what did the
 * table look like". As wide as the single-photo carousel, as tall as its
 * layout needs; the hairline gaps between tiles are the card's own white.
 */
export function MealCollage({
  plates,
  restaurant,
  hrefFor,
}: {
  plates: CollagePlate[];
  restaurant?: string;
  /** Where tapping a plate goes; no link when absent or undefined. */
  hrefFor?: (plate: CollagePlate) => string | undefined;
}) {
  const ordered = orderForCollage(plates).slice(0, MAX_COLLAGE_PLATES);
  const { tiles, height } = SOLVED[ordered.length] ?? SOLVED[1];

  return (
    <div className="w-full [container-type:inline-size]">
      <div
        className="relative w-full select-none bg-white"
        style={{ height: cq(height) }}
        role="group"
        aria-label={`${ordered.length} plates from one meal`}
      >
        {tiles.map((t) => (
          <PlateTile
            key={ordered[t.plate].id}
            plate={ordered[t.plate]}
            tile={t}
            restaurant={restaurant}
            href={hrefFor?.(ordered[t.plate])}
          />
        ))}
      </div>
    </div>
  );
}

/** The hero row and its courses as one list, the shape the collage draws. */
export function collagePlatesFor(post: {
  id: string;
  dishName?: string;
  dishId?: string;
  price?: string;
  rating?: number;
  ratingKind?: "restaurant" | "dish";
  media: PostMedia[];
  courses?: CollagePlate[];
}): CollagePlate[] {
  return [
    {
      id: post.id,
      dishName: post.dishName,
      dishId: post.dishId,
      price: post.price,
      // A legacy star row never has courses anyway, but the guard keeps a
      // 4/5 from being compared against percents when picking the hero.
      rating: post.ratingKind === "dish" ? post.rating : undefined,
      media: post.media,
    },
    ...(post.courses ?? []),
  ];
}
