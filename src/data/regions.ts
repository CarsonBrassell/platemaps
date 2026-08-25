export type RegionSubArea = {
  name: string;
  lat: number;
  lng: number;
};

export type Region = {
  name: string;
  subAreas: RegionSubArea[];
};

// Twelve zones covering all of San Diego County for the Feed map's filter
// chips. Sub-area coordinates are approximate reference points, not official
// boundary data. Every coordinate in the county is assigned to whichever
// sub-area (and therefore zone) it's nearest to — a plain nearest-neighbor
// rule, which by construction can never leave a coordinate unassigned, so it
// satisfies both "assign by coordinates" and "nothing is ever orphaned" at
// once. See regionForCoordinate below and the validation pass at the bottom
// of this file.
export const regions: Region[] = [
  {
    name: "Downtown",
    subAreas: [
      { name: "Gaslamp", lat: 32.7104, lng: -117.1601 },
      { name: "East Village", lat: 32.7135, lng: -117.1483 },
      { name: "Little Italy", lat: 32.7237, lng: -117.1686 },
      { name: "Marina", lat: 32.7079, lng: -117.1667 },
      { name: "Cortez Hill", lat: 32.7205, lng: -117.1591 },
      { name: "Barrio Logan", lat: 32.6935, lng: -117.1428 },
    ],
  },
  {
    name: "Uptown",
    subAreas: [
      { name: "Hillcrest", lat: 32.7483, lng: -117.1621 },
      { name: "North Park", lat: 32.7455, lng: -117.1298 },
      { name: "South Park", lat: 32.7205, lng: -117.1256 },
      { name: "Golden Hill", lat: 32.7166, lng: -117.1379 },
      { name: "Bankers Hill", lat: 32.728, lng: -117.1642 },
      { name: "Normal Heights", lat: 32.7592, lng: -117.1235 },
      { name: "University Heights", lat: 32.7568, lng: -117.1421 },
    ],
  },
  {
    name: "Beaches",
    subAreas: [
      { name: "Pacific Beach", lat: 32.8027, lng: -117.2231 },
      { name: "Mission Beach", lat: 32.7703, lng: -117.2515 },
      { name: "Ocean Beach", lat: 32.7494, lng: -117.2489 },
      { name: "Bay Park", lat: 32.7729, lng: -117.2087 },
    ],
  },
  {
    name: "Point Loma & Coronado",
    subAreas: [
      { name: "Point Loma", lat: 32.7157, lng: -117.24 },
      { name: "Liberty Station", lat: 32.744, lng: -117.2135 },
      { name: "Coronado", lat: 32.6859, lng: -117.1831 },
      { name: "Imperial Beach", lat: 32.575, lng: -117.115 },
    ],
  },
  {
    name: "Mid-City",
    subAreas: [
      { name: "City Heights", lat: 32.7511, lng: -117.1092 },
      { name: "Kensington", lat: 32.7614, lng: -117.1132 },
      { name: "Talmadge", lat: 32.7625, lng: -117.099 },
      { name: "Oak Park", lat: 32.7409, lng: -117.0679 },
      { name: "Rolando", lat: 32.7581, lng: -117.0562 },
      { name: "College Area", lat: 32.7757, lng: -117.0714 },
    ],
  },
  {
    name: "South Bay",
    subAreas: [
      { name: "Chula Vista", lat: 32.6401, lng: -117.0842 },
      { name: "National City", lat: 32.6781, lng: -117.0992 },
      { name: "Otay Mesa", lat: 32.573, lng: -116.945 },
      { name: "San Ysidro", lat: 32.5575, lng: -117.0281 },
      { name: "Bonita", lat: 32.662, lng: -117.0322 },
    ],
  },
  {
    name: "East County",
    subAreas: [
      { name: "La Mesa", lat: 32.7678, lng: -117.0231 },
      { name: "El Cajon", lat: 32.7948, lng: -116.9625 },
      { name: "Santee", lat: 32.8384, lng: -116.9739 },
      { name: "Lemon Grove", lat: 32.7423, lng: -117.0311 },
      { name: "Spring Valley", lat: 32.7448, lng: -116.9989 },
    ],
  },
  {
    name: "Mission Valley & Central",
    subAreas: [
      { name: "Mission Valley", lat: 32.7676, lng: -117.1652 },
      { name: "Serra Mesa", lat: 32.8028, lng: -117.1204 },
      { name: "Linda Vista", lat: 32.7869, lng: -117.1852 },
      { name: "Old Town", lat: 32.755, lng: -117.1965 },
      { name: "Mission Hills", lat: 32.7476, lng: -117.1889 },
    ],
  },
  {
    name: "University & Clairemont",
    subAreas: [
      { name: "La Jolla", lat: 32.8459, lng: -117.2725 },
      { name: "UTC", lat: 32.8703, lng: -117.2059 },
      { name: "University City", lat: 32.858, lng: -117.202 },
      { name: "Clairemont", lat: 32.828, lng: -117.19 },
      { name: "Kearny Mesa", lat: 32.81, lng: -117.14 },
    ],
  },
  {
    name: "North Coastal",
    subAreas: [
      { name: "Del Mar", lat: 32.9595, lng: -117.2653 },
      { name: "Solana Beach", lat: 32.9912, lng: -117.2712 },
      { name: "Encinitas", lat: 33.037, lng: -117.292 },
      { name: "Carlsbad", lat: 33.1581, lng: -117.3506 },
      { name: "Oceanside", lat: 33.1959, lng: -117.3795 },
      // Oceanside's point sits downtown, so the whole south end of the city
      // measured nearer to Carlsbad's and was labelled Carlsbad — four
      // restaurants along S Coast Hwy, all genuinely in Oceanside.
      { name: "South Oceanside", lat: 33.178, lng: -117.369 },
      { name: "Cardiff", lat: 33.0161, lng: -117.2795 },
      // Camp Pendleton is a separate place, eleven miles up the coast from
      // Oceanside's point and on a base you cannot drive onto casually.
      { name: "Camp Pendleton", lat: 33.3073, lng: -117.4064 },
      /*
       * La Costa and San Luis Rey were added here and taken straight back out.
       *
       * Each was the label of exactly ONE restaurant in the corpus, so each
       * point came from a single coordinate — and being a real place inside a
       * bigger city, each then captured everything around it. La Costa pulled
       * 116 restaurants out of Carlsbad and Encinitas; San Luis Rey took 36 out
       * of Oceanside.
       *
       * That is a downgrade even though the labels are accurate. Someone
       * looking for dinner searches Carlsbad, not La Costa, and this file feeds
       * the label people read and search on. **Add a point only for a place
       * restaurants are already commonly labelled with** — a sub-neighbourhood
       * with one claimant is evidence of an OSM quirk, not of a gap.
       */
    ],
  },
  {
    name: "North Inland",
    subAreas: [
      { name: "Mira Mesa", lat: 32.9068, lng: -117.142 },
      { name: "Scripps Ranch", lat: 32.9106, lng: -117.1039 },
      { name: "Rancho Bernardo", lat: 33.01, lng: -117.073 },
      { name: "Poway", lat: 32.9628, lng: -117.0359 },
      { name: "Rancho Penasquitos", lat: 32.9628, lng: -117.1653 },
      { name: "Carmel Valley", lat: 32.9595, lng: -117.234 },
      { name: "Sorrento Valley", lat: 32.902, lng: -117.1958 },
      // These three were missing entirely, so their restaurants fell to
      // whichever listed point happened to be nearest — all of them to
      // Rancho Penasquitos or Rancho Bernardo. Each point is placed at the
      // commercial centre where the restaurants actually are, not at the
      // geographic centre of the neighbourhood, since these are reference
      // points for a nearest-neighbour rule rather than boundary data.
      { name: "Pacific Highlands Ranch", lat: 32.962, lng: -117.1893 }, // Village Way
      { name: "Rancho Santa Fe", lat: 33.005, lng: -117.198 }, // between the village and Del Rayo
      { name: "Carmel Mountain Ranch", lat: 32.9835, lng: -117.079 },
    ],
  },
  /*
   * Inland North County — the largest gap this file had.
   *
   * "North Inland" above is really the northern edge of the City of San Diego:
   * Mira Mesa, Poway, Rancho Bernardo. Escondido, San Marcos and Vista are
   * separate cities ten to twenty miles further out, and until now none of them
   * had a point. Every restaurant in them fell to Rancho Bernardo, the nearest
   * thing defined — 94 in Escondido, 84 in San Marcos, 56 in Vista.
   *
   * That is also why `fix-neighborhoods.mjs` wanted to relabel 109 Escondido
   * restaurants AS Rancho Bernardo, each one six to nine miles from the point
   * it was being assigned. The script was faithfully reporting the nearest
   * defined point; the defined points were the problem. Adding these makes that
   * script correct rather than destructive — run it again after this.
   */
  {
    name: "North County Inland",
    subAreas: [
      { name: "Escondido", lat: 33.1206, lng: -117.0838 },
      { name: "San Marcos", lat: 33.1348, lng: -117.1785 },
      { name: "Vista", lat: 33.1882, lng: -117.2377 },
      { name: "Bonsall", lat: 33.2938, lng: -117.2238 },
      { name: "Fallbrook", lat: 33.3723, lng: -117.2465 },
      { name: "Valley Center", lat: 33.236, lng: -117.048 },
      { name: "Pala", lat: 33.3656, lng: -117.08 },
      { name: "Pauma Valley", lat: 33.303, lng: -116.9772 },
      { name: "Palomar Mountain", lat: 33.3144, lng: -116.8656 },
      { name: "Borrego Springs", lat: 33.2321, lng: -116.3291 },
    ],
  },
  {
    name: "Far East County",
    subAreas: [
      { name: "Alpine", lat: 32.8351, lng: -116.7664 },
      { name: "Lakeside", lat: 32.8595, lng: -116.9231 },
      { name: "Ramona", lat: 33.0417, lng: -116.8672 },
      { name: "Julian", lat: 33.0781, lng: -116.6017 },
      { name: "Jamul", lat: 32.7156, lng: -116.8703 },
      { name: "Campo", lat: 32.5978, lng: -116.4692 },
      // Also from the county-wide import. Sparse, but a restaurant in Descanso
      // measured against Alpine is 15 miles out and reads as simply wrong.
      { name: "Descanso", lat: 32.8472, lng: -116.6145 },
      { name: "Mount Laguna", lat: 32.862, lng: -116.42 },
      { name: "Dulzura", lat: 32.6439, lng: -116.7809 },
    ],
  },
];

export const regionNames = regions.map((r) => r.name);

// Nearest sub-area (by real-world distance) determines the zone — the single
// rule used everywhere, so a coordinate near a listed sub-area and one that
// isn't both resolve the same way, and every coordinate always gets a zone.
export function regionForCoordinate(lat: number, lng: number): string {
  const latRad = (lat * Math.PI) / 180;
  let best = regions[0].name;
  let bestDist = Infinity;
  for (const region of regions) {
    for (const area of region.subAreas) {
      const dLat = (lat - area.lat) * 111_320;
      const dLng = (lng - area.lng) * 111_320 * Math.cos(latRad);
      const dist = dLat * dLat + dLng * dLng;
      if (dist < bestDist) {
        bestDist = dist;
        best = region.name;
      }
    }
  }
  return best;
}

/*
 * The zone-assignment check that used to run here, at module load, has moved
 * to `scripts/import-restaurants.mjs`.
 *
 * It had to: restaurants now live in Postgres, so there is no array to walk at
 * import time. It also belongs there — the import is the moment coordinates
 * enter the system, which is the moment an unassignable one is worth failing
 * on. Running it here meant a console.log on every client bundle that touched
 * this file, to re-prove something the nearest-neighbour rule above makes
 * structurally impossible.
 */
