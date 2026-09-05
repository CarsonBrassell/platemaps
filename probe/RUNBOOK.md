# Menu extraction runbook

How to RUN the pipeline. `PLAYBOOK.md` is what extraction agents read;
`FINDINGS.md` is the archive. This file is for whoever is orchestrating, and it
exists because every rule in it was learned by getting it wrong on 2026-08-29/30.

Read this and `STATE.md` at the start of a session. You do not need the previous
conversation.

---

## 1. The loop

1. **Cut batches** — `node --env-file=.env.local scripts/cut-batches.mjs --size 10 --count 25 --prefix <name>`
2. **Spawn 4 agents**, one per batch, `model: sonnet`, using the brief in §7.
3. **On each completion notification**: screen its file, load it, and
   **immediately spawn a replacement in the same turn**.
4. Every few hours run `node --env-file=.env.local scripts/share-chain-menus.mjs`
   to hand chain branches their siblings' menus.

### Never end a turn with zero agents running

The only acceptable reasons are an exhausted queue or Calvin saying stop.
**Reporting is not one of them.** Completion notifications are the only thing
that wakes this session between turns, so an empty in-flight set means nothing
ever wakes it again — the pipeline stops until someone notices.

This has failed twice: once for five and a half hours, and once mid-session
after a load, where the report even ended with "say the word and I'll launch the
next set". No word was needed. **Report *and* spawn, in the same turn.**

### Four agents, not nine

Crash rate rose sharply at 7–9 concurrent. The machine is on marginal Wi-Fi
(60% signal, 108 Mbps uplink); many simultaneous long-lived TLS streams is what
it cannot hold. Four is the working ceiling. Batches of 10 are fine — the
write-after-every-restaurant rule means a crash costs one restaurant regardless
of batch size.

## 2. Screen, copy, load — with nothing in between

```
node --env-file=.env.local scripts/screen-menus.mjs menus/wip/result-NN.json
cp menus/wip/clean.json menus/wip/ready-<letter>.json
node --env-file=.env.local scripts/load-menus.mjs menus/wip/ready-<letter>.json
```

`screen-menus.mjs` always writes `clean.json`, so **a second screen between the
copy and the load silently overwrites it** and loads the wrong batch. That
happened once. Never load `quarantine.json`.

**Compare what loaded against what the agent reported.** A mismatch means a
partial write. Two partial loads were caught this way and would otherwise have
been invisible.

## 3. When an agent dies

They die often — usage limits, dropped connections, "the response stopped
arriving". Nearly all of it is environmental, not your prompt.

**On 2026-08-31 this happened nine times in five hours**, every one of them
`API Error: The response stopped arriving` or `Connection lost mid-response`.
Eight were resumed and finished their batches; the ninth had lost its transcript
and its last restaurant was folded into the next agent's brief as an eleventh
item. Not one of those agents had done anything wrong, and not one lost a
capture — because they write after every restaurant. **Treat a death as a
routine interruption, not a signal.** Read its file, tell it what is there, and
send it on.

Two things make the resume cheap. Name the exact restaurants remaining, in
order, rather than "carry on" — the agent then does not re-derive the list. And
tell it what changed while it was down: several agents came back and immediately
used a platform technique that had been discovered mid-batch.

**Four agents dying at the same instant is a different event.** Staggered
deaths are the upstream API; a simultaneous one is the session usage limit, and
the notification says so (`You've hit your session limit · resets 1:40am`). Do
not respawn into it — nothing will run until the reset. Salvage and load every
result file while waiting, then resume all four; on 2026-08-31 all four came
back and finished, and 1,384 dishes were sitting in their files ready to load.

Worth knowing when planning a long unattended run: four concurrent agents burn
the limit noticeably faster than three. Four is right when someone is watching;
fewer stretches the same budget further overnight.

**A resume can fail with "No transcript found."** That agent is gone for good.
Screen and load what it wrote, then hand its remaining restaurants to a new
agent as extra items on that agent's batch — spawning a fresh agent for two
restaurants is not worth a context window.

- **Salvage first.** Agents write after every restaurant, so their file usually
  holds real menus. Drop entries with no dishes, no `blocked` and no `notes` —
  those are restaurants the agent never reached, and loading one records a
  permanent `not_found` for a restaurant nobody looked at.
- **Then resume, don't respawn.** `SendMessage` to the agent's id restarts it
  from its own transcript with its context intact. A respawn throws away
  everything it had worked out. One resume finished a batch in six minutes that
  a cold start would have spent twenty on.
- **Tell it exactly what its own file already holds**, and add: *if anything I
  tell you contradicts what you can see on disk, the disk wins.* Two agents were
  sent wrong information this way (batches crossed) and both correctly ignored
  it because they checked the file first.

