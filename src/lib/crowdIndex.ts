import { crowdPostsRows } from "@/lib/db";
import { buildCrowd, type CrowdIndex } from "@/lib/crowdBonus";

/**
 * The per-place crowd values (lib/crowdBonus.ts), read in one query and kept for a short while. Loaded only for
 * the 40-axis account. A lapsed copy is handed out while a new one is read behind it. Server-only.
 */
const TTL_MS = 10 * 60_000;
let cached: { at: number; value: CrowdIndex } | null = null;
let loading: Promise<CrowdIndex> | null = null;

export async function loadCrowd(): Promise<CrowdIndex> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;
  if (!loading) {
    loading = crowdPostsRows()
      .then((rows) => {
        const value = buildCrowd(rows);
        cached = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        loading = null;
      });
  }
  if (cached) {
    loading.catch(() => {});
    return cached.value;
  }
  return loading;
}
