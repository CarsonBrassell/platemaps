"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";

/**
 * DRAFT SURFACE — nine container shapes for the map search field.
 *
 * The variable under review here is the **shape of the box**, nothing else. The
 * three variants already in this folder each changed several things at once
 * (dress, resting offer, dropdown), which makes them impossible to diff. So
 * every treatment below shares one fill family, one text palette, one icon and
 * one behaviour: type and the text appears, and nothing opens beneath it. There
 * is deliberately **no results list anywhere in this file** — a dropdown is the
 * next question, not this one, and rendering one would put the thing being
 * judged behind the thing that isn't.
 *
 * ## The one fill, so that shape is the only variable
 *
 * `#1d2126` with a `rgba(232,135,90,0.4)` hairline — the exact clothes of
 * `.map-fun-tiles .maplibregl-ctrl-group` (globals.css), i.e. the zoom stack in
 * the opposite corner of this same map. Measured against that fill:
 *
 * - `#F7F4EC` (input text) — **14.7:1**
 * - `#a7b0ba` (placeholder) — **7.4:1**
 * - `#ffb07a` (ember labels) — **9.1:1**
 *
 * All three are computed against the fill itself, and the fill is fully opaque,
 * so nothing the map draws underneath can move them. Three treatments break
 * from that fill because their whole concept is a different material — Bubble
 * (the comment card's near-white), Well (a translucent slot cut into the map)
 * and Neon sign (no fill at all). Each carries its own measurement at its
 * definition, and Neon sign is the one that cannot hold the floor; it is kept
 * and labelled rather than quietly fixed into a box.
 *
 * ## Focus is expressed per shape, not by one ring on all nine
 *
 * The previous round wore `outline-2 outline-pm-orange` on every candidate, and
 * the note back was that it reads as a loud orange oval drawn around the field
 * rather than as a focus indicator. So each treatment lights the part of itself
 * that carries its identity: the pill glows along its own inner edge, the rail
 * lights its bottom rule, the well lights its floor, the tag lights its hanging
 * edge, the ticket's chamfered outline goes bright. Every one of them is a
 * `.dff-fx` layer whose **opacity** crosses 0 → 1 in 180ms — no layout property
 * moves, and `prefers-reduced-motion` drops the transition while keeping the
 * state.
 *
 * Focus is hung on `:focus-within` rather than `:focus-visible`. The only
 * focusable thing inside any of these is a text input, and a text input matches
 * `:focus-visible` however it was focused, so the two are the same set here —
 * with the advantage that the ring can be drawn on the container that owns the
 * shape rather than on the bare input inside it.
 */

/* ---------------------------------------------------------------- palette -- */

/** The zoom stack's fill. Opaque, so map content underneath cannot reach the text. */
const DARK = "#1d2126";
/** The zoom stack's hairline. */
const EDGE = "rgba(232,135,90,0.4)";
/** Its quieter step, used where an edge divides rather than encloses. */
const EDGE_DIM = "rgba(232,135,90,0.25)";
const CREAM = "#F7F4EC";
/** Placeholder/icon step. 7.4:1 on DARK; `#8b939c` was tried and is 4.0:1 there. */
const MUTED = "#a7b0ba";
/** The map's own accent — leader lines, neon signs, hot pins. 9.1:1 on DARK. */
const EMBER = "#ffb07a";

/* The comment bubble's clothes, lifted verbatim from RestaurantMap.tsx so
   treatment 2 is wearing the real thing rather than an approximation. */
const BUBBLE_FILL = "#faf7f2";
const BUBBLE_INK = "#2b211c";
const BUBBLE_MUTED = "#776B5B";
const BUBBLE_EDGE = "rgba(43,33,28,0.16)";
const BUBBLE_POP = "#A8481A";
const BUBBLE_RADIUS = 8;

/** What a specimen types, short enough to fit the narrowest treatment. */
const SAMPLE = "Kettner";

/* ------------------------------------------------------------ shared bits -- */

/** Which frozen state a specimen is showing; `undefined` means the live field. */
export type Spec = "rest" | "focus" | "typed" | undefined;

export type FieldProps = { spec?: Spec };

