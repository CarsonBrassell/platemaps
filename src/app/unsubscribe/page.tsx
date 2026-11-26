import type { Metadata } from "next";
import { UnsubscribeCard } from "@/components/account/UnsubscribeCard";
import { resolveUnsubscribeToken } from "@/lib/unsubscribe";

export const metadata: Metadata = {
  title: "Unsubscribe | PlateMaps",
  robots: { index: false },
};

/**
 * Reached from the link in a PlateMaps email, signed out. The GET only reads
 * (to tell a bad link from a good one); the change happens on the button's POST.
 * One page serves phones and desktop, since email links open in a browser.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).token;
  const candidate = typeof raw === "string" ? raw : null;
  const valid = candidate ? await resolveUnsubscribeToken(candidate) : null;
  return <UnsubscribeCard token={valid ? candidate : null} />;
}
