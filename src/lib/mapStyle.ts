import type { StyleSpecification } from "maplibre-gl";

/**
 * PlateMaps' own neo-noir night style, written from scratch.
 *
 * The geometry is raw OpenStreetMap vector data (via OpenFreeMap's free,
 * keyless tile endpoint) rendered client-side, so every street, coastline
 * and park is exactly where it really is — but every color, line width,
 * glow and label below is ours, not a template.
 *
 * Palette: charcoal night base with streets stepping up in brightness and
 * warmth by importance, a PlateMaps-orange glow pooled under the arterials,
 * deep harbor water, and labels that never fight the pins. Every fill sits
 * far enough from the base tone to stay legible on a dim screen.
 */
/* Labels set in the app's own machine voice: Spline Sans Mono, self-hosted as
   SDF glyphs under public/fonts (generated once from the Google Fonts TTF via
   tiny-sdf — see the git history's _glyphgen.html if it ever needs re-running,
   e.g. to add a non-latin range). The tile server only offers Noto Sans, so
   the glyphs URL points at our own origin. Only latin (0-255) is generated;
   a label needing another range would render without those glyphs. */
const GLYPHS_ORIGIN =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

export const NEO_NOIR_STYLE: StyleSpecification = {
  version: 8,
  glyphs: `${GLYPHS_ORIGIN}/fonts/{fontstack}/{range}.pbf`,
  sources: {
    ofm: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#191c22" } },

    {
      id: "residential",
      type: "fill",
      source: "ofm",
      "source-layer": "landuse",
      filter: ["in", "class", "residential", "suburb", "neighbourhood"],
      paint: { "fill-color": "#1e222a" },
    },
    {
      id: "parks",
      type: "fill",
      source: "ofm",
      "source-layer": "park",
      paint: { "fill-color": "#1d2c22" },
    },
    {
      id: "landcover-green",
      type: "fill",
      source: "ofm",
      "source-layer": "landcover",
      filter: ["in", "class", "grass", "wood", "farmland"],
      paint: { "fill-color": "#1b2921", "fill-opacity": 0.8 },
    },
    {
      id: "sand",
      type: "fill",
      source: "ofm",
      "source-layer": "landcover",
      filter: ["==", "class", "sand"],
      paint: { "fill-color": "#23262d" },
    },

    {
      id: "water",
      type: "fill",
      source: "ofm",
      "source-layer": "water",
      paint: { "fill-color": "#0f2434" },
    },
    {
      id: "waterway",
      type: "line",
      source: "ofm",
      "source-layer": "waterway",
      paint: { "line-color": "#0f2434", "line-width": 1.5 },
    },

    {
      id: "aeroway",
      type: "line",
      source: "ofm",
      "source-layer": "aeroway",
      filter: ["in", "class", "runway", "taxiway"],
      paint: { "line-color": "#272b33", "line-width": 3 },
    },

    {
      id: "buildings",
      type: "fill",
      source: "ofm",
      "source-layer": "building",
      minzoom: 13,
      maxzoom: 15,
      paint: {
        "fill-color": "#252932",
        "fill-outline-color": "#31363f",
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.5, 15, 1],
      },
    },

    /* The orange arterial glow that used to pool here was removed with the
       organic-clump redesign: the only orange light on the night map now
       comes from the restaurants themselves, so the glow always means food,
       never merely a big road. */

    {
      id: "road-path",
      type: "line",
      source: "ofm",
      "source-layer": "transportation",
      filter: ["==", "class", "path"],
      minzoom: 14,
      paint: {
        "line-color": "#2c313a",
        "line-dasharray": [2, 2],
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.5, 18, 2],
      },
    },
    {
      id: "road-minor",
      type: "line",
      source: "ofm",
      "source-layer": "transportation",
      filter: ["in", "class", "minor", "service", "track"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#343943",
        "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 12, 0.6, 14, 2, 18, 12],
      },
    },
    {
      id: "road-tertiary",
      type: "line",
      source: "ofm",
      "source-layer": "transportation",
      filter: ["==", "class", "tertiary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#3e444f",
        "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 11, 1, 14, 3, 18, 16],
      },
    },
    {
      id: "road-secondary",
      type: "line",
      source: "ofm",
      "source-layer": "transportation",
      filter: ["==", "class", "secondary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#4b525e",
        "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 10, 1.4, 14, 4, 18, 20],
      },
    },
    {
      id: "road-major-casing",
      type: "line",
      source: "ofm",
      "source-layer": "transportation",
      filter: ["in", "class", "motorway", "trunk", "primary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#20232a",
        "line-gap-width": [
          "interpolate",
          ["exponential", 1.5],
          ["zoom"],
          10,
          2.4,
          14,
          6,
          18,
          26,
        ],
        "line-width": 1.5,
      },
    },
    {
      id: "road-major",
      type: "line",
      source: "ofm",
      "source-layer": "transportation",
      filter: ["in", "class", "motorway", "trunk", "primary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#5e6570",
        "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 10, 2.4, 14, 6, 18, 26],
      },
    },
    {
      id: "railway",
      type: "line",
      source: "ofm",
      "source-layer": "transportation",
      filter: ["==", "class", "rail"],
      minzoom: 12,
      paint: {
        "line-color": "#2c3038",
        "line-dasharray": [3, 3],
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.75, 18, 3],
      },
    },

    {
      id: "boundary",
      type: "line",
      source: "ofm",
      "source-layer": "boundary",
      filter: ["<=", "admin_level", 6],
      paint: {
        "line-color": "#383d47",
        "line-dasharray": [4, 3],
        "line-width": 1,
      },
    },

    /* The camera sits at a fixed gentle tilt (see RestaurantMap), so from
       street-level zoom the flat footprints hand over to extruded night
       towers with real heights. */
    {
      id: "buildings-3d",
      type: "fill-extrusion",
      source: "ofm",
      "source-layer": "building",
      minzoom: 14.5,
      paint: {
        "fill-extrusion-color": "#2a303b",
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 14.5, 0, 15.5, 0.85],
      },
    },

    /* No OSM eatery layer here on purpose: every orange light on the map has
       to be a PlateMaps restaurant. Generic POI dots read as pins that don't
       glow and can't be clicked, which is worse than an empty block. */

    {
      id: "road-labels",
      type: "symbol",
      source: "ofm",
      "source-layer": "transportation_name",
      minzoom: 13,
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-font": ["Spline Sans Mono Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 9.5, 18, 12],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.1,
      },
      paint: {
        "text-color": "#6d747f",
        "text-halo-color": "#191c22",
        "text-halo-width": 1.2,
      },
    },
    {
      id: "water-labels",
      type: "symbol",
      source: "ofm",
      "source-layer": "water_name",
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Spline Sans Mono Regular"],
        "text-size": 12,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.2,
      },
      paint: {
        "text-color": "#3d6079",
        "text-halo-color": "#0f2434",
        "text-halo-width": 1,
      },
    },
    {
      id: "place-neighbourhood",
      type: "symbol",
      source: "ofm",
      "source-layer": "place",
      filter: ["in", "class", "suburb", "neighbourhood", "quarter"],
      minzoom: 11,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Spline Sans Mono Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 12.5],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.14,
      },
      paint: {
        "text-color": "#c6cdd8",
        "text-halo-color": "#191c22",
        "text-halo-width": 1.2,
      },
    },
    {
      id: "place-city",
      type: "symbol",
      source: "ofm",
      "source-layer": "place",
      filter: ["in", "class", "city", "town"],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Spline Sans Mono Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 12, 14, 15],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.16,
      },
      paint: {
        "text-color": "#c6cdd8",
        "text-halo-color": "#191c22",
        "text-halo-width": 1.4,
      },
    },
  ],
};
