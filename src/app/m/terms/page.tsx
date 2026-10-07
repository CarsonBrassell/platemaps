import type { Metadata } from "next";
import { PhoneLegalFrame } from "@/components/mobile/PhoneLegalFrame";
import { TermsDocument } from "@/components/legal/TermsDocument";

export const metadata: Metadata = {
  title: "Terms of Service — PlateMaps",
  description: "The terms that govern your use of PlateMaps.",
};

/** Terms, phone. Same text as `/terms` (TermsDocument), phone frame around it. */
export default function Page() {
  return (
    <PhoneLegalFrame>
      <TermsDocument privacyHref="/m/privacy" />
    </PhoneLegalFrame>
  );
}
