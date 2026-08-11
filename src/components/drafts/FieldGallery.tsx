"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { DraftMapStage } from "@/components/drafts/DraftMapStage";
import {
  DraftFieldStyles,
  SPECIMEN_GROUND,
  TREATMENTS,
  type Spec,
  type Treatment,
} from "@/components/drafts/fieldShapes";

/**
 * DRAFT SURFACE — the nine container shapes, on one map.
 *
 * ## One map, one camera, one variable
 *
 * Nine maps side by side would have been nine cameras, nine sets of pins under
 * the field and nine different things happening behind the thing being judged.
 * So there is exactly one live map and a picker that swaps which treatment is
 * mounted on it: `DraftMapStage` keeps `RestaurantMap` mounted across the swap
 * (only `searchField` changes), so the camera does not move, the bubbles do not
 * re-place, and what changes between two clicks is the shape of the box and
 * nothing else. Pan into Gaslamp once and every treatment can be read over the
 * same lit block.
 *
 * ## The specimens are frozen, not live
 *
 * A shape has three states worth seeing and only one of them can be on screen
 * at a time on a real field, because focus is singular. So the states strip and
 * the contact sheet render the same components with `spec` set — same markup,
 * fixed value, `readOnly`, `tabIndex={-1}` and `aria-hidden`, with the focus
 * layer forced on by `data-force`. They are pictures of states, and they are
 * out of the tab order so the live field and the picker stay one Tab apart.
 *
 * Each specimen sits on `SPECIMEN_GROUND` rather than a flat dark panel: the
 * strip runs from harbour water through mid-grey blocks to the heatmap's hot
 * core, so the sheet reads as a contrast test as well as a shape comparison.
 *
 * **Specimen cells are never narrower than a real field**, which is what makes
 * "at real size" true rather than a caption. A treatment is 256px wide plus its
 * 10px inset; three states across the shell's 768px column gives 248px cells
 * and clips every one of them at the left edge. So the states strip stacks and
 * the contact sheet is two columns — 378px cells, with room to spare.
 */

function Specimen({
  treatment,
  spec,
  height = 150,
}: {
  treatment: Treatment;
  spec: Spec;
  height?: number;
}) {
  const { Field } = treatment;
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl"
      style={{ height, background: SPECIMEN_GROUND }}
    >
      <Field spec={spec} />
    </div>
  );
}

const STATES: { spec: Exclude<Spec, undefined>; label: string }[] = [
  { spec: "rest", label: "At rest" },
  { spec: "focus", label: "Focused" },
  { spec: "typed", label: "Text typed" },
];

/**
 * Where the camera can be sent. The shell's copy has always told reviewers to
 * pan into a lit district before deciding, because the heatmap pools are the
 * only place a floating control can lose its contrast — this is that
 * instruction as a control, so everybody reads every treatment over the same
 * block instead of over wherever they happened to drag to.
 *
 * `jumpTo`, not `flyTo`: this is a reviewer changing the test conditions, not
 * the reader travelling somewhere, so there is nothing to stay oriented about.
 *
 * **Zoom is 15.2, and not higher.** `heatmap-radius` is in screen pixels, so
 * zooming in spreads the same restaurants across more pixels and the pool gets
 * *weaker*: at 16.2 the Gaslamp core is already visibly paler than at 15.2,
 * which is the opposite of the worst case this switch exists to produce.
 *
 * **The centres are the districts' own, and an attempt to aim them was backed
 * out — the reason is worth keeping.** The obvious move is to push the camera
 * south-west so the hot core lands under the map's top-right corner, where six
 * of the nine treatments sit. It cannot be done: `pitchForZoom` has this map at
 * ~30° by z15.2, so the top of the frame is the far distance, and putting a
 * point 210px above centre under the field costs ~1km of ground — far enough
 * that the camera ends up in the bay and three quarters of the map is water.
 *
 * That is itself a finding about this map rather than about these treatments:
 * **a top-anchored field is almost never over the brightest heatmap**, because
 * the brightest heatmap is in the lower half of a pitched view and the top of
 * the frame is the horizon. The guaranteed worst case therefore lives on the
 * contact sheet, whose ground puts a full `#e8875a` directly under the field —
 * harsher than the live map can actually produce — and every contrast figure on
 * this page is measured against that, not against a lucky pan.
 */
const DISTRICTS = {
  gaslamp: { label: "Gaslamp", center: [-117.1605, 32.7112] as [number, number], zoom: 15.2 },
  northpark: { label: "North Park", center: [-117.1295, 32.747] as [number, number], zoom: 15.2 },
};

type DistrictId = keyof typeof DISTRICTS;

/**
 * Sends the camera to a district once the map has settled.
 *
 * The jump has to wait for `RestaurantMap`'s opening fit, which only runs when
 * the corpus arrives from the API — a jump issued before that is silently
 * overwritten by the fit a moment later. So it jumps immediately (for the case
 * where the fit has already played) and again on the first `idle` after that,
 * then unsubscribes.
 */
function useDistrictCamera(mapRef: RefObject<MapLibreMap | null>, district: DistrictId | null) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !district) return;
    const target = DISTRICTS[district];
    let settled = false;
    const apply = () => {
      if (settled) return;
      settled = true;
      map.jumpTo({ center: target.center, zoom: target.zoom });
    };
    map.jumpTo({ center: target.center, zoom: target.zoom });
    map.on("idle", apply);
    return () => {
      map.off("idle", apply);
    };
  }, [mapRef, district]);
}

