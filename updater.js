const { app, dialog, ipcMain, Notification, shell } = require("electron");
const { execFile } = require("child_process");
const electronUpdater = require("electron-updater");
const { RELEASE_NOTES_URL, initialState, promptKey, nextPrompt, alertFor, afterChoice, upToDateDetail } = require("./promptState");

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const WEB_CHECK_WAIT_MS = 5000;
const SHIPIT_PATH = "Squirrel.framework/Resources/ShipIt";
const SHIPIT_ID = "ai.qtr.desktop.ShipIt";
// ShipIt takes a minute or two to verify and swap the bundle; one older than this is stuck, not installing.
const SHIPIT_FRESH_MS = 5 * 60 * 1000;

// Read on first use: electron-updater builds it from app, so touching it at load would break `node --test`.
let autoUpdater = null;

let state = initialState();
let getWindow = () => null;
let shellUpdates = false;
let webCheck = null; // { resolve } while a manual check waits for the page
let lastWebBuild = null;
let checking = false;

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

const runAction = action => {
  const win = getWindow();
  if (action === "restart") restartToUpdate();
  else if (action === "reload") win?.webContents.send("qtr:reload-requested");
  else if (action === "whatsNew") shell.openExternal(RELEASE_NOTES_URL);
};

const maybePrompt = (opts) => {
  const win = getWindow();
  const prompt = win && nextPrompt(state, Date.now(), opts);
  if (!prompt) return;
  state = { ...state, showing: true };
  dialog.showMessageBox(win, { type: "info", ...alertFor(prompt) }).then(({ response }) => {
    const now = Date.now();
    const result = afterChoice(state, prompt, response, now);
    state = result.state;
    runAction(result.action);
    maybePrompt();
  }).catch(() => {
    state = { ...state, showing: false };
  });
};

const update = patch => {
  state = { ...state, ...patch };
  maybePrompt();
};

const check = () => autoUpdater.checkForUpdates().catch(() => { /* reported through the error event */ });

const setupUpdates = (windowGetter, options = {}) => {
  getWindow = windowGetter;
  shellUpdates = Boolean(options.shellUpdates);

  ipcMain.on("qtr:web-update-ready", (_event, info) => {
    const build = info?.build;
    if (typeof build !== "string" || !build || build === state.web) return;
    update({ web: build });
  });
  ipcMain.on("qtr:prompt-quiet", (_event, quiet) => {
    if (typeof quiet === "boolean") update({ quiet });
  });
  ipcMain.on("qtr:web-check-result", (_event, result) => {
    if (typeof result?.build === "string") lastWebBuild = result.build;
    const waiting = webCheck;
    webCheck = null;
    if (typeof result?.newer === "string" && result.newer) state = { ...state, web: result.newer };
    if (waiting) waiting.resolve();
    else maybePrompt();
  });

  if (!shellUpdates) return;

  autoUpdater = electronUpdater.autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", info => update({ shell: info.version }));

  check();
  setInterval(check, CHECK_EVERY_MS);
};

const setFocused = focused => update({ focused });

// A reload loads the newest build, and the page reports quiet again once it mounts.
const pageReloading = () => {
  state = { ...state, web: null, quiet: true };
};

const askPageToCheck = () => new Promise(resolve => {
  const win = getWindow();
  if (!win) { resolve(); return; }
  const timer = setTimeout(() => { webCheck = null; resolve(); }, WEB_CHECK_WAIT_MS);
  webCheck = { resolve: () => { clearTimeout(timer); resolve(); } };
  win.webContents.send("qtr:check-web");
});

const checkForUpdatesNow = async () => {
  if (checking) return;
  checking = true;
  lastWebBuild = null;
  state = { ...state, laterKey: null, laterUntil: 0 };
  try {
    const shellCheck = shellUpdates
      ? autoUpdater.checkForUpdates().then(result => result?.downloadPromise)
      : Promise.resolve();
    const [, shellResult] = await Promise.all([askPageToCheck(), shellCheck.then(() => null, err => err)]);
    if (promptKey(state)) {
      maybePrompt({ manual: true });
      return;
    }
    if (shellResult) {
      dialog.showMessageBox(getWindow(), { type: "warning", message: "Couldn't check for updates", detail: String(shellResult?.message ?? shellResult) });
      return;
    }
    dialog.showMessageBox(getWindow(), { type: "info", message: "You're up to date", detail: upToDateDetail(app.getVersion(), lastWebBuild) });
  } finally {
    checking = false;
  }
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

module.exports = { setupUpdates, setFocused, pageReloading, checkForUpdatesNow, isInstallingUpdate, notifyFinishingUpdate, findShipIt, parseElapsed };
