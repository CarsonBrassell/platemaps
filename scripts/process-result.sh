#!/usr/bin/env bash
# Runs the whole post-agent loop for one result file, so the coordinator pays
# for one round trip instead of four.
#
#   ./scripts/process-result.sh menus/wip/wave-01.result.json
#
# Steps, in order, any one of which stops the run before anything is loaded:
#   1. Take the .screen.lock (same mutex as night-run.sh) — refuse if held.
#   2. check-shape.mjs on the raw result file.
#   3. screen-menus.mjs on it (writes menus/wip/clean.json + quarantine.json).
#   4. Copy clean.json to a batch-specific ready-<b>.json (never load
#      clean.json directly — another session may be screening into it a
#      second from now).
#   5. check-shape.mjs on the ready file, AND refuse to load if any restaurant
#      from the result file is in neither ready.json nor quarantine.json (a
#      real disappearance), or if any entry would load as not_found that the
#      result file did not already mark not_found (screening must only ever
#      narrow found -> blocked, never invent a permanent not_found the agent
#      didn't call for). A legitimate quarantine is not a disappearance.
#   6. load-menus.mjs on the ready file.
#   7. Append one line to probe/STATE.md.
#   8. Release the lock. Print ONE summary line and nothing else on success.
set -euo pipefail

RESULT="${1:-}"
if [ -z "$RESULT" ] || [ ! -f "$RESULT" ]; then
  echo "usage: scripts/process-result.sh <menus/wip/RESULT.json>" >&2
  exit 1
fi

WIP="menus/wip"
LOCK="$WIP/.screen.lock"
BASE="$(basename "$RESULT")"
BASE="${BASE%.json}"
READY="$WIP/ready-${BASE}.json"

if [ -d "$LOCK" ]; then
  echo "refusing: $LOCK is held (another session is screening) — try again shortly" >&2
  exit 1
fi
mkdir "$LOCK"
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

echo "== check-shape (raw result) ==" >&2
if ! node "$WIP/check-shape.mjs" "$RESULT" >&2; then
  echo "refusing to proceed: check-shape flagged the raw result file above" >&2
  exit 1
fi

echo "== screen-menus ==" >&2
node --env-file=.env.local scripts/screen-menus.mjs "$RESULT" >&2

cp "$WIP/clean.json" "$READY"

echo "== check-shape (ready file) ==" >&2
if ! node "$WIP/check-shape.mjs" "$READY" >&2; then
  echo "refusing to load: check-shape flagged $READY above" >&2
  exit 1
fi

# Refuse if any restaurant vanished without a trace, or if screening
# manufactured a permanent not_found the result file didn't already call for.
#
# A legitimate quarantine (screen-menus.mjs's own too-few-dishes / barred-
# source holding pen, menus/wip/quarantine.json) is NOT a disappearance — it
# is explicitly a queue for re-extraction, so every result-file entry must
# land in ready.json, quarantine.json, or both counts must add up to the
# result file's. Only an entry that is in neither is a real bug.
node -e '
  const fs = require("fs");
  const result = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const ready = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  let quarantine = [];
  try {
    quarantine = JSON.parse(fs.readFileSync("menus/wip/quarantine.json", "utf8"));
  } catch {}
  const isNotFound = (e) => (e.dishes || []).length === 0 && !e.blocked;

  const readyIds = new Set(ready.map((e) => String(e.restaurantId)));
  const quarantineIds = new Set(quarantine.map((e) => String(e.restaurantId)));
  const missing = result
    .map((e) => String(e.restaurantId))
    .filter((id) => !readyIds.has(id) && !quarantineIds.has(id));
  if (missing.length) {
    console.error(
      `refusing to load: ${missing.length} restaurant(s) from the result file are in neither ` +
        `ready.json nor quarantine.json: ${missing.join(", ")}`,
    );
    process.exit(1);
  }
  if (quarantine.length) {
    console.error(
      `note: ${quarantine.length} entr${quarantine.length === 1 ? "y" : "ies"} quarantined ` +
        `(re-extraction, not loaded, no menu_lookups row written): ` +
        `${quarantine.map((e) => e.name).join(", ")}`,
    );
  }

  const resultNotFound = new Set(result.filter(isNotFound).map((e) => String(e.restaurantId)));
  const problems = [];
  for (const e of ready) {
    const id = String(e.restaurantId);
    if (isNotFound(e) && !resultNotFound.has(id)) {
      problems.push(`${id} (${e.name}): would load as not_found but the result file did not mark it not_found`);
    }
  }
  if (problems.length) {
    console.error("refusing to load — screening introduced new permanent not_found entries:");
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
' "$RESULT" "$READY"

echo "== load-menus ==" >&2
LOAD_OUTPUT="$(node --env-file=.env.local scripts/load-menus.mjs "$READY")"
echo "$LOAD_OUTPUT" >&2

FOUND_LINE="$(echo "$LOAD_OUTPUT" | grep -o 'Loaded [0-9]* menus ([0-9]* dishes)' || true)"
COVERAGE_LINE="$(echo "$LOAD_OUTPUT" | grep -o 'Coverage: [0-9]*/[0-9]* restaurants have a menu.' || true)"

STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "- ${STAMP} ${BASE}: ${FOUND_LINE:-loaded} — ${COVERAGE_LINE:-}" >> probe/STATE.md

echo "processed ${BASE}: ${FOUND_LINE:-loaded}, ${COVERAGE_LINE:-}"
