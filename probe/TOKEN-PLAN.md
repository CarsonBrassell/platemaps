# Token plan for database questions

Written 2026-09-04 from the transcripts of the two big terminals
(`55a7518e`, the "9k" terminal, and `519dc68c`).

## What actually cost the tokens

The database is not the problem. The context the question lands in is.

| | |
|---|---|
| "cus total coverage is at 9k" | 4 requests x 714K context = **2.9M tokens** |
| Tool output for that question | under 1K tokens |
| Whole 9k terminal: requests | 1,489 (492 Bash, 119 Agent spawns) |
| Whole 9k terminal: context tokens sent | **369M** |
| Whole 9k terminal: ALL tool output combined | 164K (0.04% of the bill) |
| Same pattern in `a0c23e98`: "no what are you saying" | 2 x 531K = 1.1M tokens |

Every prompt re-sends the entire conversation. A terminal that has been running
extraction waves sits at 250K-700K of context, and each one-line question in it
takes 2-11 round trips. That is where "hundreds of thousands of tokens per
prompt" comes from. Reading STATE.md or running a count query is noise by
comparison.

Second cost: each compaction resume re-reads RUNBOOK + STATE + CONTEXT + TRIAGE.
Observed 65K-447K fresh tokens per resume, 20+ resumes across the two sessions.

## The plan, in order of payoff

### 1. Never ask questions in the wave terminal

Two terminals with fixed roles:

- **Ask terminal.** Questions, numbers, decisions. Never spawns agents. `/clear`
  after each answered question. Should sit under 40K context.
- **Wave terminal.** Runs extraction. Nobody types questions into it. If a
  question is typed there by mistake, the answer costs millions of tokens.

This alone would have turned the 2.9M-token question into roughly 40K.

### 2. `npm run db:stats` — one command, twelve numbers, ~300 tokens

A read-only script that prints the STATE.md corpus table live:

```
total 8564  held 2364  live 6200  listed 4327
with_menu 4158  listed_with_menu 2836 (66%)
queue 3005  not_found 523  dishes 299131
by source: osm 5695  deh 2869
```

- Replaces the inline `node -e "const {neon}..."` one-liners in STATE.md and
  the menu-wave skill, which get pasted and re-derived every session.
- `--json` flag writes `probe/stats.json` with a timestamp. Agents, skills and
  the resume pack read the file instead of querying.
- "How far are we from 9k" becomes one Bash call in the ask terminal.

### 3. `probe/RESUME.md` — a 2K-token resume pack

What a compacted or fresh session needs, and nothing else: the current numbers
(pasted from `db:stats`), the three commands it runs, what is in flight, and
the two rules it must not break. CLAUDE.md points resumes at this file.
RUNBOOK, STATE, CONTEXT and TRIAGE stay for humans and for grep.

Cuts the 65K-447K resume re-read to about 2K.

### 4. Run the wave loop outside the interactive session

The 119 agent spawns and 492 Bash calls in the 9k terminal were all driven from
an Opus 1M context averaging 248K. Every agent completion wakes that context
for a full-price request. Two cheaper homes already exist:

- `scripts/night-run.sh` for the zero-token tiers (router, browser pass).
- The `platemaps-menu-wave` scheduled task, which starts at ~70K context, does
  a wave, and exits instead of accumulating.

Or spawn one Sonnet coordinator subagent per wave that runs the agents and
reports once; the completions then land in its context, not the main one.

### 5. Only after 3 is done: drop `autoCompactWindow` from 200K to ~120K

Compacting earlier is only a win once a resume costs 2K instead of 100K+.
Leave `opus[1m]` alone; that was measured and kept on purpose.

## Not worth doing

- Trimming SQL output, shrinking STATE.md, or a "smarter" way to evaluate
  restaurant data. Tool output is 0.04% of the spend.
- Third-party token savers aimed at file reads. Same reason.
