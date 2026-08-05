import Image from "next/image";
import type { ReactNode } from "react";

type RestaurantPhotoProps = {
  photo?: string;
  photoAlt?: string;
  /** Rendered when the restaurant has no photo yet. */
  fallback: ReactNode;
  /** Layout hint for the optimizer — what width this slot occupies per breakpoint. */
  sizes: string;
  /** Set on above-the-fold photos so they are not lazy-loaded. */
  priority?: boolean;
};

/**
 * Renders a restaurant photo when one exists, and the caller's placeholder
 * when it doesn't — so photos can be added one restaurant at a time instead
 * of all at once.
 *
 * Uses `fill`, so every call site must position its container `relative` and
 * give it a height (or aspect ratio). All three currently do.
 */
export function RestaurantPhoto({
  photo,
  photoAlt,
  fallback,
  sizes,
  priority,
}: RestaurantPhotoProps) {
  if (!photo) return <>{fallback}</>;

  return (
    <Image
      src={photo}
      /* Defaults to decorative: every call site already renders the restaurant
         name as adjacent text, so a generic alt would just make a screen reader
         announce the name twice. Set `photoAlt` in the data when a photo shows
         something the surrounding text doesn't. */
      alt={photoAlt ?? ""}
      fill
      sizes={sizes}
      priority={priority}
      className="object-cover"
    />
  );
}
