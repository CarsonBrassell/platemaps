#!/usr/bin/env bash
# Runs the DNS-verified fetch-failed retry set (menus/wip/retrychunk-NN.notes.json)
# one chunk at a time under a hard timeout, absorbing after each.
#
# Same shape as noplatform-supervisor.sh and for the same reason - one page that
# never settles must cost one chunk, not the run. The difference is that the
# retry set is a FIXED list sliced up front by probe/split-feed.mjs, so there is
# no feed to rebuild between chunks and no way to hand back a row twice.
#
# Run this ALONE. The failures it is retrying were caused by several browser
# passes competing for the resolver at once.
set -u
CAP="${1:-1500}"
LOCK=menus/wip/.screen.lock

for f in menus/wip/retrychunk-*.notes.json; do
  [ -f "$f" ] || continue
  i="$(basename "$f" .notes.json)"
  echo "[$i] $(node -e "console.log(require('./$f').length)") rows"

  timeout -k 30 "$CAP" node --env-file=.env.local scripts/browser-menus.mjs \
    --from "$f" --no-chains-first > "menus/wip/$i.log" 2>&1
  [ $? -eq 124 ] && echo "[$i] hit the ${CAP}s cap - killed, moving on"

  pkill -f 'browser-menus.mjs' 2>/dev/null
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/kill-playwright.ps1 >/dev/null 2>&1

  OUT="$(grep -ao 'menus/wip/browser-[0-9-]*\.json' "menus/wip/$i.log" | grep -v notes | tail -1)"
  [ -z "${OUT:-}" ] && OUT="$(ls -t menus/wip/browser-*.json 2>/dev/null | grep -v notes | head -1)"
  [ -f "${OUT:-}" ] || { echo "[$i] no output to absorb"; continue; }

  got=0
  for _ in $(seq 1 60); do mkdir "$LOCK" 2>/dev/null && { got=1; break; }; sleep 5; done
  [ "$got" = 0 ] && { echo "[$i] lock busy - leaving $OUT"; continue; }
  cp "$OUT" "menus/wip/$i.snap.json"
  node --env-file=.env.local scripts/screen-menus.mjs "menus/wip/$i.snap.json" > "menus/wip/$i.screen.log" 2>&1
  cp menus/wip/clean.json "menus/wip/clean-$i.json" 2>/dev/null
  rmdir "$LOCK"
  node --env-file=.env.local scripts/load-menus.mjs "menus/wip/clean-$i.json" 2>&1 \
    | grep -E '^Loaded|^Coverage' | sed "s/^/[$i] /"
done
echo "retry supervisor finished"
