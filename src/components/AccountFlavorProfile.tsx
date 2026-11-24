"use client";

import { useEffect, useState } from "react";
import { FlavorProfileCard } from "@/components/TasteMatchCard";
import { PhoneFlavorProfileCard } from "@/components/mobile/PhoneTasteMatchCard";
import type { PersonalityProfile } from "@/lib/personality";

/**
 * "Your food personality" on the account screens. Those screens are client
 * components, so unlike the public profile pages they can't await the query;
 * this fetches the server-computed result from `/api/account/flavor-profile`
 * (the math lives in lib/personality.ts, server-side).
 *
 * Renders nothing until the answer arrives, and nothing if the request fails:
 * an empty-state prompt that was really a network error would be a lie.
 */
export function AccountFlavorProfile({ variant }: { variant: "web" | "phone" }) {
  const [result, setResult] = useState<{ flavor: PersonalityProfile | null } | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/account/flavor-profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { flavor: PersonalityProfile | null } | null) => {
        if (live && data) setResult(data);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!result) return null;
  /* Inside the account column, which already pads and spaces its sections. */
  return variant === "phone" ? (
    <PhoneFlavorProfileCard flavor={result.flavor} className="mb-5" />
  ) : (
    <FlavorProfileCard flavor={result.flavor} className="mb-6" />
  );
}
