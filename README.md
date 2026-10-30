# QTR for Mac

A small native Mac app that opens the QTR app (https://app.qtr.ai) in its own window, so the desk lives in the Dock instead of a browser tab. It always shows the live web app, so it updates whenever QTR does.

- `npm start` runs it from source. `QTR_URL=http://localhost:4100 npm start` points it at a local dev server.
- `npm run dist` builds `dist/QTR-<version>-arm64.dmg` and a `.zip`.

Google refuses sign-in inside embedded browsers, so "Continue with Google" opens `app.qtr.ai/desktop-sign-in` in your default browser; after you sign in there, the page hands the Google credential back through a `qtr://auth` link with a one-time state the app issued, and the app finishes signing in. This needs the web app's desktop sign-in page (branch `feat/desktop-sign-in` in qtr-web-v4) deployed, or run against a local dev server with `QTR_URL`. Links that leave the app (including the qtr.ai marketing pages) open in your default browser. Window size and position are remembered. The window has an inset title bar (traffic lights at 18,16): the web app draws its own 44px header and reads `window.qtrDesktop.titleBar`, `isFullScreen()` and `onFullScreenChange(cb)` to leave room for the window buttons.

`npm run dist` makes a quick unsigned build for testing (the first time, right-click QTR.app → Open). Real releases are signed and notarized with `npm run release` (below).

The web app can also call `window.qtrDesktop.openExternal(url)` to open Google's contacts consent page (`https://accounts.google.com/...` only) in your default browser.

## QTR Dev

QTR Dev is a second app for trying unreleased web builds. It sits beside QTR: its own bundle ID (`ai.qtr.desktop.dev`), Dock name and icon (the mark with a DEV tag), its own data folder (`~/Library/Application Support/QTR Dev`), so it keeps a separate sign-in and both can run at once. It never auto-updates the app itself (rebuild it when the Mac code changes), but it still shows the web update alert and App menu → Check for Updates… checks the web build.

- `npm run dist:dev` builds the unsigned arm64 `dist/mac-arm64/QTR Dev.app` (and a `.dmg`) from `electron-builder.dev.js`, which takes the normal config and swaps the identity, icon and URL scheme and stamps `qtrFlavor: "dev"` into the packaged package.json. `npm run dist` and `npm run release` are unchanged.
- `npm run start:dev` runs the dev flavor from source (`QTR_FLAVOR=dev`, ignored by packaged apps).
- The **Server** menu picks what the window loads: Local (localhost:4100, the default) or dev.qtr.ai. The choice is saved in `server.json` in its data folder and switching reloads the window at that server's root. `QTR_URL` still overrides both.
- Sign-in opens `<server>/desktop-sign-in?state=…&app=dev` in your default browser, and the page hands back through `qtr-dev://auth` (same one-time state check), so it never lands in the real QTR. This needs the web change that reads `app=dev` (branch `feat/desktop-dev-scheme` in qtr-web-v4) on that server.
- `build/icon-dev.icns` and `build/icon-dev.png` come from `build/icon.png` via `python3 build/icon-src/make-dev-icon.py build/icon.png build/icon-dev.png`, then an iconset and `iconutil -c icns`.

## Updates

A web deploy reaches Mac users on their next load, and now the app tells them. The page checks for a newer build and,
when one is out, QTR shows a standard Mac alert: "QTR has been updated" with Reload / Later / What's New. It only appears
while the window is focused and the page is quiet (nothing being typed, no dialog open). Later hides it for 4 hours, or
until a newer build; What's New opens https://qtr.ai/releasenotes and the alert returns when you come back to the window.
Reload asks the page to reload, and the page waits for any unsaved note or desk change first. This relies on the page
seeing `window.qtrDesktop.updateAlertsNative`; the bridge is `webUpdateReady`, `reportPromptQuiet`, `onReloadRequested`,
`onCheckWebUpdate` and `webCheckResult`. The old `onUpdateReady` and `restartToUpdate` are gone, so no page draws its own slip here.

Changes to the Mac app itself ship through auto-update (electron-updater, GitHub Releases on `qtr-ai/qtr-mac`):
the app checks at launch and every 4 hours, downloads quietly, then shows the same kind of alert, "A new version of QTR is ready"
with Restart to update / Later / What's New. It also installs on quit. Both kinds share one prompt, so only one alert shows at a time
(`promptState.js`, covered by `npm test`).
App menu → Check for Updates… checks both by hand (asking the page for up to 5 seconds) and says "You're up to date"
with `QTR <version>, web <build>` when nothing is new. App menu → What's New… opens the release notes. In QTR Dev
(or any unpackaged run) the app-update check is skipped; the web part still works.

Restart to update shows an "Updating QTR" notification, quits, and Squirrel's ShipIt installs the new version and
reopens QTR by itself, which takes a minute or two. Opening QTR during that time would make ShipIt abort the install,
so if QTR finds this app's ShipIt running (started under 5 minutes ago) at launch, it says "Finishing an update" and
quits without opening a window; an older ShipIt is treated as stuck and ignored. `npm test` covers the `ps` parsing.

To release:
1. Bump `version` in package.json.
2. `npm run release` — reads the App Store Connect key from `~/.secrets` (override with `QTR_ASC_KEY_JSON` / `QTR_ASC_P8`), builds arm64 + x64, signs with the Developer ID Application certificate in the keychain, notarizes, and
   publishes the release with `latest-mac.yml`, which running apps check.

`npm run dist` makes an unsigned arm64 build for local testing (it can't auto-update).
