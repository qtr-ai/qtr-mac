# QTR for Mac

A small native Mac app that opens the QTR app (https://app.qtr.ai) in its own window, so the desk lives in the Dock instead of a browser tab. It always shows the live web app, so it updates whenever QTR does.

- `npm start` runs it from source. `QTR_URL=http://localhost:4100 npm start` points it at a local dev server.
- `npm run dist` builds `dist/QTR-<version>-arm64.dmg` and a `.zip`.

Google refuses sign-in inside embedded browsers, so "Continue with Google" opens `app.qtr.ai/desktop-sign-in` in your default browser; after you sign in there, the page hands the Google credential back through a `qtr://auth` link with a one-time state the app issued, and the app finishes signing in. This needs the web app's desktop sign-in page (branch `feat/desktop-sign-in` in qtr-web-v4) deployed, or run against a local dev server with `QTR_URL`. Links that leave the app (including the qtr.ai marketing pages) open in your default browser. Window size and position are remembered.

The build is unsigned. The first time, right-click QTR.app → Open. Signing and notarising needs a Developer ID certificate: set `mac.identity` in package.json and add notarisation.
