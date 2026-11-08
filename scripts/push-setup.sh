#!/usr/bin/env bash
# Turns on push: puts the APNs key from Apple into Vercel Production and
# redeploys. The key goes straight from the file to Vercel; nothing prints it.
#
#   scripts/push-setup.sh ~/Downloads/AuthKey_XXXXXXXXXX.p8
#
# APNS_ENVIRONMENT stays unset on purpose: lib/push.ts defaults to production,
# which is what TestFlight and App Store builds use.
set -euo pipefail

TEAM_ID=93Q75H5U7Z
KEY_FILE="${1:-}"
[ -f "$KEY_FILE" ] || { echo "Usage: scripts/push-setup.sh ~/Downloads/AuthKey_XXXXXXXXXX.p8"; exit 1; }

KEY_ID="$(basename "$KEY_FILE" | sed -nE 's/^AuthKey_([A-Z0-9]{10})\.p8$/\1/p')"
[ -n "$KEY_ID" ] || { echo "Expected a file named AuthKey_<10 characters>.p8"; exit 1; }
grep -q "BEGIN PRIVATE KEY" "$KEY_FILE" || { echo "That file is not a .p8 key."; exit 1; }

cd "$(dirname "$0")/.."
vercel env add APNS_TEAM_ID production --force --no-sensitive --value "$TEAM_ID" --yes
vercel env add APNS_KEY_ID production --force --no-sensitive --value "$KEY_ID" --yes
vercel env add APNS_AUTH_KEY production --force --sensitive --yes < "$KEY_FILE"

echo "Redeploying production so the new values take effect..."
vercel redeploy "$(vercel ls --prod --yes 2>/dev/null | grep -m1 -oE 'https://[^ ]+')" --target production
echo "Done. Keep the .p8 somewhere safe: Apple only lets you download it once."
