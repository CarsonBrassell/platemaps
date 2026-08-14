"use client";

import { DraftPageShell } from "@/components/drafts/DraftPageShell";
import { FieldGallery } from "@/components/drafts/FieldGallery";

/**
 * DRAFT — nine container shapes for the map search field.
 *
 * Narrower than the three variant routes on purpose: those each proposed a
 * whole field (dress, resting offer, dropdown) and are therefore impossible to
 * diff. This page changes one thing. **There is no results list anywhere on
 * it** — typing shows the typed text so the shape can be read with something in
 * it, and nothing opens beneath.
 */
export default function FieldShapesDraftPage() {
  return (
    <DraftPageShell
      name="Field shapes"
      tag="Container only"
      backLabel="← All drafts"
      summary="Nine container shapes for the map search field, on one live map with a picker that swaps which one is mounted — same camera, same pins, one variable. No dropdown: the shape of the box is the whole subject."
      watchFor="how each shape holds its text over the district heatmap rather than over water, and whether its focus indicator still reads now that the heavy orange oval is gone. Neon sign is on the sheet as a rejected option; the contact sheet's orange end shows why."
    >
      <FieldGallery />
    </DraftPageShell>
  );
}
