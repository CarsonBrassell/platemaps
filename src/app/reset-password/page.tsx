import { Header } from "@/components/Header";
import { ResetPasswordForm } from "@/components/account/RecoveryForms";

/** The form itself is shared with `/m/reset-password` - see RecoveryForms. */
export default function ResetPasswordPage() {
  return (
    <>
      <Header />
      <ResetPasswordForm links={{ signIn: "/account", forgot: "/forgot-password" }} />
    </>
  );
}
