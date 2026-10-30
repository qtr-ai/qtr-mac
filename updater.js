const { app, dialog, ipcMain, Notification } = require("electron");
const { execFile } = require("child_process");
const electronUpdater = require("electron-updater");

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const SHIPIT_PATH = "Squirrel.framework/Resources/ShipIt";
const SHIPIT_ID = "ai.qtr.desktop.ShipIt";
// ShipIt takes a minute or two to verify and swap the bundle; one older than this is stuck, not installing.
const SHIPIT_FRESH_MS = 5 * 60 * 1000;

// Read on first use: electron-updater builds it from app, so touching it at load would break `node --test`.
let autoUpdater = null;

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
  if (choice === 0) restartToUpdate();
};

const notify = (title, body) => {
  if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
};

// The app is gone for a minute or two while ShipIt installs, so say so; reopening it then makes ShipIt give up.
// On macOS electron-updater ignores the arguments and relaunches when autoRunAppAfterInstall is on (set below);
// they're passed for clarity and for any other platform.
const restartToUpdate = () => {
  notify("Updating QTR", "It reopens by itself in about a minute.");
  setTimeout(() => autoUpdater.quitAndInstall(false, true), 300);
};

const check = () => autoUpdater.checkForUpdates().catch(() => { /* reported through the error event */ });

const setupUpdates = windowGetter => {
  getWindow = windowGetter;

  ipcMain.on("qtr:update-listening", () => {
    pageListening = true;
    if (readyVersion) announce();
  });
  ipcMain.handle("qtr:restart-to-update", () => {
    if (readyVersion) restartToUpdate();
  });

  if (!app.isPackaged) return;

  autoUpdater = electronUpdater.autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoRunAppAfterInstall = true;
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

// ps prints elapsed time as [[dd-]hh:]mm:ss.
const parseElapsed = etime => {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(etime);
  if (!match) return null;
  const [, days = 0, hours = 0, minutes, seconds] = match;
  return (((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000;
};

// `ps -axo pid,etime,command` output → { pid, elapsedMs } of this app's ShipIt, or null.
const findShipIt = psOutput => {
  for (const line of psOutput.split("\n")) {
    const match = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const [, pid, etime, command] = match;
    if (!command.includes(SHIPIT_PATH) || !command.includes(SHIPIT_ID)) continue;
    const elapsedMs = parseElapsed(etime);
    if (elapsedMs !== null) return { pid: Number(pid), elapsedMs };
  }
  return null;
};

// True while ShipIt is installing an update for this app. Opening a window then would make ShipIt abort
// ("App Still Running Error") and leave the old version in place.
const isInstallingUpdate = () => new Promise(resolve => {
  execFile("ps", ["-axo", "pid,etime,command"], { timeout: 2000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
    if (err) { resolve(false); return; }
    const shipIt = findShipIt(stdout);
    resolve(Boolean(shipIt && shipIt.elapsedMs < SHIPIT_FRESH_MS));
  });
});

const notifyFinishingUpdate = () => notify("Finishing an update", "QTR reopens in a moment.");

module.exports = { setupUpdates, pageReloading, checkForUpdatesNow, isInstallingUpdate, notifyFinishingUpdate, findShipIt, parseElapsed };