const CSS = `
/* Entering. Transform and opacity only, 220ms, the entering easing. */
@keyframes dff-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: none; }
}
.dff-in { animation: dff-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both; }

/* The circle's rest/expanded swap: two layers pinned to the same right edge,
   crossing over. Never a width transition — width is a layout property and is
   also what makes an expanding search field feel rubbery. */
@keyframes dff-grow-in {
  from { opacity: 0; transform: scaleX(0.96); }
  to   { opacity: 1; transform: none; }
}
@keyframes dff-grow-out {
  from { opacity: 1; transform: none; }
  to   { opacity: 0; transform: scaleX(0.97); }
}
.dff-grow-in  { transform-origin: right center; animation: dff-grow-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.dff-grow-out { transform-origin: right center; animation: dff-grow-out 150ms ease-in both; }

/* Every treatment's focus indicator is one of these, and only its opacity
   moves. data-force is how a frozen specimen shows the focused state without
   stealing focus from the page. */
.dff-fx {
  opacity: 0;
  transition: opacity 180ms cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
}
.dff:focus-within .dff-fx,
.dff[data-force="focus"] .dff-fx { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .dff-in,
  .dff-grow-in,
  .dff-grow-out { animation: none; }
  .dff-grow-out { opacity: 0; }
  .dff-fx { transition: none; }
}
`;

/** Kept out of globals.css on purpose: nothing about this experiment should end
 *  up in the stylesheet every shipped page downloads. */
export function DraftFieldStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

function SearchGlyph({ size = 16, color = MUTED }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="shrink-0"
      style={{ color }}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/**
 * The input every treatment mounts, plus the props its host needs.
 *
 * A frozen specimen renders the same markup with a fixed value, `readOnly` and
 * `tabIndex={-1}` — it is a picture of a state, and it must not appear in the
 * tab order between the live field and the picker.
 */
function useField(spec: Spec) {
  const [typed, setTyped] = useState("");
  const frozen = spec !== undefined;
  const value = frozen ? (spec === "typed" ? SAMPLE : "") : typed;

  const inputProps = {
    type: "text" as const,
    value,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      if (!frozen) setTyped(e.target.value);
    },
    readOnly: frozen,
    tabIndex: frozen ? -1 : undefined,
    autoComplete: "off" as const,
    "aria-label": "Find a restaurant on the map",
  };

  return { frozen, value, inputProps };
}

/** `data-force` drives the frozen focus state; `dff` is the focus-within host. */
function hostProps(spec: Spec) {
  return {
    "data-force": spec ?? undefined,
    "aria-hidden": spec !== undefined ? true : undefined,
  };
}

/* Where a floating treatment sits: top-right of the map, dropping to the row
   below MapLibre's control stack at 390px, exactly as the shipped field does
   (`left-16` clears a stack that reaches 41px in from the map's edge). */
const FLOAT = "absolute left-16 right-2.5 top-16 z-10 sm:left-auto sm:top-2.5 sm:w-64";

/* --------------------------------------------------------- 1 · Pill ------- */

/**
 * The shipped shape, unchanged except for its focus indicator: `rounded-full`,
 * the zoom stack's fill and hairline. The control group — every other treatment
 * is a departure from this one, and the question each has to answer is what it
 * buys for the departure.
 *
 * Contrast on `#1d2126`: text 14.7:1, placeholder 7.4:1.
 * Focus: the hairline goes full ember and a soft ember glow runs around the
 * inside of the pill — the shape's own edge lighting up, rather than a second
 * heavier oval drawn outside it.
 */
