# QTR for Mac

A small native Mac app that opens the QTR app (https://app.qtr.ai) in its own window, so the desk lives in the Dock instead of a browser tab. It always shows the live web app, so it updates whenever QTR does.

- `npm start` runs it from source. `QTR_URL=http://localhost:4100 npm start` points it at a local dev server.
- `npm run dist` builds `dist/QTR-<version>-arm64.dmg` and a `.zip`.

Sign-in uses QTR's Google popup inside the app. The app's browser identity is plain Chrome so Google allows it. Links that leave the app (including the qtr.ai marketing pages) open in your default browser. Window size and position are remembered.

The build is unsigned. The first time, right-click QTR.app → Open. Signing and notarising needs a Developer ID certificate: set `mac.identity` in package.json and add notarisation.
