import { restaurants } from "@/data/restaurants";

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
      { name: "Cardiff", lat: 33.0161, lng: -117.2795 },
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

function validateRestaurantZoneAssignment() {
  const counts = new Map<string, number>(regionNames.map((name) => [name, 0]));
  const unassigned: string[] = [];

  for (const restaurant of restaurants) {
    const zone = regionForCoordinate(restaurant.lat, restaurant.lng);
    if (!zone || !counts.has(zone)) {
      unassigned.push(restaurant.name);
      continue;
    }
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }

  if (unassigned.length > 0) {
    throw new Error(
      `Zone assignment failed for ${unassigned.length} restaurant(s): ${unassigned.join(", ")}`,
    );
  }

  const distribution = regionNames.map((name) => `${name}: ${counts.get(name)}`).join(", ");
  console.log(`[regions] restaurant distribution — ${distribution}`);
}

validateRestaurantZoneAssignment();
