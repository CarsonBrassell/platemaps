#!/usr/bin/env bash
# Runs the never-browsed (`no-platform`) backlog in SHORT CHUNKS under a hard
# timeout, absorbing after each one.
#
# Why chunks. On 2026-09-06 a single pass over 1,326 rows hung on one page at
# row 424 and sat there: no error, no exit, no further output, 20 orphaned
# Chromium processes, and every row after it unreached. browser-menus.mjs caps
# its curl replay at 30s but nothing caps the browser open, so one page that
# never settles stalls the whole run indefinitely. A 13-hour job that can be
# killed by any one of 1,326 pages is not a job you can leave alone.
#
# So: rebuild the feed, run a small slice under `timeout`, kill whatever
# Chromium it leaked, absorb, repeat. A hang now costs one chunk, not the run.
# The rebuild is what makes it resume - mk-noplatform-feed.mjs reads the notes
# files newest-first and drops every row the browser has already opened, so
# each iteration naturally starts where the last one stopped.
#
# Absorbing takes menus/wip/.screen.lock, same as absorb-loop.sh and night-run,
# because screen-menus.mjs writes a fixed menus/wip/clean.json.
#
#   bash scripts/noplatform-supervisor.sh [chunks] [rows per chunk] [chunk timeout secs]

set -u
CHUNKS="${1:-40}"
SIZE="${2:-50}"
CAP="${3:-1500}"
LOCK=menus/wip/.screen.lock

for i in $(seq 1 "$CHUNKS"); do
  node --env-file=.env.local probe/mk-noplatform-feed.mjs --limit "$SIZE" \
    > menus/wip/noplatform-feed.log 2>&1
  FEED="$(grep -ao 'menus/wip/noplatform-[a-z0-9]*\.notes\.json' menus/wip/noplatform-feed.log | tail -1)"
  if [ -z "${FEED:-}" ] || [ ! -f "$FEED" ]; then
    echo "[$i] no feed written - stopping"; break
  fi
  n="$(node -e "console.log(require('./$FEED').length)" 2>/dev/null || echo 0)"
  if [ "$n" -eq 0 ]; then echo "[$i] backlog empty - done"; break; fi
  echo "[$i] $n rows from $FEED"

  timeout -k 30 "$CAP" node --env-file=.env.local scripts/browser-menus.mjs \
    --from "$FEED" --no-chains-first > "menus/wip/noplatform-chunk-$i.log" 2>&1
  rc=$?
  [ "$rc" -eq 124 ] && echo "[$i] chunk hit the ${CAP}s cap - killed, moving on"

  # A timed-out or crashed pass leaves its browser behind; the next chunk will
  # start its own. Leaking these is what put 20 Chromium processes on the box.
  pkill -f 'browser-menus.mjs' 2>/dev/null
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/kill-playwright.ps1 >/dev/null 2>&1

  OUT="$(grep -ao 'menus/wip/browser-[0-9-]*\.json' "menus/wip/noplatform-chunk-$i.log" | grep -v notes | tail -1)"
  [ -z "${OUT:-}" ] && OUT="$(ls -t menus/wip/browser-*.json 2>/dev/null | grep -v notes | head -1)"
  [ -f "${OUT:-}" ] || { echo "[$i] no output file to absorb"; continue; }

  got=0
  for _ in $(seq 1 60); do mkdir "$LOCK" 2>/dev/null && { got=1; break; }; sleep 5; done
  if [ "$got" = 0 ]; then echo "[$i] lock busy - leaving $OUT for the next round"; continue; fi
  cp "$OUT" "menus/wip/noplatform-chunk-$i.snap.json"
  node --env-file=.env.local scripts/screen-menus.mjs "menus/wip/noplatform-chunk-$i.snap.json" \
    > "menus/wip/noplatform-chunk-$i.screen.log" 2>&1
  cp menus/wip/clean.json "menus/wip/clean-noplatform-$i.json" 2>/dev/null
  rmdir "$LOCK"
  node --env-file=.env.local scripts/load-menus.mjs "menus/wip/clean-noplatform-$i.json" 2>&1 \
    | grep -E '^Loaded|^Coverage' | sed "s/^/[$i] /"
done
echo "supervisor finished"
