import { StarIcon } from "@/components/icons";

export function StarRating({ rating, className = "h-4 w-4" }: { rating: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <div className="relative inline-flex" role="img" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      <div className="flex gap-0.5 text-zinc-300" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <StarIcon key={i} className={className} />
        ))}
      </div>
      <div
        className="absolute inset-0 flex gap-0.5 overflow-hidden text-zinc-500"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <StarIcon key={i} className={`${className} shrink-0`} />
        ))}
      </div>
    </div>
  );
}