/** `#tag` or `#tag/gaslamp` — a treatment and its test conditions are the whole
 *  state of this page, so they belong in the URL: a reviewer can send someone
 *  the exact thing they are looking at. Read on mount and on `hashchange`,
 *  written back with `replaceState` so the back button is not filled with
 *  picker clicks. */
function parseHash(hash: string): { id?: string; district?: DistrictId } {
  const [id, district] = hash.replace(/^#/, "").split("/");
  return {
    id: TREATMENTS.some((t) => t.id === id) ? id : undefined,
    district: district && district in DISTRICTS ? (district as DistrictId) : undefined,
  };
}

export function FieldGallery() {
  const [activeId, setActiveId] = useState(TREATMENTS[0].id);
  const [district, setDistrict] = useState<DistrictId | null>(null);
  const active = TREATMENTS.find((t) => t.id === activeId) ?? TREATMENTS[0];

  useEffect(() => {
    function read() {
      const { id, district: d } = parseHash(window.location.hash);
      if (id) setActiveId(id);
      setDistrict(d ?? null);
    }
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  useEffect(() => {
    const next = `#${activeId}${district ? `/${district}` : ""}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [activeId, district]);

  /* `DraftMapStage` hands its field `mapRef` and `seeds`. No treatment needs
     either — none of them fly the camera or rank anything, the shapes are the
     whole subject — but the district switch does need the map, and the field is
     the only thing on this page holding a reference to it.

     Changing district therefore remounts the live field and clears whatever was
     typed into it. That is the accepted cost of not threading a second seam
     through `RestaurantMap`: the reason to change district is to read the
     resting shape over a lit block, and the states strip below already shows
     the typed state on a fixed ground. */
  const LiveField = useMemo(() => {
    const { Field } = active;
    function GalleryField({ mapRef }: { mapRef: RefObject<MapLibreMap | null> }) {
      useDistrictCamera(mapRef, district);
      return <Field />;
    }
    return GalleryField;
  }, [active, district]);

  return (
    <div>
      <DraftFieldStyles />

      {/* Rank 3 control (DESIGN.md): a tan segmented track with a white
          selected segment and mono labels. Nine segments is more than a
          segmented control usually carries, so it is a grid rather than a row:
          5 × 2 on desktop, 3 × 3 at 390px. Wrapping a flex row instead left the
          ninth segment alone on its own line stretched to full width, which read
          as a different control. Every cell keeps the 44px floor. */}
      <div
        role="group"
        aria-label="Which field treatment is on the map"
        className="grid grid-cols-3 gap-1 rounded-2xl bg-pm-grey-tint p-1 sm:grid-cols-5"
      >
        {TREATMENTS.map((t) => {
          const selected = t.id === active.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setActiveId(t.id)}
              className={`mono-label min-h-11 whitespace-nowrap rounded-xl px-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                selected ? "bg-white text-zinc-900" : "text-pm-grey-text hover:text-zinc-900"
              }`}
            >
              {t.short}
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl bg-white p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-zinc-900">{active.name}</h2>
          {active.fails ? (
            <span className="mono-label shrink-0 text-red-700">Fails</span>
          ) : (
            <span className="mono-label shrink-0 text-zinc-500">On the map</span>
          )}
        </div>
        <p className="mt-2 text-sm text-zinc-700">{active.borrows}</p>
        <p className="mt-2 font-mono text-xs tabular-nums text-zinc-500">{active.contrast}</p>
        {active.fails && (
          <p className="mt-2 text-sm text-red-700">
            <span className="mono-label">Why it fails</span> {active.fails}
          </p>
        )}
      </div>

      {/* Same rank-3 clothes as the picker above, because it is the same kind
          of control: a local switch over what is on screen. */}
      <div className="mt-4 flex items-center gap-3">
        <p className="mono-label shrink-0 text-pm-grey-text">Camera</p>
        <div
          role="group"
          aria-label="Where the map camera sits"
          className="flex gap-1 rounded-full bg-pm-grey-tint p-1"
        >
          {[
            { id: null, label: "Fitted" },
            ...Object.entries(DISTRICTS).map(([id, d]) => ({ id: id as DistrictId, label: d.label })),
          ].map((option) => {
            const selected = option.id === district;
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={selected}
                onClick={() => setDistrict(option.id)}
                className={`mono-label min-h-11 whitespace-nowrap rounded-full px-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                  selected ? "bg-white text-zinc-900" : "text-pm-grey-text hover:text-zinc-900"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3">
        <DraftMapStage field={LiveField} />
      </div>

      <p className="mono-label mt-6 text-zinc-900">Three states · {active.name}</p>
      <div className="mt-2 flex flex-col gap-3">
        {STATES.map((state) => (
          <div key={state.spec}>
            <p className="mono-label mb-1.5 text-pm-grey-text">{state.label}</p>
            <Specimen treatment={active} spec={state.spec} height={124} />
          </div>
        ))}
      </div>

      <p className="mono-label mt-8 text-zinc-900">Contact sheet · all nine at rest</p>
      <p className="mt-1 text-sm text-pm-grey-text">
        Every specimen sits on the same strip of the map&rsquo;s real range —
        harbour water at the left, blocks through the middle, the district
        heatmap&rsquo;s hot core at the right. Read each treatment against the
        orange end; that is where a floating control has to survive.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {TREATMENTS.map((t) => (
          <div key={t.id}>
            <Specimen treatment={t} spec="rest" />
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <p className="mono-label text-zinc-900">{t.short}</p>
              {t.fails && <p className="mono-label shrink-0 text-red-700">Fails</p>}
            </div>
            <p className="mt-1 text-sm text-pm-grey-text">{t.contrast}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
