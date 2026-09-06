#!/usr/bin/env bash
# Periodically absorbs a browser pass's output WHILE IT IS STILL RUNNING.
#
# browser-menus.mjs rewrites its result file after every restaurant, so its
# menus are loadable long before the pass ends — a 2,237-row feed takes ~3
# hours and there is no reason for the first hour's menus to sit on disk that
# whole time. Two rules make reading a live file safe:
#
#   1. Snapshot first. Screening the live file races the writer and can read a
#      half-written JSON array.
#   2. Take menus/wip/.screen.lock before screening. screen-menus.mjs writes a
#      fixed menus/wip/clean.json, so two screeners overwrite each other; the
#      lock is the same mutex night-run.sh uses.
#
# Re-absorbing an already-absorbed file is harmless — load-menus.mjs reports
# the menus it wrote and coverage simply does not move.
#
#   nohup bash scripts/absorb-loop.sh menus/wip/browser-<stamp>.json 12 900 &
#
set -u
SRC="${1:?usage: absorb-loop.sh <browser output json> [iterations] [sleep secs]}"
ITERS="${2:-12}"
NAP="${3:-900}"
LOCK=menus/wip/.screen.lock
TAG="$(basename "$SRC" .json)-loop"

for i in $(seq 1 "$ITERS"); do
  [ -f "$SRC" ] || { echo "[$i] $SRC gone"; break; }
  got=0
  for _ in $(seq 1 60); do mkdir "$LOCK" 2>/dev/null && { got=1; break; }; sleep 5; done
  if [ "$got" = 0 ]; then echo "[$i] lock busy, skipping"; sleep "$NAP"; continue; fi
  cp "$SRC" "menus/wip/$TAG.snap.json"
  node scripts/screen-menus.mjs "menus/wip/$TAG.snap.json" >"menus/wip/$TAG.screen.log" 2>&1
  cp menus/wip/clean.json "menus/wip/clean-$TAG.json" 2>/dev/null
  rmdir "$LOCK"
  node --env-file=.env.local scripts/load-menus.mjs "menus/wip/clean-$TAG.json" 2>&1 \
    | grep -E '^Loaded|^Coverage' | sed "s/^/[$i] /"
  sleep "$NAP"
done
