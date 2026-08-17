import { PhoneFriendsScreen } from "@/components/mobile/PhoneFriendsScreen";

/**
 * Friends, phone version.
 *
 * A thin route: the screen is a client component because the whole graph —
 * requests, the list, and answering one — is fetched behind the session cookie
 * from `/api/friends*`, exactly as the web `/friends` page does it. Nothing is
 * read from `lib/db.ts` here; that module is server-only and the two versions
 * deliberately share one data layer rather than growing two.
 */
export default function Page() {
  return <PhoneFriendsScreen />;
}
