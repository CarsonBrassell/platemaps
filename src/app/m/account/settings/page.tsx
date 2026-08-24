import { PhoneSettingsScreen } from "@/components/mobile/PhoneSettingsScreen";

/**
 * Settings, phone.
 *
 * Same split the web `/account/settings` page makes, and the same reason it is
 * a client component underneath: `useAuth` owns the session and every row on
 * it writes through `/api/auth/*` or `/api/account/*`.
 */
export default function Page() {
  return <PhoneSettingsScreen />;
}
