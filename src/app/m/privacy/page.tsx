import type { Metadata } from "next";
import { PhoneLegalFrame } from "@/components/mobile/PhoneLegalFrame";
import { PrivacyDocument } from "@/components/legal/PrivacyDocument";

export const metadata: Metadata = {
  title: "Privacy Policy — PlateMaps",
  description: "How PlateMaps collects, uses, and protects your information.",
};

/** Privacy, phone. Same text as `/privacy` (PrivacyDocument), phone frame around it. */
export default function Page() {
  return (
    <PhoneLegalFrame>
      <PrivacyDocument termsHref="/m/terms" />
    </PhoneLegalFrame>
  );
}
