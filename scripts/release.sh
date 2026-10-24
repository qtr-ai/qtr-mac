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
VERSION="$(node -p "require('./package.json').version")"
if gh release view "v$VERSION" --repo qtr-ai/qtr-mac >/dev/null 2>&1; then
  echo "v$VERSION is already released. Bump \"version\" in package.json first." >&2
  exit 1
fi
rm -rf dist
# Build both arches without publishing: electron-builder's own GitHub publish creates the release once per arch in
# parallel, and the second create fails ("Published releases must have a valid tag") before latest-mac.yml goes up.
npx electron-builder --mac --publish never
if ! grep -q "^version: $VERSION$" dist/latest-mac.yml; then
  echo "dist/latest-mac.yml is missing or not for $VERSION; running apps would not see this update." >&2
  exit 1
fi
gh release create "v$VERSION" --repo qtr-ai/qtr-mac --title "$VERSION" --notes "QTR for Mac $VERSION" \
  dist/*.dmg dist/*.zip dist/*.blockmap dist/latest-mac.yml
