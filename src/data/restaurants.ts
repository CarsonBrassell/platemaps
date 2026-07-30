export type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  neighborhood: string;
  distance: string;
  status: "calm" | "urgent";
  statusLabel: string;
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
  },
  {
    id: "2",
    name: "Karina's Tacos",
    cuisine: "Mexican",
    neighborhood: "Ocean Beach",
    distance: "1.2 mi",
    status: "urgent",
    statusLabel: "Closes in 45 min",
  },
  {
    id: "3",
    name: "Communal Coffee",
    cuisine: "Cafe",
    neighborhood: "North Park",
    distance: "0.3 mi",
    status: "calm",
    statusLabel: "Open til 6pm",
  },
  {
    id: "4",
    name: "Herb and Wood",
    cuisine: "Californian",
    neighborhood: "Little Italy",
    distance: "2.1 mi",
    status: "urgent",
    statusLabel: "25 min wait",
  },
  {
    id: "5",
    name: "Sushi Ota",
    cuisine: "Japanese",
    neighborhood: "Pacific Beach",
    distance: "3.4 mi",
    status: "calm",
    statusLabel: "No wait",
  },
  {
    id: "6",
    name: "Prep Kitchen",
    cuisine: "American",
    neighborhood: "La Jolla",
    distance: "4.0 mi",
    status: "calm",
    statusLabel: "Open til 9pm",
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
