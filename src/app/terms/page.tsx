import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { TermsDocument } from "@/components/legal/TermsDocument";

export const metadata: Metadata = {
  title: "Terms of Service — PlateMaps",
  description: "The terms that govern your use of PlateMaps.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl pb-16">
      <Header />
      <TermsDocument privacyHref="/privacy" />
    </div>
  );
}