Salvage numbers from real interruptions: 3,333 dishes recovered from a
session-limit kill, 1,846 from a manual stop.

## 4. Read every agent report against its file

This is the highest-value thing the coordinator does. The screen validates
format and known-bad sources; it cannot see judgement errors. Everything below
was caught by reading a report:

- An agent that says it **inferred, divided, merged or reconstructed** prices →
  add the restaurant id to `QUARANTINE_IDS` in `scripts/screen-menus.mjs` with a
  note saying why, and re-screen before loading. Three separate agents divided a
  confirmed markup out and filed the result; the divided figures **defeat the
  markup test by construction**, so nothing downstream catches them.
- An agent that says a capture was **truncated or partial** → same.
- A capture whose **section shape is wrong for the restaurant** → same. A
  cleanly-sourced 82-dish menu for "Pho Royal" contained no pho.
- A capture **much fuller than the corpus already holds under a similar name** →
  check the address; it may be a duplicate record rather than a better read.

Quarantined restaurants get no ledger row and re-queue themselves. That is
intended.

## 4b. What the coordinator should do WHILE the agents run

Waiting on four agents leaves the coordinator idle for long stretches, and there
is one job that pays better than any of them: **cracking a platform.** On
2026-08-31, five came off the browser-only list in a single night — NetWaiter,
Clover COLO2, Popmenu, Menufy, ChowNow — using the same three moves, none of
which an extraction agent is well placed to make:

