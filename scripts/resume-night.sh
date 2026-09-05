#!/usr/bin/env bash
# Restart after the 2026-09-04 shutdown killed every agent and background pass.
#
# Two jobs, in order:
#   1. Absorb the result files the killed agents had already written. They write
#      after EVERY restaurant, so a killed agent still leaves real work on disk -
#      throwing that away and re-running the batch would pay twice for it.
#   2. Resume the zero-token loop (router --no-cache -> browser -> cut batches).
#
# Everything runs here rather than in the foreground because a screen+load pair
# takes longer than the interactive tool's two-minute ceiling and was being
# killed halfway through.
set -u
cd "$(dirname "$0")/.."
LOG=menus/wip/night.log
LOCK=menus/wip/.screen.lock

lock()   { local n=0; while ! mkdir "$LOCK" 2>/dev/null; do n=$((n+1)); [ $n -gt 300 ] && return 1; sleep 2; done; }
unlock() { rmdir "$LOCK" 2>/dev/null; }
say()    { echo "[$(date -u +%H:%M)] $*" >>"$LOG"; }

absorb() {
  local src="$1" tag="$2"
  [ -s "$src" ] || { say "$tag: no file"; return; }
  lock || { say "$tag: lock timeout"; return; }
  node --env-file=.env.local scripts/screen-menus.mjs "$src" >"menus/wip/$tag.screen.log" 2>&1
  local rc=$?
  cp menus/wip/clean.json "menus/wip/clean-$tag.json" 2>/dev/null
  unlock
  [ $rc -ne 0 ] && { say "$tag: screen failed rc=$rc"; return; }
  node --env-file=.env.local scripts/load-menus.mjs "menus/wip/clean-$tag.json" >"menus/wip/$tag.load.log" 2>&1
  # A whole-file rejection over a cosmetic name difference used to drop the
  # entire batch silently. Realign and load again before giving up.
  if grep -q "problem" "menus/wip/$tag.load.log"; then
    node menus/wip/retry-load.mjs "menus/wip/clean-$tag.json" "menus/wip/$tag.load.log" &&     node --env-file=.env.local scripts/load-menus.mjs "menus/wip/clean-$tag.json" >>"menus/wip/$tag.load.log" 2>&1
  fi
  say "$tag: $(grep -E '^Loaded|^Coverage' "menus/wip/$tag.load.log" | tr '\n' ' ')"
}

say "=== resume after shutdown ==="
for b in tm-05 tm-06 tk2-01 tk2-04; do
  absorb "menus/wip/result-$b.json" "$b"
done

for i in $(seq 1 30); do
  stamp="r$(date -u +%m%d-%H%M)"

  say "iter $i: router --no-cache"
  node --env-file=.env.local scripts/route-menus.mjs --no-cache >"menus/wip/$stamp.router.log" 2>&1
  rf=$(ls -t menus/wip/router-*.json 2>/dev/null | grep -v '\.notes\.json$' | head -1)
  absorb "$rf" "$stamp-router"

  nf=$(ls -t menus/wip/router-*.notes.json 2>/dev/null | head -1)
  if [ -n "${nf:-}" ]; then
    say "iter $i: browser from $(basename "$nf")"
    node --env-file=.env.local scripts/browser-menus.mjs --from "$nf" >"menus/wip/$stamp.browser.log" 2>&1
    bf=$(ls -t menus/wip/browser-*.json 2>/dev/null | grep -v '\.notes\.json$' | head -1)
    absorb "$bf" "$stamp-browser"
  fi

  node --env-file=.env.local scripts/cut-batches.mjs --size 20 --count 6 \
       --prefix "n$(date -u +%H%M)" --window 6 --blocked-window 24 \
       >"menus/wip/$stamp.cut.log" 2>&1
  say "iter $i: $(tail -1 "menus/wip/$stamp.cut.log")"
  sleep 600
done
say "resume-night finished"
