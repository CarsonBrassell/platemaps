"use client";

import { DraftMapStage } from "@/components/drafts/DraftMapStage";
import { DraftPageShell } from "@/components/drafts/DraftPageShell";
import { EmberSearch } from "@/components/drafts/EmberSearch";

/** DRAFT C — see the comment block at the top of EmberSearch.tsx. */
export default function EmberDraftPage() {
  return (
    <DraftPageShell
      name="Ember"
      tag="Bold / map-native"
      summary="The comment bubble's own clothes — warm near-white fill, hairline, 8px corner, mono meta row — so a result reads as another annotation on the map. Hovering or arrowing a row lights that restaurant's ember. Before you type it offers whatever is in the current frame."
      watchFor="the highlight: hover a row and the matching dot should ring and glow on the map, with no DOM pin involved. Also whether a near-white card still separates itself over the bright heatmap pools."
    >
      <DraftMapStage field={EmberSearch} />
    </DraftPageShell>
  );
}
