const { app, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

let readyVersion = null;
let pageListening = false;
let manualCheck = false;
let getWindow = () => null;

// A page that knows about updates shows its own slip; otherwise (an older web build) a plain Mac alert asks.
const announce = () => {
  const win = getWindow();
  if (!win || !readyVersion) return;
  if (pageListening) {
    win.webContents.send("qtr:update-ready", { version: readyVersion });
    return;
  }
  const choice = dialog.showMessageBoxSync(win, {
    type: "info",
    buttons: ["Restart to update", "Later"],
    defaultId: 0,
    cancelId: 1,
    message: "A new version of QTR is ready",
    detail: `Version ${readyVersion} installs when you restart.`,
  });
  if (choice === 0) autoUpdater.quitAndInstall();
};

const check = () => autoUpdater.checkForUpdates().catch(() => { /* reported through the error event */ });

const setupUpdates = windowGetter => {
  getWindow = windowGetter;

  ipcMain.on("qtr:update-listening", () => {
    pageListening = true;
    if (readyVersion) announce();
  });
  ipcMain.handle("qtr:restart-to-update", () => {
    if (readyVersion) autoUpdater.quitAndInstall();
  });

  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", info => {
    readyVersion = info.version;
    manualCheck = false;
    announce();
  });
  autoUpdater.on("update-not-available", () => {
    if (!manualCheck) return;
    manualCheck = false;
    dialog.showMessageBox(getWindow(), { type: "info", message: "You're up to date", detail: `QTR ${app.getVersion()} is the latest version.` });
  });
  autoUpdater.on("error", err => {
    if (!manualCheck) return;
    manualCheck = false;
    dialog.showMessageBox(getWindow(), { type: "warning", message: "Couldn't check for updates", detail: String(err?.message ?? err) });
  });

  check();
  setInterval(check, CHECK_EVERY_MS);
};

// A reload replaces the page, so it has to subscribe again before it gets the slip.
const pageReloading = () => { pageListening = false; };

const checkForUpdatesNow = () => {
  if (!app.isPackaged) {
    dialog.showMessageBox(getWindow(), { type: "info", message: "Updates only run in the installed app" });
    return;
  }
  if (readyVersion) { announce(); return; }
  manualCheck = true;
  check();
};

module.exports = { setupUpdates, pageReloading, checkForUpdatesNow };