function PillField({ spec }: FieldProps) {
  const { inputProps } = useField(spec);
  return (
    <div className={`dff dff-in ${FLOAT}`} {...hostProps(spec)}>
      <div
        className="relative flex min-h-11 items-center gap-2.5 rounded-full border px-4 py-2"
        style={{ background: DARK, borderColor: EDGE }}
      >
        <span
          className="dff-fx absolute inset-0 rounded-full"
          style={{ boxShadow: `inset 0 0 0 1px ${EMBER}, inset 0 0 12px rgba(232,135,90,0.32)` }}
        />
        <SearchGlyph />
        <input
          {...inputProps}
          placeholder="Fly to a spot"
          className="relative w-full min-w-0 bg-transparent text-sm placeholder:text-[#a7b0ba] focus:outline-none"
          style={{ color: CREAM }}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------- 2 · Bubble ----- */

/**
 * The comment bubble's exact clothes — `#faf7f2` fill, the ink hairline, the
 * 8px corner — with a leader line dropping from the bottom edge the way
 * `bubbleElement` draws one. The map already annotates itself in this voice, so
 * the field reads as the map asking a question rather than as app chrome parked
 * on top of it.
 *
 * Contrast on `#faf7f2`: ink `#2b211c` **14.7:1**, placeholder `#776B5B`
 * **4.86:1** (the bubble meta row's own muted step, chosen there for exactly
 * this floor). Opaque fill, so the map underneath cannot move either.
 *
 * Focus: the hairline goes `--pm-orange-text` and the leader brightens — the
 * annotation lighting up, which is what the map does to a live bubble's sign.
 * The leader is drawn without the `.map-leader` flicker: that animation is
 * 450ms and belongs to a sign getting power, not to a control.
 */
function BubbleField({ spec }: FieldProps) {
  const { inputProps } = useField(spec);
  return (
    <div className={`dff dff-in ${FLOAT}`} {...hostProps(spec)}>
      <div className="relative">
        <div
          className="relative flex min-h-11 items-center gap-2.5 border px-3 py-2"
          style={{
            background: BUBBLE_FILL,
            borderColor: BUBBLE_EDGE,
            borderRadius: BUBBLE_RADIUS,
          }}
        >
          <span
            className="dff-fx absolute inset-0"
            style={{
              borderRadius: BUBBLE_RADIUS,
              boxShadow: `0 0 0 1px ${BUBBLE_POP}, 0 0 0 3px rgba(168,72,26,0.16)`,
            }}
          />
          <SearchGlyph color={BUBBLE_MUTED} />
          <input
            {...inputProps}
            placeholder="Which spot?"
            className="relative w-full min-w-0 bg-transparent text-sm placeholder:text-[#776B5B] focus:outline-none"
            style={{ color: BUBBLE_INK }}
          />
        </div>
        {/* The thread down to the map, starting at the box's bottom edge one
            corner-radius in — the same origin `bubbleElement` uses — and
            nodding sideways at the elbow the way a real leader does. */}
        <svg
          width="44"
          height="34"
          viewBox="0 0 44 34"
          fill="none"
          className="pointer-events-none absolute left-0 top-full"
          aria-hidden="true"
        >
          <path
            d={`M ${BUBBLE_RADIUS} 0 L ${BUBBLE_RADIUS} 18 L 24 32`}
            stroke={EMBER}
            strokeWidth="1"
            style={{ filter: "drop-shadow(0 0 3px rgba(232,135,90,0.9)) drop-shadow(0 0 7px rgba(232,135,90,0.45))" }}
          />
        </svg>
        <svg
          width="44"
          height="34"
          viewBox="0 0 44 34"
          fill="none"
          className="dff-fx absolute left-0 top-full"
          aria-hidden="true"
        >
          <path
            d={`M ${BUBBLE_RADIUS} 0 L ${BUBBLE_RADIUS} 18 L 24 32`}
            stroke="#ffd2ae"
            strokeWidth="1.4"
            style={{ filter: "drop-shadow(0 0 4px rgba(232,135,90,1)) drop-shadow(0 0 9px rgba(232,135,90,0.6))" }}
          />
        </svg>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- 3 · Neon sign -- */

/**
 * FAILS ITS CONTRAST FLOOR, AND IS KEPT ANYWAY SO THE FAILURE IS VISIBLE.
 *
 * No box at all: uppercase mono in ember, styled like `.map-neon-sign`, with a
 * hairline rule beneath doubling as the input's underline. It is by a distance
 * the most chromeless option and the one that most looks like it belongs to
 * this map.
 *
 * It cannot hold 4.5:1, and no tuning of the glow changes that, because the
 * treatment's "own fill" is whatever the map happens to be drawing:
 *
 * - over harbour water (`#0d1014`-ish): `#ffb07a` reads **~11:1** — excellent
 * - over the district heatmap's hot core (`#e8875a`): **1.46:1** — unreadable
 * - over mid-grey blocks (`#2a2f35`): ~7:1 — fine
 *
 * The heatmap pools sit over Gaslamp, Little Italy and North Park, which is
 * precisely where someone is most likely to be searching. `text-shadow` makes
 * the letters *feel* separated over a dark ground but adds nothing measurable
 * and nothing at all over a bright one. A fill would fix it, and a fill is the
 * one thing this treatment is defined by not having — so it is a rejected
 * option, on the sheet, labelled.
 */
function NeonField({ spec }: FieldProps) {
  const { inputProps } = useField(spec);
  return (
    <div className={`dff dff-in ${FLOAT}`} {...hostProps(spec)}>
      <div className="relative flex min-h-11 items-end pb-1.5">
        <input
          {...inputProps}
          placeholder="FIND A SPOT"
          className="w-full min-w-0 bg-transparent px-1 pb-1 font-mono text-xs font-semibold uppercase tracking-[0.18em] placeholder:text-[#ffb07a] placeholder:opacity-70 focus:outline-none"
          style={{
            color: EMBER,
            textShadow: "0 0 6px rgba(232,135,90,0.9), 0 0 14px rgba(232,135,90,0.45)",
          }}
        />
        <span
          className="absolute inset-x-0 bottom-0 h-px"
          style={{ background: "rgba(255,176,122,0.55)" }}
        />
        {/* Focus: the rule burns brighter, the way a sign does when it is the
            one being read. Opacity only. */}
        <span
          className="dff-fx absolute inset-x-0 bottom-0 h-px"
          style={{ background: EMBER, boxShadow: "0 0 7px rgba(232,135,90,0.95)" }}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------- 4 · Top rail --- */

/**
 * Spans the map's full width, flush to its top edge, top corners matching the
 * map's own `rounded-xl`. Not a card floating over the map — part of its frame,
 * the way a browser's own toolbar belongs to the window rather than to the page.
 *
 * Contrast on `#1d2126`: text 14.7:1, placeholder 7.4:1.
 *
 * **Collision, by design:** the rail owns the top band, so MapLibre's zoom stack
 * has to live below it. At exactly `min-h-11` the rail ends at 44px and the
 * stack's group starts at 50px (the draft stage keeps `/feed`'s `pt-10` on the
 * control container, plus MapLibre's own 10px margin) — 6px of clearance, and
 * the same band `/feed`'s Discover/Friends switch already occupies. Anything
 * taller than 50px and the stack needs pushing; this is the reason the rail is
 * pinned to the 44px floor rather than given comfortable padding.
 *
 * Focus: the bottom rule goes ember across the full width — the frame's own
 * edge, lit.
 */
function TopRailField({ spec }: FieldProps) {
  const { inputProps } = useField(spec);
  return (
    <div className={`dff dff-in absolute inset-x-0 top-0 z-10`} {...hostProps(spec)}>
      <div
        className="relative flex min-h-11 items-center gap-2.5 rounded-t-xl px-4"
        style={{ background: DARK, borderBottom: `1px solid ${EDGE_DIM}` }}
      >
        <SearchGlyph />
        <input
          {...inputProps}
          placeholder="Fly to a spot"
          className="w-full min-w-0 bg-transparent text-sm placeholder:text-[#a7b0ba] focus:outline-none"
          style={{ color: CREAM }}
        />
        <span
          className="dff-fx absolute inset-x-0 bottom-0 h-px"
          style={{ background: EMBER, boxShadow: "0 0 8px rgba(232,135,90,0.5)" }}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------- 5 · Docked ----- */

/**
 * Welded to the zoom stack: same left inset, same fill, same hairline, same 8px
 * corner, sitting directly above the +/− buttons as one continuous run of map
 * controls. Mono placeholder, because a control that has joined the machine
 * chrome should speak in the machine voice.
 *
 * **The one part of the brief that cannot hold is "same width".** MapLibre's
 * buttons are 29px across; a 29px field takes no text and would fail the 44px
 * floor in the other axis too. So the run shares everything else and steps out
 * in width, which is what a field does in every map product that has tried this.
 *
 * The push on `.maplibregl-ctrl-top-left` is `!important` because the draft
 * stage sets `pt-10` through a Tailwind arbitrary variant with two class
 * selectors' worth of specificity. It is injected only by the live field —
 * a frozen specimen must never move the real map's controls, and there are five
 * specimens of this treatment on the page.
 *
 * Contrast on `#1d2126`: text 14.7:1, placeholder 7.4:1.
 * Focus: the hairline goes full ember, the same answer the +/− buttons give on
 * hover, so the run keeps behaving as one object.
 */
const DOCK_TOP = 50;
const DOCK_HEIGHT = 44;
/** Field bottom (94) + a 4px seam, minus MapLibre's own 10px group margin. */
const DOCK_PUSH = DOCK_TOP + DOCK_HEIGHT + 4 - 10;

function DockedField({ spec }: FieldProps) {
  const { inputProps } = useField(spec);
  return (
    <>
      {spec === undefined && (
        <style
          dangerouslySetInnerHTML={{
            __html: `.maplibregl-ctrl-top-left { padding-top: ${DOCK_PUSH}px !important; }`,
          }}
        />
      )}
      <div
        className="dff dff-in absolute left-[10px] z-10 w-[224px]"
        style={{ top: DOCK_TOP }}
        {...hostProps(spec)}
      >
        <div
          className="relative flex items-center gap-2 rounded-lg border px-3"
          style={{ background: DARK, borderColor: EDGE, minHeight: DOCK_HEIGHT }}
        >
          <span
            className="dff-fx absolute inset-0 rounded-lg"
            style={{ boxShadow: `inset 0 0 0 1px ${EMBER}` }}
          />
          <SearchGlyph size={15} />
          <input
            {...inputProps}
            placeholder="FLY TO A SPOT"
            className="relative w-full min-w-0 bg-transparent font-mono text-[11px] font-medium uppercase tracking-[0.14em] placeholder:text-[#a7b0ba] focus:outline-none"
            style={{ color: CREAM }}
          />
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------- 6 · Circle ----- */

/**
 * A 44px icon-only circle at rest that expands leftward into a field. Lantern's
 * rest state isolated as a shape study — same geometry (two layers pinned to
 * the same right edge, crossing over with `scaleX`, never a width transition),
 * but wearing the gallery's one fill instead of Lantern's glass, so what is
 * being compared here is the shape and not the material.
 *
 * The circle is `h-11 w-11` = 44px exactly, so the rest state meets the touch
 * floor without an invisible hit area.
 *
 * Contrast on `#1d2126`: text 14.7:1, placeholder 7.4:1, glyph 7.4:1.
 * Focus: the same inner ember glow the pill uses — it is the same edge, just
 * bent into a circle.
 *
 * The known cost, inherited from Lantern: icon-only is the least discoverable
 * rest state on the sheet. Here it is paid for only by `aria-label`, because
 * this page is judging shape; the hover/focus text hint Lantern carries is the
 * real answer and would come with it.
 */
function CircleField({ spec }: FieldProps) {
  const { inputProps, value } = useField(spec);
  const inputRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<"rest" | "open" | "closing">("rest");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wantFocus = useRef(false);

  const open = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    wantFocus.current = true;
    setPanel("open");
  }, []);

  const collapse = useCallback(() => {
    setPanel((current) => {
      if (current !== "open") return current;
      if (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return "rest";
      }
      if (timer.current) clearTimeout(timer.current);
      /* Matches `.dff-grow-out`. Exits are the fastest thing on the page but
         still inside the 150–300ms band — leaving is never the part worth
         watching, and anything quicker reads as a glitch rather than a close. */
      timer.current = setTimeout(() => setPanel("rest"), 150);
      return "closing";
    });
  }, []);

  useEffect(() => {
    if (panel === "open" && wantFocus.current) {
      wantFocus.current = false;
      inputRef.current?.focus();
    }
  }, [panel]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /* A frozen specimen shows the circle for "rest" and the field for the other
     two, so the contact sheet prints the shape this treatment actually spends
     its life in. */
  const showField = spec === undefined ? panel !== "rest" : spec !== "rest";

  return (
    <div className={`dff dff-in ${FLOAT}`} {...hostProps(spec)}>
      <div className="relative flex min-h-11 justify-end">
        {!showField ? (
          <button
            type="button"
            onClick={open}
            aria-label="Find a restaurant on the map"
            aria-expanded={false}
            tabIndex={spec === undefined ? undefined : -1}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors hover:brightness-125"
            style={{ background: DARK, borderColor: EDGE }}
          >
            <span
              className="dff-fx absolute inset-0 rounded-full"
              style={{ boxShadow: `inset 0 0 0 1px ${EMBER}, inset 0 0 12px rgba(232,135,90,0.32)` }}
            />
            <SearchGlyph size={18} color={CREAM} />
          </button>
        ) : (
          <div
            className={`relative flex min-h-11 w-full items-center gap-2.5 rounded-full border px-4 py-2 ${
              panel === "closing" ? "dff-grow-out" : "dff-grow-in"
            }`}
            style={{ background: DARK, borderColor: EDGE }}
            onBlur={(e) => {
              if (spec !== undefined) return;
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              if (value.trim()) return;
              collapse();
            }}
          >
            <span
              className="dff-fx absolute inset-0 rounded-full"
              style={{ boxShadow: `inset 0 0 0 1px ${EMBER}, inset 0 0 12px rgba(232,135,90,0.32)` }}
            />
            <SearchGlyph />
            <input
              {...inputProps}
              ref={inputRef}
              placeholder="Fly to a spot"
              className="relative w-full min-w-0 bg-transparent text-sm placeholder:text-[#a7b0ba] focus:outline-none"
              style={{ color: CREAM }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- 7 · Tag -------- */

/**
 * Hangs from the top edge like a luggage tag: squared top corners, rounded
 * bottom, a hairline down the sides and around the hanging edge but none across
 * the top, because the top is where it is attached. A small ember pin sits on
 * the seam. It reads as fixed to the map's frame rather than floating over it,
 * which is the whole difference from the pill.
 *
 * Sits top-right and hangs 52px, so it clears MapLibre's stack at every width:
 * at 390px its left edge lands at ~118px against a control stack that ends at
 * 41px.
 *
 * Contrast on `#1d2126`: text 14.7:1, placeholder 7.4:1.
 * Focus: the hanging edge lights — the part of the shape that is doing the
 * hanging.
 */
function TagField({ spec }: FieldProps) {
  const { inputProps } = useField(spec);
  return (
    <div className="dff dff-in absolute right-4 top-0 z-10 w-[224px] sm:w-64" {...hostProps(spec)}>
      <div
        className="relative flex items-center gap-2.5 rounded-b-2xl px-4 pb-2 pt-3"
        style={{
          background: DARK,
          minHeight: 52,
          borderLeft: `1px solid ${EDGE}`,
          borderRight: `1px solid ${EDGE}`,
          borderBottom: `1px solid ${EDGE}`,
        }}
      >
        {/* The pin. A tag is attached to something; without this it reads as a
            card that happens to be missing its top corners. */}
        <span
          className="pointer-events-none absolute left-1/2 top-[5px] h-[5px] w-[5px] -translate-x-1/2 rounded-full"
          style={{ background: EMBER, boxShadow: "0 0 6px rgba(232,135,90,0.8)" }}
        />
        <span
          className="dff-fx absolute inset-0 rounded-b-2xl"
          style={{ boxShadow: `inset 0 -1px 0 0 ${EMBER}, 0 3px 12px rgba(232,135,90,0.3)` }}
        />
        <SearchGlyph />
        <input
          {...inputProps}
          placeholder="Fly to a spot"
          className="relative w-full min-w-0 bg-transparent text-sm placeholder:text-[#a7b0ba] focus:outline-none"
          style={{ color: CREAM }}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------- 8 · Well ------- */

/**
 * A slot cut into the map surface rather than a card laid on it: darker than
 * everything around it, with a shadowed top edge and a lit bottom edge.
 *
 * **The brief asked for a light top edge and a dark bottom edge; that is the
 * raised/embossed convention and it makes the shape read as a bar sitting on
 * the map.** Light falls from above, so a recess is dark where it meets the
 * surface at the top and catches light on its floor. Reversed as specified this
 * treatment is treatment 1 with square corners; as written below it is the only
 * thing on the sheet that reads as *inside* the map.
 *
 * It is the second at-risk treatment and it **holds**, but only because the
 * fill is nearly opaque. `rgba(10,12,15,0.86)` composited over the worst thing
 * the map can put underneath it:
 *
 * - over the heatmap's hot core `#e8875a` → `rgb(41,29,26)`: cream **14.9:1**,
 *   placeholder `#a7b0ba` **7.4:1**
 * - over a hot pin `#ffb07a` → `rgb(44,35,30)`: cream 14.1:1, placeholder **7.0:1**
 *
 * The tempting version is a much lower alpha, because that is what makes the
 * map visibly show through and sells the "cut into it" read. Measured: at 0.55
 * over a hot pin the placeholder falls to **3.0:1** and fails. So the depth here
 * is carried by the two edges, not by transparency, and 0.86 is the floor.
 *
 * Focus: the floor of the slot lights ember. Nothing outside the shape moves,
 * which suits a control that is meant to be below the surface.
 */
function WellField({ spec }: FieldProps) {
  const { inputProps } = useField(spec);
  return (
    <div className={`dff dff-in ${FLOAT}`} {...hostProps(spec)}>
      <div
        className="relative flex min-h-11 items-center gap-2.5 rounded-lg px-4 py-2"
        style={{
          background: "rgba(10,12,15,0.86)",
          boxShadow:
            "inset 0 2px 3px rgba(0,0,0,0.9), inset 0 1px 0 rgba(0,0,0,0.9), inset 0 -1px 0 rgba(247,244,236,0.22)",
        }}
      >
        <span
          className="dff-fx absolute inset-0 rounded-lg"
          style={{ boxShadow: `inset 0 -1px 0 0 ${EMBER}, inset 0 -6px 10px -6px rgba(232,135,90,0.55)` }}
        />
        <SearchGlyph />
        <input
          {...inputProps}
          placeholder="Fly to a spot"
          className="relative w-full min-w-0 bg-transparent text-sm placeholder:text-[#a7b0ba] focus:outline-none"
          style={{ color: CREAM }}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------- 9 · Ticket ----- */

/**
 * The utilitarian voice PRODUCT.md describes, which DESIGN.md overrules for the
 * cream world but which the night map is the one place that could carry: mono
 * throughout, chamfered corners, a hairline rule dividing the glyph from the
 * field, and a small mono label riding the top edge the way a field name rides
 * a form's fieldset.
 *
 * The chamfer is two stacked `clip-path` layers — an ember one underneath and
 * the fill 1px inside it — because `clip-path` cuts a border off with the
 * corners. The label is a sibling of both, since anything inside a clipped box
 * gets clipped with it.
 *
 * Contrast on `#1d2126`: text 14.7:1, placeholder 7.4:1, the `FIND` label
 * (ember) 9.1:1.
 * Focus: the whole chamfered outline goes bright ember. It is the treatment
 * whose outline is most of its identity, so the outline is what lights.
 */
const CHAMFER =
  "polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)";
const CHAMFER_INNER =
  "polygon(7px 0, calc(100% - 7px) 0, 100% 7px, 100% calc(100% - 7px), calc(100% - 7px) 100%, 7px 100%, 0 calc(100% - 7px), 0 7px)";

function TicketField({ spec }: FieldProps) {
  const { inputProps } = useField(spec);
  return (
    <div className={`dff dff-in ${FLOAT}`} {...hostProps(spec)}>
      <div className="relative">
        <span
          className="mono-label absolute -top-[7px] left-3 z-20 px-1.5"
          style={{ background: DARK, color: EMBER }}
        >
          Find
        </span>
        <div
          className="relative min-h-11 p-px"
          style={{ background: EDGE, clipPath: CHAMFER }}
        >
          <span className="dff-fx absolute inset-0" style={{ background: EMBER, clipPath: CHAMFER }} />
          <div
            className="relative flex items-center gap-2.5 px-3"
            style={{ background: DARK, clipPath: CHAMFER_INNER, minHeight: 42 }}
          >
            <SearchGlyph size={14} />
            <span className="h-4 w-px shrink-0" style={{ background: EDGE_DIM }} />
            <input
              {...inputProps}
              placeholder="FLY TO A SPOT"
              className="w-full min-w-0 bg-transparent font-mono text-[11px] font-medium uppercase tracking-[0.14em] placeholder:text-[#a7b0ba] focus:outline-none"
              style={{ color: CREAM }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the sheet -- */

export type Treatment = {
  id: string;
  /** Picker label — mono, so it stays a machine value in the segmented track. */
  short: string;
  name: string;
  /** What it is and what it is borrowing from. */
  borrows: string;
  /** Measured contrast, stated in the UI as well as in the comments above. */
  contrast: string;
  /** Set only where the treatment does not survive the map. */
  fails?: string;
  Field: (props: FieldProps) => ReactNode;
};

export const TREATMENTS: Treatment[] = [
  {
    id: "pill",
    short: "01 Pill",
    name: "Pill",
    borrows:
      "The current shape, and the control group. rounded-full, the zoom stack's warm-dark fill and ember hairline — borrowed from MapLibre's own +/− group in the opposite corner.",
    contrast: "Text 14.7:1 · placeholder 7.4:1 on an opaque #1d2126.",
    Field: PillField,
  },
  {
    id: "bubble",
    short: "02 Bubble",
    name: "Bubble",
    borrows:
      "The comment bubble's exact clothes — #faf7f2 fill, the ink hairline, the 8px corner — plus a leader line dropping from its bottom edge the way bubbleElement draws one. The map appears to be asking a question in the voice its annotations already speak in.",
    contrast: "Ink 14.7:1 · placeholder #776B5B 4.86:1 on #faf7f2.",
    Field: BubbleField,
  },
  {
    id: "neon",
    short: "03 Neon",
    name: "Neon sign",
    borrows:
      ".map-neon-sign — uppercase mono in ember with the sign's glow, no box at all, and a hairline rule beneath that doubles as the input's underline. The most chromeless option on the sheet.",
    contrast: "~11:1 over water, 7:1 over blocks, 1.46:1 over the heatmap's hot core.",
    fails:
      "No fill means no floor: over the Gaslamp / North Park heatmap pools ember-on-orange measures 1.46:1, and those pools are exactly where people search. A fill fixes it and a fill is the one thing this treatment is defined by not having.",
    Field: NeonField,
  },
  {
    id: "rail",
    short: "04 Rail",
    name: "Top rail",
    borrows:
      "The map's own frame. Full width, flush to the top edge, top corners matching the map's rounded-xl — a toolbar belonging to the window rather than chrome floating on the page. Owns the top band, so the zoom stack lives underneath it.",
    contrast: "Text 14.7:1 · placeholder 7.4:1 on an opaque #1d2126.",
    Field: TopRailField,
  },
  {
    id: "docked",
    short: "05 Docked",
    name: "Docked",
    borrows:
      "MapLibre's zoom stack: same left inset, same fill, same hairline, same 8px corner, sitting directly above the +/− buttons as one run of map controls. Mono placeholder — it has joined the machine chrome. 'Same width' is the one part that can't hold: 29px takes no text.",
    contrast: "Text 14.7:1 · placeholder 7.4:1 on an opaque #1d2126.",
    Field: DockedField,
  },
  {
    id: "circle",
    short: "06 Circle",
    name: "Circle",
    borrows:
      "Lantern's rest state, isolated as a shape study — a 44px circle expanding leftward into a field, the same two-layer scaleX swap, but wearing this sheet's one fill instead of Lantern's glass so only the shape differs.",
    contrast: "Text 14.7:1 · placeholder 7.4:1 on an opaque #1d2126.",
    Field: CircleField,
  },
  {
    id: "tag",
    short: "07 Tag",
    name: "Tag",
    borrows:
      "A luggage tag or a bookmark ribbon: squared top corners, rounded bottom, hairline down the sides and around the hanging edge but none across the top, with an ember pin on the seam. Attached to the frame rather than floating over it.",
    contrast: "Text 14.7:1 · placeholder 7.4:1 on an opaque #1d2126.",
    Field: TagField,
  },
  {
    id: "well",
    short: "08 Well",
    name: "Well",
    borrows:
      "A slot cut into the map surface: darker than its surround, shadowed top edge, lit floor. (The brief's light-top/dark-bottom is the embossed convention — reversed here, or it reads as a raised bar.) The only shape on the sheet that reads as inside the map.",
    contrast:
      "Holds, but only at 0.86 alpha: over the hot heatmap core cream 14.9:1, placeholder 7.4:1; at 0.55 the placeholder falls to 3.0:1.",
    Field: WellField,
  },
  {
    id: "ticket",
    short: "09 Ticket",
    name: "Ticket",
    borrows:
      "PRODUCT.md's utilitarian voice, which the night map is the one surface that could carry: mono throughout, chamfered corners cut with clip-path, a hairline rule dividing glyph from field, and a small mono label riding the top edge like a field name on a form.",
    contrast: "Text 14.7:1 · placeholder 7.4:1 · label 9.1:1 on an opaque #1d2126.",
    Field: TicketField,
  },
];

/**
 * The ground a frozen specimen sits on: the map's real range in one strip —
 * harbour water at the left, mid-grey blocks through the middle, the district
 * heatmap's hot core at the right. Every treatment is pinned to the same place
 * inside it, so the contact sheet is a contrast test as much as a shape one.
 * Neon sign disappearing into the orange end is the point, not a rendering bug.
 */
export const SPECIMEN_GROUND =
  "linear-gradient(103deg, #0b0e12 0%, #141920 30%, #2a2f35 54%, #b8663f 80%, #e8875a 100%)";
