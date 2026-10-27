#!/bin/bash
# filter -> screen -> junk check -> copy -> load -> verify in DB -> rebaseline (only if verified)
# usage: bash probe/sweep-2026-10-25/rx-load.sh NN
cd "/c/Users/Calvin  Lensink/Documents/platemaps" || exit 1
n=$1; D=probe/sweep-2026-10-25
node $D/rx-filter.mjs $n | grep -E "^DROP|^kept" || exit 1
node --env-file=.env.local scripts/screen-menus.mjs menus/wip/rx-filtered-$n.json 2>&1 | grep -E "clean:|quarantine|^  [A-Z].*-"
node -e "const d=require('./menus/wip/clean.json');const j=d.flatMap(e=>e.dishes.filter(x=>/out of stock|sold out|unavailable|^close\$|card fee/i.test(x.name)));if(j.length){console.log('JUNK',j.length);process.exit(1)}" || exit 1
cp menus/wip/clean.json menus/wip/ready-rx-$n.json
node --env-file=.env.local scripts/load-menus.mjs menus/wip/ready-rx-$n.json 2>&1 | grep -E "^Loaded|problem|nothing written|: file says|rror"
node --env-file=.env.local $D/rx-verify.mjs $n | tee /tmp/rxv-$n | grep -E "MISMATCH|match"
grep -q "MISMATCH" /tmp/rxv-$n && { echo "VERIFY FAILED $n - not rebaselined"; exit 1; }
node --env-file=.env.local $D/rx-rebaseline.mjs $n
