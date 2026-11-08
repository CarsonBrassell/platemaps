import type { QualityNote } from "@/lib/ratingDisplay";

/**
 * "Highly rated · 1,017 reviews": why a For me place is good, in words. The tier
 * is prose; the count is a number, so it is mono. Never the blend figure or a
 * star (see `qualityNote`). The caller sets size, colour and spacing, since the
 * phone grid and the web card differ in both.
 */
export function QualityLine({ quality, className }: { quality: QualityNote; className: string }) {
  return (
    <p className={className}>
      {quality.label && `${quality.label} · `}
      <span className="font-mono tabular-nums">{quality.reviews.toLocaleString("en-US")}</span> reviews
    </p>
  );
}
