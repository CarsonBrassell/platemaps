#!/usr/bin/env bash
#
# Build the iOS app and send it to App Store Connect.
#
# The whole of it, in one command, because getting a build to TestFlight by
# hand took an evening the first time and almost none of that was the app's
# fault: Xcode's own login is the flaky part, and every step below routes
# around it using an App Store Connect API key instead.
#
#   scripts/ship-ios.sh                    # points at platemaps.com (real)
#   PLATEMAPS_APP_URL=https://platemap-five.vercel.app/m scripts/ship-ios.sh
#
# The second form is for TestFlight while platemaps.com still serves the
# Squarespace placeholder. Never submit a binary built that way — see the
# note in capacitor.config.ts about the URL being frozen into the build.
#
# Credentials: the .p8 lives in ~/.appstoreconnect/private_keys/ and is never
# committed. Only the two identifiers come from the environment, and they are
# identifiers, not secrets:
#
#   export ASC_KEY_ID=XXXXXXXXXX
#   export ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
#
# The key must have **Admin** access. App Manager can upload but cannot mint
# the distribution certificate, and the export fails with a "Cloud signing
# permission error" that does not mention roles at all.

set -euo pipefail

# Capacitor 8's CLI requires Node >= 22 and the repo's default is still 20.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
  nvm use 24 >/dev/null 2>&1 || true
fi

# CocoaPods aborts with "Unicode Normalization not appropriate for ASCII-8BIT"
# when the shell has no UTF-8 locale, which is the default in some contexts.
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

: "${ASC_KEY_ID:?set ASC_KEY_ID (App Store Connect API key id)}"
: "${ASC_ISSUER_ID:?set ASC_ISSUER_ID (App Store Connect issuer id)}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
OUT="$(mktemp -d)"
AUTH=(-allowProvisioningUpdates
      -authenticationKeyPath "$KEY"
      -authenticationKeyID "$ASC_KEY_ID"
      -authenticationKeyIssuerID "$ASC_ISSUER_ID")

[ -f "$KEY" ] || { echo "No API key at $KEY" >&2; exit 1; }

cd "$ROOT"

echo "==> Syncing web assets into the iOS project"
npx cap sync ios

echo "==> Archiving"
xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$OUT/App.xcarchive" "${AUTH[@]}" archive

# Cloud signing: Apple mints the distribution certificate server-side, so
# nothing has to exist in the local keychain. This is the step the App
# Manager key could not do.
cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
</dict>
</plist>
PLIST

echo "==> Exporting"
xcodebuild -exportArchive -archivePath "$OUT/App.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$OUT/export" "${AUTH[@]}"

# Validate before uploading. A rejected upload still burns a build number,
# and build numbers cannot be reused once App Store Connect has seen them.
echo "==> Validating"
xcrun altool --validate-app -f "$OUT/export/App.ipa" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo "==> Uploading"
xcrun altool --upload-app -f "$OUT/export/App.ipa" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo
echo "Done. Processing takes 5-15 minutes; watch the TestFlight tab."
echo "Bump CURRENT_PROJECT_VERSION in the Xcode project before the next run —"
echo "App Store Connect refuses a build number it has already accepted."
