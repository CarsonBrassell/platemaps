# Overnight audit

Simulated visitors use the app all night and write down what a real person
would find inadequate. Two halves:

- **Agent sessions.** Each run is one `claude -p` Sonnet session with one
  persona, one scenario, one surface (phone `/m` or web `/`), one place it is
  "standing", and real targets drawn from the corpus (restaurant names,
  cuisines, dishes, neighbourhoods). It drives a headless Chromium through
  `browse.mjs` (text in, text out, so the context stays small) and ends with a
  JSON list of findings. Personas and scenarios are in `scenarios.json`; the
  rules and the finding schema are in `BRIEF.md`.
- **Search oracle.** `oracle.mts` generates thousands of queries with known
  right answers from the corpus itself (exact names, typos, dropped words,
  nicknames, dishes, cuisine words near an anchor, neighbourhoods) and scores
  the shipping search. Pass rates per check, deltas against the last run, and
  the worst failures. "Breakfast near SDSU shows coffee shops instead of
  breakfast places" is the `cuisine-nearby` check. What the oracle cannot see
  is a restaurant missing from the corpus altogether (the College Area Broken
  Yolk is that case); the `local-knowledge` scenario has agents name real
  places near an anchor from memory and search for them.

After each cycle a triage session merges the raw findings into `BACKLOG.md`
(deduped, ranked by severity and by how many sessions hit it). `REPORT.md` is
what to read in the morning.

## One-time setup

1. `claude` must be logged in for headless runs. Open a terminal, run
   `claude`, and if it says the OAuth session expired run `/login`. Then
   `echo hi | claude -p --model sonnet` should answer.
2. Playwright's Chromium is already installed (`npx playwright install
   chromium` if `browse.mjs serve` complains).
3. Optional, for the logged-in scenarios (post flow, social flow): create a
   throwaway account yourself in the app and put it in `probe/audit/.env`:

       AUDIT_EMAIL=auditor@example.com
       AUDIT_PASSWORD=...

   `.env*` is gitignored. The daemon logs in with it; the agents never see the
   password. Without it, those scenarios are skipped. Writes (submitting a
   post, sending a friend request) stay off unless you pass `-Writes`; the
   database is the live one.
4. Keep the machine awake: plugged in, sleep set to Never for the night.

## Run

    powershell -File probe/audit/start.ps1                       8h, 2 parallel, cap 60 runs
    powershell -File probe/audit/start.ps1 -Hours 6 -Parallel 3 -MaxRuns 100 -Surface phone
    powershell -File probe/audit/stop.ps1                        finish current runs and exit

`start.ps1` detaches, so closing the terminal is fine. Progress is in
`probe/audit/run.log`. The dev server is reused if it is already on :3000 and
started otherwise.

For a quick look without the loop:

    node probe/audit/run.mjs --dry                               the plan
    node probe/audit/run.mjs --hours 1 --max-runs 2 --only search-cuisine-word --no-oracle
    npx tsx --env-file=.env.local probe/audit/oracle.mts --sample 60

## Morning

- `probe/audit/REPORT.md` - counts, the oracle table with deltas, "Tonight"
  from triage (top five to fix), cost.
- `probe/audit/BACKLOG.md` - the standing ranked list. Mark a line `fixed:` or
  `wontfix:` and triage leaves it alone from then on.
- `probe/audit/findings/` - one JSON per session with the full report, the
  oracle markdowns, screenshots in `shots/`.

## Cost and pacing

Each agent session is roughly 5-10 minutes of Sonnet and 30-100K tokens.
`--parallel 2 --max-runs 60` is a night's worth without eating a subscription
week. The oracle costs nothing but Neon reads and runs on cycle 1 and every
fourth cycle (`--oracle-every`). Triage is one Sonnet call per cycle.

## Adding a scenario

Add an object to `scenarios.json`: `id`, `persona` (from the personas map),
`surface` (`phone` | `web` | `both`), `seeds` (`restaurants` | `cuisines` |
`dishes` | `neighborhoods` | `none`), `needsLogin`, and a `goal` that may use
`{anchor}` and `{seeds}`. The next cycle picks it up.
