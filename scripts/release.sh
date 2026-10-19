#!/bin/bash
# Builds, signs (Developer ID Application certificate in the login keychain), notarizes and publishes a GitHub release.
# Apple credentials come from ~/.secrets so they never live in this repo.
set -euo pipefail
KEY_JSON="${QTR_ASC_KEY_JSON:-$HOME/.secrets/ragaphone-asc-key.json}"
export APPLE_API_KEY="${QTR_ASC_P8:-$HOME/.secrets/ragaphone-asc.p8}"
export APPLE_API_KEY_ID="$(node -p "require('$KEY_JSON').key_id")"
export APPLE_API_ISSUER="$(node -p "require('$KEY_JSON').issuer_id")"
export GH_TOKEN="${GH_TOKEN:-$(gh auth token)}"
if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
  echo "No Developer ID Application certificate in the keychain. See README → Updates." >&2
  exit 1
fi
npx electron-builder --mac --publish always
