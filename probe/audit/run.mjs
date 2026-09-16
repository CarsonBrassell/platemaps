/**
 * Overnight audit loop: simulated visitors (Sonnet agents driving a headless
 * browser) plus a deterministic search oracle, in cycles until a time budget,
 * a run cap, or probe/audit/STOP.
 *
 *   node probe/audit/run.mjs                              8h, 2 parallel, 60 runs, both surfaces
 *   node probe/audit/run.mjs --hours 1 --max-runs 4 --only search-cuisine-word,search-known-place
 *   node probe/audit/run.mjs --dry                        print the plan, run nothing
 *   node probe/audit/run.mjs --no-oracle --no-triage
 *   node probe/audit/run.mjs --writes                     logged-in scenarios may submit
 *
 * Needs `claude` logged in on this machine (run `claude` once in a terminal),
 * the dev server on :3000 (started here if it is not), and optionally
 * probe/audit/.env with AUDIT_EMAIL / AUDIT_PASSWORD for logged-in scenarios.
 *
 * Outputs, all under probe/audit/:
 *   run.log                 progress, one line per run with cost and turns
 *   findings/<ts>-*.json    one raw report per session
 *   findings/runs.jsonl     one line per run (scenario, cost, ms, findings count)
 *   findings/new.jsonl      the triage inbox, cleared after each triage
 *   findings/oracle-*.md    the oracle's pass rates and worst failures
 *   BACKLOG.md              the deduped, ranked list (triage output)
 *   REPORT.md               tonight's summary, read this in the morning
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const FINDINGS = path.join(HERE, "findings");
const BACKLOG = path.join(HERE, "BACKLOG.md");
const REPORT = path.join(HERE, "REPORT.md");
const LOG = path.join(HERE, "run.log");
const STOP = path.join(HERE, "STOP");
const SAMPLE = path.join(HERE, "corpus-sample.json");
const INBOX = path.join(FINDINGS, "new.jsonl");
const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3000";
const BROWSE_PORT = Number(process.env.BROWSE_PORT ?? 3777);
const NODE = process.execPath;

/* ------------------------------------------------------------ arguments */

const argv = parseArgs(process.argv.slice(2));
const opt = {
  hours: num(argv.hours, 8),
  parallel: num(argv.parallel, 2),
  maxRuns: num(argv["max-runs"], 60),
  surface: String(argv.surface ?? "both"),
  model: String(argv.model ?? "sonnet"),
  writes: !!argv.writes,
  only: argv.only ? String(argv.only).split(",") : null,
  oracle: !argv["no-oracle"],
  triage: !argv["no-triage"],
  oracleSample: num(argv["oracle-sample"], 120),
  oracleEvery: num(argv["oracle-every"], 4),
  maxTurns: num(argv["max-turns"], 70),
  agentTimeoutMin: num(argv["agent-timeout"], 25),
  dry: !!argv.dry,
};

function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = list[i + 1];
    if (next != null && !next.startsWith("--")) { out[key] = next; i += 1; } else out[key] = true;
  }
  return out;
}
function num(v, d) { const n = Number(v); return Number.isFinite(n) && v != null ? n : d; }

/* -------------------------------------------------------------- helpers */

