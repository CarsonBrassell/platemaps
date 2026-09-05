#!/usr/bin/env bash
# Unattended overnight loop for the two ZERO-TOKEN tiers.
#
# The router and the browser pass cost nothing per menu - they are deterministic
# scripts, not model calls - so they are the tiers that should run while nobody
# is watching. Agents keep going in parallel under the coordinator; this script
# does not touch them, it only keeps their batch supply topped up.
#
# Each iteration runs the router with --no-cache. That is deliberate: the
# response cache has no TTL, so a plain pass re-reads whatever a closed-store
# gate returned hours ago and re-confirms the same verdict forever. A fresh read
# at a DIFFERENT hour is the documented way past a daypart gate, and one such
# pass over 100 gated ids filed 11 menus for nothing.
#
# LOCKING: screen-menus.mjs always writes menus/wip/clean.json, so a screen here
# racing a screen in the interactive session would have one load the other's
# output. Both sides take menus/wip/.screen.lock first, and every load reads a
# uniquely-named COPY rather than clean.json itself.

set -u
cd "$(dirname "$0")/.."
LOG=menus/wip/night.log
LOCK=menus/wip/.screen.lock

lock()   { local n=0; while ! mkdir "$LOCK" 2>/dev/null; do n=$((n+1)); [ $n -gt 300 ] && { echo "lock timeout" >>"$LOG"; return 1; }; sleep 2; done; }
unlock() { rmdir "$LOCK" 2>/dev/null; }
say()    { echo "[$(date -u +%H:%M)] $*" >>"$LOG"; }

# Screen one result file and load it under its own name. Never loads clean.json
# directly - see LOCKING above.
absorb() {
  local src="$1" tag="$2"
  [ -f "$src" ] || { say "$tag: no file"; return; }
  lock || return
  node scripts/screen-menus.mjs "$src" >"menus/wip/$tag.screen.log" 2>&1
  cp menus/wip/clean.json "menus/wip/clean-$tag.json" 2>/dev/null
  unlock
  node --env-file=.env.local scripts/load-menus.mjs "menus/wip/clean-$tag.json" >"menus/wip/$tag.load.log" 2>&1
  say "$tag: $(grep -E '^Loaded|^Coverage' "menus/wip/$tag.load.log" | tr '\n' ' ')"
}

newest() { ls -t $1 2>/dev/null | head -1; }

say "night-run starting"

for i in $(seq 1 40); do
  stamp="n$(date -u +%m%d-%H%M)"

  say "iter $i: router --no-cache"
  node --env-file=.env.local scripts/route-menus.mjs --no-cache >"menus/wip/$stamp.router.log" 2>&1
  rf=$(newest 'menus/wip/router-*.json' | grep -v notes || true)
  rf=$(ls -t menus/wip/router-*.json 2>/dev/null | grep -v '\.notes\.json$' | head -1)
  absorb "$rf" "$stamp-router"

  nf=$(ls -t menus/wip/router-*.notes.json 2>/dev/null | head -1)
  if [ -n "${nf:-}" ]; then
    say "iter $i: browser pass from $(basename "$nf")"
    node --env-file=.env.local scripts/browser-menus.mjs --from "$nf" >"menus/wip/$stamp.browser.log" 2>&1
    bf=$(ls -t menus/wip/browser-*.json 2>/dev/null | grep -v '\.notes\.json$' | head -1)
    absorb "$bf" "$stamp-browser"
  fi

  # Keep the agents' batch supply stocked so the coordinator never runs dry.
  node --env-file=.env.local scripts/cut-batches.mjs --size 20 --count 6 \
       --prefix "b$(date -u +%H%M)" --window 6 --blocked-window 24 \
       >"menus/wip/$stamp.cut.log" 2>&1
  say "iter $i: $(tail -1 "menus/wip/$stamp.cut.log")"

  sleep 900
done
say "night-run finished 40 iterations"
