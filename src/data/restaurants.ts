export type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  neighborhood: string;
  distance: string;
  status: "calm" | "urgent";
  statusLabel: string;
  rating: number;
  reviewCount: number;
};

export const restaurants: Restaurant[] = [
  {
    id: "1",
    name: "Mariscos German",
    cuisine: "Baja seafood",
    neighborhood: "Barrio Logan",
    distance: "0.6 mi",
    status: "calm",
    statusLabel: "No wait",
    rating: 4.7,
    reviewCount: 892,
  },
  {
    id: "2",
    name: "Karina's Tacos",
    cuisine: "Mexican",
    neighborhood: "Ocean Beach",
    distance: "1.2 mi",
    status: "urgent",
    statusLabel: "Closes in 45 min",
    rating: 4.5,
    reviewCount: 341,
  },
  {
    id: "3",
    name: "Communal Coffee",
    cuisine: "Cafe",
    neighborhood: "North Park",
    distance: "0.3 mi",
    status: "calm",
    statusLabel: "Open til 6pm",
    rating: 4.6,
    reviewCount: 1204,
  },
  {
    id: "4",
    name: "Herb and Wood",
    cuisine: "Californian",
    neighborhood: "Little Italy",
    distance: "2.1 mi",
    status: "urgent",
    statusLabel: "25 min wait",
    rating: 4.4,
    reviewCount: 2758,
  },
  {
    id: "5",
    name: "Sushi Ota",
    cuisine: "Japanese",
    neighborhood: "Pacific Beach",
    distance: "3.4 mi",
    status: "calm",
    statusLabel: "No wait",
    rating: 4.8,
    reviewCount: 967,
  },
  {
    id: "6",
    name: "Prep Kitchen",
    cuisine: "American",
    neighborhood: "La Jolla",
    distance: "4.0 mi",
    status: "calm",
    statusLabel: "Open til 9pm",
    rating: 4.3,
    reviewCount: 1583,
  },
];

export const neighborhoods = [
  "North Park",
  "Barrio Logan",
  "La Jolla",
  "Gaslamp",
  "Ocean Beach",
];

export const cuisines = [
  "Mexican",
  "Baja seafood",
  "Japanese",
  "Italian",
  "American",
  "Californian",
  "Asian fusion",
  "Mediterranean",
  "Indian",
  "Thai",
  "BBQ",
  "Vegan",
];
