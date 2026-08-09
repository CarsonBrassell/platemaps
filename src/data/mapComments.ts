import { dishesByRestaurant } from "@/data/dishes";

export type MapComment = {
  id: string;
  restaurantId: string;
  text: string;
  score?: number;
  upvotes?: number;
  /** Whether the signed-in user has already upvoted the underlying post. */
  upvotedByMe?: boolean;
  /** Whether the signed-in user has already hearted the underlying post —
      only meaningful when the map is showing Friends-sourced data. */
  heartedByMe?: boolean;
  createdAt?: string;
  rating?: string | null;
  dishPrefix?: string | null;
  /** Replies on the underlying post. Seeded chatter has none and shows none. */
  commentCount?: number;
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

// Seeded map bubbles, re-keyed alongside dishes.ts so a bubble's dish name
// still resolves inside the restaurant it is pinned to.
const rawCommentsByRestaurant: Record<string, RawComment[]> = {
  "1": [
    { id: "m1-1", restaurantId: "1", text: "Great pregame spot before Padres games" },
    { id: "m1-2", restaurantId: "1", text: "and a beer, can't go wrong", dish: "Burger" },
    { id: "m1-3", restaurantId: "1", text: "Packed on game nights" },
  ],
  "3": [
    { id: "m3-1", restaurantId: "3", text: "is unreal here", dish: "Burger" },
    { id: "m3-2", restaurantId: "3", text: "Great for a night out downtown" },
    { id: "m3-3", restaurantId: "3", text: "Gets loud on weekends" },
  ],
  "4": [
    { id: "m4-1", restaurantId: "4", text: "are legit", dish: "Street tacos" },
    { id: "m4-2", restaurantId: "4", text: "Family-owned, great service" },
    { id: "m4-3", restaurantId: "4", text: "are massive", dish: "Carne asada fries" },
  ],
  "5": [
    { id: "m5-1", restaurantId: "5", text: "get them", dish: "Wood-fired oysters" },
    { id: "m5-2", restaurantId: "5", text: "Great for a date night" },
    { id: "m5-3", restaurantId: "5", text: "is unreal", dish: "Budino" },
    { id: "m5-4", restaurantId: "5", text: "Book ahead, gets packed" },
  ],
  "6": [
    { id: "m6-1", restaurantId: "6", text: "is a hidden gem", dish: "Prime burger" },
    { id: "m6-2", restaurantId: "6", text: "don't skip them", dish: "Brussels sprouts" },
    { id: "m6-3", restaurantId: "6", text: "Great happy hour deals" },
    { id: "m6-4", restaurantId: "6", text: "Cozy spot, good for groups" },
  ],
  "7": [
    { id: "m7-1", restaurantId: "7", text: "is worth the splurge", dish: "Omakase" },
    { id: "m7-2", restaurantId: "7", text: "melts in your mouth", dish: "Toro nigiri" },
    { id: "m7-3", restaurantId: "7", text: "Sit at the bar if you can" },
    { id: "m7-4", restaurantId: "7", text: "Reservations fill up weeks out" },
  ],
  "8": [
    { id: "m8-1", restaurantId: "8", text: "is the move here", dish: "Marlin taco" },
    { id: "m8-2", restaurantId: "8", text: "Line moves fast, worth the wait" },
    { id: "m8-3", restaurantId: "8", text: "is the one to get", dish: "Fish taco" },
    { id: "m8-4", restaurantId: "8", text: "Cash only, bring exact change" },
  ],
  "10": [
    { id: "m10-1", restaurantId: "10", text: "Classic diner, big portions" },
    { id: "m10-2", restaurantId: "10", text: "are huge", dish: "Pancakes" },
    { id: "m10-3", restaurantId: "10", text: "Great late night breakfast" },
  ],
  "11": [
    { id: "m11-1", restaurantId: "11", text: "rivals the Baja spots", dish: "Fish taco" },
    { id: "m11-2", restaurantId: "11", text: "Great ocean view" },
    { id: "m11-3", restaurantId: "11", text: "is rich and hearty", dish: "Clam chowder" },
  ],
  "12": [
    { id: "m12-1", restaurantId: "12", text: "Casual surf-town vibe" },
    { id: "m12-2", restaurantId: "12", text: "are fresh", dish: "Fish tacos" },
    { id: "m12-3", restaurantId: "12", text: "Right by the beach" },
  ],
  "16": [
    { id: "m16-1", restaurantId: "16", text: "slaps", dish: "Al pastor taco" },
    { id: "m16-2", restaurantId: "16", text: "Late night spot after the bars" },
    { id: "m16-3", restaurantId: "16", text: "is huge", dish: "California burrito" },
    { id: "m16-4", restaurantId: "16", text: "Salsa bar is underrated" },
  ],
  "18": [
    { id: "m18-1", restaurantId: "18", text: "Cozy neighborhood Italian spot" },
    { id: "m18-2", restaurantId: "18", text: "is fantastic", dish: "Osso buco" },
    { id: "m18-3", restaurantId: "18", text: "Great for date night" },
  ],
  "19": [
    { id: "m19-1", restaurantId: "19", text: "cooked perfectly", dish: "New York strip" },
    { id: "m19-2", restaurantId: "19", text: "Great for special occasions" },
    { id: "m19-3", restaurantId: "19", text: "A bit pricey but worth it" },
  ],
  "20": [
    { id: "m20-1", restaurantId: "20", text: "melts in your mouth", dish: "Brisket" },
    { id: "m20-2", restaurantId: "20", text: "is rich", dish: "Smoked mac and cheese" },
    { id: "m20-3", restaurantId: "20", text: "Worth the drive out" },
  ],
  "26": [
    { id: "m26-1", restaurantId: "26", text: "are worth the price", dish: "Crab cakes" },
    { id: "m26-2", restaurantId: "26", text: "Beautiful bay views" },
    { id: "m26-3", restaurantId: "26", text: "Great date night spot" },
  ],
  "27": [
    { id: "m27-1", restaurantId: "27", text: "is the star here", dish: "Quesabirria" },
    { id: "m27-2", restaurantId: "27", text: "Cheap and delicious" },
    { id: "m27-3", restaurantId: "27", text: "Line moves fast" },
  ],
  "28": [
    { id: "m28-1", restaurantId: "28", text: "is a must", dish: "Burrata toast" },
    { id: "m28-2", restaurantId: "28", text: "Perfect brunch spot" },
    { id: "m28-3", restaurantId: "28", text: "Small menu but everything's good" },
  ],
  "34": [
    { id: "m34-1", restaurantId: "34", text: "Solid mall food court upgrade" },
    { id: "m34-2", restaurantId: "34", text: "Good for a quick lunch" },
    { id: "m34-3", restaurantId: "34", text: "hits the spot", dish: "Cheeseburger" },
  ],
  "35": [
    { id: "m35-1", restaurantId: "35", text: "fresh, build your own", dish: "Ahi bowl" },
    { id: "m35-2", restaurantId: "35", text: "Quick lunch near campus" },
    { id: "m35-3", restaurantId: "35", text: "Great portions for the price" },
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
