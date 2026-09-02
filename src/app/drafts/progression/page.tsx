import { Header } from "@/components/Header";
import { RankInsignia } from "@/components/RankInsignia";
import { POINT_RULE_COPY, formatPoints } from "@/lib/points";
import { RANKS, rankFor } from "@/lib/ranks";

/**
 * DRAFT SURFACE — five candidates for a progression section on the profile.
 *
 * Not linked from anywhere and not meant to be. It exists so a direction can
 * be picked by looking at the real crests, the real thresholds and the real
 * weights from `lib/ranks.ts` rather than at a comp — the same reason
 * `drafts/map-search` exists. Nothing under `/account` or `/u/[id]` is touched
 * by this file; deleting the folder removes it entirely.
 *
 * What ships today, for reference: the public profile (`/u/[id]`) draws the
 * crest beside the avatar, and the owner's own profile gets only a title and a
 * 6px track inside `PlatePointsPanel`. The gap these five are competing to
 * fill is the owner's side — what the ladder looks like when it is *yours*.
 */

/** A worked example, deliberately mid-ladder: Local, with Critic in sight. */
const POINTS = 640;

export default function ProgressionDraftsPage() {
  const rank = rankFor(POINTS);
  const index = RANKS.findIndex((r) => r.key === rank.key);
  const next = RANKS[index + 1] ?? null;
  const toNext = next ? next.minPoints - POINTS : 0;
  const spanPct = next
    ? Math.round(((POINTS - rank.minPoints) / (next.minPoints - rank.minPoints)) * 100)
    : 100;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[760px] px-5 pb-24 pt-8">
        <h1 className="text-[32px]">Progression — five ways to show it</h1>
        <p className="mt-1.5 text-[14px] text-pm-grey-text">
          All five drawn at the same worked example:{" "}
          <span className="font-mono tabular-nums">{formatPoints(POINTS)}</span> points, which is{" "}
          {rank.title}, with {next?.title} at{" "}
          <span className="font-mono tabular-nums">{formatPoints(next?.minPoints ?? 0)}</span>.
        </p>

        {/* ── A ────────────────────────────────────────────────────────── */}
        <Concept
          letter="A"
          name="The whole ladder"
          note="Every rung at once, earned in ink and unearned greyed, with the one you are on marked. Says exactly where the road goes and what each step costs — the most informative and the tallest."
        >
          <ol className="divide-y divide-zinc-100">
            {RANKS.map((r, i) => {
              const earned = POINTS >= r.minPoints;
              const current = r.key === rank.key;
              return (
                <li
                  key={r.key}
                  className={`flex items-center gap-3.5 py-2.5 ${earned ? "" : "opacity-45"}`}
                >
                  <RankInsignia rank={r.key} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
                      {r.title}
                      {current && (
                        <span
                          aria-hidden="true"
                          className="inline-block h-[5px] w-[5px] rounded-full bg-pm-orange"
                        />
                      )}
                    </p>
                    <p className="mono-label mt-0.5 text-zinc-500">
                      {i === 0 ? "From the start" : `${formatPoints(r.minPoints)} points`}
                    </p>
                  </div>
                  <span className="font-mono text-[12px] tabular-nums text-zinc-500">
                    ×{r.weight.toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ol>
          {next && (
            <p className="mt-3 border-t border-dotted border-pm-orange-border pt-3 text-[13px] text-zinc-500">
              <span className="font-mono font-semibold tabular-nums text-pm-orange-text">
                {formatPoints(toNext)}
              </span>{" "}
              points to {next.title}.
            </p>
          )}
        </Concept>

        {/* ── B ────────────────────────────────────────────────────────── */}
        <Concept
          letter="B"
          name="The next rung"
          note="Only the step you are actually on: where you are, where you are going, and the three things that get you there. Answers 'what now' instead of 'what is the whole system'."
        >
          <div className="flex items-center gap-4">
            <RankInsignia rank={rank.key} size={64} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[17px] font-semibold text-zinc-900">{rank.title}</p>
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] tabular-nums text-pm-orange-text">
                  {next ? `${formatPoints(toNext)} to ${next.title}` : "Top of the ladder"}
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-pm-grey-tint">
                <div className="h-full rounded-full bg-pm-orange" style={{ width: `${spanPct}%` }} />
              </div>
            </div>
            {next && <RankInsignia rank={next.key} size={44} className="opacity-35" />}
          </div>
          <ul className="mt-4 space-y-1.5">
            {POINT_RULE_COPY.slice(0, 3).map((rule) => (
              <li key={rule.label} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-zinc-500">{rule.label}</span>
                <span className="font-mono text-[12px] font-semibold tabular-nums text-pm-orange-text">
                  {rule.value}
                </span>
              </li>
            ))}
          </ul>
        </Concept>

        {/* ── C ────────────────────────────────────────────────────────── */}
        <Concept
          letter="C"
          name="The crest case"
          note="The six as a collection. Locked ones sit as warm tone blocks rather than grey ghosts, so the row reads as a shelf with gaps instead of a disabled list. The most collectable framing, and the least informative."
        >
          <div className="grid grid-cols-6 gap-2">
            {RANKS.map((r, i) => {
              const earned = POINTS >= r.minPoints;
              return (
                <div key={r.key} className="text-center">
                  {/* Earned and locked occupy the same 52px square, so the row
                      is a shelf of equal slots rather than small marks beside
                      big blocks. The block is a warm tone, never a grey ghost
                      — same rule as a missing photo. */}
                  <div className="mx-auto grid h-[52px] w-[52px] place-items-center">
                    {earned ? (
                      <RankInsignia rank={r.key} size={52} />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="block h-[42px] w-[42px] rounded-[10px]"
                        style={{ background: `var(--pm-tone-${(i % 3) + 1})` }}
                      />
                    )}
                  </div>
                  <p
                    className={`mono-label mt-1.5 ${
                      r.key === rank.key ? "text-pm-orange-text" : "text-zinc-500"
                    }`}
                  >
                    {r.title}
                  </p>
                </div>
              );
            })}
          </div>
        </Concept>

        {/* ── D ────────────────────────────────────────────────────────── */}
        <Concept
          letter="D"
          name="The record"
          note="Progression as history rather than status — when each title was earned, with the next one open at the bottom. Reads like the rest of the profile, which is already a record of what you did. Needs a date the database does not store yet."
        >
          <ol className="relative space-y-3 pl-5">
            <span
              aria-hidden="true"
              className="absolute bottom-2 left-[3px] top-2 w-px bg-pm-orange-border"
            />
            {[
              { key: "newcomer", when: "12 Jan 2026" },
              { key: "taster", when: "19 Jan 2026" },
              { key: "regular", when: "14 Mar 2026" },
              { key: "local", when: "2 Aug 2026" },
            ].map((row) => {
              const r = RANKS.find((x) => x.key === row.key)!;
              return (
                <li key={row.key} className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute -left-5 top-[7px] h-[7px] w-[7px] rounded-full bg-pm-orange"
                  />
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-semibold text-zinc-900">{r.title}</span>
                    <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                      {row.when}
                    </span>
                  </p>
                </li>
              );
            })}
            {next && (
              <li className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-5 top-[7px] h-[7px] w-[7px] rounded-full border border-pm-orange-border bg-[var(--background)]"
                />
                <p className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-semibold text-zinc-400">{next.title}</span>
                  <span className="font-mono text-[11px] tabular-nums text-pm-orange-text">
                    {formatPoints(toNext)} points away
                  </span>
                </p>
              </li>
            )}
          </ol>
        </Concept>

        {/* ── E ────────────────────────────────────────────────────────── */}
        <Concept
          letter="E"
          name="What it is worth"
          note="Leads with the weight instead of the title: a rank already decides how hard your rating pulls on a plate score. The only one of the five where climbing means something mechanical rather than cosmetic — and the only one that can mislead, since the spread is deliberately narrow."
        >
          <p className="flex items-baseline gap-2">
            <span className="font-mono text-[34px] font-semibold leading-none tabular-nums text-pm-orange">
              ×{rank.weight.toFixed(2)}
            </span>
            <span className="text-[13px] text-zinc-500">
              is how hard your rating pulls on a plate score
            </span>
          </p>
          <div className="mt-4 flex items-end gap-1.5">
            {RANKS.map((r) => {
              const current = r.key === rank.key;
              return (
                <div key={r.key} className="flex-1 text-center">
                  <div
                    className={`mx-auto w-full rounded-t-[3px] ${
                      current ? "bg-pm-orange" : "bg-pm-grey-tint"
                    }`}
                    style={{ height: `${(r.weight - 0.7) * 150}px` }}
                  />
                  {/* Labelled by multiplier, not by a truncated title:
                      "INSTITUTION" does not fit a sixth of this card and
                      chopping it to "INST" reads as a bug. The number is what
                      this concept is about anyway, and numbers set in mono. */}
                  <p
                    className={`mt-1.5 font-mono text-[10px] tabular-nums ${
                      current ? "font-semibold text-pm-orange-text" : "text-zinc-500"
                    }`}
                  >
                    ×{r.weight.toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>
          {next && (
            <p className="mt-4 text-[13px] leading-snug text-zinc-500">
              {next.title} takes it to{" "}
              <span className="font-mono font-semibold tabular-nums text-pm-orange-text">
                ×{next.weight.toFixed(2)}
              </span>
              . The spread is narrow on purpose — it tilts ties, it does not let a few voices
              outweigh many.
            </p>
          )}
        </Concept>
      </main>
    </>
  );
}

function Concept({
  letter,
  name,
  note,
  children,
}: {
  letter: string;
  name: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-9">
      <div className="flex items-baseline gap-2.5">
        <span className="mono-label text-pm-orange-text">{letter}</span>
        <h2 className="text-[20px]">{name}</h2>
      </div>
      <p className="mt-1 max-w-[68ch] text-[13px] leading-snug text-pm-grey-text">{note}</p>
      <div className="mt-3 rounded-2xl bg-white p-5">{children}</div>
    </section>
  );
}
