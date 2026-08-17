import { PhoneFeedScreen } from "@/components/mobile/PhoneFeedScreen";

/**
 * Feed, phone version.
 *
 * A one-line server page over a client screen, the same shape the web `/feed`
 * has: everything on this screen is a live list with optimistic writes against
 * `/api/posts/*`, so there is nothing for the server to render ahead of the
 * session. The data layer is the web feed's — `usePostFeed` and the same two
 * routes — and only the components differ. See PhoneFeedScreen.
 *
 * No `searchParams` here on purpose. The nav variant switcher (`?nav=`) is read
 * by PhoneShell in the layout, and content links inside /m don't carry it —
 * PhoneRestaurantCard set that precedent, and it means this page needs no
 * Suspense boundary of its own.
 */
export default function Page() {
  return <PhoneFeedScreen />;
}
