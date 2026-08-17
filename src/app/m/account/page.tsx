import { PhoneProfileScreen } from "@/components/mobile/PhoneProfileScreen";

/**
 * Your own profile — and, signed out, the screen where you sign in.
 *
 * Same split the web `/account` page makes, and the same reason it is a client
 * component: `useAuth` owns the session and every panel on it writes through
 * `/api/auth/*` or `/api/account/*`.
 */
export default function Page() {
  return <PhoneProfileScreen />;
}
