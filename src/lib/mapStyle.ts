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
export const NEO_NOIR_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
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

    /* The signature move: big roads sit on a wide, blurred pool of
       PlateMaps orange, like sodium streetlights seen from a rooftop. */
    {
      id: "road-glow-major",
      type: "line",
      source: "ofm",
      "source-layer": "transportation",
      filter: ["in", "class", "motorway", "trunk", "primary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#e8875a",
        "line-opacity": 0.14,
        "line-blur": 4,
        "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 10, 8, 14, 18, 18, 46],
      },
    },

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

    /* Every other eatery in the city as a faint ember, so the blocks between
       PlateMaps pins still read as a living food scene. */
    {
      id: "food-pois",
      type: "circle",
      source: "ofm",
      "source-layer": "poi",
      minzoom: 13,
      filter: [
        "in",
        "class",
        "restaurant",
        "fast_food",
        "cafe",
        "bar",
        "beer",
        "bakery",
        "ice_cream",
      ],
      paint: {
        "circle-color": "#c98757",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 1.2, 16, 2.5, 18, 4],
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.3, 16, 0.55],
      },
    },

    {
      id: "road-labels",
      type: "symbol",
      source: "ofm",
      "source-layer": "transportation_name",
      minzoom: 13,
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 18, 13],
      },
      paint: {
        "text-color": "#8a92a0",
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
        "text-font": ["Noto Sans Italic"],
        "text-size": 12,
        "text-letter-spacing": 0.15,
      },
      paint: {
        "text-color": "#4d7d99",
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
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10.5, 15, 13],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.12,
      },
      paint: {
        "text-color": "#8f97a4",
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
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 13, 14, 17],
      },
      paint: {
        "text-color": "#c6cdd8",
        "text-halo-color": "#191c22",
        "text-halo-width": 1.4,
      },
    },
  ],
};
