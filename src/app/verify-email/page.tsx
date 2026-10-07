import { Header } from "@/components/Header";
import { VerifyEmailForm } from "@/components/account/RecoveryForms";

/** The verifier itself is shared with `/m/verify-email` - see RecoveryForms. */
export default function VerifyEmailPage() {
  return (
    <>
      <Header />
      <VerifyEmailForm links={{ signIn: "/account", forgot: "/forgot-password" }} />
    </>
  );
}
