import type { CSSProperties } from "react";
import { RANKS, type RankKey } from "@/lib/ranks";

/**
 * Each rung's own light, so a Regular and an Institution read as different
 * places on the ladder at a glance rather than as the same card with a
 * different word on it (Carson, 2026-10: "wayyyy cooler").
 *
 * They only ever sit on the tracker's charcoal ground (`.rk-card`, #1f1b16
 * and darker), never on cream or white — every one of them is a *light*
 * colour, and that is what lets them carry small type there. Measured against
 * the card's base (#231f19) and against the warmest point of its glow
 * (#3d2c20, the worst case behind any text):
 *
 * | rung        | a       | on base | on glow |
 * | ----------- | ------- | ------- | ------- |
 * | Newcomer    | #D8C7A6 | 9.9:1   | 8.0:1   |
 * | Taster      | #F09B6B | 7.5:1   | 6.1:1   |
 * | Regular     | #F2753A | 5.8:1   | 4.7:1   |
 * | Local       | #F2A93B | 8.2:1   | 6.7:1   |
 * | Critic      | #F06B80 | 5.6:1   | 4.5:1   |
 * | Institution | #F5C84C | 10.3:1  | 8.4:1   |
 *
 * Regular and Critic are the tight ones; don't darken either.
 *
 * `b` is the hotter highlight each gradient runs into; it is lighter still.
 * The warm walk (sand → peach → ember → amber → raspberry → gold) keeps the
 * whole ladder inside the brand's kitchen palette; Regular is the brand
 * orange lifted until it reads on the dark.
 *
 * Do not use these on the cream page or a white card. On light grounds the
 * accent is `--pm-orange` / `--pm-orange-text` and nothing else (DESIGN.md).
 */
export const RANK_ACCENT: Record<RankKey, { a: string; b: string }> = {
  newcomer: { a: "#D8C7A6", b: "#FFF1D6" },
  taster: { a: "#F09B6B", b: "#FFD3B3" },
  regular: { a: "#F2753A", b: "#FFB27A" },
  local: { a: "#F2A93B", b: "#FFE08A" },
  critic: { a: "#F06B80", b: "#FFB0A0" },
  institution: { a: "#F5C84C", b: "#FFF4C8" },
};

/** The two custom properties every `.rk-*` rule reads its accent from. */
export function accentVars(key: RankKey): CSSProperties {
  const { a, b } = RANK_ACCENT[key];
  return { "--rk-a": a, "--rk-b": b } as CSSProperties;
}

/**
 * The whole ladder's colours in order, as one gradient — the rail fill wears
 * it so the line visibly changes colour as it passes each rung.
 */
export const LADDER_GRADIENT = `linear-gradient(90deg, ${RANKS.map(
  (r, i) => `${RANK_ACCENT[r.key].a} ${((i / (RANKS.length - 1)) * 100).toFixed(1)}%`
).join(", ")})`;

/** "4K", "1.2K", "400" — rail labels, where five characters is the room there is. */
export function shortPoints(n: number) {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
}