1. Open ONE storefront in the browser pane and read what it fetches
   (`read_network_requests`, or `performance.getEntriesByType('resource')` in
   the page when nothing was recorded — that is what found Menufy's API).
2. Reproduce the call with curl. If it works, the browser is never needed again
   for that platform.
3. Write the extractor to `probe/extract_<platform>.js`, run it against two
   different restaurants, and only then put it in `PLAYBOOK.md` §9 and in the
   next brief. Two of the five needed a second restaurant to expose a bug.

Then cut a retry list of restaurants blocked on that platform. The capability is
worth nothing until it is pointed at the backlog — `menus/blocked-log.jsonl`
carries the platform name in its reason text, so the list is a grep.

**The coordinator has a browser and the agents effectively do not** — the pane
is shared, and agents were observed navigating it out from under each other
twice in one batch. That asymmetry is the argument for doing this work here.

## 4c. Run at least one wave in daylight

A closed store and a bot wall look identical from the outside, and the pipeline
mostly runs overnight, so the same handful of restaurants gets re-blocked every
night for a reason that has nothing to do with technique. Toast's
`respectAvailability`, Olo's closed-store price gate, Clover COLO2 collapsing to
three items, and Agilysys refusing to price before noon are all this.

`scratchpad/timegated.cjs` counts them: six as of 2026-08-31. Small, but they
are free — and the count only grows while every wave runs at 3am. Ask agents to
**name the hours** when they call a closed-store gate, so the daytime list
builds itself.

## 5. Verify a technique before putting it in a brief

**The most expensive mistake made here.** An agent reported that a garbled PDF
could be read with the `Read` tool, which "renders pages visually". It was
promoted to the playbook and pushed into ~10 briefs. `pdftoppm` is not installed
on this machine and `Read` fails on every PDF. Three restaurants had been
captured on the strength of it — real dish names from the text layer, **invented
prices** — and 247 dishes had to be deleted from the database.

The mirror image happened the same day: an agent's raw-HTML grep for `$16` found
nothing on a page rendering `$` and `16` in separate elements, reported a
fabrication that had not occurred, and that was propagated too.

**An agent reporting that something worked is evidence about the agent's belief.
A tool invocation is evidence about the tool.** Run it once yourself before it
becomes a rule.

Verified on this machine: `Read` works on **PNG/JPG**; `Read` fails on **PDF**;
`pdftotext` works.

## 6. Batch cutting

Always use `scripts/cut-batches.mjs`. Cutting by hand produced a batch holding
five restaurants another agent had already finished — a restaurant being worked
on right now has no dishes and no `menu_lookups` row, so the queue query cannot
tell it apart from an untouched one.

The script has had two bugs, both instructive:

- It first excluded ids from files matching a hardcoded prefix list, and
  silently stopped working when a new prefix was introduced.
- It then excluded ids from *every* file, which locked out every restaurant ever
  attempted — including blocked ones, which are supposed to come back. That run
  reported `queue 1440, already spoken for 1440, cutting from 0`.

It now excludes ids from files touched in the last 3 hours (`--window`). "Spoken
for" is a property of **time**, not of a file existing.

## 7. The agent brief

Keep it under ~2,000 words and lead with the operational rules. Every brief must
carry:

- **Read `probe/PLAYBOOK.md`. Do NOT read `probe/FINDINGS.md` in full** — it is
  ~35,000 tokens and telling agents to read it whole was a standing tax on every
  run. Grep it for a specific restaurant name before spending long on one.
- **Write the result file after EVERY restaurant**, verifying each write parses
  and every price matches `/^\$\d+(\.\d{2})?$/`.
- **Never pipe large page content into a tool result** — fetch to a file,
  extract with a script written to a `.js` file (`node -e` gets mangled by shell
  quoting), print only the rows. An instruction to `grep -o '__OO_STATE__.\{0,200000\}'`
  killed two agents before anyone noticed the batch was not to blame.
- **Full explicit Windows paths for scratch files**
  (`C:/Users/Calvin  Lensink/AppData/Local/Temp/...`) with a per-agent prefix.
  Bare `/tmp/...` resolves inconsistently and agents share the directory.
- **Never construct a price.** The markup test says a source is unusable, not
  what the real price was.
- **Name the aggregator rule explicitly.** allmenus / sagemenu / menupages /
  restaurantguru / beyondmenu are rejected outright by the screen unless
  `crossCheckedAgainst` names an independent PRICED source. Agents keep filing
  them in good faith — one batch lost captures of 109 and 81 dishes this way in
  a single night — because the ladder permits tier 5 "with two sources" and the
  brief never says what the screen actually enforces. Tell them to block the
  restaurant instead; it costs less than a discarded capture.
- **Validate the result file from a `.js` file, not `node -e`.** The price regex
  gets mangled by shell quoting, and twice in one night an agent reported bad
  prices it did not have and went looking for a bug in its own capture.
- **List the platform techniques that are currently live** (`PLAYBOOK.md` §9)
  rather than assuming the agent will find them. Agents resumed mid-batch
  immediately used ones discovered while they were down.
- **Warn that the browser pane is shared** with the other agents and will be
  navigated out from under them. Prefer curl; if the pane is needed, do the read
  in one batch of actions.
- Do all N restaurants themselves; **spawn no sub-agents** — an agent that
  delegates cannot write the result file, which is the only output that counts.
- **Do NOT run any load script. Do not commit to git. Do NOT run any Google or
  Yelp API script** — those cost money and only run when Calvin is present.

## 8. Standing constraints

- **Never commit to git.**
- **Never run a Google Places or Yelp API script.** They cost money; Calvin runs
  them. `scripts/serper.mjs` (search and `--maps`) and
  `scripts/discover-serper.mjs` ARE allowed; Serper is the search tool.
- **A rating is not required for listing** (2026-09-05). The publish gate is
  `hold_reason IS NULL` plus coordinates. Do not reintroduce a rating check.
- **Before `publish-check.mjs` or any bulk UPDATE**, dump `id, listed,
  hold_reason` to `probe/`; refuse any UPDATE without WHERE.
- **After any restaurant import** run `exclude-chains.mjs --apply` (without
  the flag it is a dry run) and then `publish-check.mjs`.
- **Never enter credentials, API keys or payment details.** Calvin puts keys in
  `.env.local` himself.
- **Never print raw secrets.** The DB host may be shown; user and password never.
- Agents may confirm or select a **store location** — that is not personal data.
  They may not submit an age gate, birthdate, login, email or any personal
  detail, accept terms, or create accounts.
- `scripts/migrate.mjs` is append-only.
- Prefer Edit/Write over PowerShell for file surgery — `Set-Content` corrupts em
  dashes on this machine.

## 9. Keeping the docs honest

- New case, technique or failure → append to `FINDINGS.md`.
- Changes what an agent should DO → also edit the corresponding line in
  `PLAYBOOK.md`.
- Changes how the pipeline is RUN → edit this file.
- Keep `PLAYBOOK.md` under ~475 lines. Past that, something in it has stopped
  earning its place and should fall back to being archive-only.

  **It stands at ~657 as of 2026-08-31, and that is a deliberate overshoot.**
  Six platforms became readable that night — NetWaiter, Clover COLO2, Popmenu,
  Menufy, ChowNow and image-only PDFs — and §9 now carries a working recipe for
  each. Every one has already paid for itself: agents used them mid-batch on
  restaurants they had previously given up on. The stories behind them were
  pushed to `FINDINGS.md` and only the commands and the single gotcha per
  platform kept, which is the right trade; the next person to trim should look
  for a whole technique that has stopped being used, not shave sentences.

A document that accumulates every lesson becomes, past some size, a liability to
the reader it was written for. Two documents with different jobs is the fix, and
the split has to be maintained deliberately or the short one quietly becomes the
long one.
