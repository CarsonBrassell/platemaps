#!/bin/bash
# Stage 3 curl verification against a running production server (next start) on $PORT.
PORT=${PORT:-3000}; B="http://localhost:$PORT"
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
echo "== #5 headers on / =="; curl -sI "$B/" | grep -iE '^(strict-transport|x-content-type|x-frame|referrer-policy|permissions-policy|content-security-policy|x-powered-by)' 
echo "== #9 robots.txt =="; curl -s "$B/robots.txt"; echo; echo "drafts/onboarding: $(code $B/drafts/onboarding) (want 404)"
echo "== #6 image proxy =="; echo "wikimedia via /_next/image: $(code "$B/_next/image?url=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2Fa%2Fa9%2FExample.jpg&w=64&q=75") (want 400)"
echo "== #14 malformed JSON =="; echo "login '{': $(code -X POST -H 'content-type: application/json' -d '{' $B/api/auth/login) (want 400)"; echo "blocks null: $(code -X POST -H 'content-type: application/json' -d 'null' $B/api/blocks) (want 400/401)"
echo "== auth still required =="; echo "POST /api/posts no cookie: $(code -X POST -H 'content-type: application/json' -d '{}' $B/api/posts) (want 401)"
echo "== #1 private media by id =="; if [ -n "$PRIVATE_POST_ID" ]; then curl -s "$B/api/posts/$PRIVATE_POST_ID" | grep -o '"media":\[[^]]*\]' | head -1; echo "(want \"media\":[])"; else echo "PRIVATE_POST_ID unset"; fi
echo "== #4 signup hammer (7x garbage) =="; for i in 1 2 3 4 5 6 7; do printf '%s ' "$(code -X POST -H 'content-type: application/json' -d '{"email":"x","password":"y"}' $B/api/auth/signup)"; done; echo "(want 400s then 429)"
echo "== #4 Retry-After =="; curl -s -D - -o /dev/null -X POST -H 'content-type: application/json' -d '{"email":"x","password":"y"}' $B/api/auth/signup | grep -i retry-after
