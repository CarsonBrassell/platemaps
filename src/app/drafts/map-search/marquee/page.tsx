"use client";

import { DraftMapStage } from "@/components/drafts/DraftMapStage";
import { DraftPageShell } from "@/components/drafts/DraftPageShell";
import { MarqueeSearch } from "@/components/drafts/MarqueeSearch";

/** DRAFT B — see the comment block at the top of MarqueeSearch.tsx. */
export default function MarqueeDraftPage() {
  return (
    <DraftPageShell
      name="Marquee"
      tag="Safe / solid"
      summary="Always open, on a solid warm-dark card wearing the same fill and ember hairline as the zoom stack in the opposite corner. Names in Fraunces, ratings in mono ember. Before you type it offers the places this browser has flown to before."
      watchFor="whether it reads as a sibling of the zoom stack rather than as a second header search — and whether an always-open field costs the map more room than it earns."
    >
      <DraftMapStage field={MarqueeSearch} />
    </DraftPageShell>
  );
}
