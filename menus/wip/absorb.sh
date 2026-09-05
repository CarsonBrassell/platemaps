cd "/c/Users/Calvin  Lensink/Documents/platemaps" || exit 1
lock(){ for i in $(seq 1 240); do mkdir menus/wip/.screen.lock 2>/dev/null && return 0; sleep 5; done; return 1; }
say(){ echo "[$(date +%H:%M)] $*" >> menus/wip/night.log; }
for tag in "$@"; do
  lock || exit 1
  node --env-file=.env.local scripts/screen-menus.mjs "menus/wip/result-$tag.json" >"menus/wip/$tag.screen.log" 2>&1; rc=$?
  cp menus/wip/clean.json "menus/wip/clean-$tag.json" 2>/dev/null
  rmdir menus/wip/.screen.lock 2>/dev/null
  [ $rc -ne 0 ] && { say "$tag: screen failed rc=$rc"; continue; }
  node --env-file=.env.local scripts/load-menus.mjs "menus/wip/clean-$tag.json" >"menus/wip/$tag.load.log" 2>&1
  if grep -q 'problem' "menus/wip/$tag.load.log"; then
    node menus/wip/retry-load.mjs "menus/wip/clean-$tag.json" "menus/wip/$tag.load.log" && \
    node --env-file=.env.local scripts/load-menus.mjs "menus/wip/clean-$tag.json" >>"menus/wip/$tag.load.log" 2>&1
  fi
  say "$tag: $(grep -E '^Loaded|^Coverage|problem' "menus/wip/$tag.load.log" | tr '\n' ' ')"
  echo "--- $tag ---"; tail -1 menus/wip/night.log
  grep -iE 'markup|platform fee|carousel|quarantine' "menus/wip/$tag.screen.log" | head -10
done
