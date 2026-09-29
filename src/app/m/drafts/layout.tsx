import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/**
 * `/m/drafts/**` is the phone twin of `/drafts/**`: internal design-review
 * scaffolding with sample copy, not a shipped surface. Same rule as
 * `src/app/drafts/layout.tsx` — production 404s the whole subtree, and
 * `npm run dev` still serves it.
 */
export default function PhoneDraftsLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
