import type { Metadata } from "next";
import { PhoneLegalFrame } from "@/components/mobile/PhoneLegalFrame";
import { ForgotPasswordForm } from "@/components/account/RecoveryForms";

export const metadata: Metadata = {
  title: "Forgot password — PlateMaps",
};

/** Phone twin of `/forgot-password`; the form is shared (RecoveryForms). */
export default function Page() {
  return (
    <PhoneLegalFrame>
      <ForgotPasswordForm links={{ signIn: "/m/account", forgot: "/m/forgot-password", compact: true }} />
    </PhoneLegalFrame>
  );
}
