# QTR for Mac

A small native Mac app that opens the QTR app (https://app.qtr.ai) in its own window, so the desk lives in the Dock instead of a browser tab. It always shows the live web app, so it updates whenever QTR does.

- `npm start` runs it from source. `QTR_URL=http://localhost:4100 npm start` points it at a local dev server.
- `npm run dist` builds `dist/QTR-<version>-arm64.dmg` and a `.zip`.

Google refuses sign-in inside embedded browsers, so "Continue with Google" opens `app.qtr.ai/desktop-sign-in` in your default browser; after you sign in there, the page hands the Google credential back through a `qtr://auth` link with a one-time state the app issued, and the app finishes signing in. This needs the web app's desktop sign-in page (branch `feat/desktop-sign-in` in qtr-web-v4) deployed, or run against a local dev server with `QTR_URL`. Links that leave the app (including the qtr.ai marketing pages) open in your default browser. Window size and position are remembered.

The build is unsigned. The first time, right-click QTR.app → Open. Signing and notarising needs a Developer ID certificate: set `mac.identity` in package.json and add notarisation.

## Updates

Web changes need nothing: the app loads app.qtr.ai, so a web deploy reaches Mac users on their next load.

Changes to the Mac app itself ship through auto-update (electron-updater, GitHub Releases on `qtr-ai/qtr-mac`):
the app checks at launch and every 4 hours, downloads quietly, then the desk shows "A new version of QTR is ready"
with Restart to update / Later (a plain Mac alert if the web build predates that slip). It also installs on quit.
App menu → Check for Updates… checks by hand.

To release:
1. Bump `version` in package.json.
2. `npm run release` — reads the App Store Connect key from `~/.secrets` (override with `QTR_ASC_KEY_JSON` / `QTR_ASC_P8`), builds arm64 + x64, signs with the Developer ID Application certificate in the keychain, notarizes, and
   publishes the release with `latest-mac.yml`, which running apps check.

`npm run dist` makes an unsigned arm64 build for local testing (it can't auto-update).
