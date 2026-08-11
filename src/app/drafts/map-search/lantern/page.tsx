"use client";

import { DraftMapStage } from "@/components/drafts/DraftMapStage";
import { DraftPageShell } from "@/components/drafts/DraftPageShell";
import { LanternSearch } from "@/components/drafts/LanternSearch";

/** DRAFT A — see the comment block at the top of LanternSearch.tsx. */
export default function LanternDraftPage() {
  return (
    <DraftPageShell
      name="Lantern"
      tag="Quiet / glass"
      summary="A 44px circle at rest, expanding into a frosted-glass field. Ember appears only on the focus ring and the selected row. Before you type it offers the city's top-rated places."
      watchFor="whether the icon-only rest state reads as a search control at all, and whether the glass holds up over a lit district rather than over water. Hover or tab to the circle to see the label it carries."
    >
      <DraftMapStage field={LanternSearch} />
    </DraftPageShell>
  );
}