function stamp() { return new Date().toISOString().replace("T", " ").slice(0, 19); }
function log(line) {
  const s = `${stamp()}  ${line}`;
  console.log(s);
  appendFileSync(LOG, s + "\n");
}
function today() { return new Date().toISOString().slice(0, 10); }
function ts() { return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19); }
function shuffle(a, rnd = Math.random) { const b = [...a]; for (let i = b.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function pick(a, n, rnd = Math.random) { return shuffle(a, rnd).slice(0, n); }
function readJson(file, fallback) { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; } }
function readText(file, fallback = "") { try { return readFileSync(file, "utf8"); } catch { return fallback; } }
function stopRequested() { return existsSync(STOP); }

function loadDotEnv() {
  const file = path.join(HERE, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function claudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const appdata = process.env.APPDATA ?? "";
  const exe = path.join(appdata, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
  return existsSync(exe) ? exe : "claude";
}

async function fetchOk(url, ms = 8000) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------- server + daemon */

const children = [];

async function ensureServer() {
  if (await fetchOk(BASE + "/")) { log(`dev server already up at ${BASE}`); return; }
  log(`no server at ${BASE}; starting next dev`);
  const out = path.join(HERE, "dev-server.log");
  const child = spawn(NODE, ["node_modules/next/dist/bin/next", "dev"], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => appendFileSync(out, d));
  child.stderr.on("data", (d) => appendFileSync(out, d));
  children.push(child);
  for (let i = 0; i < 60; i += 1) {
    await sleep(3000);
    if (await fetchOk(BASE + "/", 15000)) { log("dev server is up"); return; }
  }
  throw new Error("dev server did not come up in 3 minutes; see probe/audit/dev-server.log");
}

async function ensureBrowse() {
  const health = `http://127.0.0.1:${BROWSE_PORT}/health`;
  if (await fetchOk(health, 2000)) { log("browse daemon already up"); return; }
  const child = spawn(NODE, [path.join(HERE, "browse.mjs"), "serve"], {
    cwd: REPO,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BROWSE_PORT: String(BROWSE_PORT), AUDIT_BASE_URL: BASE },
  });
  child.stdout.on("data", (d) => appendFileSync(LOG, `browse: ${d}`));
  child.stderr.on("data", (d) => appendFileSync(LOG, `browse! ${d}`));
  children.push(child);
  for (let i = 0; i < 20; i += 1) {
    await sleep(1000);
    if (await fetchOk(health, 2000)) { log("browse daemon is up"); return; }
  }
  throw new Error("browse daemon did not start; is playwright's chromium installed? (npx playwright install chromium)");
}

/* ---------------------------------------------------------------- oracle */

function runOracle(sample) {
  log(`oracle: sample ${sample} ...`);
  const t0 = Date.now();
  const r = spawnSync(
    NODE,
    ["--env-file=.env.local", "node_modules/tsx/dist/cli.mjs", "probe/audit/oracle.mts", "--sample", String(sample), "--quiet"],
    { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    log(`oracle failed: ${(r.stderr || r.stdout || "").slice(-600)}`);
    return null;
  }
  const latest = readJson(path.join(HERE, "oracle-latest.json"), null);
  log(`oracle: done in ${Math.round((Date.now() - t0) / 1000)}s; ${latest ? `${latest.findings.length} findings` : "no summary"}`);
  if (latest?.findings?.length) {
    for (const f of latest.findings) appendFileSync(INBOX, JSON.stringify({ ...f, scenario: "oracle", persona: "oracle", surface: "server", date: today() }) + "\n");
  }
  return latest;
}

/* ------------------------------------------------------------- scenarios */

function planRuns(catalog, sample) {
  const loginOk = !!(process.env.AUDIT_EMAIL && process.env.AUDIT_PASSWORD);
  const surfaces = opt.surface === "both" ? ["phone", "web"] : [opt.surface];
  const runs = [];
  for (const sc of catalog.scenarios) {
    if (opt.only && !opt.only.includes(sc.id)) continue;
    if (sc.needsLogin && !loginOk) continue;
    const mine = sc.surface === "both" ? surfaces : surfaces.includes(sc.surface) ? [sc.surface] : [];
    for (const surface of mine) runs.push({ scenario: sc, surface });
  }
  return shuffle(runs).map((r) => {
    const anchor = pick(catalog.anchors, 1)[0];
    const seeds = seedsFor(r.scenario.seeds, sample);
    return { ...r, anchor, seeds, persona: r.scenario.persona, personaText: catalog.personas[r.scenario.persona] ?? "" };
  });
}

function seedsFor(kind, sample) {
  if (!sample || kind === "none") return [];
  if (kind === "restaurants") return pick(sample.restaurants, 3).map((r) => `${r.name} (${r.cuisine ?? "no cuisine"}, ${r.neighborhood})`);
  if (kind === "cuisines") return pick(sample.cuisines, 4);
  if (kind === "dishes") return pick(sample.restaurants.filter((r) => r.dish), 4).map((r) => `${r.dish} (served at ${r.name})`);
  if (kind === "neighborhoods") return pick(sample.neighborhoods, 3);
  return [];
}

function buildPrompt(run, session) {
  const brief = readText(path.join(HERE, "BRIEF.md"));
  const seeds = run.seeds.length ? run.seeds.join("; ") : "(none)";
  const goal = run.scenario.goal.replaceAll("{anchor}", run.anchor.name).replaceAll("{seeds}", seeds);
  const loginLine = run.scenario.needsLogin
    ? `Login is available: run \`login\` after \`open\`. Writes (submitting a post, sending a request, commenting) are ${opt.writes ? "ALLOWED tonight" : "NOT allowed: stop before any final submit"}.`
    : "You are logged out and stay logged out.";
  return `${brief}

# Your session

- SESSION: ${session}
- Surface: ${run.surface}  (open with: node probe/audit/browse.mjs ${session} open ${run.surface} ${run.anchor.lat},${run.anchor.lng})
- You are standing at: ${run.anchor.name}
- Date/time: ${new Date().toString()}
- Scenario: ${run.scenario.id}
- Persona (${run.persona}): ${run.personaText}
- ${loginLine}

## Goal

${goal}

Start now. First command: open. Last command: close. Then the JSON report.`;
}

/* -------------------------------------------------------------- claude -p */

function runClaude(prompt, { maxTurns, disallow, timeoutMin }) {
  return new Promise((resolve) => {
    const args = [
      "-p",
      "--model", opt.model,
      "--output-format", "json",
      "--permission-mode", "bypassPermissions",
      "--max-turns", String(maxTurns),
      "--no-session-persistence",
      ...(disallow.length ? ["--disallowedTools", ...disallow] : []),
    ];
    // MSYS_NO_PATHCONV stops Git Bash (which the agent's Bash tool runs) from
    // rewriting "/m/feed" into a Windows path before browse.mjs sees it.
    const child = spawn(claudeBin(), args, { cwd: REPO, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => { child.kill(); err += `\n[killed after ${timeoutMin} min]`; }, timeoutMin * 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      let json = null;
      try { json = JSON.parse(out); } catch { /* not json */ }
      resolve({
        code,
        text: json?.result ?? out,
        cost: json?.total_cost_usd ?? null,
        ms: json?.duration_ms ?? null,
        turns: json?.num_turns ?? null,
        isError: json?.is_error ?? code !== 0,
        stderr: err.trim().slice(-800),
      });
    });
    child.stdin.end(prompt);
  });
}

// claude -p needs a logged-in CLI. Instead of burning the run cap on sixty
// instant "OAuth session expired" failures, an auth failure parks the loop:
// the run goes back on the queue and the workers re-check every minute until
// someone runs `claude` and logs in, or the night ends.
const AUTH_RE = /Failed to authenticate|OAuth session expired|not logged in|Invalid API key|authentication_error/i;
function isAuthError(r) { return r.isError && AUTH_RE.test(String(r.text) + " " + String(r.stderr)); }
async function authOk() {
  const r = await runClaude("Reply with the single word ok.", { maxTurns: 1, disallow: [], timeoutMin: 2 });
  return !isAuthError(r);
}
let authWaiting = false;
async function waitForAuth(deadline) {
  if (await authOk()) return true;
  if (!authWaiting) { authWaiting = true; log("claude -p is not logged in (OAuth expired). Waiting - open a terminal, run `claude`, log in. Re-checking every 60s."); }
  while (!stopRequested() && Date.now() < deadline) {
    await sleep(60_000);
    if (await authOk()) { if (authWaiting) { authWaiting = false; log("claude login detected; agent runs starting"); } return true; }
  }
  return false;
}

function fencedBlock(text, tag) {
  const re = new RegExp("```" + tag + "\\s*\\n([\\s\\S]*?)\\n```", "g");
  let last = null, m;
  while ((m = re.exec(text))) last = m[1];
  return last;
}

function parseReport(text) {
  const block = fencedBlock(text, "json");
  if (!block) return null;
  try {
    const j = JSON.parse(block);
    if (!Array.isArray(j.findings)) return null;
    j.findings = j.findings.filter((f) => f && typeof f.title === "string").map((f) => ({
      severity: ["blocker", "major", "minor", "nit"].includes(f.severity) ? f.severity : "minor",
      area: String(f.area ?? "other"),
      title: String(f.title).slice(0, 160),
      url: String(f.url ?? ""),
      steps: Array.isArray(f.steps) ? f.steps.map(String).slice(0, 12) : [],
      expected: String(f.expected ?? "").slice(0, 600),
      actual: String(f.actual ?? "").slice(0, 900),
      evidence: String(f.evidence ?? "").slice(0, 600),
    }));
    return j;
  } catch { return null; }
}

/* ------------------------------------------------------------- one run */

const stats = { runs: 0, cost: 0, findings: 0, errors: 0, byScenario: {}, started: Date.now() };

async function runOne(run, n) {
  const session = `${run.scenario.id}-${run.surface}-${n}`.replace(/[^a-z0-9-]/gi, "-");
  const prompt = buildPrompt(run, session);
  log(`run ${n} start  ${run.scenario.id} / ${run.surface} / ${run.persona} @ ${run.anchor.name}`);
  const r = await runClaude(prompt, {
    maxTurns: opt.maxTurns,
    disallow: ["Edit", "Write", "MultiEdit", "NotebookEdit", "Glob", "Grep", "WebSearch", "WebFetch", "Agent", "Task", "TodoWrite"],
    timeoutMin: opt.agentTimeoutMin,
  });
  // Best effort: the agent was told to close, but a killed one will not have.
  spawnSync(NODE, [path.join(HERE, "browse.mjs"), session, "close"], { cwd: REPO, env: { ...process.env, BROWSE_PORT: String(BROWSE_PORT) } });
  if (isAuthError(r)) { log(`run ${n} needs login; requeued`); return "auth"; }
  const report = parseReport(r.text);
  const file = path.join(FINDINGS, `${ts()}-${run.scenario.id}-${run.surface}.json`);
  const record = {
    ts: new Date().toISOString(), scenario: run.scenario.id, surface: run.surface, persona: run.persona,
    anchor: run.anchor.name, seeds: run.seeds, cost: r.cost, ms: r.ms, turns: r.turns, isError: r.isError,
    summary: report?.summary ?? null, findings: report?.findings ?? [], raw: report ? undefined : r.text.slice(-4000), stderr: r.stderr || undefined,
  };
  writeFileSync(file, JSON.stringify(record, null, 2));
  appendFileSync(path.join(FINDINGS, "runs.jsonl"), JSON.stringify({ ...record, findings: record.findings.length, raw: undefined, stderr: undefined }) + "\n");
  for (const f of record.findings) {
    appendFileSync(INBOX, JSON.stringify({ ...f, scenario: run.scenario.id, persona: run.persona, surface: run.surface, anchor: run.anchor.name, date: today() }) + "\n");
  }
  stats.runs += 1;
  stats.cost += r.cost ?? 0;
  stats.findings += record.findings.length;
  if (r.isError || !report) stats.errors += 1;
  const s = (stats.byScenario[run.scenario.id] ??= { runs: 0, findings: 0, cost: 0 });
  s.runs += 1; s.findings += record.findings.length; s.cost += r.cost ?? 0;
  log(`run ${n} done   ${run.scenario.id} / ${run.surface}  ${record.findings.length} findings  ${r.turns ?? "?"} turns  ${r.ms ? Math.round(r.ms / 1000) + "s" : "?"}  $${(r.cost ?? 0).toFixed(2)}${report ? "" : "  (NO REPORT: " + (r.stderr || r.text.slice(-200)).replace(/\s+/g, " ") + ")"}`);
}

/* ---------------------------------------------------------------- triage */

async function triage() {
  const lines = readText(INBOX).split("\n").filter(Boolean);
  if (!lines.length) { log("triage: inbox empty"); return null; }
  const items = lines.map((l) => JSON.parse(l));
  const batch = items.slice(0, 80);
  const backlog = readText(BACKLOG, "# PlateMaps audit backlog\n(empty)\n");
  const prompt = `${readText(path.join(HERE, "TRIAGE.md"))}

# Today: ${today()}

# Current BACKLOG.md

${backlog}

# New findings (${batch.length}${items.length > batch.length ? ` of ${items.length}; the rest come next round` : ""})

${JSON.stringify(batch, null, 1)}`;
  log(`triage: ${batch.length} findings -> backlog`);
  const r = await runClaude(prompt, { maxTurns: 4, disallow: ["Bash", "Read", "Edit", "Write", "Glob", "Grep", "WebSearch", "WebFetch", "Agent", "Task"], timeoutMin: 10 });
  stats.cost += r.cost ?? 0;
  const newBacklog = fencedBlock(r.text, "backlog");
  const report = fencedBlock(r.text, "report");
  if (!newBacklog) { log(`triage: no backlog block returned; inbox kept (${(r.stderr || r.text.slice(-200)).replace(/\s+/g, " ")})`); return null; }
  if (existsSync(BACKLOG)) renameSync(BACKLOG, path.join(FINDINGS, `backlog-${ts()}.md`));
  writeFileSync(BACKLOG, newBacklog.trim() + "\n");
  const rest = items.slice(batch.length);
  renameSync(INBOX, path.join(FINDINGS, `triaged-${ts()}.jsonl`));
  if (rest.length) writeFileSync(INBOX, rest.map((i) => JSON.stringify(i)).join("\n") + "\n");
  log(`triage: backlog written${rest.length ? `, ${rest.length} findings held for next round` : ""}`);
  return report?.trim() ?? null;
}

/* ---------------------------------------------------------------- report */

function writeReport(tonight, oracle) {
  const mins = Math.round((Date.now() - stats.started) / 60_000);
  const rows = Object.entries(stats.byScenario).sort((a, b) => b[1].findings - a[1].findings)
    .map(([id, s]) => `| ${id} | ${s.runs} | ${s.findings} | $${s.cost.toFixed(2)} |`).join("\n");
  const oracleRows = oracle
    ? Object.entries(oracle.checks).map(([k, c]) => `| ${k} | ${c.n} | ${(c.rate * 100).toFixed(0)}%${c.delta != null ? ` (${c.delta >= 0 ? "+" : ""}${(c.delta * 100).toFixed(0)})` : ""} |`).join("\n")
    : "| (oracle did not run) | | |";
  const md = `# Audit report - ${today()}

Ran ${mins} min, ${stats.runs} agent sessions, ${stats.findings} raw findings, ${stats.errors} sessions without a report, about $${stats.cost.toFixed(2)} in API terms (subscription-billed runs show $0).
Model ${opt.model}, ${opt.parallel} in parallel, surface ${opt.surface}${opt.writes ? ", writes allowed" : ""}.

${tonight ?? "## Tonight\n(triage did not run)"}

The full ranked list is in [BACKLOG.md](BACKLOG.md). Raw session reports are in findings/.

## Search oracle (measured, not opinion)

| check | n | pass rate (delta vs last) |
|---|---|---|
${oracleRows}

Worst failures are in ${oracle ? `findings/${oracle.file}` : "findings/oracle-*.md"}.

## Sessions

| scenario | runs | findings | cost |
|---|---|---|---|
${rows}
`;
  writeFileSync(REPORT, md);
}

/* ------------------------------------------------------------------ main */

async function main() {
  mkdirSync(FINDINGS, { recursive: true });
  loadDotEnv();
  const catalog = readJson(path.join(HERE, "scenarios.json"), null);
  if (!catalog) throw new Error("probe/audit/scenarios.json missing or invalid");

  if (opt.dry) {
    const sample = readJson(SAMPLE, null);
    const runs = planRuns(catalog, sample);
    console.log(`plan: ${runs.length} runs per cycle, ${opt.parallel} parallel, cap ${opt.maxRuns}, ${opt.hours}h, model ${opt.model}, claude at ${claudeBin()}`);
    for (const r of runs) console.log(`  ${r.scenario.id.padEnd(24)} ${r.surface.padEnd(5)} ${r.persona.padEnd(15)} @ ${r.anchor.name}  seeds: ${r.seeds.join("; ") || "-"}`);
    if (!sample) console.log("  (no corpus-sample.json yet; the oracle writes it on the first cycle)");
    return;
  }

  log(`=== audit start: ${opt.hours}h, ${opt.parallel} parallel, cap ${opt.maxRuns}, model ${opt.model}, surface ${opt.surface}`);
  if (stopRequested()) { log("STOP file present at start; delete probe/audit/STOP first"); return; }
  await ensureServer();
  await ensureBrowse();

  const deadline = Date.now() + opt.hours * 3600_000;
  let n = 0, cycle = 0, oracle = null, tonight = null;
  try {
    while (!stopRequested() && Date.now() < deadline && n < opt.maxRuns) {
      cycle += 1;
      log(`--- cycle ${cycle}`);
      if (opt.oracle && (cycle === 1 || cycle % opt.oracleEvery === 0)) oracle = runOracle(opt.oracleSample) ?? oracle;
      if (!existsSync(SAMPLE) && opt.oracle) runOracle(40);
      const sample = readJson(SAMPLE, null);
      if (!sample) log("no corpus-sample.json; scenarios run without seeded names");
      const queue = planRuns(catalog, sample);
      if (!queue.length) { log("no runnable scenarios (check --only / --surface / login)"); break; }
      if (!(await waitForAuth(deadline))) break;
      let idx = 0;
      const worker = async () => {
        while (idx < queue.length && !stopRequested() && Date.now() < deadline && n < opt.maxRuns) {
          const run = queue[idx]; idx += 1; n += 1;
          try {
            const res = await runOne(run, n);
            if (res === "auth") { n -= 1; queue.push(run); if (!(await waitForAuth(deadline))) return; }
          } catch (e) { stats.errors += 1; log(`run ${n} crashed: ${e.message}`); }
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, opt.parallel) }, worker));
      if (opt.triage) tonight = (await triage()) ?? tonight;
      writeReport(tonight, oracle ?? readJson(path.join(HERE, "oracle-latest.json"), null));
    }
  } finally {
    if (opt.triage && existsSync(INBOX)) tonight = (await triage()) ?? tonight;
    writeReport(tonight, oracle ?? readJson(path.join(HERE, "oracle-latest.json"), null));
    for (const c of children) c.kill();
    log(`=== audit end: ${stats.runs} runs, ${stats.findings} findings, ${stats.errors} errors, $${stats.cost.toFixed(2)}${stopRequested() ? " (STOP)" : ""}`);
  }
}

process.on("SIGINT", () => { writeFileSync(STOP, ""); log("SIGINT: finishing current runs"); });
main().catch((e) => { log(`fatal: ${e.message}`); for (const c of children) c.kill(); process.exit(1); });
