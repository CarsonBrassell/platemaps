import type { Metadata } from "next";
import { PhoneLegalFrame } from "@/components/mobile/PhoneLegalFrame";
import { VerifyEmailForm } from "@/components/account/RecoveryForms";

export const metadata: Metadata = {
  title: "Confirm email — PlateMaps",
};

/** Phone twin of `/verify-email`; the form is shared (RecoveryForms). */
export default function Page() {
  return (
    <PhoneLegalFrame>
      <VerifyEmailForm links={{ signIn: "/m/account", forgot: "/m/forgot-password", compact: true }} />
    </PhoneLegalFrame>
  );
}
