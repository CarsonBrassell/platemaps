import { dishesByRestaurant } from "@/data/dishes";

export type MapComment = {
  id: string;
  restaurantId: string;
  text: string;
  score?: number;
  upvotes?: number;
  /** Whether the signed-in user has already upvoted the underlying post. */
  upvotedByMe?: boolean;
  createdAt?: string;
  rating?: string | null;
  dishPrefix?: string | null;
  postId?: string;
  dishId?: string;
};

type RawComment = {
  id: string;
  restaurantId: string;
  text: string;
  // Set only when the comment is about a specific dish — becomes the
  // orange-highlighted "Dish XX%" prefix, same as a real food review.
  dish?: string;
};

const rawCommentsByRestaurant: Record<string, RawComment[]> = {
  "1": [
    { id: "m1-1", restaurantId: "1", text: "is the move here", dish: "Marlin taco" },
    { id: "m1-2", restaurantId: "1", text: "Line moves fast, worth the wait" },
    { id: "m1-3", restaurantId: "1", text: "is the best in Barrio Logan", dish: "Fish taco" },
    { id: "m1-4", restaurantId: "1", text: "Cash only, bring exact change" },
  ],
  "2": [
    { id: "m2-1", restaurantId: "2", text: "slaps", dish: "Al pastor taco" },
    { id: "m2-2", restaurantId: "2", text: "Late night spot after the bars" },
    { id: "m2-3", restaurantId: "2", text: "is huge", dish: "California burrito" },
    { id: "m2-4", restaurantId: "2", text: "Salsa bar is underrated" },
  ],
  "3": [
    { id: "m3-1", restaurantId: "3", text: "here is perfect", dish: "Cortado" },
    { id: "m3-2", restaurantId: "3", text: "Great spot to work from" },
    { id: "m3-3", restaurantId: "3", text: "sells out early", dish: "Almond croissant" },
    { id: "m3-4", restaurantId: "3", text: "Patio seating is the best part" },
  ],
  "4": [
    { id: "m4-1", restaurantId: "4", text: "get them", dish: "Wood-fired oysters" },
    { id: "m4-2", restaurantId: "4", text: "Great for a date night" },
    { id: "m4-3", restaurantId: "4", text: "is unreal", dish: "Budino" },
    { id: "m4-4", restaurantId: "4", text: "Book ahead, gets packed" },
  ],
  "5": [
    { id: "m5-1", restaurantId: "5", text: "is worth the splurge", dish: "Omakase" },
    { id: "m5-2", restaurantId: "5", text: "melts in your mouth", dish: "Toro nigiri" },
    { id: "m5-3", restaurantId: "5", text: "Sit at the bar if you can" },
    { id: "m5-4", restaurantId: "5", text: "Reservations fill up weeks out" },
  ],
  "6": [
    { id: "m6-1", restaurantId: "6", text: "is a hidden gem", dish: "Prime burger" },
    { id: "m6-2", restaurantId: "6", text: "don't skip them", dish: "Brussels sprouts" },
    { id: "m6-3", restaurantId: "6", text: "Great happy hour deals" },
    { id: "m6-4", restaurantId: "6", text: "Cozy spot, good for groups" },
  ],
  "7": [
    { id: "m7-1", restaurantId: "7", text: "is unreal here", dish: "Burger" },
    { id: "m7-2", restaurantId: "7", text: "Great for a night out downtown" },
    { id: "m7-3", restaurantId: "7", text: "Gets loud on weekends" },
  ],
  "8": [
    { id: "m8-1", restaurantId: "8", text: "here is the best in Hillcrest", dish: "Shawarma" },
    { id: "m8-2", restaurantId: "8", text: "Cozy patio seating" },
    { id: "m8-3", restaurantId: "8", text: "Great vegetarian options" },
  ],
  "9": [
    { id: "m9-1", restaurantId: "9", text: "is a must", dish: "Burrata toast" },
    { id: "m9-2", restaurantId: "9", text: "Perfect brunch spot" },
    { id: "m9-3", restaurantId: "9", text: "Small menu but everything's good" },
  ],
  "10": [
    { id: "m10-1", restaurantId: "10", text: "Great pregame spot before Padres games" },
    { id: "m10-2", restaurantId: "10", text: "and a beer, can't go wrong", dish: "Burger" },
    { id: "m10-3", restaurantId: "10", text: "Packed on game nights" },
  ],
  "11": [
    { id: "m11-1", restaurantId: "11", text: "rivals the Baja spots", dish: "Fish taco" },
    { id: "m11-2", restaurantId: "11", text: "Great ocean view" },
    { id: "m11-3", restaurantId: "11", text: "is rich and hearty", dish: "Clam chowder" },
  ],
  "12": [
    { id: "m12-1", restaurantId: "12", text: "Solid mall food court upgrade" },
    { id: "m12-2", restaurantId: "12", text: "Good for a quick lunch" },
    { id: "m12-3", restaurantId: "12", text: "hits the spot", dish: "Cheeseburger" },
  ],
  "13": [
    { id: "m13-1", restaurantId: "13", text: "Classic diner, big portions" },
    { id: "m13-2", restaurantId: "13", text: "are huge", dish: "Pancakes" },
    { id: "m13-3", restaurantId: "13", text: "Great late night breakfast" },
  ],
  "14": [
    { id: "m14-1", restaurantId: "14", text: "is the best in Kearny Mesa", dish: "Pho" },
    { id: "m14-2", restaurantId: "14", text: "are addictive", dish: "Garlic noodles" },
    { id: "m14-3", restaurantId: "14", text: "Convoy district gem" },
  ],
  "15": [
    { id: "m15-1", restaurantId: "15", text: "are worth the price", dish: "Crab cakes" },
    { id: "m15-2", restaurantId: "15", text: "Beautiful bay views" },
    { id: "m15-3", restaurantId: "15", text: "Great date night spot" },
  ],
  "16": [
    { id: "m16-1", restaurantId: "16", text: "are legit", dish: "Street tacos" },
    { id: "m16-2", restaurantId: "16", text: "Family-owned, great service" },
    { id: "m16-3", restaurantId: "16", text: "are massive", dish: "Carne asada fries" },
  ],
  "17": [
    { id: "m17-1", restaurantId: "17", text: "is the star here", dish: "Quesabirria" },
    { id: "m17-2", restaurantId: "17", text: "Cheap and delicious" },
    { id: "m17-3", restaurantId: "17", text: "Line moves fast" },
  ],
  "18": [
    { id: "m18-1", restaurantId: "18", text: "Casual surf-town vibe" },
    { id: "m18-2", restaurantId: "18", text: "are fresh", dish: "Fish tacos" },
    { id: "m18-3", restaurantId: "18", text: "Right by the beach" },
  ],
  "19": [
    { id: "m19-1", restaurantId: "19", text: "Hidden gem near the border" },
    { id: "m19-2", restaurantId: "19", text: "is huge", dish: "Carne asada plate" },
    { id: "m19-3", restaurantId: "19", text: "Friendly staff" },
  ],
  "20": [
    { id: "m20-1", restaurantId: "20", text: "Great local beer selection" },
    { id: "m20-2", restaurantId: "20", text: "is a winner", dish: "Tap house burger" },
    { id: "m20-3", restaurantId: "20", text: "Good spot to watch the game" },
  ],
  "21": [
    { id: "m21-1", restaurantId: "21", text: "is the best in El Cajon", dish: "Kabobs" },
    { id: "m21-2", restaurantId: "21", text: "Portions are generous" },
    { id: "m21-3", restaurantId: "21", text: "Authentic and affordable" },
  ],
  "22": [
    { id: "m22-1", restaurantId: "22", text: "melts in your mouth", dish: "Brisket" },
    { id: "m22-2", restaurantId: "22", text: "is rich", dish: "Smoked mac and cheese" },
    { id: "m22-3", restaurantId: "22", text: "Worth the drive out" },
  ],
  "23": [
    { id: "m23-1", restaurantId: "23", text: "is a must order", dish: "Sisig" },
    { id: "m23-2", restaurantId: "23", text: "Feels like home cooking" },
    { id: "m23-3", restaurantId: "23", text: "Great portions for the price" },
  ],
  "24": [
    { id: "m24-1", restaurantId: "24", text: "cooked perfectly", dish: "New York strip" },
    { id: "m24-2", restaurantId: "24", text: "Great for special occasions" },
    { id: "m24-3", restaurantId: "24", text: "A bit pricey but worth it" },
  ],
  "25": [
    { id: "m25-1", restaurantId: "25", text: "fresh, build your own", dish: "Ahi bowl" },
    { id: "m25-2", restaurantId: "25", text: "Quick lunch near campus" },
    { id: "m25-3", restaurantId: "25", text: "Great portions for the price" },
  ],
  "26": [
    { id: "m26-1", restaurantId: "26", text: "Cozy neighborhood Italian spot" },
    { id: "m26-2", restaurantId: "26", text: "is fantastic", dish: "Osso buco" },
    { id: "m26-3", restaurantId: "26", text: "Great for date night" },
  ],
};

function seedHash(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 100003;
  return hash;
}

function findDishId(restaurantId: string, dishName: string): string | undefined {
  const dishes = dishesByRestaurant[restaurantId] ?? [];
  return dishes.find((d) => d.name.toLowerCase() === dishName.toLowerCase())?.id;
}

// These are seed flavor comments, not real posts — give each a believable
// upvote count and age, and, for the ones about a specific dish, a rating
// that renders as the same orange "Dish XX%" prefix a real food review gets,
// linked to that dish's real id in the menu when the names match.
export const mapCommentsByRestaurant: Record<string, MapComment[]> = Object.fromEntries(
  Object.entries(rawCommentsByRestaurant).map(([restaurantId, comments]) => [
    restaurantId,
    comments.map((c): MapComment => {
      const seed = seedHash(c.id);
      return {
        id: c.id,
        restaurantId: c.restaurantId,
        text: c.text,
        upvotes: 2 + (seed % 23),
        createdAt: new Date(Date.now() - (1 + (seed % 71)) * 3_600_000).toISOString(),
        dishPrefix: c.dish ? `${c.dish} ${70 + (seed % 29)}%` : null,
        dishId: c.dish ? findDishId(restaurantId, c.dish) : undefined,
      };
    }),
  ]),
);
