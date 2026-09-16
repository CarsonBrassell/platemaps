import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/**
 * `/drafts/**` is internal design-review scaffolding, not a shipped surface —
 * `drafts/profile-grid` even renders the signed-in visitor's own posts via
 * `/api/posts?mine=1`. It has no auth wall of its own (SECURITY-FINDINGS.md
 * #9), so production 404s the whole subtree here rather than relying on
 * `robots.ts` alone, which only keeps well-behaved crawlers from *indexing*
 * a URL someone can still open by guessing it. `npm run dev` still serves it.
 */
export default function DraftsLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
