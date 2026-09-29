import type { Metadata } from "next";
import { PhoneLegalFrame } from "@/components/mobile/PhoneLegalFrame";
import { ResetPasswordForm } from "@/components/account/RecoveryForms";

export const metadata: Metadata = {
  title: "Reset password — PlateMaps",
};

/** Phone twin of `/reset-password`; the form is shared (RecoveryForms). */
export default function Page() {
  return (
    <PhoneLegalFrame>
      <ResetPasswordForm links={{ signIn: "/m/account", forgot: "/m/forgot-password", compact: true }} />
    </PhoneLegalFrame>
  );
}
