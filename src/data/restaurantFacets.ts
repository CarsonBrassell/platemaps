/**
 * The small fixed lists that go with the restaurant corpus: map zones, the
 * neighborhood names drawn from them, and the filter vocabulary.
 *
 * Split out of `data/restaurants.ts` so that a component needing one short
 * list does not pull in the 16,000-line seed array alongside it.
 */

import type { NeighborhoodCenter } from "@/data/restaurantTypes";

// Approximate centroid per major neighborhood, used to draw map zones so every
// part of the city falls in one — independent of which neighborhoods happen to
// have a restaurant right now. Small/minor areas aren't tracked separately, so
// they fall into whichever of these zones is geographically nearest.
export const neighborhoodCenters: NeighborhoodCenter[] = [
  { name: "Gaslamp Quarter", lat: 32.7104, lng: -117.1601, estimatedRestaurantCount: 150 },
  { name: "Little Italy", lat: 32.7237, lng: -117.1686, estimatedRestaurantCount: 100 },
  { name: "North Park", lat: 32.7455, lng: -117.1298, estimatedRestaurantCount: 110 },
  { name: "Hillcrest", lat: 32.7483, lng: -117.1621, estimatedRestaurantCount: 95 },
  { name: "Pacific Beach", lat: 32.8027, lng: -117.2231, estimatedRestaurantCount: 120 },
  { name: "La Jolla", lat: 32.8459, lng: -117.2725, estimatedRestaurantCount: 130 },
  { name: "Ocean Beach", lat: 32.7494, lng: -117.2489, estimatedRestaurantCount: 55 },
  { name: "Barrio Logan", lat: 32.6935, lng: -117.1428, estimatedRestaurantCount: 30 },
  { name: "South Park", lat: 32.7205, lng: -117.1256, estimatedRestaurantCount: 45 },
  { name: "East Village", lat: 32.7135, lng: -117.1483, estimatedRestaurantCount: 90 },
  { name: "Point Loma", lat: 32.7157, lng: -117.24, estimatedRestaurantCount: 45 },
  { name: "Mission Valley", lat: 32.7676, lng: -117.1652, estimatedRestaurantCount: 60 },
  { name: "Clairemont", lat: 32.828, lng: -117.19, estimatedRestaurantCount: 35 },
  { name: "Kearny Mesa", lat: 32.81, lng: -117.14, estimatedRestaurantCount: 140 },
  { name: "Coronado", lat: 32.6859, lng: -117.1831, estimatedRestaurantCount: 40 },
  { name: "Chula Vista", lat: 32.6401, lng: -117.0842, estimatedRestaurantCount: 70 },
  { name: "National City", lat: 32.6781, lng: -117.0992, estimatedRestaurantCount: 30 },
  { name: "Imperial Beach", lat: 32.575, lng: -117.115, estimatedRestaurantCount: 15 },
  { name: "Otay Mesa", lat: 32.573, lng: -116.945, estimatedRestaurantCount: 10 },
  { name: "La Mesa", lat: 32.7678, lng: -117.0231, estimatedRestaurantCount: 50 },
  { name: "El Cajon", lat: 32.7948, lng: -116.9625, estimatedRestaurantCount: 65 },
  { name: "Santee", lat: 32.8384, lng: -116.9739, estimatedRestaurantCount: 25 },
  { name: "Mira Mesa", lat: 32.9068, lng: -117.142, estimatedRestaurantCount: 55 },
  { name: "Rancho Bernardo", lat: 33.01, lng: -117.073, estimatedRestaurantCount: 35 },
  { name: "University City", lat: 32.858, lng: -117.202, estimatedRestaurantCount: 45 },
  { name: "Carmel Valley", lat: 32.9595, lng: -117.234, estimatedRestaurantCount: 35 },
  { name: "Poway", lat: 32.9628, lng: -117.0359, estimatedRestaurantCount: 30 },
  { name: "Rancho Penasquitos", lat: 32.9628, lng: -117.1653, estimatedRestaurantCount: 25 },
  { name: "Lakeside", lat: 32.8595, lng: -116.9231, estimatedRestaurantCount: 20 },
  { name: "San Ysidro", lat: 32.5575, lng: -117.0281, estimatedRestaurantCount: 25 },
  { name: "Sorrento Valley", lat: 32.902, lng: -117.1958, estimatedRestaurantCount: 20 },
  { name: "Serra Mesa", lat: 32.8028, lng: -117.1204, estimatedRestaurantCount: 20 },
  { name: "Bay Park", lat: 32.7729, lng: -117.2087, estimatedRestaurantCount: 25 },
  { name: "Golden Hill", lat: 32.7166, lng: -117.1379, estimatedRestaurantCount: 35 },
  { name: "Alpine", lat: 32.8351, lng: -116.7664, estimatedRestaurantCount: 15 },
  { name: "4S Ranch", lat: 33.0203, lng: -117.1289, estimatedRestaurantCount: 20 },
  { name: "Otay Ranch", lat: 32.6127, lng: -116.9702, estimatedRestaurantCount: 25 },
];

export const neighborhoods = neighborhoodCenters.map((n) => n.name);

export const cuisines = [
  "American",
  "Barbeque",
  "Bars",
  "Breakfast & Brunch",
  "Breweries",
  "Diners",
  "Italian",
  "Korean",
  "Mexican",
  "New American",
  "Pizza",
  "Sandwiches",
  "Seafood",
  "Sushi Bars",
  "Tapas Bars",
  "Thai",
];
