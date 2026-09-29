import { Header } from "@/components/Header";
import { ForgotPasswordForm } from "@/components/account/RecoveryForms";

/** The form itself is shared with `/m/forgot-password` - see RecoveryForms. */
export default function ForgotPasswordPage() {
  return (
    <>
      <Header />
      <ForgotPasswordForm links={{ signIn: "/account", forgot: "/forgot-password" }} />
    </>
  );
}
